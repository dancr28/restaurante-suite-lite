-- 011_wearables.sql
-- Avisadores + estaciones RFID. Diseñada para MariaDB 10.11.
-- ACK wearable es técnico; RFID validado es la confirmación operacional.

CREATE TABLE IF NOT EXISTS wearable_devices (
  id BIGINT NOT NULL AUTO_INCREMENT,
  device_id VARCHAR(64) NOT NULL,
  hardware_id VARCHAR(96) DEFAULT NULL,
  nombre VARCHAR(100) NOT NULL,
  device_key_hash VARCHAR(255) DEFAULT NULL,
  usuario_id INT DEFAULT NULL,
  rfid_uid VARCHAR(128) DEFAULT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  firmware VARCHAR(80) DEFAULT NULL,
  battery TINYINT UNSIGNED DEFAULT NULL,
  battery_voltage DECIMAL(5,3) DEFAULT NULL,
  rssi SMALLINT DEFAULT NULL,
  uptime BIGINT UNSIGNED DEFAULT NULL,
  last_ip VARCHAR(64) DEFAULT NULL,
  last_seen DATETIME DEFAULT NULL,
  last_hello_at DATETIME DEFAULT NULL,
  last_heartbeat_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wearable_device_id (device_id),
  UNIQUE KEY uq_wearable_hardware_id (hardware_id),
  UNIQUE KEY uq_wearable_usuario (usuario_id),
  UNIQUE KEY uq_wearable_rfid_uid (rfid_uid),
  KEY ix_wearable_active_seen (activo,last_seen),
  CONSTRAINT fk_wearable_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS rfid_stations (
  id BIGINT NOT NULL AUTO_INCREMENT,
  station_id VARCHAR(64) NOT NULL,
  hardware_id VARCHAR(96) DEFAULT NULL,
  nombre VARCHAR(100) NOT NULL,
  ubicacion VARCHAR(120) DEFAULT NULL,
  station_key_hash VARCHAR(255) DEFAULT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  firmware VARCHAR(80) DEFAULT NULL,
  rssi SMALLINT DEFAULT NULL,
  uptime BIGINT UNSIGNED DEFAULT NULL,
  reader_ok TINYINT(1) DEFAULT NULL,
  last_uid VARCHAR(128) DEFAULT NULL,
  last_ip VARCHAR(64) DEFAULT NULL,
  last_seen DATETIME DEFAULT NULL,
  last_heartbeat_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id),
  UNIQUE KEY uq_rfid_station_id(station_id),
  UNIQUE KEY uq_rfid_hardware_id(hardware_id),
  KEY ix_rfid_station_active_seen(activo,last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS wearable_alerts (
  id BIGINT NOT NULL AUTO_INCREMENT,
  alert_id VARCHAR(128) NOT NULL,
  pedido_id INT DEFAULT NULL,
  kitchen_ticket_id BIGINT DEFAULT NULL,
  usuario_id INT DEFAULT NULL,
  wearable_id BIGINT NOT NULL,
  mesa_numero VARCHAR(50) DEFAULT NULL,
  event_type VARCHAR(64) NOT NULL DEFAULT 'order_ready',
  estado ENUM('waiting_pickup','picked_up','cancelled') NOT NULL DEFAULT 'waiting_pickup',
  sent_at DATETIME DEFAULT NULL,
  ack_at DATETIME DEFAULT NULL,
  picked_up_at DATETIME DEFAULT NULL,
  closed_at DATETIME DEFAULT NULL,
  station_id BIGINT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id),
  UNIQUE KEY uq_wearable_alert_id(alert_id),
  KEY ix_wearable_alert_pedido(pedido_id),
  KEY ix_wearable_alert_ticket(kitchen_ticket_id),
  KEY ix_wearable_alert_device_state(wearable_id,estado),
  KEY ix_wearable_alert_usuario_state(usuario_id,estado),
  CONSTRAINT fk_wearable_alert_pedido FOREIGN KEY(pedido_id) REFERENCES pedidos(id) ON DELETE SET NULL,
  CONSTRAINT fk_wearable_alert_ticket FOREIGN KEY(kitchen_ticket_id) REFERENCES kitchen_tickets(id) ON DELETE SET NULL,
  CONSTRAINT fk_wearable_alert_usuario FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_wearable_alert_device FOREIGN KEY(wearable_id) REFERENCES wearable_devices(id) ON DELETE CASCADE,
  CONSTRAINT fk_wearable_alert_station FOREIGN KEY(station_id) REFERENCES rfid_stations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS rfid_enrollments (
  id BIGINT NOT NULL AUTO_INCREMENT,
  wearable_id BIGINT NOT NULL,
  station_id BIGINT DEFAULT NULL,
  estado ENUM('waiting','detected','confirmed','cancelled','expired') NOT NULL DEFAULT 'waiting',
  detected_uid VARCHAR(128) DEFAULT NULL,
  expires_at DATETIME NOT NULL,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id),
  KEY ix_rfid_enroll_state(estado,expires_at),
  CONSTRAINT fk_rfid_enroll_wearable FOREIGN KEY(wearable_id) REFERENCES wearable_devices(id) ON DELETE CASCADE,
  CONSTRAINT fk_rfid_enroll_station FOREIGN KEY(station_id) REFERENCES rfid_stations(id) ON DELETE CASCADE,
  CONSTRAINT fk_rfid_enroll_user FOREIGN KEY(created_by) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS rfid_events (
  id BIGINT NOT NULL AUTO_INCREMENT,
  event_key VARCHAR(128) NOT NULL,
  station_id BIGINT NOT NULL,
  uid VARCHAR(128) NOT NULL,
  wearable_id BIGINT DEFAULT NULL,
  alert_id BIGINT DEFAULT NULL,
  resultado VARCHAR(64) NOT NULL,
  details LONGTEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id),
  UNIQUE KEY uq_rfid_event_key(event_key),
  KEY ix_rfid_events_station_created(station_id,created_at),
  KEY ix_rfid_events_uid_created(uid,created_at),
  CONSTRAINT fk_rfid_event_station FOREIGN KEY(station_id) REFERENCES rfid_stations(id) ON DELETE CASCADE,
  CONSTRAINT fk_rfid_event_wearable FOREIGN KEY(wearable_id) REFERENCES wearable_devices(id) ON DELETE SET NULL,
  CONSTRAINT fk_rfid_event_alert FOREIGN KEY(alert_id) REFERENCES wearable_alerts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO schema_migrations(version) VALUES('011_wearables');
