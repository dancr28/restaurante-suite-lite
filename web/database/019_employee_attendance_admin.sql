-- ============================================================
-- E1 · EMPLEADOS + ASISTENCIA ADMINISTRATIVA
-- EMPLOYEE_ATTENDANCE_ADMIN_E1
-- ============================================================

ALTER TABLE asistencias
  ADD COLUMN IF NOT EXISTS origen_entrada
    ENUM('fingerprint','pin','manual','system')
    NULL
    AFTER hora_entrada,

  ADD COLUMN IF NOT EXISTS origen_salida
    ENUM('fingerprint','pin','manual','system')
    NULL
    AFTER hora_salida,

  ADD COLUMN IF NOT EXISTS incidencia_tipo
    ENUM(
      'normal',
      'falta_justificada',
      'falta_injustificada',
      'permiso',
      'vacaciones',
      'incapacidad'
    )
    NOT NULL
    DEFAULT 'normal'
    AFTER estado_puntualidad,

  ADD COLUMN IF NOT EXISTS incidencia_nota
    VARCHAR(500)
    NULL
    AFTER incidencia_tipo,

  ADD COLUMN IF NOT EXISTS ajuste_manual
    TINYINT(1)
    NOT NULL
    DEFAULT 0
    AFTER incidencia_nota,

  ADD COLUMN IF NOT EXISTS updated_at
    TIMESTAMP
    NULL
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
    AFTER distancia_entrada_metros;


CREATE TABLE IF NOT EXISTS attendance_adjustments (
  id INT NOT NULL AUTO_INCREMENT,

  asistencia_id INT NULL,
  usuario_id INT NOT NULL,

  fecha DATE NOT NULL,

  accion ENUM(
    'create',
    'update',
    'incident',
    'clear'
  ) NOT NULL DEFAULT 'update',

  before_json JSON NULL,
  after_json JSON NULL,

  motivo VARCHAR(255) NOT NULL,
  observacion VARCHAR(500) NULL,

  actor_user_id INT NULL,
  actor_name VARCHAR(100) NOT NULL,

  payroll_was_paid TINYINT(1)
    NOT NULL DEFAULT 0,

  payroll_payment_id INT NULL,

  created_at TIMESTAMP
    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  KEY ix_att_adj_user_date (
    usuario_id,
    fecha
  ),

  KEY ix_att_adj_attendance (
    asistencia_id
  ),

  KEY ix_att_adj_created (
    created_at
  ),

  CONSTRAINT fk_att_adj_user
    FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_att_adj_actor
    FOREIGN KEY (actor_user_id)
    REFERENCES usuarios(id)
    ON DELETE SET NULL,

  CONSTRAINT fk_att_adj_attendance
    FOREIGN KEY (asistencia_id)
    REFERENCES asistencias(id)
    ON DELETE SET NULL,

  CONSTRAINT fk_att_adj_payroll
    FOREIGN KEY (payroll_payment_id)
    REFERENCES payroll_payments(id)
    ON DELETE SET NULL
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_general_ci;
