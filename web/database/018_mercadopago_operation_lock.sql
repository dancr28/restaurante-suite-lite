/*
 * Mercado Pago Point
 *
 * MIGRACIÓN 018 IDEMPOTENTE
 *
 * Garantiza:
 * - pedido_activo generado
 * - un solo intento activo por pedido
 * - request_id único
 *
 * No elimina objetos existentes.
 */


SET @schema_name = DATABASE();


/* ============================================================
   pedido_activo
   ============================================================ */

SET @has_pedido_activo = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME =
      'mercadopago_operaciones'
    AND COLUMN_NAME =
      'pedido_activo'
);


SET @sql = IF(
  @has_pedido_activo = 0,

  'ALTER TABLE mercadopago_operaciones
     ADD COLUMN pedido_activo INT
       AS (
         CASE
           WHEN estado_local IN (
             ''creando'',
             ''pendiente'',
             ''en_terminal'',
             ''confirmando'',
             ''incierta'',
             ''requiere_accion'',
             ''confirmada''
           )
           THEN pedido_id
           ELSE NULL
         END
       ) STORED',

  'SELECT 1'
);


PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


/* ============================================================
   uq_mp_pedido_activo
   ============================================================ */

SET @has_pedido_index = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME =
      'mercadopago_operaciones'
    AND INDEX_NAME =
      'uq_mp_pedido_activo'
);


SET @sql = IF(
  @has_pedido_index = 0,

  'ALTER TABLE mercadopago_operaciones
     ADD UNIQUE KEY
       uq_mp_pedido_activo
       (pedido_activo)',

  'SELECT 1'
);


PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


/* ============================================================
   uq_mp_request_id
   ============================================================ */

SET @has_request_index = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME =
      'mercadopago_operaciones'
    AND INDEX_NAME =
      'uq_mp_request_id'
);


SET @sql = IF(
  @has_request_index = 0,

  'ALTER TABLE mercadopago_operaciones
     ADD UNIQUE KEY
       uq_mp_request_id
       (request_id)',

  'SELECT 1'
);


PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
