-- MP_POINT_PRINT_WORKER_SCHEMA_V1
--
-- Estado intermedio para acciones externas que ya existen
-- pero todavía no han sido obtenidas por la terminal.
--
-- No crea print_jobs.
-- No llama a Mercado Pago.
-- No imprime.

ALTER TABLE print_jobs
  MODIFY COLUMN status
  ENUM(
    'queued',
    'sending',
    'provider_pending',
    'sent',
    'failed',
    'uncertain',
    'blocked'
  )
  NOT NULL
  DEFAULT 'queued';
