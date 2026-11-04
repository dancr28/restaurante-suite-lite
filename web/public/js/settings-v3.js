'use strict';

/* PRINT_CATEGORY_SELECTOR_D3B */
let printingCategories = [];

async function loadPrintingCategories() {
  const result = await api('/api/items/categorias');

  if (Array.isArray(result)) {
    printingCategories = result;
  } else if (Array.isArray(result?.categorias)) {
    printingCategories = result.categorias;
  } else {
    throw Error('Respuesta de categorías no reconocida');
  }
}

let settingsSavedSnapshot = null;
let state;
const $ = (id) => document.getElementById(id);
function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function notice(text, error = false) {
  $('status').textContent = text;
  $('status').style.display = 'block';
  $('status').classList.toggle('error', error);
}
async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  let data = null;

  if (res.status !== 204) {
    const text = await res.text();

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
    }
  }

  if (!res.ok) {
    throw Error(data?.error || data?.message || 'No se pudo completar la operación');
  }

  return data;
}
function action(label, fn, cls = 'secondary') {
  const b = el('button', label, cls);
  b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      await fn();
    } catch (e) {
      notice(e.message, true);
    } finally {
      b.disabled = false;
    }
  });
  return b;
}
function field(parent, label, value, onChange, type = 'text') {
  const l = el('label', label),
    input = el('input');
  input.type = type;
  input.value = value ?? '';
  input.addEventListener('input', () => onChange(input.value));
  l.append(input);
  parent.append(l);
  return input;
}
function check(parent, label, value, fn) {
  const l = el('label', undefined, 'check'),
    input = el('input');
  input.type = 'checkbox';
  input.checked = value;
  input.addEventListener('change', () => fn(input.checked));
  l.append(input, document.createTextNode(label));
  parent.append(l);
}
function setBusinessQrPreview(dataUrl) {
  const wrap = $('business-reviewQrPreviewWrap');
  const img = $('business-reviewQrPreview');
  if (!wrap || !img) return;
  if (dataUrl) {
    img.src = dataUrl;
    wrap.classList.remove('is-empty');
  } else {
    img.removeAttribute('src');
    wrap.classList.add('is-empty');
  }
}
async function generateBusinessQr(force = false) {
  const url = $('business-reviewQrUrl')?.value.trim() || '';
  if (!url) {
    setBusinessQrPreview('');
    return '';
  }
  if (!force && state?.business?.reviewQrUrl === url && state?.business?.reviewQrImage) {
    setBusinessQrPreview(state.business.reviewQrImage);
    return state.business.reviewQrImage;
  }
  const data = await api('/api/devices/review-qr?text=' + encodeURIComponent(url));
  setBusinessQrPreview(data.dataUrl || '');
  return data.dataUrl || '';
}
let pointPrinterTerminals = [];
  let pointPrinterTerminalsError = '';

  async function loadPointPrinterTerminals(
    redraw = true,
  ) {
    try {
      const data =
        await api(
          '/api/mercadopago/terminals/local',
        );

      pointPrinterTerminals =
        (
          Array.isArray(data?.terminals)
            ? data.terminals
            : []
        ).filter(
          (terminal) =>
            terminal.activo !== false
            && Number(
              terminal.activo,
            ) !== 0,
        );

      pointPrinterTerminalsError = '';
    } catch (error) {
      pointPrinterTerminals = [];

      pointPrinterTerminalsError =
        error?.message
        || 'No se pudieron cargar las terminales Point';
    }

    if (redraw) {
      draw();
    }

    return pointPrinterTerminals;
  }

  function draw() {
    /* MP_POINT_PRINTER_UI_V1 */

    const list = $('printers');

    list.replaceChildren();

    state.printers.forEach((p, i) => {
      const card =
        el('div', undefined, 'card');

      const grid =
        el('div', undefined, 'grid');

      p.transport =
        p.transport === 'mercadopago_point'
          ? 'mercadopago_point'
          : 'tcp';

      p.kinds =
        Array.isArray(p.kinds)
          ? p.kinds
          : [];

      field(
        grid,
        'Nombre',
        p.name,
        (v) => (p.name = v),
      );

      const transportWrap =
        el(
          'label',
          undefined,
          'field',
        );

      transportWrap.append(
        el(
          'span',
          'Tipo de conexión',
        ),
      );

      const transportSelect =
        document.createElement('select');

      for (const optionData of [
        {
          value: 'tcp',
          label: 'Impresora TCP/IP',
        },
        {
          value: 'mercadopago_point',
          label: 'Mercado Pago Point',
        },
      ]) {
        const option =
          document.createElement('option');

        option.value =
          optionData.value;

        option.textContent =
          optionData.label;

        transportSelect.append(option);
      }

      transportSelect.value =
        p.transport;

      transportSelect.onchange =
        () => {
          p.transport =
            transportSelect.value;

          if (
            p.transport ===
            'mercadopago_point'
          ) {
            /* MP_POINT_PRINTER_UI_KINDS_V1 */

            p.cut = false;

            p.kinds =
              p.kinds.filter(
                (kind) =>
                  [
                    'kitchen',
                    'cancel'
                  ].includes(kind),
              );
          } else {
            p.terminal_id = '';
            p.terminal_alias = '';

            p.port =
              Number(p.port) || 9100;

            p.width =
              Number(p.width) === 58
                ? 58
                : 80;

            p.columns =
              Number(p.columns)
              || (
                p.width === 58
                  ? 32
                  : 48
              );
          }

          draw();
        };

      transportWrap.append(
        transportSelect,
      );

      grid.append(
        transportWrap,
      );

      if (
        p.transport ===
        'mercadopago_point'
      ) {
        const terminalWrap =
          el(
            'label',
            undefined,
            'field',
          );

        terminalWrap.append(
          el(
            'span',
            'Terminal Point',
          ),
        );

        const terminalSelect =
          document.createElement(
            'select',
          );

        const empty =
          document.createElement(
            'option',
          );

        empty.value = '';

        empty.textContent =
          pointPrinterTerminalsError
            ? 'Error cargando terminales'
            : 'Selecciona una terminal Point';

        terminalSelect.append(
          empty,
        );

        for (
          const terminal
          of pointPrinterTerminals
        ) {
          const option =
            document.createElement(
              'option',
            );

          option.value =
            terminal.terminal_id;

          option.textContent =
            terminal.alias
            || 'Terminal Point';

          terminalSelect.append(
            option,
          );
        }

        if (
          p.terminal_id
          && !pointPrinterTerminals.some(
            (terminal) =>
              terminal.terminal_id
              === p.terminal_id,
          )
        ) {
          const saved =
            document.createElement(
              'option',
            );

          saved.value =
            p.terminal_id;

          saved.textContent =
            (
              p.terminal_alias
              || 'Terminal guardada'
            )
            + ' · no disponible';

          terminalSelect.append(
            saved,
          );
        }

        terminalSelect.value =
          p.terminal_id || '';

        terminalSelect.onchange =
          () => {
            const terminal =
              pointPrinterTerminals.find(
                (item) =>
                  item.terminal_id
                  === terminalSelect.value,
              );

            p.terminal_id =
              terminalSelect.value;

            p.terminal_alias =
              terminal?.alias || '';
          };

        terminalWrap.append(
          terminalSelect,
        );

        grid.append(
          terminalWrap,
        );

        grid.append(
          el(
            'p',
            pointPrinterTerminalsError
              ? pointPrinterTerminalsError
              : pointPrinterTerminals.length
                ? (
                    'Usará la impresora integrada '
                    + 'de la Point seleccionada.'
                  )
                : (
                    'No hay terminales Point '
                    + 'activas sincronizadas.'
                  ),
            'muted',
          ),
        );
      } else {
        field(
          grid,
          'IP',
          p.host,
          (v) => (p.host = v),
        );

        field(
          grid,
          'Puerto',
          p.port,
          (v) => (
            p.port = Number(v)
          ),
          'number',
        );

        field(
          grid,
          'Ancho (58 u 80 mm)',
          p.width,
          (v) => {
            p.width =
              Number(v);

            p.columns =
              p.width === 58
                ? 32
                : 48;
          },
          'number',
        );

        field(
          grid,
          'Caracteres por línea',
          p.columns,
          (v) => (
            p.columns = Number(v)
          ),
          'number',
        );
      }

      card.append(grid);

      const flags =
        el(
          'div',
          undefined,
          'toolbar',
        );

      check(
        flags,
        'Activada',
        p.enabled,
        (v) => (p.enabled = v),
      );

      if (p.transport === 'tcp') {
        check(
          flags,
          'Cortar papel',
          p.cut,
          (v) => (p.cut = v),
        );
      }

      const kinds = {
        kitchen: 'Comandas',
        cancel: 'Cancelaciones',
        receipt: 'Recibos',
        prebill: 'Precuentas',
        refund: 'Reembolsos',
        shift: 'Cortes',
        payroll: 'Nómina',
        tips: 'Propinas',
        drawer: 'Cajón',
      };

      for (
        const [key, label]
        of Object.entries(kinds)
      ) {
        if (
          p.transport ===
            'mercadopago_point'
          && ![
            'kitchen',
            'cancel'
          ].includes(key)
        ) {
          continue;
        }

        check(
          flags,
          label,
          p.kinds.includes(key),
          (value) => {
            p.kinds =
              value
                ? [
                    ...new Set(
                      [
                        ...p.kinds,
                        key,
                      ],
                    ),
                  ]
                : p.kinds.filter(
                    (kind) =>
                      kind !== key,
                  );
          },
        );
      }

      card.append(flags);

      /* PRINT_CATEGORY_SELECTOR_D3B */
      if (
        p.kinds.includes('kitchen') ||
        p.kinds.includes('cancel')
      ) {
        const categoryBox = el('div', undefined, 'card');

        categoryBox.append(
          el('strong', 'Categorías que imprimirá')
        );

        categoryBox.append(
          el(
            'p',
            'Estas categorías se guardarán en la impresora. '
            + 'Todavía no se aplican al envío de comandas.',
            'muted'
          )
        );

        if (!Array.isArray(p.category_ids)) {
          p.category_ids = [];
        }

        if (!printingCategories.length) {
          categoryBox.append(
            el('p', 'No hay categorías disponibles.', 'muted')
          );
        }

        for (const category of printingCategories) {
          const categoryId = Number(category.id);

          if (!Number.isSafeInteger(categoryId) || categoryId <= 0) {
            continue;
          }

          check(
            categoryBox,
            category.nombre,
            p.category_ids.map(Number).includes(categoryId),
            (enabled) => {
              const selected = new Set(
                p.category_ids.map(Number)
              );

              if (enabled) {
                selected.add(categoryId);
              } else {
                selected.delete(categoryId);
              }

              p.category_ids = [...selected];
            }
          );
        }

        card.append(categoryBox);
      }

      const bar = el(
          'div',
          undefined,
          'toolbar',
        );

      if (p.transport === 'tcp') {
        bar.append(
          action(
            'Vista previa',
            async () => {
              await save();

              const result =
                await api(
                  '/api/devices/printers/'
                  + state.printers[i].id
                  + '/preview',
                );

              $('preview-text')
                .textContent =
                  result.text;

              $('preview')
                .showModal();
            },
          ),
        );
      }

      if (p.transport === 'tcp') {
        bar.append(
          action(
            'Imprimir prueba',
            async () => {
              await save();

              const result =
                await api(
                  '/api/devices/printers/'
                  + state.printers[i].id
                  + '/test',
                  'POST',
                  {},
                );

              notice(
                'Prueba en cola: '
                + result.jobs.join(', '),
              );

              await jobs();
            },
          ),
        );
      } else {
        bar.append(
          action(
            'Recargar terminales',
            async () => {
              await loadPointPrinterTerminals(
                true,
              );

              if (
                pointPrinterTerminalsError
              ) {
                notice(
                  pointPrinterTerminalsError,
                  true,
                );

                return;
              }

              notice(
                'Terminales Point cargadas: '
                + pointPrinterTerminals.length,
              );
            },
          ),
        );
      }

      bar.append(
        action(
          'Eliminar',
          () => {
            state.printers.splice(
              i,
              1,
            );

            draw();
          },
          'danger',
        ),
      );

      card.append(bar);
      list.append(card);
    });

    if (!state.printers.length) {
      list.append(
        el(
          'p',
          'Todavía no has agregado impresoras.',
          'muted',
        ),
      );
    }

    const select =
      $('retry-printer');

    select.replaceChildren(
      el(
        'option',
        'Selecciona una impresora',
      ),
    );

    for (
      const p
      of state.printers.filter(
        (printer) =>
          printer.enabled
          && printer.id,
      )
    ) {
      const option =
        el(
          'option',
          p.name,
        );

      option.value =
        p.id;

      select.append(option);
    }
  }
async function save() {
  for (const key of ['name', 'phone', 'address', 'footer'])
    state.business[key] = $('business-' + key).value;
  state.business.reviewQrEnabled = $('business-reviewQrEnabled').checked;
  state.business.reviewQrText = $('business-reviewQrText').value.trim();
  state.business.reviewQrUrl = $('business-reviewQrUrl').value.trim();
  /*
   * Respetar exactamente lo elegido en Configuración.
   * Nada de volver a habilitar encuestas automáticamente.
   */
  state.business.surveyEnabled =
    $('business-surveyEnabled')?.checked ??
    state.business.surveyEnabled;

  state.business.surveyDining =
    $('business-surveyDining')?.checked ??
    state.business.surveyDining;

  state.business.surveyTakeout =
    $('business-surveyTakeout')?.checked ??
    state.business.surveyTakeout;

  state.business.surveyDelivery =
    $('business-surveyDelivery')?.checked ??
    state.business.surveyDelivery;
  state.business.surveyTitle = $('business-surveyTitle')?.value.trim() || '';
  state.business.surveyMessage = $('business-surveyMessage')?.value.trim() || '';
  state.business.surveyMetric1 =
    $('business-surveyMetric1')?.value.trim() || '';

  state.business.surveyMetric2 =
    $('business-surveyMetric2')?.value.trim() || '';

  state.business.surveyMetric3 =
    $('business-surveyMetric3')?.value.trim() || '';

  state.business.surveyMetric4 =
    $('business-surveyMetric4')?.value.trim() || '';

  state.business.surveyMetric5 =
    $('business-surveyMetric5')?.value.trim() || '';
  state.business.surveyFooter = $('business-surveyFooter')?.value.trim() || '';
  state.business.reviewQrImage =
    state.business.reviewQrEnabled && state.business.reviewQrUrl
      ? await generateBusinessQr()
      : '';
  state.biometric = {
    ...state.biometric,
    enabled: $('bio-enabled').checked,

    attendanceEnabled: $('bio-attendance').checked,

    drawerEnabled: $('bio-drawer').checked,

    drawerAdminOnly: $('bio-admin-only').checked,

    drawerCooldownSeconds: Number($('bio-cooldown').value || 5),

    readerName: $('bio-reader-name').value.trim() || 'Lector biométrico principal',
  };

  if (!state) throw Error('Espera a que cargue la configuración');
  state.bot = {
    ...state.bot,
    enabled: $('bot-enabled').checked,
    opens: $('bot-opens').value,
    closes: $('bot-closes').value,
    closedDays: $('bot-days')
      .value.split(',')
      .filter((x) => x.trim())
      .map(Number),
    deliveryNote: $('bot-delivery').value,
    transferInstructions: $('bot-transfer').value,
    voiceTranscription: $('bot-voice').checked,
    aiEnabled: $('bot-ai-enabled').checked,
    aiFallback: $('bot-ai-fallback').checked,
  };
  state.whatsapp = {
    ...state.whatsapp,
    ...state.bot,
  };

  delete state.whatsapp.timeZone;

  const baseline =
    settingsSavedSnapshot ||
    {};

  const moduleNames = [
    'business',
    'pos',
    'orders',
    'eta',
    'kds',
    'printing',
    'attendance',
    'biometric',
    'whatsapp',
    'notifications',
    'ui',
    'security',
    'devices',
  ];

  const payload = {
    revision: state.revision,
  };

  const changedModules = [];

  for (
    const module
    of moduleNames
  ) {
    if (
      JSON.stringify(state[module]) !==
      JSON.stringify(baseline[module])
    ) {
      payload[module] =
        state[module];

      changedModules.push(
        module,
      );
    }
  }

  if (
    JSON.stringify(state.printers) !==
    JSON.stringify(baseline.printers)
  ) {
    payload.printers =
      state.printers;
  }

  if (
    JSON.stringify(state.screens) !==
    JSON.stringify(baseline.screens)
  ) {
    payload.screens =
      state.screens;
  }

  /*
   * payrollRevision solo importa al guardar asistencia.
   * Así un cambio hecho desde Nómina no bloquea
   * Restaurante, Impresión, WhatsApp, KDS, etc.
   */
  if (
    payload.attendance &&
    state.payrollRevision
  ) {
    payload.payrollRevision =
      state.payrollRevision;
  }

  const hasChanges =
    changedModules.length > 0 ||
    payload.printers !== undefined ||
    payload.screens !== undefined;

  if (!hasChanges) {
    window.dispatchEvent(
      new CustomEvent(
        'settings-saved',
      ),
    );

    notice(
      'No hay cambios pendientes.',
    );

    return;
  }

  state =
    await api(
      '/api/devices',
      'PUT',
      payload,
    );

  settingsSavedSnapshot =
    structuredClone(state);

  window.dispatchEvent(
    new CustomEvent(
      'settings-saved',
    ),
  );

  draw();

  notice(
    'Configuración guardada correctamente.',
  );
}
/* MP_POINT_PRINT_ALERT_UI_V1 */
async function jobs() {
  const data =
    await api('/api/devices/jobs');

  const container =
    $('jobs');

  container.replaceChildren();

  const kindLabel = (kind) => {
    const labels = {
      kitchen: 'Comanda',
      cancel: 'Cancelación',
      receipt: 'Cuenta',
      prebill: 'Precuenta',
      refund: 'Reembolso',
      shift: 'Turno',
      payroll: 'Nómina',
      tips: 'Propinas',
      drawer: 'Cajón',
    };

    return labels[kind] || kind;
  };

  for (const j of data) {
    const isPoint =
      j.printer_transport ===
        'mercadopago_point'
      || j.provider ===
        'mercadopago_point';

    const providerStatus =
      String(
        j.provider_status || '',
      ).toLowerCase();

    const row =
      el(
        'div',
        undefined,
        'queue-row',
      );

    if (isPoint) {
      const terminal =
        j.terminal_alias
        || j.printer_name
        || 'Point';

      let stateText =
        'Estado pendiente';

      let detail =
        j.last_error || '';

      if (
        j.status === 'sent'
        && providerStatus === 'processed'
      ) {
        stateText =
          '✓ Completada';

        detail =
          'Mercado Pago procesó la acción de impresión.';
      } else if (
        j.status === 'provider_pending'
        || providerStatus === 'created'
        || providerStatus === 'on_terminal'
      ) {
        stateText =
          '⏳ Procesando';

        detail =
          providerStatus === 'on_terminal'
            ? (
                'La terminal recibió la impresión; '
                + 'esperando estado final.'
              )
            : (
                'Esperando que la terminal procese '
                + 'la impresión.'
              );
      } else if (
        j.status === 'failed'
        || providerStatus === 'expired'
        || providerStatus === 'canceled'
      ) {
        stateText =
          '⚠ Requiere atención';

        detail =
          j.last_error
          || (
            'La impresión no se completó. '
            + 'Revisa papel, tapa, temperatura '
            + 'y estado de la terminal.'
          );
      } else if (
        j.status === 'uncertain'
      ) {
        stateText =
          '⚠ Revisión manual';

        detail =
          j.last_error
          || (
            'No se puede confirmar el resultado. '
            + 'Revisa la terminal antes de imprimir otra vez.'
          );
      }

      row.append(
        el(
          'strong',
          `${stateText} · Point ${terminal}`,
        ),
        el(
          'p',
          `#${j.id} · ${kindLabel(j.kind)}`,
        ),
        el(
          'p',
          detail,
        ),
      );

      if (providerStatus) {
        row.append(
          el(
            'p',
            `Estado Point: ${providerStatus}`,
            'muted',
          ),
        );
      }

      if (
        j.status === 'failed'
        || j.status === 'uncertain'
        || providerStatus === 'expired'
        || providerStatus === 'canceled'
      ) {
        row.append(
          action(
            'Revisar terminal',
            async () => {
              notice(
                `Point ${terminal}: `
                + (
                  detail
                  || 'Revisa la terminal.'
                ),
                true,
              );
            },
          ),
        );
      }

      /* MP_POINT_MANUAL_REPRINT_UI_V1 */
      if (
        j.status === 'failed'
        && (
          providerStatus === 'expired'
          || providerStatus === 'canceled'
        )
      ) {
        const reprintButton =
          action(
            'Reimprimir',
            async () => {
              if (
                !confirm(
                  `¿Reimprimir ${kindLabel(j.kind)} `
                  + `#${j.id} en Point ${terminal}?\n\n`
                  + 'Confirma que revisaste papel, tapa '
                  + 'y estado de la terminal.\n\n'
                  + 'Se creará una NUEVA impresión.',
                )
              ) {
                return;
              }

              reprintButton.disabled = true;

              try {
                const result =
                  await api(
                    '/api/devices/jobs/'
                      + j.id
                      + '/point-reprint',
                    'POST',
                    {
                      confirm_reprint: true,
                    },
                  );

                notice(
                  result.already_created
                    ? (
                        'La reimpresión ya había sido creada '
                        + `como job #${result.job_id}.`
                      )
                    : (
                        'Reimpresión creada como job '
                        + `#${result.job_id}.`
                      ),
                );

                await jobs();

              } catch (err) {
                notice(
                  err?.message
                  || 'No se pudo crear la reimpresión Point.',
                  true,
                );

              } finally {
                reprintButton.disabled = false;
              }
            },
          );

        row.append(reprintButton);
      }

      container.append(row);
      continue;
    }

    row.append(
      el(
        'strong',
        '#' + j.id
          + ' · ' + j.kind
          + ' · ' + j.status,
      ),
      el(
        'p',
        j.last_error || '',
      ),
    );

    if (
      [
        'blocked',
        'failed',
        'uncertain',
      ].includes(j.status)
    ) {
      row.append(
        action(
          'Reintentar / asignar',
          async () => {
            if (
              j.status === 'uncertain'
              && !confirm(
                '¿Revisaste el papel? '
                + 'Reimprimir podría duplicar el ticket.',
              )
            ) {
              return;
            }

            await api(
              '/api/devices/jobs/'
                + j.id
                + '/retry',
              'POST',
              {
                printer_id:
                  $('retry-printer').value,

                confirm_duplicate_risk:
                  j.status === 'uncertain',
              },
            );

            await jobs();
          },
        ),
      );
    }

    container.append(row);
  }

  if (!data.length) {
    container.append(
      el(
        'p',
        'No hay tickets pendientes.',
      ),
    );
  }
}
async function bot() {
  try {
    const data = await api('/api/devices/whatsapp/status');
    $('bot-status').textContent = data.ready
      ? 'Conectado · ' + data.provider
      : 'Sin conectar · ' + (data.message || data.provider);
    for (const chat of data.humanChats || []) {
      const box = el('div', undefined, 'card');
      box.append(el('strong', 'Atención humana: ' + chat.phone));
      const input = el('textarea');
      input.placeholder = 'Respuesta al cliente';
      box.append(
        input,
        action('Enviar respuesta', async () => {
          await api('/api/devices/whatsapp/reply', 'POST', {
            phone: chat.phone,
            peer: chat.peer,
            message: input.value,
          });
          input.value = '';
          notice('Respuesta en cola.');
        }),
      );
      $('bot-status').append(box);
    }
    if (data.qr) {
      $('bot-status').append(el('p', 'Escanea desde WhatsApp → Dispositivos vinculados.'));
      const img = el('img');
      img.src = data.qr;
      img.alt = 'QR de WhatsApp LAB';
      img.width = 240;
      $('bot-status').append(img);
    }
  } catch (e) {
    $('bot-status').textContent = e.message;
  }
}
async function incoming() {
  const data = await api('/api/devices/incoming');
  $('incoming').replaceChildren();
  for (const p of data) {
    const card = el('div', undefined, 'queue-row');
    card.append(
      el('h3', '#' + p.id + ' · ' + p.cliente_nombre),
      el('p', p.direccion_entrega),
      el('p', p.items.map((i) => i.cantidad + ' x ' + i.nombre).join(' · ')),
      el('strong', '$' + Number(p.total).toFixed(2)),
    );
    card.append(
      action('Aceptar y enviar a cocina', async () => {
        await api('/api/devices/incoming/' + p.id + '/accept', 'POST', {});
        await incoming();
        await jobs();
      }),
      action(
        'Cancelar y devolver stock',
        async () => {
          if (!confirm('¿Cancelar este pedido?')) return;
          await api('/api/pos/vaciar-comanda', 'POST', { pedido_id: p.id });
          await incoming();
        },
        'danger',
      ),
    );
    $('incoming').append(card);
  }
  if (!data.length) $('incoming').append(el('p', 'No hay pedidos por aceptar.'));
}
async function audit() {
  const q = $('audit-search')?.value.trim() || '';
  const data = await api('/api/devices/audit' + (q ? '?q=' + encodeURIComponent(q) : ''));
  const box = $('audit');
  box.replaceChildren();
  if (!data.length) {
    box.append(el('p', 'No hay eventos que coincidan con la búsqueda.', 'muted'));
    return;
  }
  for (const row of data) {
    const card = el('article', undefined, 'audit-card');
    const top = el('div', undefined, 'audit-card-top');
    top.append(el('strong', row.action), el('span', formatDate(row.created_at)));
    card.append(top);
    card.append(el('p', `${row.actor || 'Sistema'} · ID ${row.entity_id || '—'}`));
    if (row.details) {
      let details = row.details;
      try {
        const parsed = typeof details === 'string' ? JSON.parse(details) : details;
        details = JSON.stringify(parsed, null, 2);
      } catch {}
      const pre = el('pre', details, 'audit-details');
      card.append(pre);
    }
    box.append(card);
  }
}

async function biometricStatus() {
  try {
    const data = await api('/api/devices/biometric/status');

    const box = $('biometric-status');

    box.replaceChildren();

    box.append(
      el('strong', data.online ? '● Lector conectado' : '○ Lector desconectado'),

      el('p', 'Nombre: ' + (data.device_name || data.config?.readerName || '—')),

      el('p', 'IP: ' + (data.ip || '—')),

      el('p', 'Firmware: ' + (data.firmware || '—')),

      el(
        'p',
        'Sensor: ' +
          (data.sensor_online === null
            ? 'sin reporte'
            : data.sensor_online
              ? 'detectado'
              : 'no detectado'),
      ),

      el('p', 'Wi-Fi RSSI: ' + (data.wifi_rssi ?? '—') + (data.wifi_rssi !== null ? ' dBm' : '')),

      el(
        'p',
        'Último contacto: ' +
          (data.age_ms === null ? 'nunca' : Math.round(data.age_ms / 1000) + ' s'),
      ),
    );
  } catch (e) {
    $('biometric-status').textContent = e.message;
  }
}

const kdsPendingSaves = new Map();


function updateKdsSaveCenter() {

  const center =
    $('kds-save-center');

  const status =
    $('kds-save-status');

  const button =
    $('kds-save-all');


  if (
    !center ||
    !status ||
    !button
  ) {
    return;
  }


  const total =
    kdsPendingSaves.size;


  center.classList.toggle(
    'kds-save-clean',
    total === 0,
  );

  center.classList.toggle(
    'kds-save-dirty',
    total > 0,
  );


  if (!total) {

    status.textContent =
      'Todo guardado';

    button.textContent =
      'Guardar todo';

    button.disabled =
      true;

    return;
  }


  status.textContent =
    total === 1
      ? '1 cambio pendiente'
      : total + ' cambios pendientes';


  button.textContent =
    'Guardar todo (' +
    total +
    ')';

  button.disabled =
    false;
}


function markKdsPending(
  key,
  saveFunction,
  card,
) {

  kdsPendingSaves.set(
    key,
    saveFunction,
  );


  if (card) {

    card.classList.add(
      'kds-card-dirty',
    );


    let badge =
      card.querySelector(
        '[data-kds-pending]'
      );


    if (!badge) {

      badge =
        el(
          'span',
          'Cambios pendientes',
          'badge kds-pending-badge',
        );

      badge.dataset.kdsPending =
        '1';


      const title =
        card.querySelector(
          '.kds-title',
        );


      if (title) {
        title.append(
          badge,
        );
      }
    }
  }


  updateKdsSaveCenter();
}


function clearKdsPending(
  key,
  card,
) {

  kdsPendingSaves.delete(
    key,
  );


  if (card) {

    card.classList.remove(
      'kds-card-dirty',
    );


    const badge =
      card.querySelector(
        '[data-kds-pending]',
      );


    if (badge) {
      badge.remove();
    }
  }


  updateKdsSaveCenter();
}


async function saveAllKdsPending() {

  if (!kdsPendingSaves.size) {

    updateKdsSaveCenter();

    notice(
      'Todo está guardado.',
    );

    return;
  }


  const button =
    $('kds-save-all');


  if (button) {

    button.disabled =
      true;

    button.textContent =
      'Guardando…';
  }


  /*
   * Snapshot:
   * los callbacks eliminan su propia entrada
   * cuando terminan correctamente.
   */
  const entries =
    Array.from(
      kdsPendingSaves.entries(),
    );


  let saved =
    0;


  for (
    const [
      key,
      saveFunction,
    ]
    of entries
  ) {

    if (
      !kdsPendingSaves.has(
        key,
      )
    ) {
      continue;
    }


    try {

      await saveFunction(
        true,
      );

      saved += 1;

    } catch (error) {

      console.error(
        '[KDS save all]',
        key,
        error,
      );


      updateKdsSaveCenter();


      notice(
        'Se guardaron ' +
          saved +
          ' cambio(s). Falta revisar: ' +
          error.message,
        true,
      );

      return;
    }
  }


  /*
   * Una sola recarga cuando ya terminó TODO.
   */
  await Promise.all([
    loadKdsGroups(),
    loadKdsScreens(),
  ]);


  updateKdsSaveCenter();


  notice(
    'Todo KDS quedó guardado correctamente.',
  );
}


let kdsScreens = [];
let kdsGroups = [];
let kdsCategories = [];

let kdsPreparationOptions = {
  groups: [],
  categories: [],
  products: [],
};

let kdsPreparationRules = [];

const KDS_RULE_MODE_LABELS = {
  detail: 'Detalle',
  simplify: 'Simplificar',
  group: 'Agrupar',
  transform: 'Transformar',
  omit: 'Omitir',
};

const KDS_RULE_SOURCE_LABELS = {
  product: 'Producto',
  category: 'Categoría',
  group: 'Grupo',
};

const KDS_RULE_QUANTITY_LABELS = {
  item_quantity: 'Cantidad del artículo',
  sum: 'Sumar cantidades',
  multiply: 'Cantidad × multiplicador',
  fixed: 'Cantidad fija',
};

function formatDate(value) {
  if (!value) return 'Nunca';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString('es-MX');
}

function kdsStatusRow(label, value, cls = '') {
  const row = el('div', undefined, 'kds-status-row');

  row.append(el('span', label, 'kds-status-label'), el('strong', value ?? '—', cls));

  return row;
}


function kdsRuleSourceOptions(
  sourceType,
) {
  if (
    sourceType === 'product'
  ) {
    return (
      kdsPreparationOptions.products ||
      []
    ).map(
      item => ({
        value: String(item.id),
        label:
          item.categoria
            ? item.nombre + ' · ' + item.categoria
            : item.nombre,
      }),
    );
  }

  if (
    sourceType === 'category'
  ) {
    return (
      kdsPreparationOptions.categories ||
      []
    ).map(
      item => ({
        value: String(item.id),
        label: item.nombre,
      }),
    );
  }

  return (
    kdsPreparationOptions.groups ||
    []
  ).map(
    item => ({
      value: String(item.id),
      label: item.nombre,
    }),
  );
}


function fillKdsRuleSourceSelect(
  sourceType,
  selectedValue = '',
) {
  const select =
    $('kds-rule-source-id');

  if (!select) {
    return;
  }

  select.replaceChildren();

  const options =
    kdsRuleSourceOptions(
      sourceType,
    );

  for (
    const item
    of options
  ) {
    const option =
      document.createElement(
        'option',
      );

    option.value =
      item.value;

    option.textContent =
      item.label;

    select.append(
      option,
    );
  }

  if (selectedValue) {
    select.value =
      String(
        selectedValue,
      );
  }
}


function fillKdsRuleTargetGroups(
  selectedValue = '',
) {
  const select =
    $('kds-rule-target-group');

  if (!select) {
    return;
  }

  select.replaceChildren();

  for (
    const group
    of (
      kdsPreparationOptions.groups ||
      []
    )
  ) {
    if (!group.activo) {
      continue;
    }

    const option =
      document.createElement(
        'option',
      );

    option.value =
      String(
        group.id,
      );

    option.textContent =
      group.nombre;

    select.append(
      option,
    );
  }

  if (selectedValue) {
    select.value =
      String(
        selectedValue,
      );
  }
}


function updateKdsRuleFormVisibility() {
  const mode =
    $('kds-rule-mode')?.value ||
    'detail';

  const quantityMode =
    $('kds-rule-quantity-mode')?.value ||
    'item_quantity';

  const outputBox =
    $('kds-rule-output-box');

  if (outputBox) {
    outputBox.hidden =
      ![
        'group',
        'transform',
      ].includes(mode);
  }

  const quantityValue =
    $('kds-rule-quantity-value');

  if (quantityValue) {
    quantityValue.disabled =
      ![
        'multiply',
        'fixed',
      ].includes(
        quantityMode,
      );
  }
}


function openKdsRuleDialog(
  rule = null,
) {
  const dialog =
    $('kds-rule-dialog');

  if (!dialog) {
    notice(
      'No se encontró el editor de reglas KDS.',
      true,
    );

    return;
  }

  $('kds-rule-id').value =
    rule?.id ||
    '';

  $('kds-rule-name').value =
    rule?.nombre ||
    '';

  $('kds-rule-priority').value =
    rule?.prioridad ??
    100;

  $('kds-rule-active').checked =
    rule
      ? Boolean(rule.activo)
      : true;

  $('kds-rule-source-type').value =
    rule?.source_type ||
    'category';

  fillKdsRuleSourceSelect(
    $('kds-rule-source-type').value,
    rule?.source_id ||
    '',
  );

  fillKdsRuleTargetGroups(
    rule?.target_group_id ||
    '',
  );

  $('kds-rule-mode').value =
    rule?.mode ||
    'detail';

  $('kds-rule-output-key').value =
    rule?.output_key ||
    '';

  $('kds-rule-output-label').value =
    rule?.output_label ||
    '';

  $('kds-rule-output-template').value =
    rule?.output_template ||
    '';

  $('kds-rule-quantity-mode').value =
    rule?.quantity_mode ||
    'item_quantity';

  $('kds-rule-quantity-value').value =
    rule?.quantity_value ??
    '';

  $('kds-rule-show-variant').checked =
    rule
      ? Boolean(rule.show_variant)
      : true;

  $('kds-rule-show-modifiers').checked =
    rule
      ? Boolean(rule.show_modifiers)
      : true;

  $('kds-rule-show-notes').checked =
    rule
      ? Boolean(rule.show_notes)
      : true;

  $('kds-rule-show-course').checked =
    rule
      ? Boolean(rule.show_course)
      : true;

  $('kds-rule-hide-original').checked =
    rule
      ? Boolean(rule.hide_original)
      : false;

  updateKdsRuleFormVisibility();

  syncKdsRulePresetFromFields();

  dialog.showModal();
}


async function loadKdsPreparationRules() {
  const [
    options,
    rules,
  ] =
    await Promise.all([
      api(
        '/api/devices/kds-preparation-options'
      ),

      api(
        '/api/devices/kds-preparation-rules'
      ),
    ]);

  kdsPreparationOptions =
    options || {
      groups: [],
      categories: [],
      products: [],
    };

  kdsPreparationRules =
    Array.isArray(rules)
      ? rules
      : [];

  drawKdsPreparationRules();
}


function drawKdsPreparationRules() {
  const container =
    $('kds-preparation-rules');

  if (!container) {
    return;
  }

  container.replaceChildren();

  if (
    !kdsPreparationRules.length
  ) {
    container.append(
      el(
        'p',
        'No hay reglas de preparación. Sin reglas, los productos se envían según su grupo normal.',
        'muted',
      ),
    );

    return;
  }

  for (
    const rule
    of kdsPreparationRules
  ) {
    const card =
      el(
        'div',
        undefined,
        'card kds-card',
      );

    const title =
      el(
        'div',
        undefined,
        'kds-title',
      );

    title.append(
      el(
        'h3',
        rule.nombre ||
        'Regla KDS',
      ),

      el(
        'span',
        rule.activo
          ? 'Activa'
          : 'Inactiva',

        rule.activo
          ? 'badge kds-online'
          : 'badge kds-offline',
      ),
    );

    card.append(
      title,
    );

    const status =
      el(
        'div',
        undefined,
        'kds-status-box',
      );

    status.append(
      kdsStatusRow(
        'Origen',
        (
          KDS_RULE_SOURCE_LABELS[
            rule.source_type
          ] ||
          rule.source_type
        ) +
        ' · ' +
        (
          rule.source_name ||
          rule.source_id
        ),
      ),

      kdsStatusRow(
        'Destino',
        rule.target_group_name ||
        rule.target_group_id,
      ),

      kdsStatusRow(
        'Acción',
        KDS_RULE_MODE_LABELS[
          rule.mode
        ] ||
        rule.mode,
      ),

      kdsStatusRow(
        'Cantidad',
        KDS_RULE_QUANTITY_LABELS[
          rule.quantity_mode
        ] ||
        rule.quantity_mode,
      ),

      kdsStatusRow(
        'Prioridad',
        String(
          rule.prioridad,
        ),
      ),
    );

    card.append(
      status,
    );

    if (
      rule.output_label ||
      rule.output_template
    ) {
      card.append(
        el(
          'p',
          'Salida: ' +
          (
            rule.output_template ||
            rule.output_label
          ),
          'muted',
        ),
      );
    }

    const toolbar =
      el(
        'div',
        undefined,
        'toolbar',
      );

    toolbar.append(
      action(
        'Editar',
        () =>
          openKdsRuleDialog(
            rule,
          ),
      ),

      action(
        'Eliminar',
        async () => {

          if (
            !confirm(
              '¿Eliminar la regla "' +
              rule.nombre +
              '"?'
            )
          ) {
            return;
          }

          await api(
            '/api/devices/kds-preparation-rules/' +
            encodeURIComponent(
              rule.id,
            ),

            'DELETE',
          );

          notice(
            'Regla KDS eliminada.',
          );

          await loadKdsPreparationRules();
        },

        'danger',
      ),
    );

    card.append(
      toolbar,
    );

    container.append(
      card,
    );
  }
}


async function saveKdsPreparationRule(
  event,
) {
  event.preventDefault();

  const id =
    Number(
      $('kds-rule-id')
        .value ||
      0,
    );

  const body = {
    nombre:
      $('kds-rule-name')
        .value
        .trim(),

    activo:
      $('kds-rule-active')
        .checked,

    prioridad:
      Number(
        $('kds-rule-priority')
          .value ||
        100,
      ),

    source_type:
      $('kds-rule-source-type')
        .value,

    source_id:
      $('kds-rule-source-id')
        .value,

    target_group_id:
      $('kds-rule-target-group')
        .value,

    mode:
      $('kds-rule-mode')
        .value,

    output_key:
      $('kds-rule-output-key')
        .value
        .trim() ||
      null,

    output_label:
      $('kds-rule-output-label')
        .value
        .trim() ||
      null,

    output_template:
      $('kds-rule-output-template')
        .value
        .trim() ||
      null,

    quantity_mode:
      $('kds-rule-quantity-mode')
        .value,

    quantity_value:
      $('kds-rule-quantity-value')
        .value === ''
        ? null
        : Number(
            $('kds-rule-quantity-value')
              .value,
          ),

    show_variant:
      $('kds-rule-show-variant')
        .checked,

    show_modifiers:
      $('kds-rule-show-modifiers')
        .checked,

    show_notes:
      $('kds-rule-show-notes')
        .checked,

    show_course:
      $('kds-rule-show-course')
        .checked,

    hide_original:
      $('kds-rule-hide-original')
        .checked,
  };

  if (
    !body.nombre ||
    !body.source_id ||
    !body.target_group_id
  ) {
    notice(
      'Completa nombre, origen y grupo destino.',
      true,
    );

    return;
  }

  if (
    id > 0
  ) {
    await api(
      '/api/devices/kds-preparation-rules/' +
      encodeURIComponent(
        id,
      ),

      'PUT',

      body,
    );

    notice(
      'Regla KDS actualizada.',
    );

  } else {

    await api(
      '/api/devices/kds-preparation-rules',

      'POST',

      body,
    );

    notice(
      'Regla KDS creada.',
    );
  }

  $('kds-rule-dialog')
    .close();

  await loadKdsPreparationRules();
}


async function loadKdsGroups() {
  const data = await api('/api/devices/kds-groups');

  kdsGroups = Array.isArray(data.groups) ? data.groups : [];

  kdsCategories = Array.isArray(data.categories) ? data.categories : [];

  drawKdsGroups();
}

function drawKdsGroups() {

  let container =
    $('kds-groups');


  if (!container) {

    const screens =
      $('kds-screens');


    if (
      !screens ||
      !screens.parentNode
    ) {
      return;
    }


    const section =
      el(
        'div',
        undefined,
        'card',
      );


    section.classList.add(
      'kds-groups-compact-panel',
    );


    const header =
      el(
        'div',
        undefined,
        'settings-panel-toolbar',
      );


    const title =
      el(
        'div',
      );


    title.append(

      el(
        'strong',
        'Grupos de preparación',
      ),

      el(
        'span',
        'Organiza categorías sin llenar toda la pantalla.',
        'muted',
      ),
    );


    header.append(
      title,

      action(
        '+ Crear grupo',
        async () => {

          const nombre =
            prompt(
              'Nombre del nuevo grupo KDS',
            );


          if (!nombre) {
            return;
          }


          await api(
            '/api/devices/kds-groups',
            'POST',
            {
              nombre:
                nombre.trim(),
            },
          );


          notice(
            'Grupo KDS creado.',
          );


          await loadKdsGroups();
        },
      ),
    );


    section.append(
      header,
    );


    container =
      el(
        'div',
        undefined,
        'kds-group-compact-list',
      );


    container.id =
      'kds-groups';


    section.append(
      container,
    );


    screens.parentNode.insertBefore(
      section,
      screens,
    );
  }


  container.replaceChildren();


  if (!kdsGroups.length) {

    container.append(

      el(
        'p',
        'No hay grupos de preparación.',
        'muted',
      ),
    );

    return;
  }


  for (
    const group
    of kdsGroups
  ) {

    const row =
      el(
        'div',
        undefined,
        'kds-group-compact-row',
      );


    const info =
      el(
        'div',
        undefined,
        'kds-group-compact-info',
      );


    const heading =
      el(
        'div',
        undefined,
        'kds-group-compact-heading',
      );


    heading.append(

      el(
        'strong',
        group.nombre,
      ),

      el(
        'span',
        group.activo
          ? 'Activo'
          : 'Inactivo',
        group.activo
          ? 'badge kds-online'
          : 'badge kds-offline',
      ),
    );


    const categories =
      Array.isArray(
        group.categorias,
      )
        ? group.categorias
        : [];


    const summary =
      categories.length
        ? categories
            .slice(0, 4)
            .map(
              category =>
                category.nombre,
            )
            .join(', ') +
          (
            categories.length > 4
              ? ' +' +
                (
                  categories.length - 4
                ) +
                ' más'
              : ''
          )
        : 'Sin categorías';


    info.append(

      heading,

      el(
        'small',
        categories.length +
          (
            categories.length === 1
              ? ' categoría · '
              : ' categorías · '
          ) +
          summary,
        'muted',
      ),
    );


    row.append(
      info,

      action(
        'Editar',
        () =>
          openKdsGroupDialog(
            group.id,
          ),
      ),
    );


    container.append(
      row,
    );
  }
}


function openKdsGroupDialog(groupId) {

  const group =
    kdsGroups.find(
      item =>
        String(item.id) ===
        String(groupId),
    );


  if (!group) {

    notice(
      'No se encontró el grupo KDS.',
      true,
    );

    return;
  }


  $('kds-group-id').value =
    String(
      group.id,
    );


  $('kds-group-name').value =
    group.nombre ||
    '';


  $('kds-group-active').checked =
    group.activo !== false;


  const selected =
    new Set(
      (
        group.categorias ||
        []
      ).map(
        category =>
          Number(
            category.id,
          ),
      ),
    );


  const list =
    $('kds-group-category-list');


  list.replaceChildren();


  for (
    const category
    of kdsCategories
  ) {

    const row =
      el(
        'label',
        undefined,
        'kds-category-modal-row',
      );


    row.dataset.search =
      String(
        category.nombre ||
        '',
      ).toLowerCase();


    const input =
      document.createElement(
        'input',
      );


    input.type =
      'checkbox';


    input.value =
      String(
        category.id,
      );


    input.checked =
      selected.has(
        Number(
          category.id,
        ),
      );


    row.append(

      input,

      el(
        'span',
        category.nombre,
      ),
    );


    list.append(
      row,
    );
  }


  $('kds-group-category-search').value =
    '';


  $('kds-group-dialog').showModal();
}


async function saveKdsGroupDialog(event) {

  event.preventDefault();


  const groupId =
    String(
      $('kds-group-id').value ||
      '',
    ).trim();


  const nombre =
    String(
      $('kds-group-name').value ||
      '',
    ).trim();


  const activo =
    $('kds-group-active').checked;


  const category_ids =
    Array.from(
      document.querySelectorAll(
        '#kds-group-category-list input[type="checkbox"]:checked',
      ),
    ).map(
      input =>
        Number(
          input.value,
        ),
    );


  if (
    !groupId ||
    !nombre
  ) {

    notice(
      'Escribe un nombre para el grupo.',
      true,
    );

    return;
  }


  await api(

    '/api/devices/kds-groups/' +
      encodeURIComponent(
        groupId,
      ) +
      '/configuration',

    'PUT',

    {
      nombre,
      activo,
      category_ids,
    },
  );


  $('kds-group-dialog').close();


  notice(
    'Grupo KDS guardado correctamente.',
  );


  await Promise.all([
    loadKdsGroups(),
    loadKdsScreens(),
  ]);
}


async function loadKdsScreens() {
  kdsScreens = await api('/api/devices/kds');

  drawKdsScreens();
}

function kdsStatusLabel(status) {
  return {
    queued: 'Pendiente',
    sending: 'Enviando',
    sent: 'Enviado',
    filtered: 'Filtrado',
    duplicate: 'Duplicado',
    stale: 'Obsoleto',
    failed: 'Error / reintento',
    blocked: 'Bloqueado',
  }[status] || status;
}

async function loadKdsJobs(screenId, container) {
  container.replaceChildren(el('p', 'Consultando eventos del servidor…', 'muted'));
  try {
    const data = await api('/api/devices/kds/' + encodeURIComponent(screenId) + '/jobs?limit=20');
    container.replaceChildren();
    const summary = el('div', undefined, 'kds-job-summary');
    for (const status of ['queued', 'sending', 'failed', 'blocked', 'sent', 'duplicate', 'stale', 'filtered']) {
      const count = Number(data.summary?.[status] || 0);
      if (!count) continue;
      const chip = el('span', `${kdsStatusLabel(status)}: ${count}`, 'kds-job-chip status-' + status);
      summary.append(chip);
    }
    if (!summary.children.length) summary.append(el('span', 'Sin eventos registrados', 'muted'));
    container.append(summary);

    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    if (!jobs.length) {
      container.append(el('p', 'No hay entregas KDS registradas para esta pantalla.', 'muted'));
      return;
    }

    const list = el('div', undefined, 'kds-job-list');
    for (const job of jobs) {
      const row = el('div', undefined, 'kds-job-row');
      const main = el('div', undefined, 'kds-job-main');
      main.append(
        el('strong', `#${job.id} · Pedido ${job.pedido_id ?? '—'} · r${job.revision}`),
        el('span', `${kdsStatusLabel(job.status)} · intentos ${job.attempts} · ${formatDate(job.created_at)}`),
      );
      if (job.last_error) main.append(el('small', job.last_error, 'kds-error-text'));
      row.append(main);
      if (['failed', 'blocked'].includes(job.status)) {
        row.append(
          action('Reintentar', async () => {
            await api('/api/devices/kds/jobs/' + job.id + '/retry', 'POST', {});
            notice('Evento KDS puesto nuevamente en cola.');
            await loadKdsJobs(screenId, container);
          }),
        );
      }
      list.append(row);
    }
    container.append(list);
  } catch (e) {
    container.replaceChildren(el('p', e.message, 'kds-error-text'));
  }
}

function drawKdsScreens() {
  const list = $('kds-screens');

  list.replaceChildren();

  if (!kdsScreens.length) {
    list.append(el('p', 'Todavía no hay pantallas Pase · Cocina registradas.', 'muted'));

    return;
  }

  const stationCounts =
      new Map();

    const endpointCounts =
      new Map();


    for (const item of kdsScreens) {

      const stationId =
        String(
          item.verified_station_id ||
          ''
        ).trim();


      if (stationId) {

        stationCounts.set(
          stationId,
          (
            stationCounts.get(
              stationId
            ) || 0
          ) + 1,
        );
      }


      const endpoint =
        String(
          item.host || ''
        ) +
        ':' +
        String(
          item.port || 8080
        );


      endpointCounts.set(
        endpoint,
        (
          endpointCounts.get(
            endpoint
          ) || 0
        ) + 1,
      );
    }


    for (const screen of kdsScreens) {
    const card = el('div', undefined, 'card kds-card');

    const title = el('div', undefined, 'kds-title');

    title.append(el('h3', screen.nombre || 'Pantalla KDS'));

    const badge = el(
      'span',
      screen.last_health_ok ? 'Conexión comprobada' : 'Sin conexión comprobada',
      screen.last_health_ok ? 'badge kds-online' : 'badge kds-offline',
    );

    title.append(badge);

    card.append(title);


    const compactSummary =
      el(
        'div',
        undefined,
        'kds-screen-summary',
      );


    compactSummary.append(

      el(
        'span',
        String(
          screen.host || ''
        ) +
          ':' +
          String(
            screen.port || 8080
          ),
        'kds-screen-endpoint',
      ),

      el(
        'span',
        screen.verified_station_id
          ? 'Estación: ' +
            screen.verified_station_id
          : 'Estación sin comprobar',
        'muted',
      ),
    );


    const groupSummary =
      el(
        'span',
        'Grupos: cargando…',
        'muted',
      );


    compactSummary.append(
      groupSummary,
    );


    card.append(
      compactSummary,
    );

      const kdsConflicts =
        [];


      const verifiedStationId =
        String(
          screen.verified_station_id ||
          ''
        ).trim();


      if (
        verifiedStationId &&
        (
          stationCounts.get(
            verifiedStationId
          ) || 0
        ) > 1
      ) {

        kdsConflicts.push(
          'stationId duplicado: ' +
          verifiedStationId,
        );
      }


      const currentEndpoint =
        String(
          screen.host || ''
        ) +
        ':' +
        String(
          screen.port || 8080
        );


      if (
        (
          endpointCounts.get(
            currentEndpoint
          ) || 0
        ) > 1
      ) {

        kdsConflicts.push(
          'IP/puerto duplicados: ' +
          currentEndpoint,
        );
      }


      if (kdsConflicts.length) {

        const warning =
          el(
            'div',
            undefined,
            'settings-info-box',
          );


        const warningText =
          el(
            'div',
            undefined,
          );


        warningText.append(

          el(
            'strong',
            'Conflicto de configuración KDS',
          ),

          el(
            'span',
            kdsConflicts.join(
              ' · ',
            ),
          ),
        );


        warning.append(

          el(
            'span',
            'warning',
            'material-icons-round',
          ),

          warningText,
        );


        card.append(
          warning,
        );
      }


    const grid = el('div', undefined, 'grid');

    const nameInput = field(grid, 'Nombre', screen.nombre, () => {});

    const hostInput = field(grid, 'IP o nombre local', screen.host, () => {});

    const portInput = field(grid, 'Puerto', screen.port || 8080, () => {}, 'number');

    const keyInput = field(grid, 'Nueva clave de vinculación', '', () => {}, 'password');

    keyInput.placeholder = screen.hasPairingKey
      ? 'Clave guardada · deja vacío para conservarla'
      : 'Introduce la clave';

    const groupLabel =
      document.createElement(
        'div',
      );

    groupLabel.className =
      'settings-field';

    groupLabel.append(
      el(
        'strong',
        'Grupos de preparación',
      ),

      el(
        'small',
        'Selecciona uno o varios grupos para esta pantalla.',
        'muted',
      ),
    );


    const selectedGroups =
      new Set(
        screen.preparation_group_id
          ? [
              String(
                screen.preparation_group_id,
              ),
            ]
          : [],
      );


    const groupBox =
      el(
        'div',
        undefined,
        'grid',
      );


    for (
      const group
      of kdsGroups
    ) {
      if (!group.activo) {
        continue;
      }

      const row =
        el(
          'label',
          undefined,
          'toolbar',
        );

      const input =
        document.createElement(
          'input',
        );

      input.type =
        'checkbox';

      input.dataset.groupId =
        String(
          group.id,
        );

      input.checked =
        selectedGroups.has(
          String(
            group.id,
          ),
        );


      input.onchange =
        () => {

          const groupId =
            String(
              input.dataset.groupId,
            );

          if (
            input.checked
          ) {
            selectedGroups.add(
              groupId,
            );

          } else {

            selectedGroups.delete(
              groupId,
            );
          }
        };


      row.append(
        input,

        document.createTextNode(
          ' ' +
          group.nombre,
        ),
      );


      groupBox.append(
        row,
      );
    }


    groupLabel.append(
      groupBox,
    );

    grid.append(
      groupLabel,
    );


    /*
     * Cargar relación multigrupo real.
     */
    const groupsLoaded =
      api(
        '/api/devices/kds/' +
        encodeURIComponent(
          screen.id,
        ) +
        '/groups',
      )
        .then(
          data => {

            selectedGroups.clear();

            for (
              const groupId
              of (
                data.group_ids ||
                []
              )
            ) {
              selectedGroups.add(
                String(
                  groupId,
                ),
              );
            }


            for (
              const input
              of groupBox.querySelectorAll(
                'input[data-group-id]'
              )
            ) {
              input.checked =
                selectedGroups.has(
                  String(
                    input.dataset.groupId,
                  ),
                );
            }


            return data;
          },
        )
        .catch(
          error => {

            console.error(
              'Error cargando grupos KDS:',
              error,
            );

            return null;
          },
        );

    groupsLoaded.then(
      () => {

        const names =
          Array.from(
            selectedGroups,
          )
            .map(
              id => {

                const group =
                  kdsGroups.find(
                    item =>
                      String(item.id) ===
                      String(id),
                  );

                return group
                  ? group.nombre
                  : String(id);
              },
            )
            .filter(Boolean);


        groupSummary.textContent =
          names.length
            ? 'Grupos: ' +
              names.join(', ')
            : 'Todos los grupos';
      },
    );


    const configDetails =
      document.createElement(
        'details',
      );


    configDetails.className =
      'kds-screen-details';


    const configSummary =
      document.createElement(
        'summary',
      );


    configSummary.innerHTML =
      '<span class="material-icons-round">settings</span>' +
      '<span>Configurar pantalla</span>';


    configDetails.append(
      configSummary,
      grid,
    );


    card.append(
      configDetails,
    );

    const enabledRow = el('div', undefined, 'toolbar');

    let enabled = Boolean(screen.enabled);

    check(enabledRow, 'Pantalla habilitada', enabled, (value) => {
      enabled = value;
    });

    configDetails.append(
      enabledRow,
    );

    const statusBox = el('div', undefined, 'kds-status-box');

    statusBox.append(
      kdsStatusRow('stationId comprobado', screen.verified_station_id || 'No comprobado'),

      kdsStatusRow(
        'Protocolo',
        screen.protocol_version !== null && screen.protocol_version !== undefined
          ? 'v' + screen.protocol_version
          : 'No comprobado',
      ),

      kdsStatusRow(
        'Eventos pendientes',
        screen.last_pending_events !== null && screen.last_pending_events !== undefined
          ? String(screen.last_pending_events)
          : 'No comprobado',
      ),

      kdsStatusRow('Última comprobación', formatDate(screen.last_health_at)),

      kdsStatusRow('Último envío correcto', formatDate(screen.last_send_at)),

      kdsStatusRow(
        'Último error',
        screen.last_error || '—',
        screen.last_error ? 'kds-error-text' : '',
      ),
    );

    const diagnosticDetails =
      document.createElement(
        'details',
      );


    diagnosticDetails.className =
      'kds-screen-details kds-diagnostic-details';


    const diagnosticSummary =
      document.createElement(
        'summary',
      );


    diagnosticSummary.innerHTML =
      '<span class="material-icons-round">monitor_heart</span>' +
      '<span>Diagnóstico y eventos</span>';


    diagnosticDetails.append(
      diagnosticSummary,
      statusBox,
    );


    card.append(
      diagnosticDetails,
    );

    const serverQueue = el('div', undefined, 'kds-server-queue');
    serverQueue.append(el('h4', 'Eventos del servidor'));
    const jobContainer = el('div', undefined, 'kds-job-container');
    serverQueue.append(jobContainer);
    const jobToolbar = el('div', undefined, 'toolbar');
    jobToolbar.append(
      action('Actualizar eventos', async () => loadKdsJobs(screen.id, jobContainer)),
      action('Reintentar fallidos', async () => {
        const result = await api('/api/devices/kds/' + encodeURIComponent(screen.id) + '/retry-failed', 'POST', {});
        notice(`${result.affected || 0} evento(s) puestos nuevamente en cola.`);
        await loadKdsJobs(screen.id, jobContainer);
      }),
    );
    serverQueue.append(jobToolbar);
    diagnosticDetails.append(
      serverQueue,
    );
    let jobsLoaded =
      false;


    diagnosticDetails.addEventListener(
      'toggle',
      () => {

        if (
          diagnosticDetails.open &&
          !jobsLoaded
        ) {

          jobsLoaded =
            true;


          loadKdsJobs(
            screen.id,
            jobContainer,
          ).catch(
            error => {

              jobsLoaded =
                false;

              console.error(
                error,
              );
            },
          );
        }
      },
    );

    const note = el(
      'p',
      'Restaurant Suite controla grupos, categorías, productos y reglas. Android solamente recibe, muestra y despacha lo que el servidor le envía.',
      'muted',
    );

    configDetails.append(
      note,
    );

    const toolbar = el('div', undefined, 'toolbar');

    toolbar.append(
      (() => {

          const saveKey =
            'screen:' +
            String(
              screen.id,
            );


          const saveScreen =
            async (
              bulk = false,
            ) => {

              await groupsLoaded;


              const group_ids =
                Array.from(
                  selectedGroups,
                );


              const body = {

                nombre:
                  nameInput.value.trim(),

                host:
                  hostInput.value.trim(),

                port:
                  Number(
                    portInput.value,
                  ),

                enabled,

                group_ids,
              };


              await api(

                '/api/devices/kds/' +
                  encodeURIComponent(
                    screen.id,
                  ) +
                  '/configuration',

                'PUT',

                body,
              );


              if (
                keyInput.value.trim()
              ) {

                await api(

                  '/api/devices/kds/' +
                    encodeURIComponent(
                      screen.id,
                    ),

                  'PUT',

                  {
                    nombre:
                      body.nombre,

                    host:
                      body.host,

                    port:
                      body.port,

                    enabled:
                      body.enabled,

                    preparation_group_id:
                      group_ids[0] ||
                      null,

                    pairingKey:
                      keyInput.value.trim(),
                  },
                );


                keyInput.value =
                  '';
              }


              clearKdsPending(
                saveKey,
                card,
              );


              if (!bulk) {

                notice(
                  'Pantalla KDS guardada correctamente.',
                );


                await loadKdsScreens();
              }
            };


          const markDirty =
            () => {

              markKdsPending(
                saveKey,
                saveScreen,
                card,
              );
            };


          card.addEventListener(
            'input',
            event => {

              if (
                event.target?.matches(
                  'input,select,textarea',
                )
              ) {
                markDirty();
              }
            },
          );


          card.addEventListener(
            'change',
            event => {

              if (
                event.target?.matches(
                  'input,select,textarea',
                )
              ) {
                markDirty();
              }
            },
          );


          return action(
            'Guardar esta pantalla',
            () =>
              saveScreen(
                false,
              ),
          );

        })(),

        action('Probar conexión', async () => {
        const result = await api(
          '/api/devices/kds/' + encodeURIComponent(screen.id) + '/test',
          'POST',
          {},
        );

        await loadKdsScreens();

        if (result.ok) {
          notice(
            'KDS conectado correctamente.\n' +
              'Estación: ' +
              (result.stationId || 'sin stationId') +
              '\nProtocolo: ' +
              (result.protocolVersion ?? 'desconocido') +
              '\nEventos pendientes: ' +
              (result.pendingEvents ?? 'desconocido'),
          );
        } else {
          notice(result.message || 'No se pudo conectar al KDS.', true);
        }
      }),

      action(
        'Eliminar',
        async () => {
          if (!confirm('¿Eliminar esta pantalla KDS de la configuración?')) {
            return;
          }

          await api('/api/devices/kds/' + encodeURIComponent(screen.id), 'DELETE');

          notice('Pantalla KDS eliminada.');

          await loadKdsScreens();
        },
        'danger',
      ),
    );

    card.append(toolbar);

    list.append(card);
  }
}

function openKdsAddDialog() {

  const dialog =
    $('kds-add-dialog');


  $('kds-add-name').value =
    'Cocina principal';

  $('kds-add-host').value =
    '';

  $('kds-add-port').value =
    '8080';

  $('kds-add-key').value =
    '';


  const box =
    $('kds-add-groups');


  if (box) {

    box.replaceChildren();


    for (
      const group
      of kdsGroups.filter(
        item =>
          item.activo
      )
    ) {

      const row =
        el(
          'label',
          undefined,
          'toolbar',
        );


      const input =
        document.createElement(
          'input',
        );


      input.type =
        'checkbox';

      input.value =
        String(
          group.id,
        );

      input.dataset.kdsAddGroup =
        '1';


      row.append(

        input,

        document.createTextNode(
          ' ' +
          group.nombre,
        ),
      );


      box.append(
        row,
      );
    }


    if (
      !box.children.length
    ) {

      box.append(

        el(
          'p',
          'No hay grupos activos. Si no seleccionas ninguno, esta pantalla recibirá todo lo que el servidor le envíe.',
          'muted',
        ),
      );
    }
  }


  dialog.showModal();
}


async function addKdsScreenFromDialog(event) {

  event.preventDefault();


  const group_ids =
    Array.from(
      document.querySelectorAll(
        '#kds-add-groups input[data-kds-add-group]:checked',
      ),
    ).map(
      input =>
        String(
          input.value,
        ),
    );


  const body = {

    nombre:
      $('kds-add-name').value.trim(),

    host:
      $('kds-add-host').value.trim(),

    port:
      Number(
        $('kds-add-port').value,
      ),

    pairingKey:
      $('kds-add-key').value.trim(),

    enabled:
      true,

    preparation_group_id:
      group_ids[0] ||
      null,
  };


  if (
    !body.nombre ||
    !body.host ||
    !body.pairingKey
  ) {

    notice(
      'Completa nombre, host y clave de vinculación.',
      true,
    );

    return;
  }


  let created =
    null;


  try {

    created =
      await api(
        '/api/devices/kds',
        'POST',
        body,
      );


    await api(

      '/api/devices/kds/' +
        encodeURIComponent(
          created.id,
        ) +
        '/configuration',

      'PUT',

      {
        nombre:
          body.nombre,

        host:
          body.host,

        port:
          body.port,

        enabled:
          true,

        group_ids,
      },
    );


  } catch (error) {

    /*
     * Si la creación principal funcionó
     * pero falló la configuración atómica,
     * eliminamos el registro incompleto.
     */
    if (
      created &&
      created.id
    ) {

      try {

        await api(

          '/api/devices/kds/' +
            encodeURIComponent(
              created.id,
            ),

          'DELETE',
        );

      } catch (
        rollbackError
      ) {

        console.error(
          'No se pudo revertir alta KDS:',
          rollbackError,
        );
      }
    }


    throw error;
  }


  $('kds-add-dialog').close();


  notice(
    'Pantalla KDS registrada con sus grupos.',
  );


  await Promise.all([
    loadKdsScreens(),
    loadKdsGroups(),
  ]);
}


(async () => {
  try {
    state = await api('/api/devices');

    settingsSavedSnapshot =
      structuredClone(state);
    try {
      await loadPrintingCategories();
    } catch (error) {
      console.warn(
        'No se pudieron cargar las categorías de impresión:',
        error
      );
    }

    await initializeModules();
    for (const key of ['name', 'phone', 'address', 'footer'])
      $('business-' + key).value = state.business[key];
    $('business-reviewQrEnabled').checked = state.business.reviewQrEnabled === true;
    if ($('business-surveyEnabled'))
      $('business-surveyEnabled').checked =
        state.business.surveyEnabled !== false;

    if ($('business-surveyDining'))
      $('business-surveyDining').checked =
        state.business.surveyDining !== false;

    if ($('business-surveyTakeout'))
      $('business-surveyTakeout').checked =
        state.business.surveyTakeout === true;

    if ($('business-surveyDelivery'))
      $('business-surveyDelivery').checked =
        state.business.surveyDelivery === true;
    if ($('business-surveyTitle')) $('business-surveyTitle').value = state.business.surveyTitle || '¿CÓMO LO HICIMOS?';
    if ($('business-surveyMessage')) $('business-surveyMessage').value = state.business.surveyMessage || 'Tu opinión nos ayuda a mejorar.';
    if ($('business-surveyMetric1'))
      $('business-surveyMetric1').value =
        state.business.surveyMetric1 ||
        'Atención del personal';

    if ($('business-surveyMetric2'))
      $('business-surveyMetric2').value =
        state.business.surveyMetric2 ||
        'Calidad de los alimentos';

    if ($('business-surveyMetric3'))
      $('business-surveyMetric3').value =
        state.business.surveyMetric3 ||
        'Rapidez en el servicio';

    if ($('business-surveyMetric4'))
      $('business-surveyMetric4').value =
        state.business.surveyMetric4 ||
        'Limpieza de las instalaciones';

    if ($('business-surveyMetric5'))
      $('business-surveyMetric5').value =
        state.business.surveyMetric5 ||
        'Relación precio / calidad';
    if ($('business-surveyFooter')) $('business-surveyFooter').value = state.business.surveyFooter || '¡Gracias por visitarnos!';
    $('business-reviewQrText').value = state.business.reviewQrText || '';
    $('business-reviewQrUrl').value = state.business.reviewQrUrl || '';
    setBusinessQrPreview(state.business.reviewQrImage || '');
    $('business-reviewQrRefresh')?.addEventListener('click', async () => {
      try {
        const dataUrl = await generateBusinessQr(true);
        state.business.reviewQrImage = dataUrl;
        state.business.reviewQrUrl = $('business-reviewQrUrl').value.trim();
        notice(dataUrl ? 'QR generado correctamente.' : 'Ingresa un enlace para generar el QR.');
      } catch (e) {
        notice(e.message, true);
      }
    });
    $('business-surveyTest')?.addEventListener('click', async () => {
      try {
        await save();
        const result = await api('/api/devices/survey/test', 'POST', {});
        const jobs = Array.isArray(result.jobs) ? result.jobs : [];
        notice(
          jobs.length
            ? 'Encuesta de prueba en cola: ' + jobs.join(', ')
            : (result.warning || 'Encuesta de prueba enviada a la cola de impresión.'),
          !jobs.length && !!result.warning,
        );
      } catch (e) {
        notice(e.message, true);
      }
    });
    state.biometric = state.biometric || {
      enabled: true,
      attendanceEnabled: true,
      drawerEnabled: false,
      drawerAdminOnly: true,
      drawerCooldownSeconds: 5,
      readerName: 'Lector biométrico principal',
    };

    $('bio-enabled').checked = state.biometric.enabled !== false;

    $('bio-attendance').checked = state.biometric.attendanceEnabled !== false;

    $('bio-drawer').checked = state.biometric.drawerEnabled === true;

    $('bio-admin-only').checked = state.biometric.drawerAdminOnly !== false;

    $('bio-cooldown').value = state.biometric.drawerCooldownSeconds || 5;

    $('bio-reader-name').value = state.biometric.readerName || 'Lector biométrico principal';

    $('bot-enabled').checked = state.bot.enabled;
    $('bot-opens').value = state.bot.opens;
    $('bot-closes').value = state.bot.closes;
    $('bot-days').value = state.bot.closedDays.join(',');
    $('bot-delivery').value = state.bot.deliveryNote;
    $('bot-transfer').value = state.bot.transferInstructions;
    $('bot-voice').checked = state.bot.voiceTranscription !== false;
    $('bot-ai-enabled').checked = state.bot.aiEnabled === true;
    $('bot-ai-fallback').checked = state.bot.aiFallback !== false;
    draw();

      await loadPointPrinterTerminals(
        true,
      );
    await loadKdsGroups();

    await Promise.all([
        jobs(),
        bot(),
        incoming(),
        audit(),
        loadKdsScreens(),
        loadKdsPreparationRules(),
        biometricStatus(),
      ]);
  } catch (e) {
    notice(e.message, true);
  }
})();
$('add-printer').onclick = () => {
  /* MP_PRINTER_NEW_ID_V2 */
  const printerId =
    (
      globalThis.crypto
      && typeof globalThis.crypto.randomUUID === 'function'
    )
      ? globalThis.crypto.randomUUID()
      : (
          'printer-'
          + Date.now().toString(36)
          + '-'
          + Math.random()
            .toString(36)
            .slice(2, 12)
        );

  state.printers.push({
      id: printerId,

      name:
        'Impresora '
        + (
          state.printers.length
          + 1
        ),

      transport: 'tcp',

      host: '',
      port: 9100,

      terminal_id: '',
      terminal_alias: '',

      width: 80,
      columns: 48,

      enabled: false,
      cut: true,

      kinds: [
        'kitchen',
        'cancel',
        'receipt',
        'prebill',
        'refund',
        'shift',
        'drawer',
      ],
    });
  draw();
};

for (const [id, fn] of Object.entries({
  save,
  'refresh-jobs': jobs,
  'refresh-bot': bot,
  'refresh-incoming': incoming,
  'refresh-audit': audit,
}))
  $(id).onclick = () => fn().catch((e) => notice(e.message, true));
$('refresh-biometric').onclick = () => biometricStatus().catch((e) => notice(e.message, true));

$('test-biometric-drawer').onclick = async () => {
  try {
    await api('/api/devices/biometric/test-drawer', 'POST', {});

    notice('Prueba de cajón enviada.');
  } catch (e) {
    notice(e.message, true);
  }
};

$('close-preview').onclick = () => $('preview').close();
$('audit-search')?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') audit().catch((e) => notice(e.message, true));
});


function updateKdsRuleWizardExample() {

  const preset =
    $('kds-rule-preset')?.value ||
    'custom';


  const box =
    $('kds-rule-wizard-example');


  if (!box) {
    return;
  }


  const source =
    $('kds-rule-source-id')
      ?.selectedOptions?.[0]
      ?.textContent
      ?.trim() ||
    'producto';


  const target =
    $('kds-rule-target-group')
      ?.selectedOptions?.[0]
      ?.textContent
      ?.trim() ||
    'estación';


  const output =
    String(
      $('kds-rule-output-label')
        ?.value ||
      ''
    ).trim() ||
    'preparación';


  const quantityMode =
    $('kds-rule-quantity-mode')
      ?.value ||
    'item_quantity';


  const quantityValue =
    Number(
      $('kds-rule-quantity-value')
        ?.value ||
      0
    );


  if (
    preset ===
    'derived'
  ) {

    const multiplier =
      quantityMode === 'multiply' &&
      quantityValue > 0
        ? quantityValue
        : 1;


    box.innerHTML =
      '<strong>Ejemplo:</strong> ' +
      'si entran 2 × ' +
      source +
      ', se enviarán ' +
      String(
        2 * multiplier
      ) +
      ' × ' +
      output +
      ' a ' +
      target +
      '.';

    return;
  }


  if (
    preset ===
    'aggregate'
  ) {

    box.innerHTML =
      '<strong>Ejemplo:</strong> ' +
      'varias líneas de ' +
      source +
      ' se agruparán en una sola preparación.';

    return;
  }


  if (
    preset ===
    'omit'
  ) {

    box.innerHTML =
      '<strong>Resultado:</strong> ' +
      source +
      ' no aparecerá en ' +
      target +
      '.';

    return;
  }


  if (
    preset ===
    'normal'
  ) {

    box.innerHTML =
      '<strong>Resultado:</strong> ' +
      source +
      ' se mostrará normalmente en ' +
      target +
      '.';

    return;
  }


  box.innerHTML =
    '<strong>Modo avanzado:</strong> ' +
    'los campos técnicos controlan la salida.';
}


function applyKdsRulePreset() {

  const preset =
    $('kds-rule-preset')?.value ||
    'custom';


  const mode =
    $('kds-rule-mode');

  const quantityMode =
    $('kds-rule-quantity-mode');

  const quantityValue =
    $('kds-rule-quantity-value');

  const hideOriginal =
    $('kds-rule-hide-original');

  const showVariant =
    $('kds-rule-show-variant');

  const showModifiers =
    $('kds-rule-show-modifiers');

  const showNotes =
    $('kds-rule-show-notes');

  const showCourse =
    $('kds-rule-show-course');


  if (
    !mode ||
    !quantityMode
  ) {
    return;
  }


  if (
    preset ===
    'normal'
  ) {

    mode.value =
      'detail';

    quantityMode.value =
      'item_quantity';

    quantityValue.value =
      '';

    hideOriginal.checked =
      false;

    showVariant.checked =
      true;

    showModifiers.checked =
      true;

    showNotes.checked =
      true;

    showCourse.checked =
      true;
  }


  if (
    preset ===
    'aggregate'
  ) {

    mode.value =
      'group';

    quantityMode.value =
      'sum';

    quantityValue.value =
      '';

    hideOriginal.checked =
      true;

    showVariant.checked =
      false;

    showModifiers.checked =
      false;

    showNotes.checked =
      false;

    showCourse.checked =
      false;
  }


  if (
    preset ===
    'derived'
  ) {

    mode.value =
      'transform';

    quantityMode.value =
      'multiply';


    if (
      !Number(
        quantityValue.value
      )
    ) {

      quantityValue.value =
        '1';
    }


    /*
     * Una preparación derivada NO debe borrar
     * el producto original.
     *
     * Birria sigue siendo Birria en cocina,
     * mientras generamos tortillas en otra estación.
     */
    hideOriginal.checked =
      false;

    showVariant.checked =
      false;

    showModifiers.checked =
      false;

    showNotes.checked =
      false;

    showCourse.checked =
      false;
  }


  if (
    preset ===
    'omit'
  ) {

    mode.value =
      'omit';

    quantityMode.value =
      'item_quantity';

    quantityValue.value =
      '';

    hideOriginal.checked =
      true;
  }


  if (
    preset !==
    'custom'
  ) {

    updateKdsRuleFormVisibility();
  }


  updateKdsRuleWizardExample();
}


function syncKdsRulePresetFromFields() {

  const preset =
    $('kds-rule-preset');


  if (!preset) {
    return;
  }


  const mode =
    $('kds-rule-mode')?.value ||
    'detail';

  const quantityMode =
    $('kds-rule-quantity-mode')
      ?.value ||
    'item_quantity';


  if (
    mode === 'transform' &&
    quantityMode === 'multiply'
  ) {

    preset.value =
      'derived';

  } else if (
    mode === 'group' &&
    quantityMode === 'sum'
  ) {

    preset.value =
      'aggregate';

  } else if (
    mode === 'omit'
  ) {

    preset.value =
      'omit';

  } else if (
    mode === 'detail'
  ) {

    preset.value =
      'normal';

  } else {

    preset.value =
      'custom';
  }


  updateKdsRuleWizardExample();
}


$('kds-rule-preset')?.addEventListener(
  'change',
  applyKdsRulePreset,
);


$('kds-rule-form')?.addEventListener(
  'input',
  event => {

    if (
      event.target?.id !==
      'kds-rule-preset'
    ) {

      updateKdsRuleWizardExample();
    }
  },
);


$('kds-rule-form')?.addEventListener(
  'change',
  event => {

    if (
      event.target?.id !==
      'kds-rule-preset'
    ) {

      updateKdsRuleWizardExample();
    }
  },
);


$('add-kds-rule')?.addEventListener(
  'click',
  () =>
    openKdsRuleDialog(),
);


$('kds-rule-source-type')?.addEventListener(
  'change',
  event => {
    fillKdsRuleSourceSelect(
      event.target.value,
    );
  },
);


$('kds-rule-mode')?.addEventListener(
  'change',
  updateKdsRuleFormVisibility,
);


$('kds-rule-quantity-mode')?.addEventListener(
  'change',
  updateKdsRuleFormVisibility,
);


$('kds-rule-form')?.addEventListener(
  'submit',
  async event => {

    try {
      await saveKdsPreparationRule(
        event,
      );

    } catch (e) {

      notice(
        e.message,
        true,
      );
    }
  },
);


$('kds-rule-close')?.addEventListener(
  'click',
  () =>
    $('kds-rule-dialog')
      ?.close(),
);


$('kds-rule-cancel')?.addEventListener(
  'click',
  () =>
    $('kds-rule-dialog')
      ?.close(),
);


$('kds-group-form')?.addEventListener(
  'submit',
  async event => {

    try {

      await saveKdsGroupDialog(
        event,
      );

    } catch (error) {

      notice(
        error.message,
        true,
      );
    }
  },
);


$('kds-group-close')?.addEventListener(
  'click',
  () =>
    $('kds-group-dialog').close(),
);


$('kds-group-cancel')?.addEventListener(
  'click',
  () =>
    $('kds-group-dialog').close(),
);


$('kds-group-category-search')?.addEventListener(
  'input',
  event => {

    const query =
      String(
        event.target.value ||
        '',
      )
        .trim()
        .toLowerCase();


    for (
      const row
      of document.querySelectorAll(
        '#kds-group-category-list .kds-category-modal-row',
      )
    ) {

      row.hidden =
        query &&
        !String(
          row.dataset.search ||
          '',
        ).includes(
          query,
        );
    }
  },
);


$('add-kds-screen').onclick =
  () =>
    openKdsAddDialog();


if ($('kds-save-all')) {

  $('kds-save-all').onclick =
    () =>
      saveAllKdsPending();
}


updateKdsSaveCenter();
$('kds-add-form')?.addEventListener('submit', async (event) => {
  try {
    await addKdsScreenFromDialog(event);
  } catch (e) {
    notice(e.message, true);
  }
});
$('kds-add-close')?.addEventListener('click', () => $('kds-add-dialog').close());
$('kds-add-cancel')?.addEventListener('click', () => $('kds-add-dialog').close());
