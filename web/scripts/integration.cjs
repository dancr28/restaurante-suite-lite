// Integration suite creates a NEW database; never selects an existing application database.
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
process.env.PIN_SECRET = 'integration-only-secret-32-characters';
const mysql = require('mysql2/promise');
async function main() {
  const database = 'ops_test_' + Date.now();
  const admin = await mysql.createConnection({
    host: process.env.TEST_DB_HOST || '127.0.0.1',
    port: Number(process.env.TEST_DB_PORT || 33385),
    user: process.env.TEST_DB_USER || 'root',
    password: process.env.TEST_DB_PASSWORD || '',
    multipleStatements: true,
  });
  await admin.query(
    'CREATE DATABASE ' + database + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  );
  process.env.DB_HOST = process.env.TEST_DB_HOST || '127.0.0.1';
  process.env.DB_PORT = process.env.TEST_DB_PORT || '33385';
  process.env.DB_USER = process.env.TEST_DB_USER || 'root';
  process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || '';
  process.env.DB_NAME = database;
  const db = require('../config/db');
  let server;
  let count = 0;
  try {
    await admin.query('USE ' + database);
    await admin.query(fs.readFileSync(path.join(__dirname, '../database/001_initial.sql'), 'utf8'));
    await admin.query(
      fs.readFileSync(path.join(__dirname, '../database/002_integrations.sql'), 'utf8'),
    );
    const { hashPin } = require('../lib/pin');
    await db.query("INSERT INTO usuarios(nombre,rol,pin) VALUES('Admin prueba','admin',?)", [
      hashPin('9876', process.env.PIN_SECRET),
    ]);
    const app = require('../app');
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    const base = 'http://127.0.0.1:' + server.address().port;
    let cookie = '';
    async function request(url, method = 'GET', body, status = 200) {
      const response = await fetch(base + url, {
        method,
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await response.text();
      assert.equal(response.status, status, url + ' ' + text);
      count++;
      if (url.endsWith('login-pin')) cookie = response.headers.get('set-cookie').split(';')[0];
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    await request('/api/auth/login-pin', 'POST', { pin: '9876' });
    for (const url of [
      '/health/ready',
      '/api/admin/usuarios',
      '/api/admin/asistencias-hoy',
      '/api/pos/datos-iniciales',
      '/api/items/productos',
      '/api/items/categorias',
      '/api/items/modificadores',
      '/api/items/descuentos',
      '/api/items/insumos',
      '/api/settings',
      '/api/accounting/gastos',
      '/api/payroll/datos',
      '/api/dashboard/metricas?rango=hoy',
      '/api/receipts',
      '/api/shifts/estado-actual',
      '/api/shifts/historial',
    ])
      await request(url);
    await request('/api/shifts/abrir', 'POST', { monto_inicial: 100 });
    const [product] = await db.query(
      "INSERT INTO productos(nombre,precio,seguimiento_stock,stock_actual) VALUES('Prueba',10,TRUE,5)",
    );
    const item = {
      producto_id: product.insertId,
      nombre: 'Prueba',
      precio_unitario: 10,
      cantidad: 2,
    };
    const order = await request('/api/pos/marchar-comanda', 'POST', {
      mesa: 'Mesa prueba',
      items: [item],
      total: 20,
    });
    let [[stock]] = await db.query('SELECT stock_actual FROM productos WHERE id=?', [
      product.insertId,
    ]);
    assert.equal(Number(stock.stock_actual), 3);
    await request(
      '/api/pos/marchar-comanda',
      'POST',
      { mesa: 'Mesa prueba', items: [{ ...item, cantidad: 9 }], total: 90 },
      409,
    );
    [[stock]] = await db.query('SELECT stock_actual FROM productos WHERE id=?', [product.insertId]);
    assert.equal(Number(stock.stock_actual), 3);
    await request(
      '/api/pos/marchar-comanda',
      'POST',
      { mesa: 'Fraude', items: [{ ...item, precio_unitario: 1 }], total: 2 },
      409,
    );
    const sub = await request('/api/pos/dividir-cuenta', 'POST', {
      pedido_id: order.pedido_id,
      origen: [{ ...item, cantidad: 1 }],
      destino: [{ ...item, cantidad: 1 }],
    });
    [[stock]] = await db.query('SELECT stock_actual FROM productos WHERE id=?', [product.insertId]);
    assert.equal(Number(stock.stock_actual), 3);
    await request('/api/pos/cobrar-cuenta', 'POST', {
      pedido_id: sub.pedido.id,
      total: 10,
      metodo_pago: 'mixto',
      pagos: [
        { metodo: 'efectivo', monto: 4, recibido: 10 },
        { metodo: 'tarjeta', monto: 6 },
      ],
      paga_con: 4,
    });
    await request(
      '/api/pos/cobrar-cuenta',
      'POST',
      { pedido_id: sub.pedido.id, total: 10, metodo_pago: 'efectivo', paga_con: 10 },
      409,
    );
    await request('/api/receipts/reembolso', 'POST', {
      pedido_id: sub.pedido.id,
      motivo: 'Prueba',
      restock_items: true,
    });
    const [[paid]] = await db.query('SELECT cambio FROM pedidos WHERE id=?', [sub.pedido.id]);
    assert.equal(Number(paid.cambio), 6);
    await request(
      '/api/receipts/reembolso',
      'POST',
      { pedido_id: sub.pedido.id, motivo: 'Duplicado', restock_items: true },
      409,
    );
    [[stock]] = await db.query('SELECT stock_actual FROM productos WHERE id=?', [product.insertId]);
    assert.equal(Number(stock.stock_actual), 4);
    await request('/api/pos/vaciar-comanda', 'POST', { pedido_id: order.pedido_id });
    [[stock]] = await db.query('SELECT stock_actual FROM productos WHERE id=?', [product.insertId]);
    assert.equal(Number(stock.stock_actual), 5);
    // Shared ingredients: aggregate demand must be checked inside the transaction.
    const [ing] = await db.query(
      "INSERT INTO insumos(nombre,stock_actual) VALUES('Insumo prueba',3)",
    );
    await db.query('UPDATE productos SET es_compuesto=TRUE WHERE id=?', [product.insertId]);
    await db.query('INSERT INTO recetas(producto_id,insumo_id,cantidad) VALUES(?,?,1)', [
      product.insertId,
      ing.insertId,
    ]);
    await request(
      '/api/pos/marchar-comanda',
      'POST',
      {
        mesa: 'Receta',
        items: [
          { ...item, cantidad: 2 },
          { ...item, cantidad: 2 },
        ],
      },
      409,
    );
    const competing = await Promise.allSettled([
      request('/api/pos/marchar-comanda', 'POST', { mesa: 'Concurrente A', items: [item] }),
      request('/api/pos/marchar-comanda', 'POST', { mesa: 'Concurrente B', items: [item] }),
    ]);
    assert.equal(competing.filter((x) => x.status === 'fulfilled').length, 1);
    count++;
    const [[ingredient]] = await db.query('SELECT stock_actual FROM insumos WHERE id=?', [
      ing.insertId,
    ]);
    assert.equal(Number(ingredient.stock_actual), 1);
    for (const url of [
      '/api/dashboard/metricas?rango=hoy',
      '/api/dashboard/metricas?rango=personalizado&fecha_inicio=2026-01-01&fecha_fin=2026-12-31',
      '/api/payroll/datos',
      '/api/receipts/export/csv',
      '/api/accounting/export/csv',
      '/api/shifts/estado-actual',
    ])
      await request(url);
    const cash = await request('/api/shifts/estado-actual');
    assert.equal(cash.turno.efectivo_esperado, 100);
    await request('/api/shifts/cerrar', 'POST', { monto_final_real: 100, total_propinas: 0 });
    await request('/api/shifts/historial');
    console.log(
      'INTEGRATION PASS: ' +
        count +
        ' HTTP checks + stock, rollback, concurrent orders, mixed payment, refund and cash assertions. Database: ' +
        database,
    );
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    await db.end();
    await admin.end();
  }
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
