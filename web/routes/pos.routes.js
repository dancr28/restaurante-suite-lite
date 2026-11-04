const express = require('express');
const router = express.Router();
const db = require('../config/db');
const printer = require('../services/printer.service');
const orders = require('../services/orders.service');
const settings = require('../services/settings.service');
const { can } = require('../lib/permissions');

function normalizarMetodoPago(metodo) {
  if (!metodo) return 'efectivo';
  const m = String(metodo).toLowerCase().trim();
  if (m.includes('trans')) return 'transferencia';
  if (m.includes('tarj') || m.includes('card')) return 'tarjeta';
  if (m.includes('mix')) return 'mixto';
  return 'efectivo';
}

// TOGGLES DE DISPONIBILIDAD PARA VARIANTES Y MODIFICADORES
router.post('/variantes/toggle-disponible', async (req, res) => {
  const { variante_id, disponible } = req.body;
  try {
    await db.query('UPDATE variantes_producto SET disponible = ? WHERE id = ?', [
      disponible ? 1 : 0,
      variante_id,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

router.post('/modificadores/toggle-disponible', async (req, res) => {
  const { opcion_id, disponible } = req.body;
  try {
    await db.query('UPDATE modificador_opciones SET disponible = ? WHERE id = ?', [
      disponible ? 1 : 0,
      opcion_id,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

router.get('/clientes/buscar', async (req, res) => {
  const q = req.query.q || '';
  try {
    const [clientes] = await db.query(
      `SELECT * FROM clientes WHERE COALESCE(activo,1)=1 AND (nombre LIKE ? OR COALESCE(telefono,'') LIKE ?) ORDER BY nombre ASC LIMIT 50`,
      [`%${q}%`, `%${q}%`],
    );
    res.json(clientes);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

router.post('/clientes', async (req, res, next) => {
  const nombre = String(req.body.nombre || '').trim();
  const telefono = String(req.body.telefono || '').trim() || null;
  const direccion = String(req.body.direccion || '').trim() || null;
  const referencias = String(req.body.referencias || '').trim() || null;
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
  try {
    if (telefono) {
      const [[old]] = await db.query('SELECT id FROM clientes WHERE telefono=? LIMIT 1', [telefono]);
      if (old) {
        await db.query('UPDATE clientes SET nombre=?,direccion=?,referencias=?,activo=1 WHERE id=?', [nombre,direccion,referencias,old.id]);
        return res.json({ success:true, id:old.id, updated:true });
      }
    }
    const [r] = await db.query('INSERT INTO clientes(nombre,telefono,direccion,referencias,activo) VALUES(?,?,?,?,1)', [nombre,telefono,direccion,referencias]);
    res.status(201).json({ success:true, id:r.insertId });
  } catch (err) { next(err); }
});

router.get('/datos-iniciales', async (req, res) => {
  try {
    const [productos] = await db.query(`
      SELECT p.id, p.nombre, p.precio, p.categoria_id, p.stock_actual, p.seguimiento_stock, 
             p.es_compuesto, p.disponible_venta, p.activo,
             IF(p.seguimiento_stock = 1, p.stock_actual, 999) AS stock_disponible
      FROM productos p
      WHERE p.activo = TRUE
      ORDER BY p.nombre ASC
    `);

    const [[allVariants], [allLinks], [allRecipes]] = await Promise.all([
      db.query(
        'SELECT id,producto_id,nombre,precio,stock_actual,COALESCE(disponible,1) AS disponible FROM variantes_producto ORDER BY nombre',
      ),
      db.query('SELECT producto_id,grupo_id FROM producto_modificador_grupos'),
      db.query(
        'SELECT r.producto_id,r.cantidad,i.stock_actual,i.nombre AS insumo_nombre FROM recetas r JOIN insumos i ON i.id=r.insumo_id',
      ),
    ]);
    for (const p of productos) {
      const vars = allVariants.filter((v) => v.producto_id === p.id);
      const modGrupos = allLinks.filter((g) => g.producto_id === p.id);
      p.variantes = vars;
      p.modificadores_ids = modGrupos.map((m) => m.grupo_id);

      let maxPorciones = 999;
      let sinStock = false;
      let insumoFaltante = '';

      if (p.es_compuesto) {
        const rec = allRecipes.filter((r) => r.producto_id === p.id);

        for (const r of rec) {
          const cantPorPlato = parseFloat(r.cantidad) || 1;
          const stockActual = Math.max(0, parseFloat(r.stock_actual) || 0);
          const porciones = Math.floor(stockActual / cantPorPlato);

          if (porciones < maxPorciones) maxPorciones = porciones;
          if (stockActual < cantPorPlato) {
            sinStock = true;
            insumoFaltante = r.insumo_nombre;
          }
        }
      } else if (p.seguimiento_stock) {
        maxPorciones = Math.max(0, parseFloat(p.stock_actual) || 0);
        if (maxPorciones <= 0) {
          sinStock = true;
          insumoFaltante = 'Stock directo';
        }
      }

      p.max_porciones = maxPorciones;
      p.insumo_agotado = sinStock;
      p.insumo_faltante_nombre = insumoFaltante;
    }

    const [categorias] = await db.query(
      'SELECT * FROM categorias WHERE activo = TRUE ORDER BY orden ASC, nombre ASC',
    );
    const [modificadores] = await db.query(
      'SELECT * FROM modificador_grupos WHERE activo = TRUE ORDER BY nombre ASC',
    );
    const [allOptions] = await db.query(
      'SELECT id,grupo_id,nombre,precio_extra,COALESCE(disponible,1) AS disponible FROM modificador_opciones WHERE activo=TRUE ORDER BY nombre',
    );
    for (const g of modificadores) {
      const opciones = allOptions.filter((o) => o.grupo_id === g.id);
      g.opciones = opciones;
    }

    const [descuentos] = await db.query(
      'SELECT * FROM descuentos WHERE activo = TRUE ORDER BY nombre ASC',
    );
    const [usuarios] = await db.query(
      "SELECT id, nombre, rol FROM usuarios WHERE activo = TRUE AND rol IN ('mesero', 'admin') ORDER BY nombre ASC",
    );

    const [pedidosAbiertos] = await db.query(`
      SELECT * FROM pedidos 
      WHERE estado IN ('abierto', 'pendiente') 
         OR (tipo_servicio = 'delivery' AND estado_despacho IN ('en_preparacion', 'en_camino') AND estado IN ('abierto','pendiente'))
      ORDER BY id DESC
    `);

    const [openItems] = pedidosAbiertos.length
      ? await db.query(
          'SELECT * FROM pedido_items WHERE pedido_id IN (?) ORDER BY numero_plato,id',
          [pedidosAbiertos.map((p) => p.id)],
        )
      : [[]];
    for (const p of pedidosAbiertos) {
      const items = openItems.filter((it) => it.pedido_id === p.id);
      p.items = items;
    }

    res.json({
      productos,
      categorias,
      modificadores,
      descuentos,
      usuarios,
      pedidosAbiertos,
    });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

router.post('/vaciar-comanda', async (req, res) => {
  const result = await orders.cancel(req.body, req.user);

  res.json({ success: true, pedido_id: result.pedido_id });
});

router.post('/marchar-comanda', async (req, res) => {
  const result = await orders.march(req.body, req.user);
  res.json({ success: true, pedido_id: result.pedido_id, total: result.total });
});

router.post('/asignar-mesero', async (req, res) => {
  const { pedido_id, mesero_secundario } = req.body;
  try {
    await db.query('UPDATE pedidos SET mesero_secundario = ? WHERE id = ?', [
      mesero_secundario || null,
      pedido_id,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

router.post('/mover-mesa', async (req, res) => {
  const { pedido_id, nueva_mesa } = req.body;
  try {
    const [[exist]] = await db.query(
      'SELECT id FROM pedidos WHERE mesa_numero = ? AND estado IN ("abierto", "pendiente")',
      [nueva_mesa],
    );
    if (exist)
      return res.status(400).json({ error: 'La mesa de destino ya se encuentra ocupada.' });

    await db.query('UPDATE pedidos SET mesa_numero = ? WHERE id = ?', [nueva_mesa, pedido_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

router.post('/editar-ticket', async (req, res) => {
  const { pedido_id, cliente_nombre, notas } = req.body;
  try {
    await db.query('UPDATE pedidos SET cliente_nombre = ?, referencias_entrega = ? WHERE id = ?', [
      cliente_nombre || null,
      notas || null,
      pedido_id,
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

router.post('/reimprimir-ticket', async (req, res) => {
  const { pedido_id } = req.body;
  try {
    const [[p]] = await db.query('SELECT * FROM pedidos WHERE id = ?', [pedido_id]);
    if (!p) return res.status(404).json({ error: 'Pedido no encontrado' });

    const [items] = await db.query('SELECT * FROM pedido_items WHERE pedido_id = ?', [pedido_id]);
    const result = await printer.imprimirReciboCobro({
      folio: p.id,
      mesa: p.mesa_numero,
      cajero: req.user?.nombre || p.mesero || 'Caja',
      mesero: p.mesero || 'General',

      // DELIVERY_CUSTOMER_REPRINT_V1
      pedido_id: p.id,
      tipo_servicio: p.tipo_servicio || 'comedor',

      cliente_nombre: p.cliente_nombre,
      cliente_telefono: p.cliente_telefono,
      direccion_entrega: p.direccion_entrega,
      referencias_entrega: p.referencias_entrega,
      metodo_pago: p.metodo_pago || 'efectivo',
      paga_con: p.paga_con || p.total,
      cambio_llevar: p.cambio || 0,
      total: p.total,
      items,
    });
    await require('../services/operations.service').audit(
      db,
      req.user,
      'ticket.reprinted',
      p.id,
      { jobs: result.jobs || [] },
    );
    res.json({ success: true, impresion: result });
  } catch (err) {
    console.error('[ERROR /api/pos/reimprimir-ticket]:', err);
    res.status(err.status || 500).json({ error: err.message || 'No se pudo reimprimir el ticket' });
  }
});

router.post('/reimprimir-cocina', async (req, res) => {
  const { pedido_id } = req.body;
  try {
    const [[p]] = await db.query('SELECT * FROM pedidos WHERE id = ?', [pedido_id]);
    if (!p) return res.status(404).json({ error: 'Pedido no encontrado' });

    const [items] = await db.query('SELECT * FROM pedido_items WHERE pedido_id = ?', [pedido_id]);

    try {
      await printer.imprimirComandaCocina({
        mesa: p.mesa_numero,
        mesero: p.mesero,
        turno_id: 1,
        tipo_servicio: p.tipo_servicio,
        items: items,
        es_adicional: false,
        cliente_nombre: p.cliente_nombre,
      });
    } catch (eP) {}

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

router.post('/abrir-cajon', async (req, res) => {
  try {
    await printer.abrirCajonDinero();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

router.post('/asignar-cliente', async(req,res,next)=>{try{const {pedido_id,cliente_id,direccion_entrega,referencias_entrega}=req.body;const [[p]]=await db.query('SELECT id FROM pedidos WHERE id=?',[pedido_id]);if(!p)return res.status(404).json({error:'Pedido no encontrado'});if(cliente_id){const [[c]]=await db.query('SELECT id,nombre,telefono,direccion,referencias FROM clientes WHERE id=? AND COALESCE(activo,1)=1',[cliente_id]);if(!c)return res.status(404).json({error:'Cliente no encontrado'});await db.query('UPDATE pedidos SET cliente_id=?,cliente_nombre=?,cliente_telefono=?,direccion_entrega=COALESCE(?,direccion_entrega,?),referencias_entrega=COALESCE(?,referencias_entrega,?) WHERE id=?',[c.id,c.nombre,c.telefono,direccion_entrega,c.direccion,referencias_entrega,c.referencias,pedido_id]);return res.json({success:true,cliente_id:c.id,cliente_nombre:c.nombre});}await db.query('UPDATE pedidos SET cliente_id=NULL,cliente_nombre=NULL,cliente_telefono=NULL WHERE id=?',[pedido_id]);res.json({success:true,cliente_id:null,cliente_nombre:null});}catch(e){next(e);}});

function surveyForService(cfg, service) {
  if (!cfg?.business?.surveyEnabled) {
    return false;
  }

  const normalized = String(
    service || 'comedor'
  ).toLowerCase();

  if (
    normalized === 'delivery' ||
    normalized === 'domicilio'
  ) {
    return cfg.business.surveyDelivery === true;
  }

  if (
    normalized === 'para_llevar' ||
    normalized === 'takeout' ||
    normalized === 'llevar'
  ) {
    return cfg.business.surveyTakeout === true;
  }

  return cfg.business.surveyDining !== false;
}

async function enqueueSurveyAfterPrebill(data, service, key) {
  const cfg = await settings.get();

  if (!surveyForService(cfg, service)) {
    return {
      skipped: true,
      reason: 'survey_disabled_for_service',
      service: service || 'comedor',
    };
  }

  const queue = require('../services/print-queue.service');

  return queue.enqueue(
    db,
    'survey',
    {
      ...data,
      tipo_servicio:
        service ||
        data.tipo_servicio ||
        'comedor',
    },
    key,
  );
}

router.post('/despachar-delivery', async (req, res) => {
  const { pedido_id, metodo_pago, paga_con, cambio_llevar } = req.body;
  try {
    const [[turnoActivo]] = await db.query(
      'SELECT id FROM turnos_caja WHERE estado = "abierto" ORDER BY id DESC LIMIT 1',
    );
    const turnoIdCaja = turnoActivo && turnoActivo.id ? turnoActivo.id : null;
    const metodoLimpio = normalizarMetodoPago(metodo_pago);

    await db.query(
      `
      UPDATE pedidos 
      SET estado_despacho = 'en_camino', 
          metodo_pago = ?, 
          paga_con = ?, 
          cambio = ?, 
          turno_id = COALESCE(?, turno_id)
      WHERE id = ?
    `,
      [
        metodoLimpio,
        parseFloat(paga_con) || 0,
        parseFloat(cambio_llevar) || 0,
        turnoIdCaja,
        pedido_id,
      ],
    );

    const [[p]] = await db.query('SELECT * FROM pedidos WHERE id = ?', [pedido_id]);
    if (!p) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (p.tipo_servicio === 'delivery' && (!String(p.cliente_nombre||'').trim() || !String(p.direccion_entrega||'').trim())) return res.status(400).json({ error: 'Asigna nombre y dirección antes de despachar.' });
    const [items] = await db.query('SELECT * FROM pedido_items WHERE pedido_id = ?', [pedido_id]);

    /*
     * DELIVERY_DISPATCH_PREBILL_V1
     *
     * El ticket gráfico sólo muestra teléfono, dirección y
     * referencias cuando tipo_servicio === 'delivery'.
     *
     * Este flujo de despacho imprimía directamente una precuenta
     * sin enviar tipo_servicio/pedido_id/referencias, aunque esos
     * datos sí estaban persistidos en pedidos.
     */
    const ticketResult = await printer.imprimirPrecuenta({
      folio: p.id,
      pedido_id: p.id,

      mesa: p.mesa_numero,
      mesero: p.mesero,

      tipo_servicio: p.tipo_servicio || 'delivery',

      cajero: req.user?.nombre || '',
      turno_id: turnoIdCaja,

      cliente_id: p.cliente_id || null,
      cliente_nombre: p.cliente_nombre || null,
      cliente_telefono: p.cliente_telefono || null,
      direccion_entrega: p.direccion_entrega || null,
      referencias_entrega: p.referencias_entrega || null,

      items: items,
      total: p.total,

      metodo_pago: metodoLimpio,
      paga_con: p.paga_con,
      cambio_llevar: p.cambio,
    });

    let drawerOpened = false;
    const cfg = await settings.get();
    const needsChange = metodoLimpio === 'efectivo' && Number(p.cambio || 0) > 0;
    if (needsChange && can(cfg, req.user?.rol, 'drawer')) {
      await printer.abrirCajonDinero({
        usuario_nombre: req.user?.nombre || '',
        motivo: 'cambio_delivery',
      });
      drawerOpened = true;
    }

    await enqueueSurveyAfterPrebill({
      folio: p.id,
      cajero: req.user?.nombre || '',
      total: p.total,
      tipo_servicio: p.tipo_servicio,
    }, p.tipo_servicio, 'survey:prebill:delivery:' + p.id);

    // WHATSAPP_DELIVERY_DISPATCH_V5

    let whatsappQueued =
      false;

    if (
      p.tipo_servicio ===
        'delivery' &&
      String(
        p.cliente_telefono ||
        ''
      ).trim()
    ) {
      try {
        await require(
          '../services/whatsapp.service'
        ).enqueue(
          db,
          p.cliente_telefono,
          '¡Listo! 😊 Tu pedido ya va en camino. Muchas gracias por tu compra.',
          'delivery-en-camino:' +
            p.id
        );

        whatsappQueued =
          true;

      } catch (waErr) {
        console.warn(
          '[WhatsApp despacho]',
          waErr.message
        );
      }
    }

    res.json({
      success: true,
      ticket: ticketResult,
      drawer_opened: drawerOpened,
      whatsapp_queued: whatsappQueued
    });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

router.post('/imprimir-precuenta', async (req, res) => {
  try {
    let pedido = null;

    if (req.body.pedido_id) {
      const [rows] = await db.query(
        `SELECT
           id,
           mesa_numero,
           mesero,
           tipo_servicio,
           cliente_id,
           cliente_nombre,
           cliente_telefono,
           direccion_entrega,
           referencias_entrega,
           total
         FROM pedidos
         WHERE id = ?
         LIMIT 1`,
        [Number(req.body.pedido_id)],
      );
      pedido = rows[0] || null;
    }

    const service =
      pedido?.tipo_servicio ||
      req.body.tipo_servicio ||
      req.body.servicio ||
      'comedor';

    const payload = {
      ...req.body,
      folio: pedido?.id || req.body.folio || req.body.pedido_id || null,
      pedido_id: pedido?.id || req.body.pedido_id || null,
      mesa: pedido?.mesa_numero || req.body.mesa,
      mesero: pedido?.mesero || req.body.mesero || '',
      tipo_servicio: service,
      cliente_id: pedido?.cliente_id || req.body.cliente_id || null,
      cliente_nombre: pedido?.cliente_nombre || req.body.cliente_nombre || null,
      cliente_telefono: pedido?.cliente_telefono || req.body.cliente_telefono || null,
      direccion_entrega: pedido?.direccion_entrega || req.body.direccion_entrega || null,
      referencias_entrega:
        pedido?.referencias_entrega ||
        req.body.referencias_entrega ||
        null,
      total:
        req.body.total !== undefined
          ? req.body.total
          : (pedido?.total || 0),
      cajero: req.user?.nombre || req.body.cajero || '',
      turno_id: req.body.turno_id || 1,
    };

    const ticket = await printer.imprimirPrecuenta(payload);
    const identity =
      payload.pedido_id ||
      payload.folio ||
      payload.mesa ||
      Date.now();

    const survey = await enqueueSurveyAfterPrebill(
      payload,
      service,
      'survey:prebill:' + service + ':' + identity,
    );

    res.json({ success: true, ticket, survey });
  } catch (err) {
    console.error('[precuenta]', err);
    res.status(500).json({
      error: err.message || 'No se pudo imprimir la precuenta',
    });
  }
});

// COBRO DIRECTO: IMPRIME COMANDA SI AÚN NO SE HA IMPRESO
router.post('/cobrar-cuenta', async (req, res) => {
  const result = await orders.charge(req.body, req.user);
  res.json({ success: true, pedido_id: result.pedido_id, total: result.total });
});

router.post('/dividir-cuenta', async (req, res) =>
  res.json({ success: true, pedido: await orders.split(req.body, req.user) }),
);
router.surveyForService = surveyForService;
module.exports = router;
