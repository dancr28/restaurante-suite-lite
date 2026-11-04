process.env.PIN_SECRET = 'integration-secret-32-characters-long';
process.env.BOT_SHARED_TOKEN = 'integration-bot-secret-32-characters-long';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net'),
  mysql = require('mysql2/promise');
async function main() {
  const database = 'ops_v3_test_' + Date.now(),
    connection = {
      host: process.env.TEST_DB_HOST || '127.0.0.1',
      port: Number(process.env.TEST_DB_PORT || 33385),
      user: process.env.TEST_DB_USER || 'root',
      password: process.env.TEST_DB_PASSWORD || '',
    };
  const admin = await mysql.createConnection({ ...connection, multipleStatements: true });
  await admin.query(
    'CREATE DATABASE ' + database + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  );
  await admin.query('USE ' + database);
  for (const file of ['001_initial.sql', '002_integrations.sql'])
    await admin.query(fs.readFileSync(path.join(__dirname, '../database', file), 'utf8'));
  Object.assign(process.env, {
    DB_HOST: connection.host,
    DB_PORT: String(connection.port),
    DB_USER: connection.user,
    DB_PASSWORD: connection.password,
    DB_NAME: database,
  });
  const db = require('../config/db');
  let server, printer;
  try {
    const { hashPin } = require('../lib/pin');
    await db.query("INSERT INTO usuarios(nombre,rol,pin) VALUES('Admin','admin',?)", [
      hashPin('9876', process.env.PIN_SECRET),
    ]);
    await db.query("INSERT INTO turnos_caja(monto_inicial,estado) VALUES(100,'abierto')");
    await db.query(
      "INSERT INTO productos(nombre,precio,seguimiento_stock,stock_actual) VALUES('Taco largo de prueba',12.50,TRUE,20)",
    );
    let paper = Buffer.alloc(0);
    printer = net.createServer((socket) => {
      socket.on('data', (b) => {
        paper = Buffer.concat([paper, b]);
      });
      socket.on('end', () => socket.end());
    });
    await new Promise((r) => printer.listen(0, '127.0.0.1', r));
    const app = require('../app');
    await new Promise((r) => {
      server = app.listen(0, '127.0.0.1', r);
    });
    const base = 'http://127.0.0.1:' + server.address().port;
    let cookie = '',
      checks = 0;
    async function req(url, method = 'GET', body, status = 200, token = false) {
      const res = await fetch(base + url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'x-bot-token': process.env.BOT_SHARED_TOKEN } : { Cookie: cookie }),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await res.text();
      assert.equal(res.status, status, url + ' ' + text);
      checks++;
      if (url.endsWith('login-pin')) cookie = res.headers.get('set-cookie').split(';')[0];
      return text ? JSON.parse(text) : null;
    }
    await req('/api/auth/login-pin', 'POST', { pin: '9876' });
    await req('/api/integration/catalog', 'GET', null, 401);
    const cfg = await req('/api/devices');
    assert.equal(cfg.printers.length, 0);
    cfg.printers = [
      {
        name: 'Impresora 1',
        host: '127.0.0.1',
        port: printer.address().port,
        width: 80,
        columns: 48,
        enabled: true,
        kinds: ['kitchen', 'receipt', 'cancel', 'refund'],
        cut: true,
      },
    ];
    cfg.screens = [{ name: 'Cocina 1', enabled: true }];
    cfg.bot.enabled = true;
    cfg.bot.closedDays = [];
    cfg.bot.opens = '00:00';
    cfg.bot.closes = '23:59';
    const saved = await req('/api/devices', 'PUT', cfg);
    const items = [{ producto_id: 1, cantidad: 2, opciones_ids: [] }];
    const quote = await req('/api/integration/quote', 'POST', { items }, 200, true);
    assert.equal(quote.total, 25);
    const body = {
      event_id: 'event-test-12345',
      phone: '523300000000',
      name: 'Cliente prueba',
      address: 'Dirección de prueba',
      items,
      confirmed_total: 25,
    };
    const order = await req('/api/integration/orders', 'POST', body, 200, true);
    const replay = await req('/api/integration/orders', 'POST', body, 200, true);
    assert.equal(order.pedido_id, replay.pedido_id);
    let [[row]] = await db.query('SELECT COUNT(*) n FROM pedidos');
    assert.equal(row.n, 1);
    [[row]] = await db.query('SELECT COUNT(*) n FROM print_jobs');
    assert.equal(row.n, 0);
    [[row]] = await db.query('SELECT stock_actual FROM productos WHERE id=1');
    assert.equal(Number(row.stock_actual), 18);
    await req('/api/devices/incoming/' + order.pedido_id + '/accept', 'POST', {});
    await req('/api/devices/incoming/' + order.pedido_id + '/accept', 'POST', {});
    [[row]] = await db.query('SELECT COUNT(*) n FROM print_jobs');
    assert.equal(row.n, 1);
    [[row]] = await db.query('SELECT COUNT(*) n FROM notification_jobs');
    assert.equal(row.n, 1);
    await require('../services/print-queue.service').tick();
    const jobs = await req('/api/devices/jobs');
    assert.equal(jobs[0].status, 'sent');
    assert.ok(paper.toString('ascii').includes('COMANDA DE COCINA'));
    const preview = await req('/api/devices/printers/' + saved.printers[0].id + '/preview');
    assert.ok(preview.text.split('\n').every((x) => x.length <= 48));
    const board = await req('/api/kitchen/' + saved.screens[0].id);
    assert.equal(board.tickets.length, 1);
    const ticket = board.tickets[0];
    await req('/api/kitchen/tickets/' + ticket.id, 'PATCH', { version: 1, status: 'preparing' });
    await req(
      '/api/kitchen/tickets/' + ticket.id,
      'PATCH',
      { version: 1, status: 'preparing' },
      409,
    );
    const pay = {
      request_id: 'charge-test-1234',
      pedido_id: order.pedido_id,
      total: 25,
      metodo_pago: 'efectivo',
      paga_con: 30,
      imprimir_ticket: true,
    };
    await req('/api/pos/cobrar-cuenta', 'POST', pay);
    await req('/api/pos/cobrar-cuenta', 'POST', pay);
    await req('/api/pos/cobrar-cuenta', 'POST', { ...pay, total: 99 }, 409);
    [[row]] = await db.query("SELECT COUNT(*) n FROM print_jobs WHERE kind='receipt'");
    assert.equal(row.n, 1);
    const quick = {
      request_id: 'quick-test-1234',
      mesa: 'Rápida',
      total: 12.5,
      metodo_pago: 'efectivo',
      paga_con: 20,
      items: [
        { producto_id: 1, nombre: 'Taco largo de prueba', precio_unitario: 12.5, cantidad: 1 },
      ],
      imprimir_ticket: true,
    };
    const a = await req('/api/pos/cobrar-cuenta', 'POST', quick),
      b = await req('/api/pos/cobrar-cuenta', 'POST', quick);
    assert.equal(a.pedido_id, b.pedido_id);
    const expense = {
      event_id: 'expense-test-1234',
      monto: 10,
      proveedor: 'Prueba',
      concepto: 'Insumos',
      metodo_pago: 'efectivo_caja',
      autor: 'Admin',
    };
    const e1 = await req('/api/integration/expenses', 'POST', expense, 200, true),
      e2 = await req('/api/integration/expenses', 'POST', expense, 200, true);
    assert.equal(e1.id, e2.id);
    [[row]] = await db.query('SELECT COUNT(*) n FROM movimientos_caja');
    assert.equal(row.n, 1);
    // Bot engine talks to the actual web API, with no external WhatsApp account.
    const { Store } = require('../../bot/lib/store'),
      { createEngine } = require('../../bot/lib/engine'),
      { createWebClient } = require('../../bot/lib/web-client');
    const dir = path.join(__dirname, '../.test-bot-' + Date.now());
    const store = new Store(dir),
      config = {
        admins: [],
        webUrl: base,
        token: process.env.BOT_SHARED_TOKEN,
        aiKey: '',
        aiModel: '',
      };
    const engine = createEngine(config, store, createWebClient(config));
    const event = {
      peer: '523300000001@c.us',
      phone: '523300000001',
      id: 'bot-flow-1',
      text: 'pedir 1 x 1',
    };
    assert.match(await engine(event), /Resumen/);
    await engine({ ...event, id: 'bot-flow-2', text: 'nombre: Cliente' });
    await engine({ ...event, id: 'bot-flow-3', text: 'dirección: Calle de prueba' });
    const reply = await engine({ ...event, id: 'bot-flow-4', text: 'CONFIRMAR' });
    assert.match(reply, /Pedido #/);
    const again = await engine({ ...event, id: 'bot-flow-5', text: 'CONFIRMAR' });
    assert.match(again, /último pedido/);
    store.save();
    assert.ok(new Store(dir).chat(event.peer).lastOrder);
    console.log(
      'V3 PASS: ' +
        checks +
        ' HTTP checks; real TCP printer capture, WhatsApp/web flow, durable state, idempotency, kitchen, expenses and notifications. Database ' +
        database,
    );
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
    if (printer) await new Promise((r) => printer.close(r));
    await db.end();
    await admin.end();
  }
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
