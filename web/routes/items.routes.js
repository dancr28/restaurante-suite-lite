const express = require('express');
const router = express.Router();
const db = require('../config/db');
router.use(async (req, res, next) => {
  const match = req.path.match(/^\/productos\/(\d+)$/);
  if (match && ['PUT', 'DELETE'].includes(req.method)) {
    const [[used]] = await db.query(
      "SELECT COUNT(*) n FROM pedido_items i JOIN pedidos p ON p.id=i.pedido_id WHERE i.producto_id=? AND p.estado IN ('abierto','pendiente')",
      [match[1]],
    );
    if (used.n)
      return res
        .status(409)
        .json({
          error:
            'Hay comandas abiertas con este producto. Ciérralas antes de editar su receta o variantes.',
        });
  }
  next();
});
const { syncMenu: notificarCambioAlBot } = require('../services/whatsapp.service');

// ========================================================
// 1. PRODUCTOS
// ========================================================

router.get('/productos', async (req, res) => {
  try {
    const [productos] = await db.query(`
      SELECT p.*, c.nombre AS categoria_nombre, c.color AS categoria_color 
      FROM productos p 
      LEFT JOIN categorias c ON p.categoria_id = c.id 
      WHERE p.activo = TRUE 
      ORDER BY p.nombre ASC
    `);

    for (const p of productos) {
      const [vars] = await db.query(
        'SELECT * FROM variantes_producto WHERE producto_id = ? ORDER BY nombre ASC',
        [p.id],
      );
      const [mods] = await db.query(
        'SELECT grupo_id FROM producto_modificador_grupos WHERE producto_id = ?',
        [p.id],
      );
      p.variantes = vars;
      p.modificadores_ids = mods.map((m) => m.grupo_id);
    }

    res.json(productos);
  } catch (err) {
    console.error('[ERROR GET /productos]:', err);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

router.get('/productos/:id', async (req, res) => {
  try {
    const [[producto]] = await db.query('SELECT * FROM productos WHERE id = ?', [req.params.id]);
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

    const [variantes] = await db.query(
      'SELECT * FROM variantes_producto WHERE producto_id = ? ORDER BY nombre ASC',
      [req.params.id],
    );
    const [modGrupos] = await db.query(
      'SELECT grupo_id FROM producto_modificador_grupos WHERE producto_id = ?',
      [req.params.id],
    );
    const [receta] = await db.query(
      `
      SELECT r.*, i.nombre AS insumo_nombre, i.unidad_medida, i.costo_unitario 
      FROM recetas r 
      JOIN insumos i ON r.insumo_id = i.id 
      WHERE r.producto_id = ?
    `,
      [req.params.id],
    );

    res.json({
      producto,
      variantes,
      modificadores_vinculados: modGrupos.map((m) => m.grupo_id),
      receta,
    });
  } catch (err) {
    console.error('[ERROR GET /productos/:id]:', err);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

// Toggle 1-clic Disponible / Agotado
router.patch('/productos/:id/toggle-disponibilidad', async (req, res) => {
  try {
    const [[p]] = await db.query('SELECT disponible_venta FROM productos WHERE id = ?', [
      req.params.id,
    ]);
    if (!p) return res.status(404).json({ error: 'Producto no encontrado' });

    const nuevoEstado = p.disponible_venta === 1 ? 0 : 1;
    await db.query('UPDATE productos SET disponible_venta = ? WHERE id = ?', [
      nuevoEstado,
      req.params.id,
    ]);

    notificarCambioAlBot();
    res.json({ success: true, disponible_venta: nuevoEstado });
  } catch (err) {
    console.error('[ERROR PATCH /productos/toggle-disponibilidad]:', err);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

router.post('/productos', async (req, res) => {
  const {
    nombre,
    categoria_id,
    precio,
    costo,
    sku,
    codigo_barras,
    modalidad_venta,
    disponible_venta,
    disponible_comedor,
    disponible_para_llevar,
    disponible_delivery,
    es_compuesto,
    seguimiento_stock,
    stock_actual,
    stock_minimo,
    variantes,
    grupos_modificadores,
    receta,
  } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre del artículo es obligatorio.' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [resProd] = await conn.query(
      `
      INSERT INTO productos (
        nombre, categoria_id, precio, costo, sku, codigo_barras,
        modalidad_venta, disponible_venta, disponible_comedor, disponible_para_llevar,
        disponible_delivery, es_compuesto, seguimiento_stock, stock_actual, stock_minimo, activo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
    `,
      [
        nombre.trim(),
        categoria_id ? parseInt(categoria_id) : null,
        parseFloat(precio) || 0,
        parseFloat(costo) || 0,
        sku || null,
        codigo_barras || null,
        modalidad_venta || 'unidad',
        disponible_venta !== undefined ? (disponible_venta ? 1 : 0) : 1,
        disponible_comedor !== false ? 1 : 0,
        disponible_para_llevar !== false ? 1 : 0,
        disponible_delivery !== false ? 1 : 0,
        es_compuesto ? 1 : 0,
        seguimiento_stock ? 1 : 0,
        parseFloat(stock_actual) || 0,
        parseFloat(stock_minimo) || 0,
      ],
    );

    const prodId = resProd.insertId;

    if (variantes && Array.isArray(variantes)) {
      for (const v of variantes) {
        if (v.nombre && v.nombre.trim()) {
          await conn.query(
            `
            INSERT INTO variantes_producto
              (producto_id,nombre,precio,costo,stock_actual,disponible,
               disponible_comedor,disponible_para_llevar,disponible_delivery)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
            [
              prodId,
              v.nombre.trim(),
              parseFloat(v.precio) || 0,
              parseFloat(v.costo) || 0,
              parseFloat(v.stock_actual) || 0,
              v.disponible !== false ? 1 : 0,
              v.disponible_comedor === null || v.disponible_comedor === undefined ? null : (v.disponible_comedor ? 1 : 0),
              v.disponible_para_llevar === null || v.disponible_para_llevar === undefined ? null : (v.disponible_para_llevar ? 1 : 0),
              v.disponible_delivery === null || v.disponible_delivery === undefined ? null : (v.disponible_delivery ? 1 : 0),
            ],
          );
        }
      }
    }

    if (grupos_modificadores && Array.isArray(grupos_modificadores)) {
      for (const gId of grupos_modificadores) {
        await conn.query(
          'INSERT INTO producto_modificador_grupos (producto_id, grupo_id) VALUES (?, ?)',
          [prodId, parseInt(gId)],
        );
      }
    }

    if (es_compuesto && receta && Array.isArray(receta)) {
      for (const r of receta) {
        if (r.insumo_id) {
          await conn.query(
            `
            INSERT INTO recetas (producto_id, insumo_id, cantidad, factor_merma)
            VALUES (?, ?, ?, ?)
          `,
            [prodId, parseInt(r.insumo_id), parseFloat(r.cantidad) || 1, 0],
          );
        }
      }
    }

    await conn.commit();
    notificarCambioAlBot();
    res.json({ success: true, id: prodId });
  } catch (err) {
    await conn.rollback();
    console.error('[ERROR POST /productos]:', err);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  } finally {
    conn.release();
  }
});

router.put('/productos/:id', async (req, res) => {
  const prodId = req.params.id;
  const {
    nombre,
    categoria_id,
    precio,
    costo,
    sku,
    codigo_barras,
    modalidad_venta,
    disponible_venta,
    disponible_comedor,
    disponible_para_llevar,
    disponible_delivery,
    es_compuesto,
    seguimiento_stock,
    stock_actual,
    stock_minimo,
    variantes,
    grupos_modificadores,
    receta,
  } = req.body;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `
      UPDATE productos SET
        nombre = ?, categoria_id = ?, precio = ?, costo = ?, sku = ?, codigo_barras = ?,
        modalidad_venta = ?, disponible_venta = ?, disponible_comedor = ?,
        disponible_para_llevar = ?, disponible_delivery = ?, es_compuesto = ?, seguimiento_stock = ?,
        stock_actual = ?, stock_minimo = ?
      WHERE id = ?
    `,
      [
        nombre.trim(),
        categoria_id ? parseInt(categoria_id) : null,
        parseFloat(precio) || 0,
        parseFloat(costo) || 0,
        sku || null,
        codigo_barras || null,
        modalidad_venta || 'unidad',
        disponible_venta ? 1 : 0,
        disponible_comedor !== false ? 1 : 0,
        disponible_para_llevar !== false ? 1 : 0,
        disponible_delivery !== false ? 1 : 0,
        es_compuesto ? 1 : 0,
        seguimiento_stock ? 1 : 0,
        parseFloat(stock_actual) || 0,
        parseFloat(stock_minimo) || 0,
        prodId,
      ],
    );

    const keepVariantIds = [];
    if (variantes && Array.isArray(variantes)) {
      for (const v of variantes) {
        if (!v.nombre || !v.nombre.trim()) continue;
        const vals = [
          v.nombre.trim(), parseFloat(v.precio) || 0, parseFloat(v.costo) || 0,
          parseFloat(v.stock_actual) || 0, v.disponible !== false ? 1 : 0,
          v.disponible_comedor == null ? null : (v.disponible_comedor ? 1 : 0),
          v.disponible_para_llevar == null ? null : (v.disponible_para_llevar ? 1 : 0),
          v.disponible_delivery == null ? null : (v.disponible_delivery ? 1 : 0),
        ];
        if (v.id) {
          const [updated] = await conn.query(
            `UPDATE variantes_producto SET nombre=?,precio=?,costo=?,stock_actual=?,disponible=?,
             disponible_comedor=?,disponible_para_llevar=?,disponible_delivery=?
             WHERE id=? AND producto_id=?`,
            [...vals, Number(v.id), prodId],
          );
          if (updated.affectedRows) keepVariantIds.push(Number(v.id));
        } else {
          const [created] = await conn.query(
            `INSERT INTO variantes_producto
             (producto_id,nombre,precio,costo,stock_actual,disponible,
              disponible_comedor,disponible_para_llevar,disponible_delivery)
             VALUES(?,?,?,?,?,?,?,?,?)`,
            [prodId, ...vals],
          );
          keepVariantIds.push(created.insertId);
        }
      }
    }
    if (keepVariantIds.length)
      await conn.query(
        `DELETE FROM variantes_producto WHERE producto_id=? AND id NOT IN (${keepVariantIds.map(()=>'?').join(',')})`,
        [prodId, ...keepVariantIds],
      );
    else
      await conn.query('DELETE FROM variantes_producto WHERE producto_id=?', [prodId]);

    await conn.query('DELETE FROM producto_modificador_grupos WHERE producto_id = ?', [prodId]);
    if (grupos_modificadores && Array.isArray(grupos_modificadores)) {
      for (const gId of grupos_modificadores) {
        await conn.query(
          'INSERT INTO producto_modificador_grupos (producto_id, grupo_id) VALUES (?, ?)',
          [prodId, parseInt(gId)],
        );
      }
    }

    await conn.query('DELETE FROM recetas WHERE producto_id = ?', [prodId]);
    if (es_compuesto && receta && Array.isArray(receta)) {
      for (const r of receta) {
        if (r.insumo_id) {
          await conn.query(
            `
            INSERT INTO recetas (producto_id, insumo_id, cantidad, factor_merma)
            VALUES (?, ?, ?, ?)
          `,
            [prodId, parseInt(r.insumo_id), parseFloat(r.cantidad) || 1, 0],
          );
        }
      }
    }

    await conn.commit();
    notificarCambioAlBot();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error('[ERROR PUT /productos]:', err);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  } finally {
    conn.release();
  }
});

router.delete('/productos/:id', async (req, res) => {
  try {
    await db.query('UPDATE productos SET activo = FALSE WHERE id = ?', [req.params.id]);
    notificarCambioAlBot();
    res.json({ success: true });
  } catch (err) {
    console.error('[ERROR DELETE /productos]:', err);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

// ========================================================
// 2. CATEGORÍAS
// ========================================================

router.get('/categorias', async (req, res) => {
  try {
    const [cats] = await db.query(
      `SELECT c.*, COUNT(p.id) AS articulos FROM categorias c LEFT JOIN productos p ON p.categoria_id=c.id AND p.activo=TRUE WHERE c.activo=TRUE GROUP BY c.id ORDER BY c.orden ASC,c.nombre ASC`,
    );
    res.json(cats);
  } catch (err) {
    console.error('[ERROR GET /categorias]:', err);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

router.get('/categorias/:id', async (req,res)=>{const [[cat]]=await db.query(`SELECT c.*,COUNT(p.id) articulos FROM categorias c LEFT JOIN productos p ON p.categoria_id=c.id AND p.activo=TRUE WHERE c.id=? AND c.activo=TRUE GROUP BY c.id`,[req.params.id]);if(!cat)return res.status(404).json({error:'No se encontró la categoría'});res.json(cat)});
router.put('/categorias/:id', async (req,res)=>{const {nombre,color}=req.body;if(!String(nombre||'').trim())return res.status(400).json({error:'Nombre requerido'});const [r]=await db.query('UPDATE categorias SET nombre=?,color=? WHERE id=? AND activo=TRUE',[nombre.trim(),color||'#1E88E5',req.params.id]);if(!r.affectedRows)return res.status(404).json({error:'No se encontró la categoría'});res.json({success:true})});

router.post('/categorias', async (req, res) => {
  const { nombre, color } = req.body;
  if (!nombre || !nombre.trim())
    return res.status(400).json({ error: 'Nombre de la categoría requerido' });
  try {
    const [result] = await db.query(
      'INSERT INTO categorias (nombre, color, activo) VALUES (?, ?, TRUE)',
      [nombre.trim(), color || '#1E88E5'],
    );
    notificarCambioAlBot();
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error('[ERROR POST /categorias]:', err);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

router.delete('/categorias/:id', async (req, res) => {
  try {
    await db.query('UPDATE categorias SET activo = FALSE WHERE id = ?', [req.params.id]);
    notificarCambioAlBot();
    res.json({ success: true });
  } catch (err) {
    console.error('[ERROR DELETE /categorias]:', err);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

// ========================================================
// DISPONIBILIDAD RÁPIDA DE VARIANTES Y MODIFICADORES
// ========================================================

router.patch('/variantes/:id/disponibilidad', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const disponible = req.body?.disponible === true || req.body?.disponible === 1;
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ error: 'Variante inválida' });
    const [[row]] = await db.query('SELECT id,producto_id,nombre FROM variantes_producto WHERE id=?', [id]);
    if (!row) return res.status(404).json({ error: 'Variante no encontrada' });
    await db.query('UPDATE variantes_producto SET disponible=? WHERE id=?', [disponible ? 1 : 0, id]);
    await db.query('INSERT INTO audit_events(actor,action,entity_id,details) VALUES(?,?,?,?)', [
      req.user?.nombre || 'Sistema',
      'catalog.variant_availability',
      String(id),
      JSON.stringify({ producto_id: row.producto_id, nombre: row.nombre, disponible }),
    ]);
    notificarCambioAlBot();
    res.json({ success: true, id, disponible });
  } catch (err) {
    next(err);
  }
});

router.patch('/modificadores/opciones/:id/disponibilidad', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const disponible = req.body?.disponible === true || req.body?.disponible === 1;
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ error: 'Opción inválida' });
    const [[row]] = await db.query('SELECT id,grupo_id,nombre FROM modificador_opciones WHERE id=? AND activo=TRUE', [id]);
    if (!row) return res.status(404).json({ error: 'Opción de modificador no encontrada' });
    await db.query('UPDATE modificador_opciones SET disponible=? WHERE id=?', [disponible ? 1 : 0, id]);
    await db.query('INSERT INTO audit_events(actor,action,entity_id,details) VALUES(?,?,?,?)', [
      req.user?.nombre || 'Sistema',
      'catalog.modifier_availability',
      String(id),
      JSON.stringify({ grupo_id: row.grupo_id, nombre: row.nombre, disponible }),
    ]);
    notificarCambioAlBot();
    res.json({ success: true, id, disponible });
  } catch (err) {
    next(err);
  }
});

// ========================================================
// 3. MODIFICADORES
// ========================================================

router.get('/modificadores', async (req, res) => {
  try {
    const [grupos] = await db.query(
      'SELECT * FROM modificador_grupos WHERE activo = TRUE ORDER BY nombre ASC',
    );
    for (const g of grupos) {
      const [opciones] = await db.query(
        'SELECT * FROM modificador_opciones WHERE grupo_id = ? AND activo = TRUE ORDER BY nombre ASC',
        [g.id],
      );
      g.opciones = opciones;
    }
    res.json(grupos);
  } catch (err) {
    console.error('[ERROR GET /modificadores]:', err);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

router.get('/modificadores/grupos/:id', async (req, res) => {
  try {
    const [[grupo]] = await db.query('SELECT * FROM modificador_grupos WHERE id = ?', [
      req.params.id,
    ]);
    if (!grupo) return res.status(404).json({ error: 'Grupo no encontrado' });
    const [opciones] = await db.query(
      'SELECT * FROM modificador_opciones WHERE grupo_id = ? AND activo = TRUE ORDER BY id ASC',
      [grupo.id],
    );
    grupo.opciones = opciones;
    res.json(grupo);
  } catch (err) {
    console.error('[ERROR GET /modificadores/grupos/:id]:', err);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

router.post('/modificadores/completo', async (req, res) => {
  const { nombre, obligatorio, opciones } = req.body;
  if (!nombre || !nombre.trim())
    return res.status(400).json({ error: 'Nombre del grupo obligatorio' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [resG] = await conn.query(
      `
      INSERT INTO modificador_grupos (nombre, obligatorio, activo)
      VALUES (?, ?, TRUE)
    `,
      [nombre.trim(), obligatorio ? 1 : 0],
    );

    const grupoId = resG.insertId;

    if (opciones && Array.isArray(opciones)) {
      for (const opt of opciones) {
        if (opt.nombre && opt.nombre.trim()) {
          await conn.query(
            `
            INSERT INTO modificador_opciones (grupo_id, nombre, precio_extra, activo, disponible)
            VALUES (?, ?, ?, TRUE, ?)
          `,
            [grupoId, opt.nombre.trim(), parseFloat(opt.precio_extra) || 0, opt.disponible === false ? 0 : 1],
          );
        }
      }
    }

    await conn.commit();
    notificarCambioAlBot();
    res.json({ success: true, id: grupoId });
  } catch (err) {
    await conn.rollback();
    console.error('[ERROR POST /modificadores/completo]:', err);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  } finally {
    conn.release();
  }
});

router.put('/modificadores/completo/:id', async (req, res) => {
  const grupoId = req.params.id;
  const { nombre, obligatorio, opciones } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'Nombre requerido' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE modificador_grupos SET nombre = ?, obligatorio = ? WHERE id = ?', [
      nombre.trim(),
      obligatorio ? 1 : 0,
      grupoId,
    ]);
    await conn.query('DELETE FROM modificador_opciones WHERE grupo_id = ?', [grupoId]);

    if (opciones && Array.isArray(opciones)) {
      for (const opt of opciones) {
        if (opt.nombre && opt.nombre.trim()) {
          await conn.query(
            `
            INSERT INTO modificador_opciones (grupo_id, nombre, precio_extra, activo, disponible)
            VALUES (?, ?, ?, TRUE, ?)
          `,
            [grupoId, opt.nombre.trim(), parseFloat(opt.precio_extra) || 0, opt.disponible === false ? 0 : 1],
          );
        }
      }
    }

    await conn.commit();
    notificarCambioAlBot();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error('[ERROR PUT /modificadores/completo]:', err);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  } finally {
    conn.release();
  }
});

router.delete('/modificadores/grupos/:id', async (req, res) => {
  try {
    await db.query('UPDATE modificador_grupos SET activo = FALSE WHERE id = ?', [req.params.id]);
    notificarCambioAlBot();
    res.json({ success: true });
  } catch (err) {
    console.error('[ERROR DELETE /modificadores/grupos]:', err);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

// ========================================================
// 4. DESCUENTOS
// ========================================================

router.get('/descuentos', async (req, res) => {
  try {
    const [descs] = await db.query(
      'SELECT * FROM descuentos WHERE activo = TRUE ORDER BY nombre ASC',
    );
    res.json(descs);
  } catch (err) {
    console.error('[ERROR GET /descuentos]:', err);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

router.post('/descuentos', async (req, res) => {
  const { nombre, tipo, valor, requiere_pin_admin } = req.body;
  if (!nombre || !nombre.trim())
    return res.status(400).json({ error: 'Nombre del descuento requerido' });
  try {
    await db.query(
      `
      INSERT INTO descuentos (nombre, tipo, valor, requiere_pin_admin, activo)
      VALUES (?, ?, ?, ?, TRUE)
    `,
      [nombre.trim(), tipo || 'porcentaje', parseFloat(valor) || 0, requiere_pin_admin ? 1 : 0],
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[ERROR POST /descuentos]:', err);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

router.delete('/descuentos/:id', async (req, res) => {
  try {
    await db.query('UPDATE descuentos SET activo = FALSE WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[ERROR DELETE /descuentos]:', err);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

// ========================================================
// 5. INSUMOS Y EXPORTACIÓN
// ========================================================

router.get('/insumos', async (req, res) => {
  try {
    const [insumos] = await db.query(
      'SELECT id, nombre, unidad_medida, stock_actual FROM insumos WHERE activo = TRUE ORDER BY nombre ASC',
    );
    res.json(insumos);
  } catch (err) {
    console.error('[ERROR GET /insumos]:', err);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

router.post('/insumos', async (req, res) => {
  const { nombre, unidad_medida, costo_unitario, stock_actual, merma_porcentaje } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  try {
    await db.query(
      `
      INSERT INTO insumos (nombre, unidad_medida, costo_unitario, stock_actual, merma_porcentaje, activo)
      VALUES (?, ?, ?, ?, ?, TRUE)
    `,
      [
        nombre.trim(),
        unidad_medida || 'pza',
        parseFloat(costo_unitario) || 0,
        parseFloat(stock_actual) || 0,
        parseFloat(merma_porcentaje) || 0,
      ],
    );
    notificarCambioAlBot();
    res.json({ success: true });
  } catch (err) {
    console.error('[ERROR POST /insumos]:', err);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

router.delete('/insumos/:id', async (req, res) => {
  try {
    await db.query('UPDATE insumos SET activo = FALSE WHERE id = ?', [req.params.id]);
    notificarCambioAlBot();
    res.json({ success: true });
  } catch (err) {
    console.error('[ERROR DELETE /insumos]:', err);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

router.get('/exportar-csv', async (req, res) => {
  try {
    const [productos] = await db.query(`
      SELECT p.id, p.nombre, c.nombre AS categoria, p.precio, p.costo, p.stock_actual 
      FROM productos p 
      LEFT JOIN categorias c ON p.categoria_id = c.id 
      WHERE p.activo = TRUE
    `);
    let csv = 'ID,Nombre,Categoria,Precio,Costo,Stock\n';
    productos.forEach((p) => {
      csv += `"${p.id}","${p.nombre}","${p.categoria || ''}","${p.precio}","${p.costo}","${p.stock_actual}"\n`;
    });
    res.header('Content-Type', 'text/csv');
    res.attachment('catalogo_los_compadres.csv');
    res.send(csv);
  } catch (err) {
    console.error('[ERROR GET /exportar-csv]:', err);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

module.exports = router;
