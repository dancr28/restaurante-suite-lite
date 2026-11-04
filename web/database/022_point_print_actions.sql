-- MP_POINT_PRINT_PERSISTENCE_V1
--
-- Persistencia de acciones de impresión Mercado Pago Point.
--
-- No modifica trabajos existentes.
-- No envía impresiones.
-- No crea acciones en Mercado Pago.

ALTER TABLE print_jobs

  ADD COLUMN IF NOT EXISTS
    provider VARCHAR(32) NULL
    AFTER printer_snapshot,

  ADD COLUMN IF NOT EXISTS
    provider_action_id VARCHAR(100) NULL
    AFTER provider,

  ADD COLUMN IF NOT EXISTS
    provider_status VARCHAR(40) NULL
    AFTER provider_action_id,

  ADD COLUMN IF NOT EXISTS
    provider_idempotency_key VARCHAR(80) NULL
    AFTER provider_status,

  ADD COLUMN IF NOT EXISTS
    provider_external_reference VARCHAR(64) NULL
    AFTER provider_idempotency_key,

  ADD COLUMN IF NOT EXISTS
    provider_response LONGTEXT NULL
    AFTER provider_external_reference,

  ADD COLUMN IF NOT EXISTS
    provider_updated_at DATETIME NULL
    AFTER provider_response;


CREATE UNIQUE INDEX IF NOT EXISTS
  ux_print_jobs_provider_action
ON print_jobs (
  provider_action_id
);


CREATE UNIQUE INDEX IF NOT EXISTS
  ux_print_jobs_provider_idempotency
ON print_jobs (
  provider_idempotency_key
);


CREATE UNIQUE INDEX IF NOT EXISTS
  ux_print_jobs_provider_external_reference
ON print_jobs (
  provider_external_reference
);
