"use strict";

const db = require("../config/db");

async function columnExists(table, column) {
  const [[r]] = await db.query(
    `
      SELECT COUNT(*) AS n
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
    `,
    [table, column]
  );

  return Number(r.n) > 0;
}

async function main() {

  await db.query(`
    CREATE TABLE IF NOT EXISTS payroll_loans (
      id INT NOT NULL AUTO_INCREMENT,

      employee_id INT NOT NULL,

      amount_original DECIMAL(10,2)
        NOT NULL,

      balance DECIMAL(10,2)
        NOT NULL,

      installment_amount DECIMAL(10,2)
        NOT NULL,

      concept VARCHAR(255)
        DEFAULT NULL,

      status ENUM(
        'active',
        'paused',
        'settled',
        'cancelled'
      )
        NOT NULL
        DEFAULT 'active',

      created_by VARCHAR(100)
        DEFAULT NULL,

      created_at TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      updated_at TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

      settled_at DATETIME
        DEFAULT NULL,

      PRIMARY KEY (id),

      KEY idx_payroll_loans_employee (
        employee_id,
        status
      ),

      CONSTRAINT fk_payroll_loans_employee
        FOREIGN KEY (employee_id)
        REFERENCES usuarios(id)
        ON DELETE RESTRICT
    )
      ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_general_ci
  `);


  await db.query(`
    CREATE TABLE IF NOT EXISTS payroll_loan_movements (
      id INT NOT NULL AUTO_INCREMENT,

      loan_id INT NOT NULL,
      employee_id INT NOT NULL,

      payroll_payment_id INT
        DEFAULT NULL,

      movement_type ENUM(
        'disbursement',
        'payroll_deduction',
        'manual_payment',
        'cancellation'
      )
        NOT NULL,

      amount DECIMAL(10,2)
        NOT NULL,

      balance_before DECIMAL(10,2)
        NOT NULL,

      balance_after DECIMAL(10,2)
        NOT NULL,

      note VARCHAR(255)
        DEFAULT NULL,

      created_by VARCHAR(100)
        DEFAULT NULL,

      created_at TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      PRIMARY KEY (id),

      KEY idx_loan_movements_loan (
        loan_id,
        created_at
      ),

      KEY idx_loan_movements_employee (
        employee_id,
        created_at
      ),

      UNIQUE KEY uq_loan_payroll_payment (
        loan_id,
        payroll_payment_id
      ),

      CONSTRAINT fk_loan_movements_loan
        FOREIGN KEY (loan_id)
        REFERENCES payroll_loans(id)
        ON DELETE RESTRICT,

      CONSTRAINT fk_loan_movements_employee
        FOREIGN KEY (employee_id)
        REFERENCES usuarios(id)
        ON DELETE RESTRICT,

      CONSTRAINT fk_loan_movements_payment
        FOREIGN KEY (payroll_payment_id)
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
      "loan_deduction"
    ))
  ) {
    await db.query(`
      ALTER TABLE payroll_payments
      ADD COLUMN loan_deduction
        DECIMAL(10,2)
        NOT NULL
        DEFAULT 0.00
        AFTER deducciones
    `);

    console.log(
      "OK: payroll_payments.loan_deduction"
    );
  }


  console.log(
    "PAYROLL_N2_SCHEMA_OK"
  );
}

main()
  .catch((err) => {
    console.error(
      "PAYROLL_N2_SCHEMA_ERROR:",
      err
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await db.end();
    } catch (_) {}
  });
