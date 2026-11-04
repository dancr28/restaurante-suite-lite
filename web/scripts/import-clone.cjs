// Reads ONLY the staging clone. Never connect this script to the original database.
const mysql = require('mysql2/promise'),
  config = require('../config/env'),
  fs = require('node:fs'),
  { hashPin } = require('../lib/pin');
const sourceName = process.env.SOURCE_DB || 'restaurante_snapshot_lab';
const apply = process.argv.includes('--apply');
const required = {
  usuarios: ['id', 'nombre', 'rol', 'pin', 'activo'],
  productos: ['id', 'nombre', 'precio'],
  pedidos: ['id', 'total', 'estado', 'metodo_pago'],
  pedido_items: ['id', 'pedido_id', 'nombre', 'cantidad', 'precio_unitario'],
};
const aliases = {
  turnos_caja: { monto_final_esperado: 'efectivo_esperado' },
  daily_tip_pool: { shift_id: 'closed_by_shift_id' },
  productos: { modalidad_venta: 'tipo_venta', stock_minimo: 'stock_seguridad' },
};
async function main() {
  if (config.db.database !== 'restaurante_lab' || sourceName !== 'restaurante_snapshot_lab')
    throw Error(
      'Se requieren restaurante_lab y restaurante_snapshot_lab. No se admite la base original.',
    );
  const source = await mysql.createConnection({
    ...config.db,
    database: sourceName,
    dateStrings: true,
  });
  const target = await mysql.createConnection({ ...config.db, dateStrings: true });
  const report = {
    source: sourceName,
    target: config.db.database,
    tables: [],
    blockers: [],
    warnings: [],
  };
  try {
    await source.query('SET TRANSACTION READ ONLY');
    await source.beginTransaction();
    const [sourceTables] = await source.query('SHOW FULL TABLES WHERE Table_type="BASE TABLE"');
    const names = new Set(sourceTables.map((r) => Object.values(r)[0]));
    const schema = fs.readFileSync(
      require('node:path').join(__dirname, '../database/001_initial.sql'),
      'utf8',
    );
    const tables = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)]
      .map((m) => m[1])
      .filter((t) => t !== 'pedido_stock');
    for (const name of names)
      if (!tables.includes(name))
        report.warnings.push('Tabla conservada sólo en snapshot: ' + name);
    for (const [table, cols] of Object.entries(required)) {
      if (!names.has(table)) {
        report.blockers.push('Falta tabla ' + table);
        continue;
      }
      const [actual] = await source.query('SHOW COLUMNS FROM ' + table);
      for (const c of cols)
        if (!actual.some((a) => a.Field === c)) report.blockers.push('Falta ' + table + '.' + c);
    }
    if (report.blockers.length) {
      fs.writeFileSync('migration-report.json', JSON.stringify(report, null, 2));
      throw Error('Estructura incompatible; consulta migration-report.json');
    }
    if (names.has('pedidos')) {
      const [[open]] = await source.query(
        "SELECT COUNT(*) n FROM pedidos WHERE estado IN ('abierto','pendiente')",
      );
      if (open.n)
        report.blockers.push(
          'La copia tiene ' +
            open.n +
            ' pedidos abiertos. Cierra y concilia antes del respaldo final.',
        );
    }
    if (names.has('turnos_caja')) {
      const [[open]] = await source.query(
        "SELECT COUNT(*) n FROM turnos_caja WHERE estado='abierto'",
      );
      if (open.n) report.blockers.push('La copia tiene turno de caja abierto.');
    }
    const [[used]] = await target.query(
      'SELECT (SELECT COUNT(*) FROM pedidos)+(SELECT COUNT(*) FROM productos) AS n',
    );
    if (used.n)
      report.blockers.push('El destino contiene productos o pedidos. Usa un laboratorio nuevo.');
    const [[users]] = await target.query('SELECT COUNT(*) n FROM usuarios');
    if (users.n > 1) report.blockers.push('El destino contiene usuarios adicionales.');
    for (const table of tables) {
      if (!names.has(table)) {
        report.warnings.push('No existe en origen: ' + table);
        continue;
      }
      const [sc] = await source.query('SHOW COLUMNS FROM ' + table),
        [tc] = await target.query('SHOW COLUMNS FROM ' + table);
      const cols = tc
        .filter(
          (c) =>
            !String(c.Extra).includes('GENERATED') &&
            (sc.some((s) => s.Field === c.Field) ||
              (aliases[table]?.[c.Field] && sc.some((s) => s.Field === aliases[table][c.Field]))),
        )
        .map((c) => c.Field);
      const [[count]] = await source.query('SELECT COUNT(*) n FROM ' + table);
      const extra = sc
        .filter(
          (c) =>
            !tc.some((t) => t.Field === c.Field) &&
            !Object.values(aliases[table] || {}).includes(c.Field),
        )
        .map((c) => c.Field);
      report.tables.push({
        table,
        rows: count.n,
        columns: cols,
        extraColumnsPreservedInSnapshot: extra,
      });
      if (count.n && !cols.length) report.blockers.push('Tabla sin formato compatible: ' + table);
      for (const c of tc)
        if (
          count.n &&
          c.Null === 'NO' &&
          c.Default === null &&
          !String(c.Extra).includes('auto_increment') &&
          !String(c.Extra).includes('GENERATED') &&
          !cols.includes(c.Field)
        )
          report.blockers.push('Columna obligatoria sin correspondencia: ' + table + '.' + c.Field);
      if (!['usuarios', 'mesas', 'configuracion'].includes(table)) {
        const [[existing]] = await target.query('SELECT COUNT(*) n FROM ' + table);
        if (existing.n) report.blockers.push('Destino no vacío: ' + table);
      }
      if (extra.length)
        report.warnings.push(
          table + ': columnas adicionales sólo conservadas en snapshot: ' + extra.join(','),
        );
    }
    if (names.has('usuarios')) {
      const [rows] = await source.query('SELECT id,pin,rol,activo FROM usuarios');
      if (!rows.some((u) => u.rol === 'admin' && u.activo))
        report.blockers.push('No hay administrador activo');
      for (const u of rows) {
        if (!/^\d{4}$/.test(u.pin || '')) {
          if (/^[a-f0-9]{64}$/.test(u.pin || '') && process.env.SOURCE_PINS_SAME_SECRET === 'true')
            continue;
          report.blockers.push(
            'PIN no convertible en usuario ' +
              u.id +
              '; hashes previos requieren el mismo PIN_SECRET.',
          );
        }
        if (!['admin', 'mesero', 'repartidor', 'cocina', 'empleado'].includes(u.rol))
          report.blockers.push('Rol no mapeado: ' + u.rol);
      }
    }
    if (names.has('pedidos')) {
      const [cols] = await source.query('SHOW COLUMNS FROM pedidos');
      if (
        !['pago_efectivo', 'pago_tarjeta', 'pago_transferencia'].every((c) =>
          cols.some((x) => x.Field === c),
        )
      ) {
        const [[mixed]] = await source.query(
          "SELECT COUNT(*) n FROM pedidos WHERE metodo_pago='mixto'",
        );
        if (mixed.n)
          report.blockers.push(
            'Pagos mixtos históricos sin desglose: ' + mixed.n + '; requieren conciliación.',
          );
      }
      const [states] = await source.query('SELECT DISTINCT estado FROM pedidos');
      for (const row of states)
        if (
          ![
            'pagado',
            'completado',
            'cerrado',
            'cobrado',
            'finalizado',
            'cancelado',
            'reembolsado',
            'abierto',
            'pendiente',
          ].includes(row.estado)
        )
          report.blockers.push('Estado de pedido desconocido: ' + row.estado);
    }
    fs.writeFileSync('migration-report.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (report.blockers.length)
      throw Error('Importación bloqueada; consulta migration-report.json');
    if (!apply) {
      console.log('Sólo diagnóstico. Revisa advertencias y usa --apply para importar.');
      return;
    }
    await target.beginTransaction();
    try {
      await target.query('DELETE FROM usuarios');
      await target.query('DELETE FROM mesas');
      await target.query('DELETE FROM configuracion');
      for (const item of report.tables) {
        if (!item.columns.length && item.rows)
          throw Error('Sin columnas compatibles en ' + item.table);
        for (let offset = 0; offset < item.rows; offset += 250) {
          const [rows] = await source.query(
            'SELECT * FROM ' + item.table + ' LIMIT 250 OFFSET ' + offset,
          );
          for (const row of rows) {
            const data = {};
            for (const col of item.columns)
              data[col] = row[col] === undefined ? row[aliases[item.table]?.[col]] : row[col];
            if (item.table === 'usuarios') data.password = null;
            if (item.table === 'usuarios' && /^\d{4}$/.test(String(data.pin)))
              data.pin = hashPin(String(data.pin), config.pinSecret);
            if (item.table === 'pedidos') {
              if (['completado', 'cerrado', 'cobrado', 'finalizado'].includes(data.estado))
                data.estado = 'pagado';
              data.migrated_legacy = 1;
              for (const m of ['efectivo', 'tarjeta', 'transferencia'])
                if (data['pago_' + m] === undefined)
                  data['pago_' + m] =
                    ['pagado', 'reembolsado'].includes(data.estado) &&
                    (data.metodo_pago === m ||
                      (m === 'transferencia' && data.metodo_pago === 'transf'))
                      ? data.total
                      : 0;
            }
            if (item.table === 'configuracion' && data.clave === 'integrations_v3') continue;
            const columns = Object.keys(data);
            await target.query(
              'INSERT INTO ' +
                item.table +
                ' (' +
                columns.map((c) => '`' + c + '`').join(',') +
                ') VALUES (' +
                columns.map(() => '?').join(',') +
                ')',
              columns.map((c) => data[c]),
            );
          }
        }
      }
      await target.query('INSERT INTO audit_events(actor,action,details) VALUES(?,?,?)', [
        'Migración',
        'database.imported',
        JSON.stringify({ source: sourceName }),
      ]);
      await target.commit();
      console.log(
        'IMPORTACIÓN COMPLETA. Snapshot conservado; impresoras y bot deben configurarse de nuevo.',
      );
    } catch (err) {
      await target.rollback();
      throw err;
    }
  } finally {
    await source.rollback();
    await source.end();
    await target.end();
  }
}
main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
