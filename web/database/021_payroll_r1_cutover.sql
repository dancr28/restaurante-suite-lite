-- PAYROLL_R1_1_CUTOVER
--
-- Inicio oficial:
-- 2026-10-05
--
-- No se modifica payroll_payments histórico.

INSERT INTO configuracion (
  clave,
  valor
)
VALUES (
  'payroll_r1_cutover',
  '{"date":"2026-10-05"}'
)
ON DUPLICATE KEY UPDATE
  valor =
    VALUES(valor);


DELETE FROM daily_tip_distribution
WHERE
  shift_date < '2026-10-05'
  AND calculation_json
      LIKE '%"version":"PAYROLL-R1"%';
