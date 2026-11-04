-- 014_pos_prebill_survey_variable_price.sql

ALTER TABLE pedido_items
  ADD COLUMN IF NOT EXISTS es_variable TINYINT(1) NOT NULL DEFAULT 0 AFTER precio_unitario;

UPDATE pedido_items pi
JOIN productos p ON p.id = pi.producto_id
SET pi.es_variable = 1
WHERE COALESCE(p.precio, 0) = 0
  AND pi.precio_unitario > 0;

INSERT IGNORE INTO schema_migrations(version)
VALUES('014_pos_prebill_survey_variable_price');
