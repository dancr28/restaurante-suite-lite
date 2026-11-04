const fs = require('node:fs'),
  mysql = require('mysql2/promise'),
  config = require('../config/env');
const { hashPin } = require('../lib/pin');
async function main() {
  if (config.db.database !== 'restaurante_lab')
    throw new Error('Inicialización limitada a restaurante_lab');
  const conn = await mysql.createConnection({ ...config.db, multipleStatements: true });
  try {
    const [tables] = await conn.query('SHOW TABLES');
    if (tables.length) throw new Error('La base no está vacía. No se modificó; utiliza db:check.');
    const pin = hashPin(process.env.ADMIN_PIN, config.pinSecret);
    await conn.query(
      fs.readFileSync(require('node:path').join(__dirname, '../database/001_initial.sql'), 'utf8'),
    );
    await conn.query(
      fs.readFileSync(
        require('node:path').join(__dirname, '../database/002_integrations.sql'),
        'utf8',
      ),
    );
    await conn.query(
      "INSERT INTO usuarios(nombre,rol,pin,activo) VALUES('Administrador LAB','admin',?,TRUE)",
      [pin],
    );
    console.log('Base LAB inicializada.');
  } finally {
    await conn.end();
  }
}
main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
