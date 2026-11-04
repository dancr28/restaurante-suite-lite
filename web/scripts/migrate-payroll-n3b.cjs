"use strict";

const db = require("../config/db");


async function columnExists(
  table,
  column
) {
  const [[r]] =
    await db.query(
      `
        SELECT COUNT(*) AS n
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
      `,
      [
        table,
        column,
      ]
    );

  return Number(r.n) > 0;
}


async function main() {

  await db.query(`
    CREATE TABLE IF NOT EXISTS
      payroll_employee_charges (
        id INT NOT NULL AUTO_INCREMENT,

        employee_id INT NOT NULL,

        product_id INT DEFAULT NULL,

        source ENUM(
          'catalog',
          'manual'
        )
          NOT NULL,

        concept VARCHAR(255)
          NOT NULL,

        quantity DECIMAL(10,3)
          NOT NULL
          DEFAULT 1.000,

        unit_price DECIMAL(10,2)
          NOT NULL
          DEFAULT 0.00,

        total_amount DECIMAL(10,2)
          NOT NULL,

        remaining_amount DECIMAL(10,2)
          NOT NULL,

        price_mode ENUM(
          'regular',
          'cost',
          'employee',
          'manual'
        )
          NOT NULL
          DEFAULT 'regular',

        status ENUM(
          'pending',
          'deducted',
          'cancelled'
        )
          NOT NULL
          DEFAULT 'pending',

        inventory_applied
          TINYINT(1)
          NOT NULL
          DEFAULT 0,

        inventory_snapshot
          LONGTEXT
          DEFAULT NULL,

        notes VARCHAR(255)
          DEFAULT NULL,

        created_by VARCHAR(100)
          DEFAULT NULL,

        created_at TIMESTAMP
          NOT NULL
          DEFAULT CURRENT_TIMESTAMP,

        updated_at TIMESTAMP
          NOT NULL
          DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP,

        deducted_at DATETIME
          DEFAULT NULL,

        cancelled_at DATETIME
          DEFAULT NULL,

        PRIMARY KEY (id),

        KEY idx_charge_employee_status (
          employee_id,
          status,
          created_at
        ),

        KEY idx_charge_product (
          product_id
        ),

        CONSTRAINT
          fk_charge_employee
        FOREIGN KEY (
          employee_id
        )
        REFERENCES usuarios(id)
        ON DELETE RESTRICT,

        CONSTRAINT
          fk_charge_product
        FOREIGN KEY (
          product_id
        )
        REFERENCES productos(id)
        ON DELETE SET NULL
      )
      ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_general_ci
  `);


  await db.query(`
    CREATE TABLE IF NOT EXISTS
      payroll_employee_charge_movements (
        id INT NOT NULL AUTO_INCREMENT,

        charge_id INT NOT NULL,

        employee_id INT NOT NULL,

        payroll_payment_id INT
          DEFAULT NULL,

        movement_type ENUM(
          'payroll_deduction',
          'cancellation'
        )
          NOT NULL,

        amount DECIMAL(10,2)
          NOT NULL,

        remaining_before DECIMAL(10,2)
          NOT NULL,

        remaining_after DECIMAL(10,2)
          NOT NULL,

        note VARCHAR(255)
          DEFAULT NULL,

        created_by VARCHAR(100)
          DEFAULT NULL,

        created_at TIMESTAMP
          NOT NULL
          DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (id),

        KEY idx_charge_movements_charge (
          charge_id,
          created_at
        ),

        KEY idx_charge_movements_employee (
          employee_id,
          created_at
        ),

        UNIQUE KEY
          uq_charge_payroll_payment (
            charge_id,
            payroll_payment_id
          ),

        CONSTRAINT
          fk_charge_mov_charge
        FOREIGN KEY (
          charge_id
        )
        REFERENCES payroll_employee_charges(id)
        ON DELETE RESTRICT,

        CONSTRAINT
          fk_charge_mov_employee
        FOREIGN KEY (
          employee_id
        )
        REFERENCES usuarios(id)
        ON DELETE RESTRICT,

        CONSTRAINT
          fk_charge_mov_payment
        FOREIGN KEY (
          payroll_payment_id
        )
        REFERENCES payroll_payments(id)
        ON DELETE RESTRICT
      )
      ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_general_ci
  `);


  if (
    !(await columnExists(
      "payroll_payments",
      "charge_deduction"
    ))
  ) {
    await db.query(`
      ALTER TABLE payroll_payments
      ADD COLUMN charge_deduction
        DECIMAL(10,2)
        NOT NULL
        DEFAULT 0.00
        AFTER loan_deduction
    `);

    console.log(
      "OK: payroll_payments.charge_deduction"
    );
  }


  console.log(
    "PAYROLL_N3B_SCHEMA_OK"
  );
}


main()
  .catch((err) => {
    console.error(
      "PAYROLL_N3B_SCHEMA_ERROR:",
      err
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await db.end();
    } catch (_) {}
  });
