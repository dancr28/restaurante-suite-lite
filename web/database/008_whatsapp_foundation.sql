-- Restaurante Suite · WhatsApp Foundation
-- MariaDB 10.11 · idempotente
-- Mantiene clientes.direccion/referencias por compatibilidad.

CREATE TABLE IF NOT EXISTS cliente_direcciones (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT NOT NULL,
  etiqueta VARCHAR(60) NOT NULL DEFAULT 'Principal',
  direccion TEXT NOT NULL,
  referencias TEXT NULL,
  es_principal BOOLEAN NOT NULL DEFAULT FALSE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cliente_direcciones_cliente
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  INDEX ix_cliente_direcciones_cliente (cliente_id, activo),
  INDEX ix_cliente_direcciones_principal (cliente_id, es_principal, activo)
);

-- Migra la dirección heredada sin borrarla ni modificarla.
INSERT INTO cliente_direcciones(cliente_id, etiqueta, direccion, referencias, es_principal, activo)
SELECT c.id, 'Principal', c.direccion, c.referencias, TRUE, TRUE
FROM clientes c
WHERE COALESCE(c.activo, TRUE)=TRUE
  AND c.direccion IS NOT NULL
  AND TRIM(c.direccion) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM cliente_direcciones d
    WHERE d.cliente_id=c.id
      AND d.activo=TRUE
      AND d.direccion=c.direccion
  );

INSERT IGNORE INTO schema_migrations(version) VALUES('008_whatsapp_foundation');
