-- 013_device_crud_rfid_test.sql
-- Borrado lógico para conservar auditoría/historial de avisadores y estaciones.

ALTER TABLE wearable_devices
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME DEFAULT NULL AFTER updated_at;

ALTER TABLE rfid_stations
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME DEFAULT NULL AFTER updated_at;

CREATE INDEX IF NOT EXISTS ix_wearable_deleted
  ON wearable_devices(deleted_at);

CREATE INDEX IF NOT EXISTS ix_rfid_station_deleted
  ON rfid_stations(deleted_at);

INSERT IGNORE INTO schema_migrations(version)
VALUES('013_device_crud_rfid_test');
