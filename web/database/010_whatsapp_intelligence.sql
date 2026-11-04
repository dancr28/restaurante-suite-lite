-- Restaurante Suite · WhatsApp Intelligence / CRM
CREATE TABLE IF NOT EXISTS bot_knowledge (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  titulo VARCHAR(160) NOT NULL,
  categoria VARCHAR(80) NOT NULL DEFAULT 'general',
  contenido TEXT NOT NULL,
  entidad VARCHAR(160) NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX ix_bot_knowledge_activo (activo,categoria)
);
CREATE TABLE IF NOT EXISTS bot_questions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  telefono VARCHAR(20) NOT NULL,
  pregunta TEXT NOT NULL,
  respuesta TEXT NULL,
  estado ENUM('pendiente','respondida','descartada') NOT NULL DEFAULT 'pendiente',
  knowledge_id BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  answered_at DATETIME NULL,
  INDEX ix_bot_questions_estado (estado,created_at),
  CONSTRAINT fk_bot_question_knowledge FOREIGN KEY (knowledge_id) REFERENCES bot_knowledge(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS whatsapp_order_snapshots (
  pedido_id INT PRIMARY KEY,
  telefono VARCHAR(20) NOT NULL,
  tipo_servicio VARCHAR(20) NOT NULL,
  items_json LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_wa_snapshot_order FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
  INDEX ix_wa_snapshot_phone (telefono,created_at)
);
INSERT IGNORE INTO schema_migrations(version) VALUES('010_whatsapp_intelligence');
