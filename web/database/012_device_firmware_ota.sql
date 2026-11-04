-- 012_device_firmware_ota.sql
CREATE TABLE IF NOT EXISTS device_firmware (
  id BIGINT NOT NULL AUTO_INCREMENT,
  device_type ENUM('wearable','rfid_station') NOT NULL,
  version VARCHAR(80) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  storage_name VARCHAR(255) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  notes TEXT DEFAULT NULL,
  published TINYINT(1) NOT NULL DEFAULT 0,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_firmware_type_version(device_type,version),
  KEY ix_firmware_published(device_type,published,created_at),
  CONSTRAINT fk_firmware_created_by FOREIGN KEY(created_by) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS device_ota_jobs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  device_type ENUM('wearable','rfid_station') NOT NULL,
  device_ref_id BIGINT NOT NULL,
  firmware_id BIGINT NOT NULL,
  status ENUM('pending','offered','downloading','installing','success','error','cancelled') NOT NULL DEFAULT 'pending',
  progress TINYINT UNSIGNED DEFAULT NULL,
  message VARCHAR(500) DEFAULT NULL,
  requested_by INT DEFAULT NULL,
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  offered_at DATETIME DEFAULT NULL,
  started_at DATETIME DEFAULT NULL,
  finished_at DATETIME DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY ix_ota_device(device_type,device_ref_id,status), KEY ix_ota_firmware(firmware_id),
  CONSTRAINT fk_ota_firmware FOREIGN KEY(firmware_id) REFERENCES device_firmware(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ota_requested_by FOREIGN KEY(requested_by) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
