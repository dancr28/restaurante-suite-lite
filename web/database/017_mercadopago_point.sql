CREATE TABLE IF NOT EXISTS mercadopago_operaciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  pedido_id INT NOT NULL,
  turno_id INT NULL,

  usuario_nombre VARCHAR(100) NOT NULL,

  terminal_id VARCHAR(160) NOT NULL,
  terminal_alias VARCHAR(100) NULL,

  mp_order_id VARCHAR(100) NULL,
  mp_payment_id VARCHAR(100) NULL,
  mp_reference_id VARCHAR(100) NULL,

  external_reference VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(80) NOT NULL,
  request_id VARCHAR(100) NULL,

  monto DECIMAL(10,2) NOT NULL,

  estado_local VARCHAR(40) NOT NULL DEFAULT 'creando',
  estado_mp VARCHAR(40) NULL,
  status_detail VARCHAR(120) NULL,

  error_codigo VARCHAR(100) NULL,
  error_detalle TEXT NULL,

  respuesta_mp LONGTEXT NULL,

  creada_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizada_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  confirmada_en DATETIME NULL,
  finalizada_en DATETIME NULL,

  pedido_activo INT
    AS (
      CASE
        WHEN estado_local IN (
          'creando',
          'pendiente',
          'en_terminal',
          'confirmando'
        )
        THEN pedido_id
        ELSE NULL
      END
    ) STORED,

  PRIMARY KEY (id),

  UNIQUE KEY uq_mp_order_id (mp_order_id),
  UNIQUE KEY uq_mp_external_reference (external_reference),
  UNIQUE KEY uq_mp_idempotency (idempotency_key),
  UNIQUE KEY uq_mp_pedido_activo (pedido_activo),

  KEY ix_mp_pedido (pedido_id),
  KEY ix_mp_estado_local (estado_local),
  KEY ix_mp_estado_mp (estado_mp),
  KEY ix_mp_creada (creada_en)
);

CREATE TABLE IF NOT EXISTS mercadopago_terminales (
  terminal_id VARCHAR(160) NOT NULL,

  alias VARCHAR(100) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,

  pos_id VARCHAR(100) NULL,
  store_id VARCHAR(100) NULL,
  external_pos_id VARCHAR(100) NULL,
  operating_mode VARCHAR(30) NULL,

  ultima_deteccion DATETIME NULL,

  PRIMARY KEY (terminal_id),
  KEY ix_mp_terminal_activo (activo)
);
