-- PAYROLL_R1_SCHEMA
-- Refactor de nómina y propinas diarias.
--
-- No modifica pagos históricos existentes.
-- Sólo agrega metadatos para operaciones futuras.

ALTER TABLE payroll_payments
  ADD COLUMN IF NOT EXISTS
    snapshot_json LONGTEXT NULL
    AFTER total_pagado,

  ADD COLUMN IF NOT EXISTS
    calculation_version VARCHAR(30) NULL
    AFTER snapshot_json,

  ADD COLUMN IF NOT EXISTS
    paid_by VARCHAR(100) NULL
    AFTER calculation_version;


ALTER TABLE daily_tip_distribution
  ADD COLUMN IF NOT EXISTS
    delivery_date DATE NULL
    AFTER shift_date,

  ADD COLUMN IF NOT EXISTS
    delivery_status
      ENUM(
        'pending',
        'delivered'
      )
      NOT NULL
      DEFAULT 'pending'
    AFTER tip_amount_earned,

  ADD COLUMN IF NOT EXISTS
    delivered_at DATETIME NULL
    AFTER delivery_status,

  ADD COLUMN IF NOT EXISTS
    delivered_by VARCHAR(100) NULL
    AFTER delivered_at,

  ADD COLUMN IF NOT EXISTS
    calculation_json LONGTEXT NULL
    AFTER delivered_by,

  ADD COLUMN IF NOT EXISTS
    created_at TIMESTAMP
      NOT NULL
      DEFAULT CURRENT_TIMESTAMP
    AFTER calculation_json;


UPDATE daily_tip_distribution
SET delivery_date =
  CASE
    WHEN DAYOFWEEK(shift_date) = 7
      THEN DATE_ADD(
        shift_date,
        INTERVAL 1 DAY
      )

    ELSE shift_date
  END
WHERE delivery_date IS NULL;
