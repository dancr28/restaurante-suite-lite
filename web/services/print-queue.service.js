const db = require('../config/db'),
  settings = require('./settings.service'),
  { render } = require('../lib/ticket'),
  { renderKitchenBuffer } = require('../lib/kitchen-ticket'),
  { renderCustomerBuffer } = require('../lib/customer-ticket'),
  { renderShiftBuffer } = require('../lib/shift-ticket'),
  { renderSurveyBuffer } = require('../lib/survey-ticket'),
  { renderPayrollBuffer } = require('../lib/payroll-ticket');
const net = require('node:net');

const pointPrint =
  require('./point-print.service');

/*
 * MP_POINT_PRINT_WORKER_V1
 *
 * Reglas:
 * - TCP conserva el flujo existente.
 * - Point sólo procesa kitchen/cancel.
 * - La identidad se persiste ANTES del POST.
 * - Una acción conocida se reconcilia por GET.
 * - Un POST ambiguo reutiliza la MISMA idempotencia.
 * - Nunca genera una segunda identidad automáticamente.
 */

function isPointPrinter(printer) {
  return (
    printer &&
    printer.transport ===
      'mercadopago_point'
  );
}

function pointIdentity(job) {
  const id =
    String(job.id);

  return {
    idempotencyKey:
      job.provider_idempotency_key ||
      `rs_point_print_${id}`,

    externalReference:
      job.provider_external_reference ||
      `rs_print_${id}`
  };
}

function providerJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function pointRetrySeconds(cfg) {
  return Math.max(
    2,
    Math.min(
      30,
      Number(
        cfg?.printing?.retrySeconds
        || 5
      )
    )
  );
}

async function savePointIdentity(
  job
) {
  const identity =
    pointIdentity(job);

  await db.query(
    `UPDATE print_jobs
     SET
       provider='mercadopago_point',
       provider_idempotency_key=
         COALESCE(
           provider_idempotency_key,
           ?
         ),
       provider_external_reference=
         COALESCE(
           provider_external_reference,
           ?
         ),
       provider_updated_at=NOW()
     WHERE id=?`,
    [
      identity.idempotencyKey,
      identity.externalReference,
      job.id
    ]
  );

  job.provider =
    'mercadopago_point';

  job.provider_idempotency_key =
    identity.idempotencyKey;

  job.provider_external_reference =
    identity.externalReference;

  return identity;
}

/*
 * MP_POINT_PRINT_FINAL_STATE_V2
 *
 * Estados observados físicamente/API:
 *
 * created:
 *   acción creada, aún pendiente.
 *
 * on_terminal:
 *   la terminal obtuvo la acción.
 *   NO significa impresión física terminada.
 *
 * processed:
 *   observado posteriormente en acciones que
 *   completaron correctamente.
 *
 * expired/canceled:
 *   no se consideran impresiones completadas.
 *
 * IMPORTANTE:
 * nunca se crea automáticamente otra acción.
 */
async function setPointState(
  job,
  action,
  cfg
) {
  const actionId =
    String(
      action?.id ||
      job.provider_action_id ||
      ''
    ).trim();

  const status =
    String(
      action?.status ||
      job.provider_status ||
      ''
    ).trim().toLowerCase();

  const response =
    providerJson(action);

  if (!actionId) {
    await db.query(
      `UPDATE print_jobs
       SET
         status='uncertain',
         provider_status=?,
         provider_response=?,
         provider_updated_at=NOW(),
         last_error=?
       WHERE id=?`,
      [
        status || null,
        response,
        'Mercado Pago respondió sin action_id; revisión manual requerida',
        job.id
      ]
    );

    return;
  }

  if (status === 'processed') {
    await db.query(
      `UPDATE print_jobs
       SET
         status='sent',
         provider_action_id=?,
         provider_status=?,
         provider_response=?,
         provider_updated_at=NOW(),
         sent_at=COALESCE(sent_at,NOW()),
         next_attempt=NOW(),
         last_error=NULL
       WHERE id=?`,
      [
        actionId,
        status,
        response,
        job.id
      ]
    );

    return;
  }

  if (
    status === 'expired' ||
    status === 'canceled'
  ) {
    const message =
      status === 'expired'
        ? (
            'La impresión Point no se completó. '
            + 'Revisa papel, tapa, temperatura '
            + 'o estado de la terminal. '
            + 'No se reimprimió automáticamente.'
          )
        : (
            'La acción de impresión Point fue cancelada. '
            + 'No se reimprimió automáticamente.'
          );

    await db.query(
      `UPDATE print_jobs
       SET
         status='failed',
         provider_action_id=?,
         provider_status=?,
         provider_response=?,
         provider_updated_at=NOW(),
         next_attempt=NOW(),
         last_error=?
       WHERE id=?`,
      [
        actionId,
        status,
        response,
        message,
        job.id
      ]
    );

    return;
  }

  if (
    status === 'created' ||
    status === 'on_terminal'
  ) {
    const message =
      status === 'on_terminal'
        ? 'Point recibió la impresión; esperando estado final'
        : null;

    await db.query(
      `UPDATE print_jobs
       SET
         status='provider_pending',
         provider_action_id=?,
         provider_status=?,
         provider_response=?,
         provider_updated_at=NOW(),
         next_attempt=
           DATE_ADD(
             NOW(),
             INTERVAL ? SECOND
           ),
         last_error=?
       WHERE id=?`,
      [
        actionId,
        status,
        response,
        pointRetrySeconds(cfg),
        message,
        job.id
      ]
    );

    return;
  }

  await db.query(
    `UPDATE print_jobs
     SET
       status='provider_pending',
       provider_action_id=?,
       provider_status=?,
       provider_response=?,
       provider_updated_at=NOW(),
       next_attempt=
         DATE_ADD(
           NOW(),
           INTERVAL ? SECOND
         ),
       last_error=?
     WHERE id=?`,
    [
      actionId,
      status || 'created',
      response,
      pointRetrySeconds(cfg),
      (
        'Estado Point no reconocido como final: '
        + (status || 'sin_estado')
        + '. No se reimprimirá automáticamente.'
      ).slice(0, 500),
      job.id
    ]
  );
}

async function processPointJob(
  job,
  printer,
  payload,
  cfg
) {
  if (
    ![
      'kitchen',
      'cancel'
    ].includes(job.kind)
  ) {
    await db.query(
      `UPDATE print_jobs
       SET
         status='blocked',
         last_error=?,
         provider_updated_at=NOW()
       WHERE id=?`,
      [
        'Point sólo admite Comandas y Cancelaciones en esta versión',
        job.id
      ]
    );

    return;
  }

  const terminalId =
    String(
      printer?.terminal_id || ''
    ).trim();

  if (!terminalId) {
    await db.query(
      `UPDATE print_jobs
       SET
         status='blocked',
         last_error=?,
         provider_updated_at=NOW()
       WHERE id=?`,
      [
        'La impresora Point no tiene terminal_id',
        job.id
      ]
    );

    return;
  }

  const identity =
    await savePointIdentity(job);

  if (job.provider_action_id) {
    try {
      const action =
        await pointPrint.getPrintAction({
          actionId:
            job.provider_action_id
        });

      await setPointState(
        job,
        action,
        cfg
      );
    } catch (err) {
      await db.query(
        `UPDATE print_jobs
         SET
           status='provider_pending',
           provider_updated_at=NOW(),
           next_attempt=
             DATE_ADD(
               NOW(),
               INTERVAL ? SECOND
             ),
           last_error=?
         WHERE id=?`,
        [
          pointRetrySeconds(cfg),
          (
            'No se pudo consultar acción Point: '
            + String(
                err.message ||
                'error desconocido'
              )
          ).slice(0, 500),
          job.id
        ]
      );
    }

    return;
  }

  try {
    const action =
      await pointPrint.sendKitchenPrint({
        terminalId,

        externalReference:
          identity.externalReference,

        idempotencyKey:
          identity.idempotencyKey,

        kind:
          job.kind,

        data:
          payload
      });

    await setPointState(
      job,
      action,
      cfg
    );
  } catch (err) {
    const mpStatus =
      Number(
        err.mpStatus || 0
      );

    const message =
      String(
        err.message ||
        'Error enviando impresión Point'
      ).slice(0, 500);

    const definitiveClientError =
      [
        400,
        401,
        403,
        404,
        422
      ].includes(mpStatus);

    if (definitiveClientError) {
      await db.query(
        `UPDATE print_jobs
         SET
           status='failed',
           provider_updated_at=NOW(),
           provider_response=?,
           last_error=?
         WHERE id=?`,
        [
          providerJson(
            err.mpResponse
          ),
          message,
          job.id
        ]
      );

      return;
    }

    /*
     * MP_POINT_TERMINAL_BUSY_V2
     * HTTP 409 terminal ocupada no equivale
     * a conflicto de idempotencia.
     */
    const mpErrorText = (
      message + ' ' + providerJson(err.mpResponse)
    ).toLowerCase();

    const terminalBusy =
      mpStatus === 409
      && (
        mpErrorText.includes(
          'already_queued_order_on_terminal'
        )
        || mpErrorText.includes(
          'already_queued_order_for_terminal'
        )
        || mpErrorText.includes(
          'there is already a queued order on the terminal'
        )
      );

    if (terminalBusy) {
      await db.query(
        `UPDATE print_jobs
         SET
           status='queued',
           provider_updated_at=NOW(),
           provider_response=?,
           next_attempt=DATE_ADD(
             NOW(),
             INTERVAL ? SECOND
           ),
           last_error=?
         WHERE id=?`,
        [
          providerJson(err.mpResponse),
          Math.max(
            15,
            pointRetrySeconds(cfg)
          ),
          (
            'Terminal Point ocupada. '
            + 'Esperando con la misma idempotencia. '
            + message
          ).slice(0, 500),
          job.id
        ]
      );

      return;
    }

    if (mpStatus === 409) {
      await db.query(
        `UPDATE print_jobs
         SET
           status='uncertain',
           provider_updated_at=NOW(),
           provider_response=?,
           last_error=?
         WHERE id=?`,
        [
          providerJson(err.mpResponse),
          (
            'Conflicto Point HTTP 409 no reconocido. '
            + 'NO reintentar automáticamente. '
            + message
          ).slice(0, 500),
          job.id
        ]
      );

      return;
    }

    const maxAttempts =
      Math.max(
        1,
        Number(
          cfg?.printing?.maxAttempts
          || 3
        )
      );

    if (
      Number(job.attempts || 0)
      >= maxAttempts
    ) {
      await db.query(
        `UPDATE print_jobs
         SET
           status='uncertain',
           provider_updated_at=NOW(),
           provider_response=?,
           last_error=?
         WHERE id=?`,
        [
          providerJson(
            err.mpResponse
          ),
          (
            'No se confirmó la creación de la impresión Point '
            + 'después de varios intentos con la misma idempotencia. '
            + message
          ).slice(0, 500),
          job.id
        ]
      );

      return;
    }

    await db.query(
      `UPDATE print_jobs
       SET
         status='queued',
         provider_updated_at=NOW(),
         provider_response=?,
         next_attempt=
           DATE_ADD(
             NOW(),
             INTERVAL ? SECOND
           ),
         last_error=?
       WHERE id=?`,
      [
        providerJson(
          err.mpResponse
        ),
        pointRetrySeconds(cfg),
        (
          'Creación Point no confirmada; '
          + 'se reutilizará la MISMA idempotencia. '
          + message
        ).slice(0, 500),
        job.id
      ]
    );
  }
}


/* PRINT_CATEGORY_ROUTING_E2
 * Enrutamiento seguro de comandas y cancelaciones.
 * No modifica recibos, cajón ni cobros Point.
 */
async function categoryRoutingItems(conn, cfg, kind, data, printers, printerId) {
  const original = Array.isArray(data?.items) ? data.items : null;

  if (
    cfg.printing?.categoryRoutingEnabled !== true ||
    !['kitchen', 'cancel'].includes(kind) ||
    printerId ||
    !original ||
    !original.length ||
    !printers.length
  ) {
    return null;
  }

  const productIds = [
    ...new Set(
      original
        .map((item) => Number(item.producto_id))
        .filter((id) => Number.isSafeInteger(id) && id > 0)
    )
  ];

  const categories = new Map();

  try {
    if (productIds.length) {
      const placeholders = productIds.map(() => '?').join(',');

      const [rows] = await conn.query(
        'SELECT id, categoria_id FROM productos WHERE id IN ('
          + placeholders + ')',
        productIds
      );

      for (const row of rows) {
        categories.set(
          Number(row.id),
          row.categoria_id == null
            ? null
            : Number(row.categoria_id)
        );
      }
    }
  } catch (error) {
    console.error(
      '[PRINT_CATEGORY_ROUTING_E2] Error consultando categorías; '
      + 'se conserva la impresión completa:',
      error
    );

    return null;
  }

  const assignments = new Map(
    printers.map((printer) => [printer.id, []])
  );

  for (const item of original) {
    const productId = Number(item.producto_id);
    const categoryId = categories.get(productId);

    const assigned = printers.filter((printer) => {
      const selected = Array.isArray(printer.category_ids)
        ? printer.category_ids
        : [];

      return Number.isSafeInteger(categoryId)
        && categoryId > 0
        && selected.some((id) => Number(id) === categoryId);
    });

    // PRINT_CATEGORY_ROUTING_G1B
    // Cada impresora recibe exclusivamente sus categorias.
    for (const printer of assigned) {
      assignments.get(printer.id).push(item);
    }
  }

  return assignments;
}

async function enqueue(conn, kind, data, key, printerId) {
  const cfg = await settings.get(conn);
  if (kind === 'kitchen' && !cfg.printing.autoKitchen && !printerId)
    return { success: true, skipped: true, jobs: [] };
  const printers = cfg.printers.filter((p) => {
    if (!p.enabled) return false;
    if (printerId) return p.id === printerId;
    if (p.kinds.includes(kind)) return true;
    return [
      'payroll',
      'tips',
      'prebill',
      'survey',
      'loan_agreement',
      'loan_payment',
      'loan_statement',
      'employee_charge',
    ].includes(kind) && p.kinds.includes('receipt');
  });
  if (printerId && !printers.length)
    throw Object.assign(new Error('Impresora desactivada o inexistente'), { status: 400 });
  const ids = [];
  const copies =
    kind === 'receipt'
      ? cfg.printing.receiptCopies
      : ['kitchen', 'cancel'].includes(kind)
        ? cfg.printing.kitchenCopies
        : 1;
  const categoryAssignments = await categoryRoutingItems(
    conn,
    cfg,
    kind,
    data,
    printers,
    printerId
  );

  for (const p of printers.length ? printers : [null]) {
    const routedItems = categoryAssignments?.get(p?.id);

    if (categoryAssignments && !routedItems?.length) {
      continue;
    }

    for (let copy = 0; copy < copies; copy++) {
      const payload = {
        ...data,
        ...(categoryAssignments ? { items: routedItems } : {}),
        printed_at: new Date().toLocaleString(cfg.business.locale, {
          timeZone: cfg.business.timeZone,
          hour12: cfg.business.hour12,
        }),
        business: {
          ...cfg.business,
          phone: cfg.printing.showPhone ? cfg.business.phone : '',
          address: cfg.printing.showAddress ? cfg.business.address : '',
        },
        printing: cfg.printing,
        cajero: cfg.printing.showCashier ? data.cajero : '',
        mesero: cfg.printing.showWaiter ? data.mesero : '',
        metodo_pago: cfg.printing.showPayment ? data.metodo_pago : '',
      };
      const [result] = await conn.query(
        'INSERT IGNORE INTO print_jobs(printer_id,kind,payload,printer_snapshot,dedupe_key,status) VALUES(?,?,?,?,?,?)',
        [
          p?.id || null,
          kind,
          JSON.stringify(payload),
          p ? JSON.stringify(p) : null,
          key ? key + ':' + (p?.id || 'unassigned') + (copy ? ':copy' + copy : '') : null,
          p ? 'queued' : 'blocked',
        ],
      );
      if (result.insertId) ids.push(result.insertId);
    }
  }
  return {
    success: true,
    queued: true,
    jobs: ids,
    warning: printers.length ? null : 'Configura una impresora y asigna el ticket pendiente.',
  };
}
function transmit(printer, buffer, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let sent = false,
      settled = false;
    function finish(err) {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) {
        err.uncertain = sent;
        reject(err);
      } else resolve();
    }
    socket.setTimeout(timeoutMs);
    socket.once('error', finish);
    socket.once('timeout', () => finish(new Error('Tiempo de espera agotado')));
    socket.connect(printer.port, printer.host, () => {
      sent = true;
      socket.end(buffer);
    });
    socket.once('close', (hadError) => {
      if (!settled) finish(hadError ? new Error('Conexión interrumpida') : null);
    });
  });
}
/* E2E_E2_SAFE_V1: reservas por dispositivo con GET_LOCK en MariaDB.
 * El bloqueo se mantiene durante la operación de red; una acción Point
 * provider_pending impide NUEVOS POST, pero permite su reconciliación GET.
 */
const crypto = require('node:crypto');
const MAX_ACTIVE_PRINT_JOBS = 2;
let activePrintJobs = 0;
let claimingPrintJob = false;

function printDeviceKey(job) {
  let printer = null;
  try { printer = JSON.parse(job.printer_snapshot || 'null'); }
  catch { /* Un snapshot inválido se manejará al ejecutar el trabajo. */ }
  if (isPointPrinter(printer) && String(printer.terminal_id || '').trim()) {
    return 'point:' + String(printer.terminal_id).trim();
  }
  return 'printer:' + String(job.printer_id || printer?.id || ('job:' + job.id));
}

function isPrintJobBlocked(job, others, deviceKey) {
  for (const other of others) {
    if (String(other.id) === String(job.id)) continue;
    if (printDeviceKey(other) !== deviceKey) continue;
    if (other.status === 'sending') return true;
    if (other.status === 'provider_pending' && job.status !== 'provider_pending') return true;
    if (other.status === 'queued' && job.status === 'queued'
        && Number(other.id) < Number(job.id)) return true;
  }
  return false;
}

async function claimPrintJob() {
  let lastId = 0;
  for (let page = 0; page < 5; page++) {
    const [candidates] = await db.query(
      `SELECT id, printer_id, printer_snapshot
       FROM print_jobs
       WHERE status IN ('queued', 'provider_pending')
         AND next_attempt <= NOW() AND id > ?
       ORDER BY id LIMIT 100`,
      [lastId]
    );
    if (!candidates.length) return null;
    lastId = Number(candidates[candidates.length - 1].id);

    for (const candidate of candidates) {
      const key = printDeviceKey(candidate);
      const name = 'rs_print_e2_' + crypto.createHash('sha256')
        .update(key).digest('hex').slice(0, 40);
      const lockConn = await db.getConnection();
      let hasLock = false;
      let claimed = null;
      try {
        const [[result]] = await lockConn.query(
          'SELECT GET_LOCK(?, 0) AS obtained', [name]
        );
        hasLock = Number(result.obtained) === 1;
        if (!hasLock) continue;

        const tx = await db.getConnection();
        try {
          await tx.beginTransaction();
          const [[job]] = await tx.query(
            `SELECT * FROM print_jobs
             WHERE id=? AND status IN ('queued','provider_pending')
               AND next_attempt <= NOW() FOR UPDATE`,
            [candidate.id]
          );
          if (job) {
            const [others] = await tx.query(
              `SELECT id, status, printer_id, printer_snapshot
               FROM print_jobs
               WHERE status IN ('queued','provider_pending','sending')
                 AND id <> ?`, [job.id]
            );
            if (!isPrintJobBlocked(job, others, key)) {
              let point = false;
              try { point = isPointPrinter(JSON.parse(job.printer_snapshot || 'null')); }
              catch { point = false; }
              if (point) {
                await tx.query(
                  `UPDATE print_jobs SET status='sending',
                   attempts=attempts+?, provider='mercadopago_point',
                   provider_updated_at=NOW() WHERE id=?`,
                  [job.status === 'queued' ? 1 : 0, job.id]
                );
                job.provider = 'mercadopago_point';
                if (job.status === 'queued') job.attempts = Number(job.attempts || 0) + 1;
              } else {
                await tx.query(
                  `UPDATE print_jobs SET status='sending',
                   attempts=attempts+1 WHERE id=?`, [job.id]
                );
                job.attempts = Number(job.attempts || 0) + 1;
              }
              claimed = job;
            }
          }
          if (claimed) await tx.commit();
          else await tx.rollback();
        } catch (err) {
          claimed = null; // Liberar bloqueo si falla COMMIT.
          try { await tx.rollback(); } catch { /* reportar error original */ }
          throw err;
        } finally {
          tx.release();
        }
        if (claimed) {
          return {
            job: claimed,
            release: async () => {
              try {
                const [[result]] = await lockConn.query(
                  'SELECT RELEASE_LOCK(?) AS released', [name]
                );
                if (Number(result.released) !== 1) {
                  throw new Error('Bloqueo no confirmado como liberado');
                }
                lockConn.release();
              } catch (err) {
                lockConn.destroy();
                console.error('[print lock release]', err.message);
              }
            }
          };
        }
      } finally {
        if (!claimed) {
          let canReturnToPool = true;
          if (hasLock) {
            try {
              const [[released]] = await lockConn.query(
                'SELECT RELEASE_LOCK(?) AS released', [name]
              );
              canReturnToPool = Number(released.released) === 1;
            } catch {
              canReturnToPool = false;
            }
          }
          if (canReturnToPool) lockConn.release();
          else lockConn.destroy();
        }
      }
    }
    if (candidates.length < 100) return null;
  }
  return null;
}

async function tick() {
  if (claimingPrintJob || activePrintJobs >= MAX_ACTIVE_PRINT_JOBS) return;
  claimingPrintJob = true;
  try {
    while (activePrintJobs < MAX_ACTIVE_PRINT_JOBS) {
      const claim = await claimPrintJob();
      if (!claim) break;
      activePrintJobs++;
      void executePrintJob(claim.job)
        .catch(err => console.error('[print worker job]', claim.job.id, err.message))
        .finally(async () => {
          try { await claim.release(); }
          finally { activePrintJobs--; }
        });
    }
  } finally {
    claimingPrintJob = false;
  }
}

async function executePrintJob(job) {
  let printer;
  let payload;

  try {
    printer =
      JSON.parse(
        job.printer_snapshot
      );

    payload =
      JSON.parse(
        job.payload
      );
  } catch {
    await db.query(
      `UPDATE print_jobs
       SET
         status='failed',
         last_error=?
       WHERE id=?`,
      [
        'Snapshot o payload de impresión inválido',
        job.id
      ]
    );

    return;
  }

  const cfg =
    await settings.get();

  const pointJob =
    isPointPrinter(printer);

  const pointAlreadyStarted =
    pointJob &&
    Boolean(
      job.provider_action_id ||
      job.provider_idempotency_key
    );

  const currentPrinter =
    cfg.printers.find(
      (p) =>
        p.id === printer.id
        && p.enabled
    );

  if (pointJob) {
    /*
     * Si todavía NO comenzó la operación Point,
     * respetamos la configuración actual.
     */
    if (!pointAlreadyStarted) {
      if (!currentPrinter) {
        await db.query(
          `UPDATE print_jobs
           SET
             status='blocked',
             last_error=?
           WHERE id=?`,
          [
            'Impresora Point desactivada antes de iniciar el envío',
            job.id
          ]
        );

        return;
      }

      if (
        !isPointPrinter(
          currentPrinter
        )
      ) {
        await db.query(
          `UPDATE print_jobs
           SET
             status='blocked',
             last_error=?
           WHERE id=?`,
          [
            'La impresora cambió de Point a TCP antes de iniciar el envío',
            job.id
          ]
        );

        return;
      }

      if (
        String(
          currentPrinter.terminal_id
          || ''
        ) !==
        String(
          printer.terminal_id
          || ''
        )
      ) {
        await db.query(
          `UPDATE print_jobs
           SET
             status='blocked',
             last_error=?
           WHERE id=?`,
          [
            'La terminal Point cambió antes de iniciar el envío',
            job.id
          ]
        );

        return;
      }
    }

    /*
     * Si YA comenzó:
     *
     * - action_id conocido -> GET
     * - sin action_id pero con idempotencia -> mismo POST
     *
     * No depende de que posteriormente alguien haya
     * desactivado o cambiado la impresora.
     */
    await processPointJob(
      job,
      printer,
      payload,
      cfg
    );

    return;
  }

  /*
   * TCP conserva su comportamiento anterior.
   */
  if (!currentPrinter) {
    await db.query(
      `UPDATE print_jobs
       SET
         status='blocked',
         last_error='Impresora desactivada'
       WHERE id=?`,
      [job.id]
    );

    return;
  }

  try {
    let buffer;

    if (job.kind === 'drawer') {
      const pulse =
        payload.printing ||
        cfg.printing;

      buffer = Buffer.from([
        27,
        112,
        Number(
          pulse.drawerPin
        ),
        pulse.drawerOnMs / 2,
        pulse.drawerOffMs / 2
      ]);

    } else if (
      [
        'kitchen',
        'cancel'
      ].includes(job.kind)
    ) {
      buffer =
        await renderKitchenBuffer(
          job.kind,
          payload,
          printer
        );

    } else if (
      [
        'receipt',
        'prebill'
      ].includes(job.kind)
    ) {
      buffer =
        await renderCustomerBuffer(
          job.kind,
          payload,
          printer,
          payload.business
        );

    } else if (
      job.kind === 'survey'
    ) {
      buffer =
        await renderSurveyBuffer(
          payload,
          printer
        );

    } else if (
      job.kind === 'shift'
    ) {
      buffer =
        await renderShiftBuffer(
          payload,
          printer,
          payload.business
        );

    } else if (
      [
        'payroll',
        'tips',
        'loan_agreement',
        'loan_payment',
        'loan_statement',
        'employee_charge'
      ].includes(job.kind)
    ) {
      buffer =
        await renderPayrollBuffer(
          job.kind,
          payload,
          printer,
          payload.business
        );

    } else {
      buffer =
        render(
          job.kind,
          payload,
          printer,
          payload.business
        ).buffer;
    }

    await transmit(
      printer,
      buffer,
      cfg.printing.timeoutMs
    );

    await db.query(
      `UPDATE print_jobs
       SET
         status='sent',
         sent_at=NOW(),
         last_error=NULL
       WHERE id=?`,
      [job.id]
    );

  } catch (err) {
    const status =
      err.uncertain
        ? 'uncertain'
        : (
            job.attempts >=
            cfg.printing.maxAttempts
          )
          ? 'failed'
          : 'queued';

    await db.query(
      `UPDATE print_jobs
       SET
         status=?,
         last_error=?,
         next_attempt=
           DATE_ADD(
             NOW(),
             INTERVAL ? SECOND
           )
       WHERE id=?`,
      [
        status,
        String(
          err.message
        ).slice(0, 500),
        cfg.printing.retrySeconds,
        job.id
      ]
    );
  }

}


async function start() {
  /*
   * Point con action_id:
   * podemos continuar por GET.
   */
  await db.query(
    `UPDATE print_jobs
     SET
       status='provider_pending',
       next_attempt=NOW(),
       last_error=
         'Reinicio durante reconciliación Point; continuando por action_id'
     WHERE status='sending'
       AND provider='mercadopago_point'
       AND provider_action_id IS NOT NULL`
  );

  /*
   * Point reservado pero todavía SIN identidad:
   * el proceso cayó antes de iniciar el POST.
   * Es seguro devolverlo a queued.
   */
  await db.query(
    `UPDATE print_jobs
     SET
       status='queued',
       next_attempt=NOW(),
       last_error=
         'Reinicio antes de iniciar impresión Point; reanudando de forma segura'
     WHERE status='sending'
       AND provider='mercadopago_point'
       AND provider_action_id IS NULL
       AND provider_idempotency_key IS NULL`
  );

  /*
   * Point sin action_id pero con idempotencia:
   * se repite exactamente el mismo POST.
   */
  await db.query(
    `UPDATE print_jobs
     SET
       status='queued',
       next_attempt=NOW(),
       last_error=
         'Reinicio durante creación Point; se reutilizará la misma idempotencia'
     WHERE status='sending'
       AND provider='mercadopago_point'
       AND provider_action_id IS NULL
       AND provider_idempotency_key IS NOT NULL`
  );

  /*
   * TCP conserva el comportamiento anterior.
   */
  await db.query(
    `UPDATE print_jobs
     SET
       status='uncertain',
       last_error=
         'Reinicio durante envío; comprueba el papel antes de reintentar'
     WHERE status='sending'
       AND (provider IS NULL OR provider <> 'mercadopago_point')`
  );

  const timer =
    setInterval(
      () =>
        tick().catch(
          (err) =>
            console.error(
              '[print worker]',
              err.message
            )
        ),
      1000
    );

  timer.unref();

  return () =>
    clearInterval(timer);
}

module.exports = { enqueue, tick, start, transmit };
