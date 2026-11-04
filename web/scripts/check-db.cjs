const db = require('../config/db');
const fs = require('node:fs'),
  path = require('node:path');
(async () => {
  try {
    const schema = fs.readFileSync(path.join(__dirname, '../database/001_initial.sql'), 'utf8');
    for (const match of schema.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(/g)) {
      await db.query('SELECT 1 FROM ' + match[1] + ' LIMIT 1');
    }
    const [[p]] = await db.query(
      'SELECT COUNT(*) AS n FROM usuarios WHERE activo=TRUE AND rol="admin"',
    );
    if (!p.n) throw new Error('Falta administrador');
    await db.query('SELECT pago_efectivo,fecha_pago,numero_turno FROM pedidos LIMIT 1');
    console.log('Tablas y columnas principales disponibles');
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
