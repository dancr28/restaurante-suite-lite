-- CRM + Inventario integrado a productos existentes
-- Seguro/idempotente para MariaDB 10.11

ALTER TABLE clientes MODIFY telefono VARCHAR(20) NULL;
ALTER TABLE clientes MODIFY direccion TEXT NULL;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_maximo DECIMAL(10,3) NULL;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS inventario_unidad VARCHAR(30) NOT NULL DEFAULT 'pz';
ALTER TABLE productos ADD COLUMN IF NOT EXISTS inventario_proveedor VARCHAR(150) NULL;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS inventario_ubicacion VARCHAR(150) NULL;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS inventario_notas TEXT NULL;

CREATE TABLE IF NOT EXISTS producto_inventario_movimientos (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  producto_id INT NOT NULL,
  tipo ENUM('entrada','salida','ajuste_positivo','ajuste_negativo','merma','devolucion') NOT NULL,
  cantidad DECIMAL(12,3) NOT NULL,
  stock_anterior DECIMAL(12,3) NOT NULL,
  stock_nuevo DECIMAL(12,3) NOT NULL,
  motivo VARCHAR(255) NOT NULL,
  usuario VARCHAR(120) NOT NULL,
  referencia VARCHAR(120) NULL,
  notas TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_prod_inv_mov_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
  INDEX ix_prod_inv_mov_producto(producto_id),
  INDEX ix_prod_inv_mov_fecha(created_at)
);

CREATE TABLE IF NOT EXISTS producto_inventario_conteos (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  usuario VARCHAR(120) NOT NULL,
  notas TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS producto_inventario_conteo_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  conteo_id BIGINT NOT NULL,
  producto_id INT NOT NULL,
  stock_teorico DECIMAL(12,3) NOT NULL,
  stock_fisico DECIMAL(12,3) NOT NULL,
  diferencia DECIMAL(12,3) NOT NULL,
  CONSTRAINT fk_prod_inv_ci_conteo FOREIGN KEY (conteo_id) REFERENCES producto_inventario_conteos(id) ON DELETE CASCADE,
  CONSTRAINT fk_prod_inv_ci_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
);
