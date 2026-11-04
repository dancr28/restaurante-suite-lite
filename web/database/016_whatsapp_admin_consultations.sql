-- 016_whatsapp_admin_consultations.sql

ALTER TABLE bot_questions
  ADD COLUMN IF NOT EXISTS admin_group_peer VARCHAR(180) NULL AFTER knowledge_id,
  ADD COLUMN IF NOT EXISTS admin_context TEXT NULL AFTER admin_group_peer,
  ADD COLUMN IF NOT EXISTS last_reminder_at DATETIME NULL AFTER admin_context,
  ADD COLUMN IF NOT EXISTS reminder_count INT NOT NULL DEFAULT 0 AFTER last_reminder_at;

CREATE TABLE IF NOT EXISTS bot_temp_availability (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  entity_key VARCHAR(160) NOT NULL,
  entity_label VARCHAR(160) NOT NULL,
  estado ENUM('disponible','agotado') NOT NULL,
  source_text VARCHAR(500) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bot_temp_availability_entity (entity_key),
  INDEX ix_bot_temp_availability_estado (estado)
);

CREATE TABLE IF NOT EXISTS bot_runtime_state (
  state_key VARCHAR(100) PRIMARY KEY,
  state_value VARCHAR(500) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO schema_migrations(version)
VALUES('016_whatsapp_admin_consultations');
