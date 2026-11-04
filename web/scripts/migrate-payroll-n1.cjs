"use strict";

const db = require("../config/db");

async function columnExists(name) {
  const [[row]] = await db.query(
    `
      SELECT COUNT(*) AS n
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'usuarios'
        AND COLUMN_NAME = ?
    `,
    [name]
  );

  return Number(row.n) > 0;
}

async function indexExists(name) {
  const [[row]] = await db.query(
    `
      SELECT COUNT(*) AS n
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'payroll_payments'
        AND INDEX_NAME = ?
    `,
    [name]
  );

  return Number(row.n) > 0;
}

async function main() {
  const [duplicates] = await db.query(`
    SELECT
      employee_id,
      fecha_inicio,
      fecha_fin,
      COUNT(*) AS total
    FROM payroll_payments
    GROUP BY
      employee_id,
      fecha_inicio,
      fecha_fin
    HAVING COUNT(*) > 1
    LIMIT 20
  `);

  if (duplicates.length) {
    console.error(
      "ERROR: existen periodos de nómina duplicados."
    );

    console.table(duplicates);

    process.exitCode = 2;
    return;
  }

  if (!(await columnExists("frecuencia_pago"))) {
    await db.query(`
      ALTER TABLE usuarios
      ADD COLUMN frecuencia_pago
        ENUM('diario','semanal','fin_semana')
        NOT NULL
        DEFAULT 'semanal'
        AFTER sueldo_base
    `);

    console.log(
      "OK: usuarios.frecuencia_pago"
    );
  }

  if (!(await columnExists("dia_pago"))) {
    await db.query(`
      ALTER TABLE usuarios
      ADD COLUMN dia_pago
        TINYINT UNSIGNED
        NOT NULL
        DEFAULT 0
        AFTER frecuencia_pago
    `);

    console.log(
      "OK: usuarios.dia_pago"
    );
  }

  if (
    !(await indexExists(
      "uq_payroll_employee_period"
    ))
  ) {
    await db.query(`
      ALTER TABLE payroll_payments
      ADD UNIQUE KEY
        uq_payroll_employee_period (
          employee_id,
          fecha_inicio,
          fecha_fin
        )
    `);

    console.log(
      "OK: índice único de periodo"
    );
  }

  console.log(
    "PAYROLL_N1_SCHEMA_OK"
  );
}

main()
  .catch((err) => {
    console.error(
      "PAYROLL_N1_SCHEMA_ERROR:",
      err
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    if (typeof db.end === "function") {
      try {
        await db.end();
      } catch (_) {}
    }
  });
