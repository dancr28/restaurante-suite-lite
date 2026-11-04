// Explicit, optional rollback of configuration only. Sales and attendance are never restored.
require('../config/env');
const db = require('../config/db');
(async () => {
  if (!process.argv.includes('--restore'))
    throw Error('Usa --restore únicamente si quieres recuperar los ajustes anteriores a v4.');
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query(
      "SELECT valor FROM configuracion WHERE clave='settings_pre_v4'",
    );
    if (!row) throw Error('No hay respaldo de configuración anterior a v4.');
    const saved = JSON.parse(row.valor);
    const [current] = await conn.query(
      "SELECT clave,valor FROM configuracion WHERE clave IN ('integrations_v3','payroll_config') FOR UPDATE",
    );
    await conn.query('INSERT INTO configuracion(clave,valor) VALUES(?,?)', [
      'settings_before_restore_' + Date.now(),
      JSON.stringify(current),
    ]);
    for (const [key, value] of [
      ['integrations_v3', saved.integrations],
      ['payroll_config', saved.payroll],
    ])
      await conn.query(
        'INSERT INTO configuracion(clave,valor) VALUES(?,?) ON DUPLICATE KEY UPDATE valor=VALUES(valor)',
        [key, JSON.stringify(value)],
      );
    await conn.commit();
    console.log('Ajustes anteriores restaurados. Ventas, caja y asistencias conservadas.');
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
})()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
