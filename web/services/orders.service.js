const { randomUUID } = require('node:crypto');

const ops = require('./operations.service'),
  printQueue = require('./print-queue.service'),
  kdsOrder = require('./kds-order.service');
const db = require('../config/db');
const settings = require('./settings.service');
const { fail, amount, validateItems, deltaItems, paymentParts } = require('../lib/order');
const { can } = require('../lib/permissions');
const serviceAvailability = require('../lib/service-availability');
async function transaction(fn) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
async function currentShift(conn) {
  const [[shift]] = await conn.query(
    "SELECT id FROM turnos_caja WHERE estado='abierto' LIMIT 1 FOR UPDATE",
  );
  return shift?.id || null;
}
async function activeShift(conn) {
  const shift = await currentShift(conn);
  if (!shift) fail('Abre un turno de caja primero', 409);
  return shift;
}
async function priceItems(conn, items, serviceType = null) {
  validateItems(items);
  const cfg = await settings.get(conn);
  const result = [];
  for (const it of items) {
    const [[p]] = await conn.query('SELECT * FROM productos WHERE id=? FOR UPDATE', [
      it.producto_id,
    ]);
    if (!p || !p.activo || !p.disponible_venta) fail('Producto no disponible');
    if (serviceType && !serviceAvailability.allowed(p, serviceType))
      fail(`${p.nombre} no está disponible para ${serviceAvailability.label(serviceType)}`, 409);
    const [variants] = await conn.query('SELECT * FROM variantes_producto WHERE producto_id=?', [
      p.id,
    ]);
    const variant = variants.find((v) => it.nombre === p.nombre + ' (' + v.nombre + ')');
    if (variants.length && !variant) fail('Selecciona una variante válida de ' + p.nombre);
    if (variant && !variant.disponible) fail('Variante agotada');
    if (variant && serviceType && !serviceAvailability.allowed(variant, serviceType, p))
      fail(`${p.nombre} (${variant.nombre}) no está disponible para ${serviceAvailability.label(serviceType)}`, 409);
    let cents = amount(variant ? variant.precio : p.precio);
    // El catálogo heredado usa precio cero para artículos de precio abierto.
    if (!cfg.pos.allowNotes && String(it.notas || '').trim())
      fail('Las notas por producto están deshabilitadas');
    if (!variant && cents === 0) {
      if (!cfg.pos.allowOpenPrice) fail('Los precios abiertos están deshabilitados');
      cents = amount(it.precio_unitario);
    }
    const names = String(it.modificadores || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (new Set(names).size !== names.length) fail('Modificadores repetidos');
    const [options] = await conn.query(
      'SELECT mo.*, mg.obligatorio FROM modificador_opciones mo JOIN producto_modificador_grupos pg ON pg.grupo_id=mo.grupo_id JOIN modificador_grupos mg ON mg.id=mo.grupo_id WHERE pg.producto_id=? AND mg.activo=TRUE AND mo.activo=TRUE',
      [p.id],
    );
    for (const name of names) {
      const matches = options.filter((o) => o.nombre === name);
      if (matches.length !== 1 || !matches[0].disponible) fail('Modificador no válido: ' + name);
      if (variant || amount(p.precio) > 0) cents += amount(matches[0].precio_extra);
    }
    for (const option of options)
      if (
        option.obligatorio &&
        !options.some((o) => o.grupo_id === option.grupo_id && names.includes(o.nombre))
      )
        fail('Falta un modificador obligatorio');
    if (cents !== amount(it.precio_unitario)) fail('El precio cambió. Recarga el catálogo.', 409);
    result.push({
      ...it,
      producto_id: p.id,
      cantidad: Number(it.cantidad),
      precio_unitario: cents / 100,
      nombre: variant
        ? p.nombre + ' (' + variant.nombre + ')'
        : amount(p.precio) > 0
          ? p.nombre
          : it.nombre,
      numero_plato: Number(it.numero_plato) || 1,
    });
  }
  return result;
}
async function releaseStock(conn, id) {
  const [allocations] = await conn.query(
    'SELECT * FROM pedido_stock WHERE pedido_id=? ORDER BY tipo,recurso_id FOR UPDATE',
    [id],
  );
  for (const a of allocations) {
    const table = a.tipo === 'insumo' ? 'insumos' : 'productos';
    await conn.query('UPDATE ' + table + ' SET stock_actual=stock_actual+? WHERE id=?', [
      a.cantidad,
      a.recurso_id,
    ]);
  }
  await conn.query('DELETE FROM pedido_stock WHERE pedido_id=?', [id]);
}
async function reserveStock(conn, id, items) {
  const needs = new Map();
  for (const it of items) {
    const [[p]] = await conn.query(
      'SELECT es_compuesto,seguimiento_stock FROM productos WHERE id=?',
      [it.producto_id],
    );
    if (p.es_compuesto) {
      const [recipe] = await conn.query(
        'SELECT insumo_id,cantidad FROM recetas WHERE producto_id=?',
        [it.producto_id],
      );
      if (!recipe.length) fail('El producto compuesto no tiene receta');
      for (const row of recipe) {
        if (Number(row.cantidad) <= 0) fail('Cantidad inválida en receta');
        add('insumo', row.insumo_id, Number(row.cantidad) * it.cantidad);
      }
    } else if (p.seguimiento_stock) add('producto', it.producto_id, it.cantidad);
  }
  function add(type, id, qty) {
    const key = type + ':' + id;
    const prev = needs.get(key) || { type, id, qty: 0 };
    prev.qty += qty;
    needs.set(key, prev);
  }
  for (const n of [...needs.values()].sort((a, b) =>
    (a.type + ':' + a.id).localeCompare(b.type + ':' + b.id),
  )) {
    n.qty = Math.round(n.qty * 1000) / 1000;
    const table = n.type === 'insumo' ? 'insumos' : 'productos';
    const [result] = await conn.query(
      'UPDATE ' + table + ' SET stock_actual=stock_actual-? WHERE id=? AND stock_actual>=?',
      [n.qty, n.id, n.qty],
    );
    if (result.affectedRows !== 1) fail('Stock insuficiente para ' + n.type + ' #' + n.id, 409);
    await conn.query(
      'INSERT INTO pedido_stock(pedido_id,tipo,recurso_id,cantidad) VALUES(?,?,?,?)',
      [id, n.type, n.id, n.qty],
    );
  }
}
async function saveItems(conn, id, items) {
  const [existingLines] = await conn.query(
    'SELECT kds_line_id FROM pedido_items WHERE pedido_id=? FOR UPDATE',
    [id],
  );

  const reusableIds = new Set(
    existingLines
      .map((line) => line.kds_line_id)
      .filter(Boolean),
  );

  const usedIds = new Set();

  await releaseStock(conn, id);
  await reserveStock(conn, id, items);

  await conn.query('DELETE FROM pedido_items WHERE pedido_id=?', [id]);

  for (const it of items) {
    const requestedId =
      typeof it.kds_line_id === 'string' ? it.kds_line_id : '';

    let kdsLineId;

    if (reusableIds.has(requestedId) && !usedIds.has(requestedId)) {
      kdsLineId = requestedId;
    } else {
      do {
        kdsLineId = randomUUID();
      } while (usedIds.has(kdsLineId) || reusableIds.has(kdsLineId));
    }

    usedIds.add(kdsLineId);

    await conn.query(
      `
      INSERT INTO pedido_items(
        pedido_id,
        producto_id,
        nombre,
        cantidad,
        precio_unitario,
        modificadores,
        notas,
        numero_plato,
        kds_line_id,
        es_variable
      )
      VALUES(?,?,?,?,?,?,?,?,?,?)
      `,
      [
        id,
        it.producto_id,
        it.nombre,
        it.cantidad,
        it.precio_unitario,
        it.modificadores || '',
        it.notas || '',
        it.numero_plato || 1,
        kdsLineId,
        it.es_variable ? 1 : 0,
      ],
    );

    it.kds_line_id = kdsLineId;
  }
}
const sum = (items) =>
  items.reduce((s, it) => s + Math.round(amount(it.precio_unitario) * it.cantidad), 0);
async function march(body, user) {
  return transaction(async (conn) => {
    const key = body.request_id ? 'march:' + body.request_id : null;
    const replay = await ops.begin(conn, key, body);
    if (replay) return replay;
    const shift = body.allow_without_shift ? await currentShift(conn) : await activeShift(conn);
    if (typeof body.mesa !== 'string' || !body.mesa.trim() || body.mesa.length > 50)
      fail('Mesa inválida');
    const tipo = body.tipo_servicio || 'comedor';
    if (!['comedor', 'delivery', 'para_llevar'].includes(tipo)) fail('Servicio inválido');
    const items = await priceItems(conn, body.items, tipo);
    const [[old]] = await conn.query(
      "SELECT * FROM pedidos WHERE mesa_numero=? AND estado IN ('abierto','pendiente') FOR UPDATE",
      [body.mesa],
    );
    if (old && body.expected_version !== undefined && Number(body.expected_version) !== old.version)
      fail('Otro usuario modificó la comanda. Recarga.', 409);
    let id = old?.id,
      numero = old?.numero_turno;
    const [previous] = id
      ? await conn.query('SELECT * FROM pedido_items WHERE pedido_id=?', [id])
      : [[]];
    if (!id) {
      await conn.query(
        'INSERT INTO secuencia_turnos_dia(fecha,ultimo_turno) VALUES(CURDATE(),1) ON DUPLICATE KEY UPDATE ultimo_turno=ultimo_turno+1',
      );
      const [[seq]] = await conn.query(
        'SELECT ultimo_turno FROM secuencia_turnos_dia WHERE fecha=CURDATE()',
      );
      numero = seq.ultimo_turno;
      const [created] = await conn.query(
        'INSERT INTO pedidos(mesa_numero,mesero,turno_id,numero_turno) VALUES(?,?,?,?)',
        [body.mesa, user.nombre, shift, numero],
      );
      id = created.insertId;
    }
    const cfg = await settings.get(conn);
    if (!old || old.tipo_servicio !== tipo)
      require('../lib/order-policy').check(cfg, { ...body, tipo_servicio: tipo });
    await saveItems(conn, id, items);
    await conn.query(
      'UPDATE pedidos SET version=version+1,total=?,tipo_servicio=?,cliente_id=?,cliente_nombre=?,cliente_telefono=?,direccion_entrega=?,referencias_entrega=? WHERE id=?',
      [
        sum(items) / 100,
        tipo,
        body.cliente_id || null,
        body.cliente_nombre || null,
        body.cliente_telefono || null,
        body.direccion_entrega || null,
        body.referencias_entrega || null,
        id,
      ],
    );
    const diff = deltaItems(previous, items);
    const ticket = {
      ...body,
      pedido_id: id,
      numero_turno: numero,
      mesero: user.nombre,
      items,
      total: sum(items) / 100,
    };
    if (body.review_required)
      await conn.query("UPDATE pedidos SET estado='pendiente' WHERE id=?", [id]);
    if (!body.review_required && diff.added.length) {
      const extra = Boolean(old);

      await printQueue.enqueue(conn, 'kitchen', {
        ...ticket,
        items: diff.added,
        es_adicional: extra,
      });

      await ops.kitchen(conn, id, {
        ...ticket,
        items: diff.added,
        es_adicional: extra,
      });
    }
    if (!body.review_required && diff.removed.length) {
      await printQueue.enqueue(conn, 'cancel', { ...ticket, items: diff.removed });
      await ops.kitchen(conn, id, { ...ticket, items: diff.removed, cancellation: true });
    }
    const hasKitchenChange = diff.added.length || diff.removed.length;

    if (!body.review_required && hasKitchenChange) {
      await kdsOrder.enqueueOrder(conn, id, {
        extra: Boolean(old) && diff.added.length > 0,
        extraLineIds: Boolean(old)
          ? diff.added.map((item) => item.kds_line_id).filter(Boolean)
          : [],
      });
    }
    await ops.audit(conn, user, 'order.saved', id, { total: ticket.total });
    return ops.finish(conn, key, {
      pedido_id: id,
      numero_turno: numero,
      ...diff,
      items,
      total: ticket.total,
    });
  });
}

/* ============================================================
 * MP_POINT_AUTHORITATIVE_TOTAL_V1
 *
 * Calcula el total desde pedido_items persistidos.
 * Reutiliza sum(), igual que el cobro normal.
 *
 * NO confía en montos enviados por navegador.
 * NO modifica el pedido.
 * NO registra pagos.
 * ============================================================ */
async function authoritativeOpenOrderTotal(
  conn,
  pedidoId,
  discountId = null
) {
  const [items] = await conn.query(
    'SELECT * FROM pedido_items WHERE pedido_id=?',
    [pedidoId]
  );

  if (!items.length) {
    fail('La comanda está vacía');
  }

  const subtotal = sum(items);

  let discountCents = 0;
  let resolvedDiscountId = null;

  if (discountId) {
    const [[discount]] =
      await conn.query(
        `
        SELECT *
        FROM descuentos
        WHERE id=?
          AND activo=TRUE
          AND (
            vigente_desde IS NULL
            OR vigente_desde<=NOW()
          )
          AND (
            vigente_hasta IS NULL
            OR vigente_hasta>=NOW()
          )
        `,
        [discountId]
      );

    if (!discount) {
      fail(
        'Descuento no disponible',
        409
      );
    }

    if (
      subtotal <
      amount(discount.minimo_compra || 0)
    ) {
      fail(
        'No se alcanza el mínimo del descuento',
        409
      );
    }

    if (discount.tipo === 'porcentaje') {
      const pct =
        Math.min(
          100,
          Math.max(
            0,
            Number(discount.valor)
          )
        );

      discountCents =
        Math.round(
          subtotal * pct / 100
        );
    } else {
      discountCents =
        Math.min(
          subtotal,
          amount(discount.valor)
        );
    }

    resolvedDiscountId =
      discount.id;
  }

  const total =
    Math.max(
      0,
      subtotal - discountCents
    );

  return {
    items,
    subtotal,
    discountCents,
    discountId:
      resolvedDiscountId,
    total
  };
}


async function charge(body, user) {
  return transaction(async (conn) => {
    const key = body.request_id ? 'charge:' + body.request_id : null;
    const replay = await ops.begin(conn, key, body);
    if (replay) return replay;
    const shift = await activeShift(conn);
    const cfg = await settings.get(conn);
    let [[p]] = body.pedido_id
      ? await conn.query('SELECT * FROM pedidos WHERE id=? FOR UPDATE', [body.pedido_id])
      : await conn.query(
          "SELECT * FROM pedidos WHERE mesa_numero=? AND estado IN ('abierto','pendiente') FOR UPDATE",
          [body.mesa],
        );
    if (body.pedido_id && !p) fail('Pedido no encontrado', 404);
    if (p && !['abierto', 'pendiente'].includes(p.estado))
      fail('Este pedido ya no puede cobrarse', 409);
    let items,
      created = false;
    if (p) {
      [items] = await conn.query('SELECT * FROM pedido_items WHERE pedido_id=?', [p.id]);
    } else {
      items = await priceItems(conn, body.items, body.tipo_servicio || 'comedor');
      await conn.query(
        'INSERT INTO secuencia_turnos_dia(fecha,ultimo_turno) VALUES(CURDATE(),1) ON DUPLICATE KEY UPDATE ultimo_turno=ultimo_turno+1',
      );
      const [[quickSeq]] = await conn.query(
        'SELECT ultimo_turno FROM secuencia_turnos_dia WHERE fecha=CURDATE()',
      );
      const [result] = await conn.query(
        'INSERT INTO pedidos(mesa_numero,mesero,turno_id,numero_turno) VALUES(?,?,?,?)',
        [body.mesa || 'Venta rápida', user.nombre, shift, quickSeq.ultimo_turno],
      );
      p = { id: result.insertId, numero_turno: quickSeq.ultimo_turno };
      await saveItems(conn, p.id, items);
      created = true;
    }
    // New requirements must not strand an account that was already open.
    if (created) require('../lib/order-policy').check(cfg, { ...p, ...body });
    if (!items.length) fail('La comanda está vacía');
    const subtotal = sum(items);
    let discountCents=0,discountId=null;
    if(body.descuento_id){const [[d]]=await conn.query(`SELECT * FROM descuentos WHERE id=? AND activo=TRUE AND (vigente_desde IS NULL OR vigente_desde<=NOW()) AND (vigente_hasta IS NULL OR vigente_hasta>=NOW())`,[body.descuento_id]);if(!d)fail('Descuento no disponible',409);if(subtotal<amount(d.minimo_compra||0))fail('No se alcanza el mínimo del descuento',409);discountCents=d.tipo==='porcentaje'?Math.round(subtotal*Math.min(100,Math.max(0,Number(d.valor)))/100):Math.min(subtotal,amount(d.valor));discountId=d.id;}
    const total=Math.max(0,subtotal-discountCents);
    if (amount(body.total) !== total) fail('La comanda o descuento cambió. Actualiza antes de cobrar.', 409);
    const parts = paymentParts(body, total);
    // MP5_PAYMENT_PERMISSION_ENFORCEMENT_V1
    //
    // `charge` es el permiso maestro.
    // Cada método de pago tiene además permiso granular.
    //
    // IMPORTANTE:
    // tarjeta NO puede liquidarse mediante cobrar-cuenta.
    // Debe pasar por Mercado Pago Point y confirmarse
    // desde backend.
    if (!can(cfg, user.rol, 'charge')) {
      fail(
        'Tu rol no tiene permiso para cobrar',
        403
      );
    }

    const activePaymentMethods =
      Object.keys(parts).filter(
        (paymentMethod) =>
          Number(parts[paymentMethod] || 0) > 0
      );

    if (
      activePaymentMethods.length > 1 &&
      !can(cfg, user.rol, 'chargeMixed')
    ) {
      fail(
        'Tu rol no tiene permiso para cobros mixtos',
        403
      );
    }

    if (
      Number(parts.efectivo || 0) > 0 &&
      !can(cfg, user.rol, 'chargeCash')
    ) {
      fail(
        'Tu rol no tiene permiso para cobrar en efectivo',
        403
      );
    }

    if (
      Number(parts.transferencia || 0) > 0 &&
      !can(cfg, user.rol, 'chargeTransfer')
    ) {
      fail(
        'Tu rol no tiene permiso para cobrar por transferencia',
        403
      );
    }

    // MP5_CHARGE_CARD_ENFORCEMENT_V1
    //
    // `tarjeta` en cobrar-cuenta representa
    // una tarjeta MANUAL / terminal externa.
    //
    // Mercado Pago Point NO entra por esta ruta:
    // usa su propio flujo seguro y chargePoint.
    if (
      Number(parts.tarjeta || 0) > 0 &&
      !can(cfg, user.rol, 'chargeCard')
    ) {
      fail(
        'Tu rol no tiene permiso para cobrar con tarjeta manual',
        403
      );
    }
    const method = Object.keys(parts).filter((k) => parts[k] > 0);
    const metodo = method.length > 1 ? 'mixto' : method[0] || body.metodo_pago || 'efectivo';
    const cashParts = body.pagos?.filter((p) => p.metodo === 'efectivo');
    const received = cashParts?.length
      ? cashParts.reduce((n, p) => n + amount(p.recibido ?? p.monto), 0)
      : parts.efectivo
        ? amount(body.paga_con ?? parts.efectivo / 100)
        : 0;
    if (received < parts.efectivo) fail('Efectivo insuficiente');
    const change = received - parts.efectivo;
    await conn.query(
      "UPDATE pedidos SET total=?,subtotal_antes_descuento=?,descuento_id=?,descuento_monto=?,estado='pagado',estado_despacho='entregado',metodo_pago=?,paga_con=?,cambio=?,turno_id=?,fecha_pago=NOW(),pago_efectivo=?,pago_tarjeta=?,pago_transferencia=? WHERE id=?",
      [
        total / 100,
        subtotal / 100,
        discountId,
        discountCents / 100,
        metodo,
        received / 100,
        change / 100,
        shift,
        parts.efectivo / 100,
        parts.tarjeta / 100,
        parts.transferencia / 100,
        p.id,
      ],
    );
    const result = {
      pedido_id: p.id,
      items,
      total: total / 100,
      subtotal: subtotal / 100,
      descuento_id: discountId,
      descuento_monto: discountCents / 100,
      metodo_pago: metodo,
      paga_con: received / 100,
      cambio_llevar: change / 100,
      created,
    };
    /*
     * DELIVERY_CUSTOMER_RECEIPT_V1
     *
     * La cuenta final debe reutilizar los datos persistidos del pedido.
     * No dependemos de que el frontend vuelva a enviar cliente/domicilio
     * al momento de cobrar.
     */
    const ticket = {
      ...body,
      ...result,

      folio: p.id,
      pedido_id: p.id,
      numero_turno: p.numero_turno ?? null,

      tipo_servicio:
        p.tipo_servicio ||
        body.tipo_servicio ||
        body.servicio ||
        'comedor',

      cliente_id:
        p.cliente_id ||
        body.cliente_id ||
        null,

      cliente_nombre:
        p.cliente_nombre ||
        body.cliente_nombre ||
        null,

      cliente_telefono:
        p.cliente_telefono ||
        body.cliente_telefono ||
        null,

      direccion_entrega:
        p.direccion_entrega ||
        body.direccion_entrega ||
        null,

      referencias_entrega:
        p.referencias_entrega ||
        body.referencias_entrega ||
        null,

      cajero: user.nombre,
    };
    if (created) {
      await printQueue.enqueue(conn, 'kitchen', ticket);

      await ops.kitchen(conn, p.id, ticket);

      await kdsOrder.enqueueOrder(conn, p.id);
    }
    if (body.imprimir_ticket || cfg.printing.autoReceipt) {
      await printQueue.enqueue(conn, 'receipt', ticket);
    }
    if (parts.efectivo > 0 && cfg.printing.drawerOnCash && can(cfg, user.rol, 'drawer'))
      await printQueue.enqueue(
        conn,
        'drawer',
        { usuario_nombre: user.nombre, motivo: 'cobro_efectivo' },
        'cash-drawer:' + p.id,
      );
    await ops.audit(conn, user, 'order.paid', p.id, { total: result.total, payments: parts });
    return ops.finish(conn, key, result);
  });
}
async function cancel(body, user = { nombre: 'Sistema' }) {
  return transaction(async (conn) => {
    await activeShift(conn);
    const [[p]] = body.pedido_id
      ? await conn.query('SELECT * FROM pedidos WHERE id=? FOR UPDATE', [body.pedido_id])
      : await conn.query(
          "SELECT * FROM pedidos WHERE mesa_numero=? AND estado IN ('abierto','pendiente') FOR UPDATE",
          [body.mesa],
        );
    if (!p) fail('Pedido no encontrado', 404);
    if (!['abierto', 'pendiente'].includes(p.estado))
      fail('Sólo puedes cancelar comandas abiertas', 409);
    const [items] = await conn.query('SELECT * FROM pedido_items WHERE pedido_id=?', [p.id]);
    await releaseStock(conn, p.id);
    await conn.query(
      `
  UPDATE pedidos
  SET
    estado='cancelado',
    version=version+1
  WHERE id=?
  `,
      [p.id],
    );

    await conn.query(
      "UPDATE kitchen_tickets SET status='cancelled',version=version+1 WHERE pedido_id=? AND status!='done'",
      [p.id],
    );
    await printQueue.enqueue(conn, 'cancel', {
      pedido_id: p.id,
      numero_turno: p.numero_turno ?? null,
      mesero: p.mesero,
      items,
      mesa: p.mesa_numero
    });
    await kdsOrder.enqueueOrder(conn, p.id, {
      empty: true,
    });
    await ops.audit(conn, user, 'order.cancelled', p.id);
    return { pedido_id: p.id, items, mesa: p.mesa_numero };
  });
}
async function refund(body, user) {
  return transaction(async (conn) => {
    const shift = await activeShift(conn);
    const [[p]] = await conn.query('SELECT * FROM pedidos WHERE id=? FOR UPDATE', [body.pedido_id]);
    if (!p) fail('Pedido no encontrado', 404);
    if (p.estado !== 'pagado') fail('Sólo se reembolsa un pedido pagado', 409);
    if (!String(body.motivo || '').trim()) fail('Escribe el motivo del reembolso');
    if (body.restock_items === true && p.migrated_legacy)
      fail(
        'Pedido histórico importado: ajusta el inventario manualmente tras verificar la devolución',
        409,
      );
    if (body.restock_items === true) await releaseStock(conn, p.id);
    await conn.query(
      "UPDATE pedidos SET estado='reembolsado',motivo_reembolso=?,usuario_reembolso_nombre=?,fecha_reembolso=NOW(),monto_reembolsado=total WHERE id=?",
      [body.motivo, user.nombre, p.id],
    );
    if (Number(p.pago_efectivo) > 0)
      await conn.query(
        "INSERT INTO movimientos_caja(turno_id,usuario_nombre,tipo,monto,motivo) VALUES(?,?,'pay_out',?,?)",
        [shift, user.nombre, p.pago_efectivo, 'Reembolso #' + p.id],
      );
    const [items] = await conn.query('SELECT * FROM pedido_items WHERE pedido_id=?', [p.id]);
    await printQueue.enqueue(conn, 'refund', { ...p, items, motivo: body.motivo });
    await ops.audit(conn, user, 'order.refunded', p.id, { restock: body.restock_items === true });
    return { ...p, items };
  });
}
async function split(body, user) {
  return transaction(async (conn) => {
    const shift = await activeShift(conn);
    const [[p]] = await conn.query('SELECT * FROM pedidos WHERE id=? FOR UPDATE', [body.pedido_id]);
    if (!p || !['abierto', 'pendiente'].includes(p.estado))
      fail('Guarda una comanda abierta antes de dividir', 409);
    validateItems(body.origen);
    validateItems(body.destino);
    if (!body.destino.length) fail('Selecciona artículos');
    const [original] = await conn.query('SELECT * FROM pedido_items WHERE pedido_id=?', [p.id]);
    const changes = deltaItems(original, [...body.origen, ...body.destino]);
    if (changes.added.length || changes.removed.length)
      fail('La cuenta cambió. Guarda y vuelve a dividir.', 409);
    const [created] = await conn.query(
      'INSERT INTO pedidos(mesa_numero,mesero,tipo_servicio,turno_id,numero_turno) VALUES(?,?,?,?,?)',
      ['Sub ' + p.id + ' ' + Date.now(), p.mesero, p.tipo_servicio, shift, p.numero_turno],
    );
    await saveItems(conn, p.id, body.origen);
    await saveItems(conn, created.insertId, body.destino);
    await conn.query('UPDATE pedidos SET total=?,estado=? WHERE id=?', [
      sum(body.origen) / 100,
      body.origen.length ? 'abierto' : 'cancelado',
      p.id,
    ]);
    await conn.query('UPDATE pedidos SET total=? WHERE id=?', [
      sum(body.destino) / 100,
      created.insertId,
    ]);
    const [[sub]] = await conn.query('SELECT * FROM pedidos WHERE id=?', [created.insertId]);
    await ops.audit(conn, user, 'order.split', p.id, { destination: sub.id });
    return sub;
  });
}
module.exports = {
  authoritativeOpenOrderTotal, split, march, charge, cancel, refund, transaction, priceItems, saveItems, sum };
