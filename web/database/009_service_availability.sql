-- Restaurante Suite · disponibilidad por tipo de servicio
-- Producto: defaults TRUE para no cambiar catálogo existente.
-- Variante: NULL = hereda la regla del producto.
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS disponible_comedor BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS disponible_para_llevar BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS disponible_delivery BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE variantes_producto
  ADD COLUMN IF NOT EXISTS disponible_comedor BOOLEAN NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS disponible_para_llevar BOOLEAN NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS disponible_delivery BOOLEAN NULL DEFAULT NULL;

INSERT IGNORE INTO schema_migrations(version) VALUES('009_service_availability');
