const express = require('express');
const router = express.Router();
const db = require('../config/db');
const printer = require('../services/printer.service');

// 1. Listado general de recibos con ítems
router.get('/', async (req, res) => {
  try {
    const [pedidos] = await db.query(`
      SELECT p.*, 
             COALESCE(p.created_at, NOW()) AS fecha_creacion
      FROM pedidos p 
      WHERE p.estado IN ('pagado', 'reembolsado', 'cerrado', 'cancelado')
      ORDER BY p.id DESC 
      LIMIT 150
    `);

    for (const p of pedidos) {
      const [items] = await db.query('SELECT * FROM pedido_items WHERE pedido_id = ?', [p.id]);
      p.items = items;
    }

    res.json(pedidos);
  } catch (err) {
    console.error('[ERROR /api/receipts]:', err);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

// 2. Detalle de un recibo específico
router.get('/:id', async (req, res) => {
  try {
    const [[pedido]] = await db.query('SELECT * FROM pedidos WHERE id = ?', [req.params.id]);
    if (!pedido) return res.status(404).json({ error: 'Recibo no encontrado' });

    const [items] = await db.query('SELECT * FROM pedido_items WHERE pedido_id = ?', [pedido.id]);
    pedido.items = items;

    res.json(pedido);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

// 3. Reimprimir Ticket
router.post('/reimprimir/:id', async (req, res) => {
  try {
    const [[p]] = await db.query('SELECT * FROM pedidos WHERE id = ?', [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Recibo no encontrado' });

    const [items] = await db.query('SELECT * FROM pedido_items WHERE pedido_id = ?', [p.id]);

    await printer.imprimirReciboCobro({
      folio: p.id,
      mesa: p.mesa_numero,
      cajero: p.mesero || 'Caja',
      mesero: p.mesero || 'General',
      metodo_pago: p.metodo_pago || 'efectivo',
      paga_con: p.paga_con || p.total,
      cambio_llevar: p.cambio || 0,
      total: p.total,
      items: items,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[ERROR /api/receipts/reimprimir]:', err);
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

// 4. Procesar Reembolso / Devolución
router.post('/reembolso', async (req, res) => {
  await require('../services/orders.service').refund(req.body, req.user);

  res.json({ success: true });
});

// 5. Exportación a CSV
router.get('/export/csv', async (req, res) => {
  try {
    const [pedidos] = await db.query(`
      SELECT p.id, p.mesa_numero, p.mesero, p.total, p.metodo_pago, p.estado, 
             p.cliente_nombre, p.cliente_telefono, p.motivo_reembolso,
             COALESCE(p.created_at, NOW()) AS fecha_pago
      FROM pedidos p 
      WHERE p.estado IN ('pagado', 'reembolsado', 'cerrado', 'cancelado')
      ORDER BY p.id DESC
    `);

    let csv =
      'Folio,Fecha,Mesa/Orden,Mesero/Cajero,Cliente,Telefono,Metodo Pago,Estado,Total,Motivo Reembolso\n';
    pedidos.forEach((p) => {
      const fecha = new Date(p.fecha_pago).toISOString().replace(/T/, ' ').replace(/\..+/, '');
      const cli = (p.cliente_nombre || '').replace(/,/g, '');
      const mot = (p.motivo_reembolso || '').replace(/,/g, '');
      csv += `${p.id},"${fecha}","${p.mesa_numero}","${p.mesero || 'General'}","${cli}","${p.cliente_telefono || ''}","${p.metodo_pago || 'efectivo'}","${p.estado}",${p.total},"${mot}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="recibos_los_compadres.csv"');
    res.send('\uFEFF' + csv);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

module.exports = router;
