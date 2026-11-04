let cobroOperacionId = null;

/* MP_POINT_REQUEST_INTENT_V1
 *
 * Point mantiene una identidad independiente de los
 * cobros tradicionales.
 */
let pointRequestIntent = null;

function pointRequestIdFor(
  pedidoId,
  terminalId
) {
  const pedidoKey =
    String(pedidoId ?? '');

  const terminalKey =
    String(terminalId ?? '');

  /* MP_POINT_REQUEST_TERMINAL_RESET_V1
   *
   * Una operación definitivamente terminada NO debe
   * prestar su request_id a un nuevo cobro, incluso si
   * se trata del mismo pedido y de la misma terminal.
   */
  const estadoAnterior =
    pointOperacionActual
      ?.estado_local;

  const estadosTerminados =
    new Set([
      'error',
      'fallida',
      'cancelada',
      'expirada',
      'finalizada',
      'reembolsada'
    ]);

  if (
    pointRequestIntent &&
    estadosTerminados.has(
      estadoAnterior
    )
  ) {
    pointRequestIntent = null;
  }

  if (
    !pointRequestIntent ||
    pointRequestIntent.pedidoId !==
      pedidoKey ||
    pointRequestIntent.terminalId !==
      terminalKey
  ) {
    pointRequestIntent = {
      pedidoId:
        pedidoKey,

      terminalId:
        terminalKey,

      requestId:
        `mp-${nuevaClaveOperacion()}`
    };
  }

  return pointRequestIntent.requestId;
}

function resetPointRequestIntent() {
  pointRequestIntent = null;
}
let usuarioSesion = null;
let zonaActual = 'salon';
let datosGlobales = {
  categorias: [],
  productos: [],
  pedidosAbiertos: [],
  modificadores: [],
  usuarios: [],
};
let pedidoActivo = null;
let comandaLocal = [];
let comandaInicialSnapshot = [];
let platoActual = 1;
let productoEnModal = null;
let itemEditandoIndex = null;
let varianteSeleccionada = null;
let modificadoresSeleccionados = [];
let pedidoEnDespacho = null;

let categoriaActivaId = null;
let textoBusquedaActivo = '';

let splitItemsOrigen = [];
let splitItemsDestino = [];
let modoSplitPaymentActivo = false;
let pagosParcialesRegistrados = [];
let saldoRestanteCobro = 0;
let totalOriginalCobro = 0;


let syncTimer = null;

/* MP_POINT_PRINT_POS_ALERT_V1 */
let pointPrintAlertTimer = null;
let pointPrintAlertBaselineReady = false;
const pointPrintAlertSeen = new Set();

function pointPrintAlertIsFailure(job) {
  if (!job) return false;

  const isPoint =
    job.printer_transport ===
      'mercadopago_point'
    || job.provider ===
      'mercadopago_point';

  if (!isPoint) return false;

  const providerStatus =
    String(
      job.provider_status || '',
    ).toLowerCase();

  return (
    job.status === 'failed'
    || job.status === 'uncertain'
    || providerStatus === 'expired'
    || providerStatus === 'canceled'
  );
}

let pointPrintAlertCurrentJob = null;

/* MP_POINT_MANUAL_REPRINT_POS_V1 */
async function reimprimirAlertaImpresionPoint() {
  const job =
    pointPrintAlertCurrentJob;

  if (!job?.id) {
    return;
  }

  const terminal =
    job.terminal_alias
    || job.printer_name
    || 'Point';

  if (
    !confirm(
      `¿Reimprimir la comanda #${job.id} `
      + `en Point ${terminal}?\n\n`
      + 'Confirma que revisaste papel, tapa '
      + 'y estado de la terminal.\n\n'
      + 'Se creará una NUEVA impresión.',
    )
  ) {
    return;
  }

  const button =
    document.getElementById(
      'point-print-alert-reprint',
    );

  if (button) {
    button.disabled = true;
    button.textContent =
      'Creando...';
  }

  try {
    const res =
      await fetch(
        `/api/devices/jobs/${job.id}/point-reprint`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            confirm_reprint: true,
          }),
        },
      );

    let body = null;

    try {
      body =
        await res.json();
    } catch {
      body = null;
    }

    if (!res.ok) {
      throw new Error(
        body?.error
        || `Error HTTP ${res.status}`,
      );
    }

    const detail =
      document.getElementById(
        'point-print-alert-detail',
      );

    if (detail) {
      detail.textContent =
        body?.already_created
          ? (
              'La reimpresión ya había sido creada '
              + `como job #${body.job_id}.`
            )
          : (
              'Reimpresión creada como job '
              + `#${body.job_id}.`
            );
    }

    if (button) {
      button.style.display = 'none';
    }

  } catch (err) {
    const detail =
      document.getElementById(
        'point-print-alert-detail',
      );

    if (detail) {
      detail.textContent =
        err?.message
        || 'No se pudo crear la reimpresión.';
    }

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        'Reimprimir';
    }
  }
}

function cerrarAlertaImpresionPoint() {
  const box =
    document.getElementById(
      'point-print-alert',
    );

  if (box) {
    box.style.display = 'none';
  }
}

function mostrarAlertaImpresionPoint(job) {
  const box =
    document.getElementById(
      'point-print-alert',
    );

  if (!box) return;

  pointPrintAlertCurrentJob = job;

  const terminal =
    job.terminal_alias
    || job.printer_name
    || 'Point';

  const kindLabels = {
    kitchen: 'Comanda',
    cancel: 'Cancelación',
  };

  const kind =
    kindLabels[job.kind]
    || job.kind
    || 'Impresión';

  const title =
    document.getElementById(
      'point-print-alert-title',
    );

  const meta =
    document.getElementById(
      'point-print-alert-meta',
    );

  const detail =
    document.getElementById(
      'point-print-alert-detail',
    );

  if (title) {
    title.textContent =
      'Problema de impresión';
  }

  if (meta) {
    meta.textContent =
      `${terminal} · ${kind} #${job.id}`;
  }

  if (detail) {
    detail.textContent =
      job.last_error
      || (
        'La impresión no se completó. '
        + 'Revisa papel, tapa, temperatura '
        + 'y estado de la terminal.'
      );
  }

  const reprintButton =
    document.getElementById(
      'point-print-alert-reprint',
    );

  const providerStatus =
    String(
      job.provider_status || '',
    ).toLowerCase();

  if (reprintButton) {
    reprintButton.style.display =
      job.status === 'failed'
      && (
        providerStatus === 'expired'
        || providerStatus === 'canceled'
      )
        ? 'inline-flex'
        : 'none';
  }

  box.style.display = 'block';
}

async function revisarAlertasImpresionPoint() {
  try {
    const res =
      await fetch(
        '/api/devices/jobs',
        {
          cache: 'no-store',
        },
      );

    if (!res.ok) return;

    const jobs =
      await res.json();

    if (!Array.isArray(jobs)) return;

    const failures =
      jobs.filter(
        pointPrintAlertIsFailure,
      );

    if (!pointPrintAlertBaselineReady) {
      for (const job of failures) {
        pointPrintAlertSeen.add(
          Number(job.id),
        );
      }

      pointPrintAlertBaselineReady = true;
      return;
    }

    const nuevos =
      failures
        .filter((job) => {
          const id =
            Number(job.id);

          return (
            Number.isFinite(id)
            && !pointPrintAlertSeen.has(id)
          );
        })
        .sort(
          (a, b) =>
            Number(a.id)
            - Number(b.id),
        );

    for (const job of nuevos) {
      pointPrintAlertSeen.add(
        Number(job.id),
      );
    }

    if (nuevos.length) {
      mostrarAlertaImpresionPoint(
        nuevos[nuevos.length - 1],
      );
    }
  } catch (err) {
    console.debug(
      'Monitor impresión Point:',
      err?.message || err,
    );
  }
}

function iniciarMonitorImpresionPoint() {
  if (pointPrintAlertTimer) {
    return;
  }

  revisarAlertasImpresionPoint();

  pointPrintAlertTimer =
    setInterval(
      revisarAlertasImpresionPoint,
      15000,
    );
}


document.addEventListener('DOMContentLoaded', async () => {
  await window.restaurantReady;
  const sesionRaw = localStorage.getItem('empleado_sesion');
  if (sesionRaw) {
    usuarioSesion = JSON.parse(sesionRaw);
    const tag = document.getElementById('txt-usuario-tag');
    if (tag) tag.innerText = `${usuarioSesion.nombre} (${usuarioSesion.rol.toUpperCase()})`;

    aplicarRestriccionesRol();

    if (usuarioSesion.rol === 'repartidor') {
      const tabSalon = document.getElementById('tab-btn-salon');
      const tabLlevar = document.getElementById('tab-btn-takeout');
      if (tabSalon) tabSalon.style.display = 'none';
      if (tabLlevar) tabLlevar.style.display = 'none';
      zonaActual = 'delivery';
      await cargarDatos();
      cambiarZona('delivery');
      iniciarSyncContinua();
      iniciarMonitorImpresionPoint();
      return;
    }
  }

  const turnoValido = await verificarTurnoActivo();
  if (turnoValido) {
    await cargarDatos();
    cambiarZona('salon');
    iniciarSyncContinua();
    iniciarMonitorImpresionPoint();
  }
});

function aplicarRestriccionesRol() {
  const esMesero = !window.restaurantSettings?.permissions.charge;

  document.querySelectorAll('.btn-action-cobrar').forEach((btn) => {
    btn.style.display = esMesero ? 'none' : 'inline-block';
  });

  const optCajon = document.getElementById('opt-open-cashdrawer');
  if (optCajon) {
    optCajon.style.display = window.restaurantSettings?.permissions.drawer ? 'flex' : 'none';
  }
}

function iniciarSyncContinua() {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(async () => {
    try {
      const res = await fetch('/api/pos/datos-iniciales');
      const nuevosDatos = await res.json();

      datosGlobales.pedidosAbiertos = nuevosDatos.pedidosAbiertos || [];
      datosGlobales.productos = nuevosDatos.productos || [];

      if (!pedidoActivo) {
        if (zonaActual === 'salon') {
          renderPlanoSalon();
        } else {
          renderPedidosEspeciales();
        }
      }
    } catch (e) {}
  }, window.restaurantSettings?.pos.syncMs ?? 1500);
}

function toggleMenuOpciones() {
  const menu = document.getElementById('menu-opciones');
  const backdrop = document.getElementById('backdrop-menu-opciones');

  const optClear = document.getElementById('opt-clear-ticket');
  const optBill = document.getElementById('opt-print-bill');
  const optReprint = document.getElementById('opt-reprint-order');
  const optReprintReceipt = document.getElementById('opt-reprint-receipt');
  const optEdit = document.getElementById('opt-edit-ticket');
  const optSplit = document.getElementById('opt-split-ticket');
  const optMove = document.getElementById('opt-move-ticket');
  const optAsignar = document.getElementById('opt-asignar-ticket');
  const optCajon = document.getElementById('opt-open-cashdrawer');

  const enComandero = !!pedidoActivo;
  const esMesero = !window.restaurantSettings?.permissions.charge;

  if (optClear)
    optClear.style.display =
      enComandero && window.restaurantSettings?.permissions.cancel ? 'flex' : 'none';
  if (optBill) optBill.style.display = enComandero ? 'flex' : 'none';
  if (optReprint) optReprint.style.display = enComandero && window.restaurantSettings?.permissions.ticketReprint ? 'flex' : 'none';
  if (optReprintReceipt) optReprintReceipt.style.display = enComandero && window.restaurantSettings?.permissions.ticketReprint ? 'flex' : 'none';
  if (optEdit) optEdit.style.display = enComandero ? 'flex' : 'none';
  if (optSplit) optSplit.style.display = enComandero ? 'flex' : 'none';
  if (optMove) optMove.style.display = enComandero ? 'flex' : 'none';
  if (optAsignar)
    optAsignar.style.display =
      enComandero && usuarioSesion && usuarioSesion.rol === 'admin' ? 'flex' : 'none';
  if (optCajon)
    optCajon.style.display = window.restaurantSettings?.permissions.drawer ? 'flex' : 'none';

  if (menu && backdrop) {
    menu.classList.toggle('open');
    backdrop.classList.toggle('open');
  }
}

function cerrarMenuOpciones() {
  const menu = document.getElementById('menu-opciones');
  const backdrop = document.getElementById('backdrop-menu-opciones');
  if (menu) menu.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
}

async function verificarTurnoActivo() {
  try {
    const res = await fetch('/api/shifts/estado-actual');
    const data = await res.json();
    const overlay = document.getElementById('bloqueo-turno-pos');

    if (!data.turno_abierto) {
      if (overlay) overlay.style.display = 'flex';
      const tit = document.getElementById('lock-titulo');
      const msg = document.getElementById('lock-msg');
      const btn = document.getElementById('lock-btn-abrir-turno');
      if (tit) tit.innerText = 'Caja Cerrada';
      if (msg) msg.innerText = 'Apertura de turno requerida.';
      if (btn) btn.style.display = 'inline-block';
      return false;
    } else {
      if (overlay) overlay.style.display = 'none';
      return true;
    }
  } catch (err) {
    return false;
  }
}

async function cargarDatos() {
  try {
    const res = await fetch('/api/pos/datos-iniciales');
    datosGlobales = await res.json();
    if (zonaActual === 'salon') {
      renderPlanoSalon();
    } else {
      renderPedidosEspeciales();
    }
    renderCategorias();
    renderProductos();
  } catch (err) {}
}

function cambiarZona(zona) {
  zonaActual = zona;
  document.querySelectorAll('#floor-nav .cat-btn').forEach((b) => b.classList.remove('active'));
  const btn = document.getElementById(`tab-btn-${zona}`);
  if (btn) btn.classList.add('active');

  const panelSalon = document.getElementById('panel-zona-salon');
  const panelDelivery = document.getElementById('panel-zona-delivery');

  if (zona === 'salon') {
    if (panelSalon) panelSalon.style.display = 'block';
    if (panelDelivery) panelDelivery.style.display = 'none';
    renderPlanoSalon();
  } else {
    if (panelSalon) panelSalon.style.display = 'none';
    if (panelDelivery) panelDelivery.style.display = 'block';
    renderPedidosEspeciales();
  }
}

function puedeGestionarMesa(pedidoObj) {
  if (!pedidoObj || !pedidoObj.id) return true;
  if (!usuarioSesion) return false;
  if (usuarioSesion.rol === 'admin') return true;

  const m1 = (pedidoObj.mesero || '').toLowerCase();
  const m2 = (pedidoObj.mesero_secundario || '').toLowerCase();
  const u = (usuarioSesion.nombre || '').toLowerCase();

  return m1 === u || m2 === u;
}

function renderPlanoSalon() {
  const filas = {
    'fila-1': [1, 2, 3, 4, 5],
    'fila-2': [6, 7, 8, 9, 10],
    'fila-3': [11, 12, 13, 14],
  };

  for (const [filaId, mesas] of Object.entries(filas)) {
    const cont = document.getElementById(filaId);
    if (!cont) continue;
    cont.innerHTML = '';

    mesas.forEach((num) => {
      const nombreMesa = `Mesa ${num}`;
      const pedidoMesa = (datosGlobales.pedidosAbiertos || []).find(
        (p) => p.mesa_numero === nombreMesa && p.estado === 'abierto',
      );
      const ocupada = !!pedidoMesa;
      const tienePermiso = puedeGestionarMesa(pedidoMesa);

      const box = document.createElement('div');
      box.className = `mesa-box ${ocupada ? 'ocupada' : ''}`;

      if (ocupada && !tienePermiso) {
        box.style.opacity = '0.75';
        box.style.borderStyle = 'dashed';
      }

      if (pedidoMesa?.created_at && window.restaurantSettings?.orders) {
        const minutes = (Date.now() - new Date(pedidoMesa.created_at).getTime()) / 60000;
        if (minutes >= window.restaurantSettings.orders.criticalMinutes)
          box.style.outline = '3px solid #ef6464';
        else if (minutes >= window.restaurantSettings.orders.warningMinutes)
          box.style.outline = '3px solid #e4b34b';
      }
      box.onclick = () => {
        if (ocupada && !tienePermiso) {
          const mTexto = pedidoMesa.mesero_secundario
            ? `${pedidoMesa.mesero} y ${pedidoMesa.mesero_secundario}`
            : pedidoMesa.mesero;
          return alert(`Mesa asignada a: ${mTexto}`);
        }
        abrirComanderoMesa(nombreMesa, pedidoMesa);
      };

      box.innerHTML = `
        <div class="mesa-name">${nombreMesa}</div>
        <div class="mesa-status">${ocupada ? `$${Number(pedidoMesa.total).toFixed(2)}` : ''}</div>
        ${
          ocupada && pedidoMesa.mesero
            ? `
          <div style="font-size:0.65rem; color:${tienePermiso ? '#A8C7FA' : '#F2B8B5'}; margin-top:2px;">
            ${tienePermiso ? '👤' : '🔒'} ${pedidoMesa.mesero} ${pedidoMesa.mesero_secundario ? `+ ${pedidoMesa.mesero_secundario}` : ''}
          </div>
        `
            : ''
        }
      `;
      cont.appendChild(box);
    });
  }

  renderMesasPersonalizadas();
}

function renderMesasPersonalizadas() {
  const cont = document.getElementById('fila-custom');
  if (!cont) return;
  cont.innerHTML = '';

  const especiales = (datosGlobales.pedidosAbiertos || []).filter(
    (p) =>
      p.estado === 'abierto' &&
      !p.mesa_numero.match(/^Mesa (1[0-4]|[1-9])$/) &&
      (p.tipo_servicio === 'comedor' || !p.tipo_servicio) &&
      !p.mesa_numero.startsWith('DELIV') &&
      !p.mesa_numero.startsWith('LLEVAR'),
  );

  especiales.forEach((p) => {
    const tienePermiso = puedeGestionarMesa(p);
    const box = document.createElement('div');
    box.className = 'mesa-box ocupada';

    if (!tienePermiso) {
      box.style.opacity = '0.75';
      box.style.borderStyle = 'dashed';
    }

    box.onclick = () => {
      if (!tienePermiso) return alert(`Orden de: ${p.mesero}`);
      abrirComanderoMesa(p.mesa_numero, p);
    };

    box.innerHTML = `
      <div class="mesa-name">${p.mesa_numero}</div>
      <div class="mesa-status">$${Number(p.total).toFixed(2)}</div>
      <div style="font-size:0.65rem; color:${tienePermiso ? '#A8C7FA' : '#F2B8B5'};">
        ${tienePermiso ? '👤' : '🔒'} ${p.mesero || 'Mesero'} ${p.mesero_secundario ? `+ ${p.mesero_secundario}` : ''}
      </div>
    `;
    cont.appendChild(box);
  });
}

function renderPedidosEspeciales() {
  const cont = document.getElementById('lista-pedidos-especiales');
  if (!cont) return;
  cont.innerHTML = '';

  const pedidos = (datosGlobales.pedidosAbiertos || []).filter((p) => {
    if (zonaActual === 'delivery') {
      return (
        (p.tipo_servicio === 'delivery' || p.mesa_numero.startsWith('DELIV')) &&
        p.estado !== 'pagado'
      );
    } else {
      return (
        (p.tipo_servicio === 'para_llevar' ||
          p.mesa_numero.startsWith('LLEVAR') ||
          p.tipo_servicio === 'takeout') &&
        p.estado !== 'pagado'
      );
    }
  });

  if (pedidos.length === 0) {
    cont.innerHTML = `<div style="text-align:center; color:#888; padding:30px;">Sin órdenes activas en ${zonaActual === 'delivery' ? 'A Domicilio' : 'Para Llevar'}.</div>`;
    return;
  }

  const esMesero = !window.restaurantSettings?.permissions.charge;

  pedidos.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'order-card-deliv';

    const estadoDesp = p.estado_despacho || 'en_preparacion';
    const tagColor = estadoDesp === 'en_camino' ? '#FBC02D' : '#6DD58C';
    const tagTexto = estadoDesp === 'en_camino' ? '🚴 EN CAMINO' : '🍳 EN PREPARACIÓN';

    const tienePermiso =
      puedeGestionarMesa(p) || (usuarioSesion && usuarioSesion.rol === 'repartidor');

    let botonesAccion = '';

    if (
      zonaActual === 'delivery' ||
      p.tipo_servicio === 'delivery' ||
      p.mesa_numero.startsWith('DELIV')
    ) {
      const direccionCompleta =
        `${p.direccion_entrega || ''} ${p.referencias_entrega || ''}`.trim();
      const mapsQuery = encodeURIComponent(direccionCompleta || p.cliente_nombre || 'Jalisco');

      botonesAccion += `
        <a href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}" target="_blank" class="cat-btn" style="background:#1e88e5; color:#fff; text-decoration:none; display:inline-flex; align-items:center; gap:4px;">
          <span class="material-icons-round" style="font-size:16px;">map</span> Maps
        </a>
      `;

      if (estadoDesp === 'en_preparacion') {
        botonesAccion += `
          <button class="cat-btn" style="background:#f57c00; color:#fff;" onclick="abrirModalDespachoPaso1(${p.id})">
            <span class="material-icons-round" style="font-size:16px; margin-right:4px;">local_shipping</span> Despachar
          </button>
        `;
      }
    }

    if (tienePermiso) {
      if (!esMesero) {
        botonesAccion += `
          <button class="cat-btn btn-action-cobrar" style="background:#2E7D32; color:#fff;" onclick="abrirCobroPedidoDirecto(${p.id})">
            <span class="material-icons-round" style="font-size:16px; margin-right:4px;">payments</span> Cobrar
          </button>
        `;
      }

      if (usuarioSesion && usuarioSesion.rol !== 'repartidor') {
        botonesAccion += `
          <button class="cat-btn" onclick="abrirComanderoMesa('${p.mesa_numero}', datosGlobales.pedidosAbiertos.find(x=>x.id===${p.id}))">
            <span class="material-icons-round" style="font-size:16px; margin-right:4px;">edit</span> Comanda
          </button>
        `;
      }
    } else {
      botonesAccion += `
        <span style="font-size:0.75rem; color:#F2B8B5; padding:6px;">🔒 ${p.mesero}</span>
      `;
    }

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <strong style="font-size:1.05rem; color:#A8C7FA;">#${p.id} - ${p.cliente_nombre || p.mesa_numero}</strong>
          <div style="font-size:0.85rem; color:#eee; margin-top:2px;">
            ${p.cliente_telefono ? `📞 ${p.cliente_telefono}` : ''}
          </div>
          ${p.direccion_entrega ? `<div style="font-size:0.85rem; color:#aaa; margin-top:2px;">📍 ${p.direccion_entrega}</div>` : ''}
          ${p.referencias_entrega ? `<div style="font-size:0.8rem; color:#888;">${p.referencias_entrega}</div>` : ''}
          <div style="font-size:0.75rem; color:#aaa; margin-top:4px;">👤 Atiende: <strong>${p.mesero || 'General'}</strong></div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:1.25rem; font-weight:900; color:#6DD58C;">$${Number(p.total).toFixed(2)}</div>
          <span style="display:inline-block; font-size:0.75rem; font-weight:700; color:${tagColor}; margin-top:4px;">${tagTexto}</span>
        </div>
      </div>
      <div class="deliv-btn-group">${botonesAccion}</div>
    `;
    cont.appendChild(card);
  });
}

function abrirComanderoMesa(nombreMesa, pedidoObj = null) {
  if (pedidoObj && !puedeGestionarMesa(pedidoObj)) {
    return alert(`Mesa asignada a: ${pedidoObj.mesero}`);
  }

  cerrarMenuOpciones();

  pedidoActivo = pedidoObj ||
    (datosGlobales.pedidosAbiertos || []).find(
      (p) => p.mesa_numero === nombreMesa && p.estado === 'abierto',
    ) || {
      mesa_numero: nombreMesa,
      tipo_servicio:
        zonaActual === 'salon' ? 'comedor' : zonaActual === 'takeout' ? 'para_llevar' : zonaActual,
      mesero: usuarioSesion ? usuarioSesion.nombre : 'Mesero',
      total: 0,
    };

  comandaLocal = pedidoActivo.items ? JSON.parse(JSON.stringify(pedidoActivo.items)) : [];
  comandaInicialSnapshot = JSON.parse(JSON.stringify(comandaLocal));

  if (comandaLocal.length > 0) {
    const maxPlato = Math.max(...comandaLocal.map((it) => parseInt(it.numero_plato) || 1));
    platoActual = maxPlato;
  } else {
    platoActual = 1;
  }

  document.getElementById('vista-mesas').style.display = 'none';
  document.getElementById('floor-nav').style.display = 'none';

  const comandero = document.getElementById('vista-comandero');
  comandero.classList.add('split-active');

  document.getElementById('btn-sidebar-menu').style.display = 'none';
  document.getElementById('btn-back-mesas').style.display = 'inline-flex';
  const esServicioEspecial = ['delivery', 'para_llevar', 'takeout'].includes(pedidoActivo.tipo_servicio);
  const etiquetaVisiblePedido = esServicioEspecial
    ? (pedidoActivo.cliente_nombre || (pedidoActivo.tipo_servicio === 'delivery' ? 'Pedido a domicilio' : 'Pedido para llevar'))
    : nombreMesa;
  document.getElementById('txt-top-titulo').innerText = etiquetaVisiblePedido;
  document.getElementById('txt-mesa-activa').innerText = etiquetaVisiblePedido;
  document.getElementById('txt-pedido-id').innerText = pedidoActivo.id
    ? `Folio #${pedidoActivo.id} • ${pedidoActivo.mesero}`
    : `Nueva Orden • ${usuarioSesion ? usuarioSesion.nombre : 'Mesero'}`;

  limpiarBusquedaProductos();
  aplicarRestriccionesRol();
  actualizarBotonesPlato();
  renderCategorias();
  renderProductos();
  renderTicketBody();
}

function cerrarComandero() {
  cerrarMenuOpciones();
  const comandero = document.getElementById('vista-comandero');
  comandero.classList.remove('split-active');

  document.getElementById('vista-mesas').style.display = 'block';
  document.getElementById('floor-nav').style.display = 'flex';
  document.getElementById('btn-sidebar-menu').style.display = 'inline-flex';
  document.getElementById('btn-back-mesas').style.display = 'none';
  document.getElementById('txt-top-titulo').innerText = 'TPV';

  pedidoActivo = null;
  comandaLocal = [];
  comandaInicialSnapshot = [];
  limpiarBusquedaProductos();
  cargarDatos();
  aplicarRestriccionesRol();
}

function renderCategorias() {
  const cont = document.getElementById('cat-bar');
  if (!cont) return;
  cont.innerHTML = `<button class="cat-btn ${categoriaActivaId === null ? 'active' : ''}" onclick="filtrarProductosPorCat(null, this)">Todo</button>`;
  (datosGlobales.categorias || []).forEach((c) => {
    const isAct = categoriaActivaId === c.id ? 'active' : '';
    cont.innerHTML += `<button class="cat-btn ${isAct}" onclick="filtrarProductosPorCat(${c.id}, this)">${c.nombre}</button>`;
  });
}

function filtrarProductosPorCat(catId, btn) {
  categoriaActivaId = catId;
  document.querySelectorAll('#cat-bar .cat-btn').forEach((b) => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderProductos();
}

function filtrarProductosPorBusqueda(texto) {
  textoBusquedaActivo = (texto || '').toLowerCase().trim();
  const clearBtn = document.getElementById('pos-search-clear-btn');
  if (clearBtn) clearBtn.style.display = textoBusquedaActivo ? 'inline-block' : 'none';
  renderProductos();
}

function limpiarBusquedaProductos() {
  textoBusquedaActivo = '';
  const inp = document.getElementById('pos-search-input');
  const clearBtn = document.getElementById('pos-search-clear-btn');
  if (inp) inp.value = '';
  if (clearBtn) clearBtn.style.display = 'none';
  renderProductos();
}

function renderProductos() {
  const cont = document.getElementById('prod-grid');
  if (!cont) return;
  cont.innerHTML = '';

  let prods = (datosGlobales.productos || []).filter((p) => p.activo);

  if (categoriaActivaId !== null) {
    prods = prods.filter((p) => p.categoria_id === categoriaActivaId);
  }

  if (textoBusquedaActivo) {
    prods = prods.filter(
      (p) =>
        (p.nombre && p.nombre.toLowerCase().includes(textoBusquedaActivo)) ||
        (p.sku && p.sku.toLowerCase().includes(textoBusquedaActivo)),
    );
  }

  if (prods.length === 0) {
    cont.innerHTML = `<div style="text-align:center; color:#888; grid-column:1/-1; padding:20px;">${textoBusquedaActivo ? 'Sin coincidencias con la búsqueda.' : 'Sin platillos en esta sección.'}</div>`;
    return;
  }

  prods.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'prod-item';

    const estaAgotado =
      p.disponible_venta === 0 ||
      p.insumo_agotado === true ||
      (p.max_porciones !== undefined && p.max_porciones <= 0);

    if (estaAgotado) {
      card.style.opacity = '0.45';
      card.style.borderColor = '#E53935';
    }

    const esVariable = parseFloat(p.precio) === 0;
    const precioTxt = esVariable ? 'Variable' : `$${Number(p.precio).toFixed(2)}`;

    card.onclick = () => {
      if (p.disponible_venta === 0) {
        return alert(`⛔ Platillo Agotado:\nEste artículo está marcado como no disponible.`);
      }
      if (p.insumo_agotado || (p.max_porciones !== undefined && p.max_porciones <= 0)) {
        return alert(
          `⛔ Insumo Agotado:\nNo hay suficiente stock de "${p.insumo_faltante_nombre || 'insumos'}" para preparar este platillo.`,
        );
      }
      abrirModalConfigurarProducto(p);
    };

    card.innerHTML = `
      <div style="font-weight:700;">${p.nombre}</div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
        <span style="color:var(--secondary); font-weight:900;">${precioTxt}</span>
        ${estaAgotado ? '<span style="color:#F2B8B5; font-size:0.7rem; font-weight:700;">AGOTADO</span>' : ''}
      </div>
    `;
    cont.appendChild(card);
  });
}

function abrirModalConfigurarProducto(prod, editIndex = null) {
  productoEnModal = prod;
  itemEditandoIndex = editIndex;
  varianteSeleccionada = null;
  modificadoresSeleccionados = [];

  const itemEdit = editIndex !== null ? comandaLocal[editIndex] : null;

  document.getElementById('m-prod-nombre').innerText = prod.nombre;

  const esVariable = parseFloat(prod.precio) === 0;
  const boxCustomPrecio = document.getElementById('m-box-precio-variable');
  const displayPrecio = document.getElementById('m-prod-precio-display');

  if (esVariable) {
    displayPrecio.innerText = 'Producto Abierto / Variable:';
    if (boxCustomPrecio) boxCustomPrecio.style.display = 'block';
    const customInp = document.getElementById('m-prod-precio-custom');
    const customNameInp = document.getElementById('m-prod-nombre-custom');

    if (customInp) customInp.value = itemEdit ? itemEdit.precio_unitario : '';
    if (customNameInp) customNameInp.value = itemEdit ? itemEdit.nombre : prod.nombre;
  } else {
    displayPrecio.innerText = `$${Number(prod.precio).toFixed(2)}`;
    if (boxCustomPrecio) boxCustomPrecio.style.display = 'none';
  }

  document.getElementById('m-prod-qty').innerText = itemEdit ? itemEdit.cantidad || 1 : '1';
  document.getElementById('m-prod-notas').value = itemEdit ? itemEdit.notas || '' : '';

  const btnEliminar = document.getElementById('btn-eliminar-item-modal');
  if (btnEliminar) btnEliminar.style.display = editIndex !== null ? 'inline-flex' : 'none';

  // VARIANTES
  const varSec = document.getElementById('m-variantes-section');
  const varBox = document.getElementById('m-variantes-box');
  varBox.innerHTML = '';

  if (prod.variantes && prod.variantes.length > 0) {
    varSec.style.display = 'block';

    let variantePreviaNombre = null;
    if (itemEdit && itemEdit.nombre) {
      const match = itemEdit.nombre.match(/\(([^)]+)\)/);
      if (match) variantePreviaNombre = match[1].trim();
    }

    let indiceSeleccionar = 0;
    if (variantePreviaNombre) {
      const idx = prod.variantes.findIndex(
        (v) => v.nombre.toLowerCase() === variantePreviaNombre.toLowerCase(),
      );
      if (idx !== -1) indiceSeleccionar = idx;
    }

    prod.variantes.forEach((v, idx) => {
      const isSelected = idx === indiceSeleccionar;
      if (isSelected) varianteSeleccionada = v;
      const activeClass = isSelected ? 'active' : '';

      varBox.innerHTML += `
        <button type="button" class="cat-btn ${activeClass}" ${Number(v.disponible)===0?'disabled style="opacity:.45;cursor:not-allowed"':''} onclick="seleccionarVarianteModal('${v.nombre}', ${v.precio}, this)">${v.nombre} ($${Number(v.precio).toFixed(2)})${Number(v.disponible)===0?' · AGOTADO':''}</button>
      `;
    });
  } else {
    varSec.style.display = 'none';
  }

  // MODIFICADORES
  const modSec = document.getElementById('m-modificadores-section');
  const modBox = document.getElementById('m-modificadores-box');
  modBox.innerHTML = '';

  const gruposAsignados =
    prod.modificadores_ids && Array.isArray(prod.modificadores_ids) ? prod.modificadores_ids : [];

  const modificadoresFiltrados = (datosGlobales.modificadores || []).filter((g) =>
    gruposAsignados.includes(g.id),
  );

  const modsPreviosArray =
    itemEdit && itemEdit.modificadores
      ? itemEdit.modificadores.split(',').map((m) => m.trim().toLowerCase())
      : [];

  if (modificadoresFiltrados.length > 0) {
    modSec.style.display = 'block';
    modificadoresFiltrados.forEach((g) => {
      let botones = '';
      (g.opciones || []).forEach((o) => {
        const extraNum = parseFloat(o.precio_extra) || 0;
        const extraTexto = extraNum > 0 ? ` (+$${extraNum.toFixed(2)})` : '';
        const estabaMarcado = modsPreviosArray.includes(o.nombre.toLowerCase());

        if (estabaMarcado) {
          modificadoresSeleccionados.push({ nombre: o.nombre, precio: extraNum });
        }

        botones += `
          <button type="button" class="cat-btn btn-mod-opt ${estabaMarcado ? 'active' : ''}" ${Number(o.disponible)===0?'disabled style="opacity:.45;cursor:not-allowed"':''} data-nombre="${o.nombre}" data-precio="${extraNum}" onclick="toggleModificadorPill(this)">${o.nombre}${extraTexto}${Number(o.disponible)===0?' · AGOTADO':''}</button>
        `;
      });
      modBox.innerHTML += `
        <div style="margin-top:6px;">
          <span style="font-size:0.75rem; color:#A8C7FA; font-weight:700;">${g.nombre}:</span>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:4px;">${botones}</div>
        </div>
      `;
    });
  } else {
    modSec.style.display = 'none';
  }

  document.getElementById('modal-producto').style.display = 'flex';
}

function toggleModificadorPill(btn) {
  btn.classList.toggle('active');
  const nombre = btn.dataset.nombre;
  const precio = parseFloat(btn.dataset.precio) || 0;

  if (btn.classList.contains('active')) {
    modificadoresSeleccionados.push({ nombre, precio });
  } else {
    modificadoresSeleccionados = modificadoresSeleccionados.filter((m) => m.nombre !== nombre);
  }
}

function seleccionarVarianteModal(nom, precio, btn) {
  document
    .querySelectorAll('#m-variantes-box .cat-btn')
    .forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  varianteSeleccionada = { nombre: nom, precio: parseFloat(precio) || 0 };
}

function ajustarCantidadModal(delta) {
  const lbl = document.getElementById('m-prod-qty');
  let cant = parseInt(lbl.innerText) || 1;
  const maxPermitido =
    productoEnModal && productoEnModal.max_porciones !== undefined
      ? productoEnModal.max_porciones
      : 999;

  if (delta > 0 && cant >= maxPermitido) {
    return alert(
      `⛔ Límite de Insumos:\nSolo hay insumos para preparar ${maxPermitido} orden(es).`,
    );
  }

  cant = Math.max(1, cant + delta);
  lbl.innerText = cant;
}

function cerrarModalProducto() {
  document.getElementById('modal-producto').style.display = 'none';
}
function generarKdsLineId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));

    return (
      hex.slice(0, 4).join('') +
      '-' +
      hex.slice(4, 6).join('') +
      '-' +
      hex.slice(6, 8).join('') +
      '-' +
      hex.slice(8, 10).join('') +
      '-' +
      hex.slice(10, 16).join('')
    );
  }

  return 'line-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

function confirmarAgregarProducto() {
  const qty = parseInt(document.getElementById('m-prod-qty').innerText) || 1;
  const notas = document.getElementById('m-prod-notas').value.trim();

  const maxPermitido =
    productoEnModal && productoEnModal.max_porciones !== undefined
      ? productoEnModal.max_porciones
      : 999;

  if (qty > maxPermitido) {
    return alert(`⛔ Insumos insuficientes:\nSolo puedes agregar hasta ${maxPermitido} orden(es).`);
  }

  const modsNombres = modificadoresSeleccionados.map((m) => m.nombre);
  const extras = modificadoresSeleccionados.reduce((acc, m) => acc + m.precio, 0);

  let precioBase = parseFloat(productoEnModal.precio) || 0;
  let esPrecioVariable = false;
  let nombreFinal = productoEnModal.nombre;

  const inpCustomPrec = document.getElementById('m-prod-precio-custom');
  const inpCustomNom = document.getElementById('m-prod-nombre-custom');

  if (precioBase === 0 && !varianteSeleccionada && inpCustomPrec) {
    const customPrec = parseFloat(inpCustomPrec.value);
    if (isNaN(customPrec) || customPrec < 0) return alert('Ingrese un precio válido.');
    precioBase = customPrec;
    esPrecioVariable = true;

    if (inpCustomNom && inpCustomNom.value.trim() !== '') {
      nombreFinal = inpCustomNom.value.trim();
    }
  }

  if (varianteSeleccionada) {
    precioBase = parseFloat(varianteSeleccionada.precio) || 0;
    nombreFinal = `${productoEnModal.nombre} (${varianteSeleccionada.nombre})`;
  }

  const precioUnitarioFinal = precioBase + extras;

  const item = {
    kds_line_id:
      itemEditandoIndex !== null
        ? comandaLocal[itemEditandoIndex].kds_line_id || generarKdsLineId()
        : generarKdsLineId(),

    producto_id: productoEnModal.id,
    nombre: nombreFinal,
    precio_unitario: precioUnitarioFinal,
    cantidad: qty,

    numero_plato:
      itemEditandoIndex !== null
        ? comandaLocal[itemEditandoIndex].numero_plato || platoActual
        : platoActual,

    modificadores: modsNombres.join(', '),
    notas: notas,
    es_variable: esPrecioVariable,
  };

  if (itemEditandoIndex !== null) {
    comandaLocal[itemEditandoIndex] = item;
  } else {
    comandaLocal.push(item);
  }

  cerrarModalProducto();
  renderTicketBody();
  // La búsqueda permanece después de agregar un artículo.
  // Se limpia únicamente con la X del buscador o al salir del comandero.
}

function eliminarProductoDeComanda() {
  if (window.restaurantSettings?.pos.confirmRemove && !confirm('¿Quitar este producto?')) return;
  if (itemEditandoIndex !== null) {
    comandaLocal.splice(itemEditandoIndex, 1);
    cerrarModalProducto();
    renderTicketBody();
  }
}

function renderTicketBody() {
  const body = document.getElementById('ticket-body');
  body.innerHTML = '';

  let totalCalculado = 0;
  let totalItemsCount = 0;

  const platos = {};
  comandaLocal.forEach((it, idx) => {
    const p = it.numero_plato || 1;
    if (!platos[p]) platos[p] = [];
    platos[p].push({ ...it, originalIdx: idx });
  });

  Object.keys(platos)
    .sort((a, b) => Number(a) - Number(b))
    .forEach((pNum) => {
      body.innerHTML += `<div class="plato-divider" style="background:#24252B; padding:4px 8px; font-weight:700; color:#A8C7FA; border-radius:4px; margin:6px 0;">🍽️ PLATO ${pNum}</div>`;
      platos[pNum].forEach((it) => {
        const cant = Number(it.cantidad) || 1;
        const prec = Number(it.precio_unitario || it.precio) || 0;
        const sub = cant * prec;
        totalCalculado += sub;
        totalItemsCount += cant;

        body.innerHTML += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid #282828;">
          <div style="flex:1;">
            <div style="display:flex; align-items:center; gap:6px;">
              <strong style="color:#fff;">${cant}x ${it.nombre}</strong>
              <span class="material-icons-round" style="font-size:16px; color:#A8C7FA; cursor:pointer;" onclick="abrirModalConfigurarProducto(datosGlobales.productos.find(p=>p.id===${it.producto_id}) || {id:${it.producto_id}, nombre:'${it.nombre}', precio:${prec}}, ${it.originalIdx})">edit</span>
            </div>
            ${it.modificadores ? `<div style="font-size:0.75rem; color:#aaa;">+ ${it.modificadores}</div>` : ''}
            ${it.notas ? `<div style="font-size:0.75rem; color:#F2B8B5;">>> ${it.notas}</div>` : ''}
          </div>
          <div style="font-weight:900; color:#6DD58C;">$${sub.toFixed(2)}</div>
        </div>
      `;
      });
    });

  const formattedTotal = `$${totalCalculado.toFixed(2)}`;
  const formattedItems = `${totalItemsCount} ítems`;

  const idsTotal = ['txt-bar-total-mob', 'txt-bar-total', 'txt-total-mobile'];
  idsTotal.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerText = formattedTotal;
  });

  const idsItems = ['txt-bar-items-mob', 'txt-bar-items'];
  idsItems.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerText = formattedItems;
  });
}

function siguientePlato() {
  platoActual = platoActual + 1;
  actualizarBotonesPlato();
}

function actualizarBotonesPlato() {
  const texto = `Plato ${platoActual}`;
  const ids = [
    'txt-btn-plato',
    'txt-btn-plato-mobile',
    'txt-btn-plato-dock-mob',
    'txt-btn-plato-panel',
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerText = texto;
  });
}

function toggleDrawerComanda() {
  document.getElementById('ticket-drawer').classList.toggle('open');
  document.getElementById('ticket-overlay').classList.toggle('open');
}

async function marcharCocina() {
  if (comandaLocal.length === 0) {
    cerrarComandero();
    return;
  }

  const snapshotString = JSON.stringify(comandaInicialSnapshot);
  const actualString = JSON.stringify(comandaLocal);

  if (pedidoActivo && pedidoActivo.id && snapshotString === actualString) {
    cerrarComandero();
    return;
  }

  const total = comandaLocal.reduce(
    (acc, it) => acc + (Number(it.cantidad) || 1) * (Number(it.precio_unitario || it.precio) || 0),
    0,
  );
  const payload = {
    mesa: pedidoActivo.mesa_numero,
    expected_version: pedidoActivo.version,
    mesero: pedidoActivo.mesero || (usuarioSesion ? usuarioSesion.nombre : 'Mesero'),
    tipo_servicio: pedidoActivo.tipo_servicio || 'comedor',
    items: comandaLocal,
    total: total,
    cliente_id: pedidoActivo.cliente_id || null,
    cliente_nombre: pedidoActivo.cliente_nombre || null,
    cliente_telefono: pedidoActivo.cliente_telefono || null,
    direccion_entrega: pedidoActivo.direccion_entrega || null,
    referencias_entrega: pedidoActivo.referencias || pedidoActivo.referencias_entrega || null,
  };

  try {
    const res = await fetch('/api/pos/marchar-comanda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      cerrarComandero();
    } else {
      const err = await res.json();
      alert(`⚠️ ${err.error || 'Error al guardar comanda'}`);
    }
  } catch (err) {
    console.error('Error enviando comanda:', err);
  }
}

async function imprimirPrecuentaTermica() {
  if (comandaLocal.length === 0 || !pedidoActivo) return;

  const total = comandaLocal.reduce(
    (acc, it) => acc + (Number(it.cantidad) || 1) * (Number(it.precio_unitario || it.precio) || 0),
    0,
  );

  const tipoServicio = pedidoActivo.tipo_servicio || 'comedor';

  try {
    const res = await fetch('/api/pos/imprimir-precuenta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pedido_id: pedidoActivo.id || null,
        folio: pedidoActivo.id || null,
        mesa: pedidoActivo.mesa_numero,
        mesero: pedidoActivo.mesero || (usuarioSesion ? usuarioSesion.nombre : 'General'),
        tipo_servicio: tipoServicio,
        cliente_id: pedidoActivo.cliente_id || null,
        cliente_nombre: pedidoActivo.cliente_nombre || null,
        cliente_telefono: pedidoActivo.cliente_telefono || null,
        direccion_entrega: pedidoActivo.direccion_entrega || null,
        referencias_entrega:
          pedidoActivo.referencias_entrega ||
          pedidoActivo.referencias ||
          null,
        items: comandaLocal,
        total,
      }),
    });

    const result = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(result.error || 'No se pudo imprimir la precuenta');
    }

    if (tipoServicio === 'comedor') {
      cambiarZona('salon');
      cerrarComandero();
    }

    return result;
  } catch (err) {
    console.error('[precuenta]', err);
    alert(`⚠️ ${err.message || 'No se pudo imprimir la precuenta'}`);
  }
}


/* ============================================================
 * MP_POINT_UI_V1
 * MERCADO PAGO POINT · POS
 *
 * REGLAS:
 * - El navegador NUNCA declara un pago exitoso.
 * - Mercado Pago Point NO usa /api/pos/cobrar-cuenta.
 * - Sólo backend consulta Mercado Pago.
 * - Sólo finalize() puede cerrar el pedido.
 * - Cerrar/ocultar modal NO cancela el pago.
 * - Polling sólo mientras existe operación activa.
 * ============================================================ */

let metodoCobroSeleccionado = 'efectivo';

let pointOperacionActual = null;
let pointPollTimer = null;
let pointPollInicio = 0;
let pointPollEnCurso = false;
let pointFinalizando = false;


/* ------------------------------------------------------------
 * PERMISOS FRONTEND
 * ------------------------------------------------------------ */

function permisoMetodoCobro(metodo) {
  const p =
    window.restaurantSettings?.permissions || {};

  if (!p.charge)
    return false;

  const mapa = {
    efectivo: 'chargeCash',
    transferencia: 'chargeTransfer',
    // MP5_MANUAL_CARD_PERMISSION_UI_V1
    tarjeta_manual: 'chargeCard',
    tarjeta: 'chargePoint'
  };

  const permiso = mapa[metodo];

  if (!permiso)
    return false;

  return p[permiso] === true;
}


function buscarBotonMetodoCobro(metodo) {
  return Array.from(
    document.querySelectorAll(
      '#modal-cobro button'
    )
  ).find(btn => {
    const onclick =
      btn.getAttribute('onclick') || '';

    return onclick.includes(
      `seleccionarMetodoCobro('${metodo}'`
    );
  }) || null;
}


function aplicarPermisosMetodosCobro() {
  const metodos = [
    'efectivo',
    // MP5_MANUAL_CARD_METHOD_LIST_V1
    'tarjeta_manual',
    'tarjeta',
    'transferencia'
  ];

  let primeroDisponible = null;

  for (const metodo of metodos) {
    const btn =
      buscarBotonMetodoCobro(metodo);

    if (!btn)
      continue;

    btn.dataset.paymentMethod = metodo;

    const permitido =
      permisoMetodoCobro(metodo);

    btn.style.display =
      permitido ? '' : 'none';

    if (
      permitido &&
      !primeroDisponible
    ) {
      primeroDisponible = {
        metodo,
        btn
      };
    }
  }

  const split =
    document.getElementById(
      'btn-toggle-split-pay'
    );

  if (split) {
    split.style.display =
      window.restaurantSettings
        ?.permissions
        ?.chargeMixed === true
        ? ''
        : 'none';
  }

  const actual =
    buscarBotonMetodoCobro(
      metodoCobroSeleccionado
    );

  if (
    actual &&
    permisoMetodoCobro(
      metodoCobroSeleccionado
    )
  ) {
    seleccionarMetodoCobro(
      metodoCobroSeleccionado,
      actual
    );

    return true;
  }

  if (primeroDisponible) {
    seleccionarMetodoCobro(
      primeroDisponible.metodo,
      primeroDisponible.btn
    );

    return true;
  }

  return false;
}


/* ------------------------------------------------------------
 * PANEL DE TERMINAL
 * ------------------------------------------------------------ */

function asegurarPanelPoint() {
  let panel =
    document.getElementById(
      'point-terminal-panel'
    );

  if (panel)
    return panel;

  panel =
    document.createElement('div');

  panel.id =
    'point-terminal-panel';

  panel.style.cssText = [
    'display:none',
    'background:#18191f',
    'border:1px solid #333',
    'border-radius:12px',
    'padding:12px',
    'margin:10px 0'
  ].join(';');

  panel.innerHTML = `
    <div style="
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
      margin-bottom:8px;
    ">
      <strong style="color:#a8c7fa">
        Terminal Mercado Pago Point
      </strong>

      <button
        type="button"
        class="cat-btn"
        style="
          padding:5px 9px;
          font-size:.75rem;
        "
        onclick="cargarTerminalesPoint(true)"
      >
        Actualizar
      </button>
    </div>

    <select
      id="point-terminal-select"
      class="input-field"
      style="width:100%"
    >
      <option value="">
        Cargando terminales...
      </option>
    </select>

    <div
      id="point-terminal-info"
      style="
        margin-top:7px;
        font-size:.76rem;
        color:#aaa;
      "
    >
      Selecciona la Point donde se realizará
      el cobro.
    </div>
  `;

  const main =
    document.getElementById(
      'btn-ejecutar-cobro-main'
    );

  if (
    main &&
    main.parentElement
  ) {
    main.parentElement.insertBefore(
      panel,
      main
    );
  } else {
    const modal =
      document.querySelector(
        '#modal-cobro .modal-box'
      );

    modal?.appendChild(panel);
  }

  return panel;
}


async function cargarTerminalesPoint(
  force = false
) {
  const panel =
    asegurarPanelPoint();

  const select =
    document.getElementById(
      'point-terminal-select'
    );

  const info =
    document.getElementById(
      'point-terminal-info'
    );

  if (!select)
    return [];

  if (
    !force &&
    select.dataset.loaded === '1'
  ) {
    return [];
  }

  select.disabled = true;
  select.innerHTML =
    '<option value="">Cargando terminales...</option>';

  if (info)
    info.textContent =
      'Consultando terminales disponibles...';

  try {
    const res =
      await fetch(
        '/api/mercadopago/terminals',
        {
          cache: 'no-store'
        }
      );

    const data =
      await res.json()
        .catch(() => ({}));

    if (!res.ok) {
      throw new Error(
        data.error ||
        'No se pudieron consultar las terminales'
      );
    }

    let terminales =
      Array.isArray(data.detected)
        ? [...data.detected]
        : [];

    if (data.virtual_terminal) {
      const virtual =
        data.virtual_terminal;

      const vid =
        virtual.terminal_id ||
        virtual.id;

      if (
        vid &&
        !terminales.some(t =>
          String(
            t.terminal_id || t.id
          ) === String(vid)
        )
      ) {
        terminales.push(virtual);
      }
    }

    terminales =
      terminales.filter(
        t => t.activo !== false
      );

    select.innerHTML = '';

    if (!terminales.length) {
      select.innerHTML =
        '<option value="">No hay terminales disponibles</option>';

      if (info)
        info.textContent =
          'No se detectaron terminales Point activas.';

      return [];
    }

    for (const t of terminales) {
      const id =
        t.terminal_id ||
        t.id;

      if (!id)
        continue;

      const alias =
        t.alias ||
        t.name ||
        t.external_pos_id ||
        id;

      const option =
        document.createElement(
          'option'
        );

      option.value =
        String(id);

      option.textContent =
        String(alias);

      option.dataset.alias =
        String(alias);

      select.appendChild(option);
    }

    select.dataset.loaded = '1';

    if (info) {
      const entorno =
        String(
          data.environment || ''
        ).toUpperCase();

      info.textContent =
        `${select.options.length} terminal(es)` +
        (
          entorno
            ? ` · Entorno ${entorno}`
            : ''
        );
    }

    return terminales;

  } catch (err) {
    select.innerHTML =
      '<option value="">Error consultando terminales</option>';

    if (info)
      info.textContent =
        err.message;

    throw err;

  } finally {
    select.disabled = false;
  }
}


/* ------------------------------------------------------------
 * MODAL DE ESTADO POINT
 * ------------------------------------------------------------ */

function asegurarModalPoint() {
  let modal =
    document.getElementById(
      'modal-point-cobro'
    );

  if (modal)
    return modal;

  modal =
    document.createElement('div');

  modal.id =
    'modal-point-cobro';

  modal.className =
    'modal-overlay';

  modal.style.display =
    'none';

  modal.innerHTML = `
    <div
      class="modal-box"
      style="max-width:460px"
    >
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:10px;
      ">
        <div>
          <div style="
            font-size:.72rem;
            color:#888;
            text-transform:uppercase;
          ">
            Mercado Pago Point
          </div>

          <h3
            id="point-status-title"
            style="
              margin:3px 0 0 0;
              color:#a8c7fa;
            "
          >
            Preparando cobro...
          </h3>
        </div>

        <div
          id="point-status-time"
          style="
            color:#aaa;
            font-variant-numeric:tabular-nums;
            font-weight:700;
          "
        >
          00:00
        </div>
      </div>

      <div style="
        background:#18191f;
        border:1px solid #333;
        border-radius:12px;
        padding:14px;
        margin:14px 0;
      ">
        <div style="
          display:flex;
          justify-content:space-between;
          gap:12px;
        ">
          <span style="color:#aaa">
            Importe
          </span>

          <strong
            id="point-status-amount"
            style="
              color:#6dd58c;
              font-size:1.25rem;
            "
          >
            $0.00
          </strong>
        </div>

        <div style="
          display:flex;
          justify-content:space-between;
          gap:12px;
          margin-top:7px;
        ">
          <span style="color:#aaa">
            Pedido
          </span>

          <strong
            id="point-status-order"
            style="text-align:right"
          >
            -
          </strong>
        </div>

        <div style="
          display:flex;
          justify-content:space-between;
          gap:12px;
          margin-top:7px;
        ">
          <span style="color:#aaa">
            Terminal
          </span>

          <strong
            id="point-status-terminal"
            style="text-align:right"
          >
            -
          </strong>
        </div>
      </div>

      <div
        id="point-status-message"
        style="
          min-height:54px;
          padding:12px;
          border-radius:10px;
          background:#202127;
          color:#ddd;
          line-height:1.35;
        "
      >
        Preparando operación...
      </div>

      <div
        id="point-status-warning"
        style="
          display:none;
          margin-top:10px;
          padding:10px;
          border-radius:8px;
          background:#3a2d18;
          color:#ffd180;
          font-size:.8rem;
        "
      ></div>

      <div style="
        display:flex;
        justify-content:flex-end;
        gap:8px;
        margin-top:14px;
        flex-wrap:wrap;
      ">
        <button
          type="button"
          class="cat-btn"
          id="btn-point-retry"
          onclick="reintentarCobroPointSeguro()"
          style="display:none"
        >
          Reintentar cobro
        </button>

        <button
          type="button"
          class="cat-btn"
          id="btn-point-check"
          onclick="revisarEstadoPointManual()"
          style="display:none"
        >
          Revisar estado
        </button>

        <button
          type="button"
          class="cat-btn"
          onclick="ocultarModalPoint()"
        >
          Ocultar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(
    modal
  );

  return modal;
}


function abrirModalEstadoPoint(
  operation = null
) {
  const modal =
    asegurarModalPoint();

  modal.style.display =
    'flex';

  if (operation)
    actualizarModalPoint(operation);
}


function ocultarModalPoint() {
  const modal =
    document.getElementById(
      'modal-point-cobro'
    );

  if (modal)
    modal.style.display = 'none';

  /*
   * IMPORTANTE:
   * ocultar NO cancela la operación
   * ni detiene el backend.
   */
}


function referenciaPedidoPoint() {
  if (!pedidoActivo)
    return '-';

  if (
    [
      'delivery',
      'para_llevar',
      'takeout'
    ].includes(
      pedidoActivo.tipo_servicio
    )
  ) {
    return (
      pedidoActivo.cliente_nombre ||
      pedidoActivo.mesa_numero ||
      `Pedido ${pedidoActivo.id}`
    );
  }

  return (
    pedidoActivo.mesa_numero ||
    `Pedido ${pedidoActivo.id}`
  );
}


function formatoTiempoPoint() {
  if (!pointPollInicio)
    return '00:00';

  const sec =
    Math.max(
      0,
      Math.floor(
        (
          Date.now() -
          pointPollInicio
        ) / 1000
      )
    );

  const min =
    Math.floor(sec / 60);

  const rest =
    sec % 60;

  return (
    String(min).padStart(2, '0') +
    ':' +
    String(rest).padStart(2, '0')
  );
}


function actualizarRelojPoint() {
  const el =
    document.getElementById(
      'point-status-time'
    );

  if (el)
    el.textContent =
      formatoTiempoPoint();
}


/*
 * MP_POINT_RETRY_SAFE_V2
 *
 * El detalle útil del rechazo viene del pago
 * y backend lo expone como payment_status_detail.
 */
function detalleRechazoPoint(op) {
  return String(
    op?.payment_status_detail ||
    op?.error_codigo ||
    op?.status_detail ||
    ''
  )
    .trim()
    .toLowerCase();
}


function mensajeRechazoPoint(op) {
  const detail =
    detalleRechazoPoint(op);

  const mensajes = {
    bad_filled_card_data:
      'Los datos de la tarjeta no pudieron validarse. Revisa la tarjeta o intenta con otra.',

    max_attempts_exceeded:
      'Se alcanzó el máximo de intentos permitido. Usa otra tarjeta o medio de pago.',

    amount_limit_exceeded:
      'El monto supera el límite permitido por la tarjeta o por el emisor. Usa otra tarjeta o medio de pago.',

    insufficient_amount:
      'La tarjeta no tiene fondos suficientes para completar el pago.',

    card_insufficient_amount:
      'La tarjeta no tiene fondos suficientes para completar el pago.',

    card_disabled:
      'La tarjeta está deshabilitada o bloqueada. Usa otra tarjeta o consulta con el banco.',

    rejected_by_issuer:
      'El banco emisor rechazó la operación. El cliente puede intentar con otra tarjeta o consultar con su banco.',

    required_call_for_authorize:
      'El banco requiere autorización adicional. El cliente debe contactar a su banco o usar otra tarjeta.',

    high_risk:
      'El pago fue rechazado por controles de seguridad. Usa otro medio de pago o revisa la operación antes de intentarlo nuevamente.',

    processing_error:
      'Mercado Pago tuvo un error de procesamiento. Puedes realizar un nuevo intento seguro.',

    invalid_installments:
      'La configuración de cuotas no fue aceptada. Intenta nuevamente con una opción válida.',

    rejected_other_reason:
      'El pago fue rechazado por el emisor. Intenta con otra tarjeta o medio de pago.',

    cc_rejected_other_reason:
      'El pago fue rechazado por el emisor. Intenta con otra tarjeta o medio de pago.'
  };

  return (
    mensajes[detail] ||
    'Mercado Pago informó que el pago no fue aprobado. La cuenta permanece abierta y puedes realizar un nuevo intento.'
  );
}


function textoEstadoPoint(op) {
  switch (op?.estado_local) {
    case 'creando':
      return {
        title:
          'Preparando cobro...',
        message:
          'Restaurant Suite está preparando la operación.'
      };

    case 'pendiente':
      return {
        title:
          'Cobro enviado',
        message:
          'La operación fue creada. Esperando que la terminal reciba el cobro.'
      };

    case 'en_terminal':
      return {
        title:
          'Esperando pago en terminal...',
        message:
          'El cliente puede realizar el pago en la Point seleccionada.'
      };

    case 'confirmada':
      return {
        title:
          'Pago aprobado',
        message:
          'Mercado Pago confirmó el pago. Registrándolo en Restaurant Suite...'
      };

    case 'finalizada':
      return {
        title:
          'Pago aprobado',
        message:
          'Pago registrado correctamente. La cuenta quedó liquidada.'
      };

    case 'fallida':
      return {
        title:
          'Pago no aprobado',
        message:
          mensajeRechazoPoint(op)
      };

    case 'cancelada':
      return {
        title:
          'Cobro cancelado',
        message:
          'La operación fue cancelada. La cuenta permanece abierta.'
      };

    case 'expirada':
      return {
        title:
          'Cobro expirado',
        message:
          'La operación expiró. La cuenta permanece abierta.'
      };

    case 'requiere_accion':
      return {
        title:
          'Requiere intervención',
        message:
          'Mercado Pago requiere una acción adicional. No inicies otro cobro hasta resolver esta operación.'
      };

    case 'incierta':
      return {
        title:
          'Estado sin confirmar',
        message:
          'No podemos confirmar todavía el resultado. No vuelvas a cobrar hasta reconciliar esta operación.'
      };

    default:
      return {
        title:
          'Consultando estado...',
        message:
          'Verificando la operación con el servidor.'
      };
  }
}


function actualizarModalPoint(op) {
  if (!op)
    return;

  pointOperacionActual = op;

  /*
   * MP-4B:
   * mostrar/ocultar Cancelar según
   * estado y permiso pointCancel.
   */
  setTimeout(
    () =>
      actualizarBotonCancelarPointV2(
        op
      ),
    0
  );

  const estado =
    textoEstadoPoint(op);

  const title =
    document.getElementById(
      'point-status-title'
    );

  const message =
    document.getElementById(
      'point-status-message'
    );

  const amount =
    document.getElementById(
      'point-status-amount'
    );

  const order =
    document.getElementById(
      'point-status-order'
    );

  const terminal =
    document.getElementById(
      'point-status-terminal'
    );

  const check =
    document.getElementById(
      'btn-point-check'
    );

  const retry =
    document.getElementById(
      'btn-point-retry'
    );

  if (title)
    title.textContent =
      estado.title;

  if (message)
    message.textContent =
      estado.message;

  if (amount) {
    amount.textContent =
      `$${Number(
        op.monto ||
        totalOriginalCobro ||
        0
      ).toFixed(2)}`;
  }

  if (order)
    order.textContent =
      referenciaPedidoPoint();

  if (terminal) {
    terminal.textContent =
      op.terminal_alias ||
      op.terminal_id ||
      '-';
  }

  if (check) {
    check.style.display =
      [
        'pendiente',
        'en_terminal',
        'incierta',
        'requiere_accion',
        'confirmada'
      ].includes(
        op.estado_local
      )
        ? ''
        : 'none';
  }

  /*
   * Sólo estados definitivamente terminados
   * permiten generar otro cobro.
   *
   * incierta / pendiente / en_terminal /
   * requiere_accion / confirmada NO permiten retry.
   */
  if (retry) {
    retry.style.display =
      [
        'fallida',
        'cancelada',
        'expirada',
        'error'
      ].includes(
        op.estado_local
      )
        ? ''
        : 'none';

    retry.disabled = false;
  }

  actualizarRelojPoint();

  /* MP_POINT_AUTOCLOSE_SUCCESS_V1
   *
   * Un pago sólo cierra automáticamente el modal cuando
   * Restaurant Suite ya lo marcó como FINALIZADO.
   *
   * No cerramos en confirmada, processed intermedio,
   * pendiente ni en_terminal.
   *
   * El ID de operación protege contra un temporizador
   * antiguo que pudiera coincidir con un cobro posterior.
   */
  if (
    op.estado_local === 'finalizada'
  ) {
    const modal =
      document.getElementById(
        'modal-point-cobro'
      );

    const operationKey =
      String(op.id ?? '');

    if (
      modal &&
      operationKey &&
      modal.dataset
        .pointAutoCloseOperation !==
        operationKey
    ) {
      modal.dataset
        .pointAutoCloseOperation =
        operationKey;

      setTimeout(
        () => {
          const actual =
            pointOperacionActual;

          if (
            actual &&
            String(actual.id ?? '') ===
              operationKey &&
            actual.estado_local ===
              'finalizada'
          ) {
            ocultarModalPoint();
          }
        },
        1500
      );
    }
  }
}


/* ------------------------------------------------------------
 * POLLING ACOTADO
 * ------------------------------------------------------------ */

function detenerPollingPoint() {
  if (pointPollTimer) {
    clearTimeout(
      pointPollTimer
    );

    pointPollTimer = null;
  }
}


function siguienteEsperaPoint() {
  const elapsed =
    Date.now() -
    pointPollInicio;

  if (elapsed < 15000)
    return 2000;

  if (elapsed < 45000)
    return 3000;

  if (elapsed < 90000)
    return 5000;

  if (elapsed < 120000)
    return 8000;

  return null;
}


function programarPollingPoint() {
  detenerPollingPoint();

  const espera =
    siguienteEsperaPoint();

  if (espera === null) {
    const warning =
      document.getElementById(
        'point-status-warning'
      );

    if (warning) {
      warning.style.display =
        'block';

      warning.textContent =
        'La verificación automática se detuvo para evitar consultas indefinidas. El cobro sigue guardado. Usa “Revisar estado” antes de intentar cobrar nuevamente.';
    }

    const check =
      document.getElementById(
        'btn-point-check'
      );

    if (check)
      check.style.display = '';

    return;
  }

  pointPollTimer =
    setTimeout(
      () => reconciliarOperacionPoint(),
      espera
    );
}


/* ------------------------------------------------------------
 * RECONCILIACION
 * ------------------------------------------------------------ */

async function reconciliarOperacionPoint(
  manual = false
) {
  const op =
    pointOperacionActual;

  if (!op?.id)
    return;

  if (pointPollEnCurso)
    return;

  pointPollEnCurso = true;

  try {
    /* MP_POINT_LOCAL_POLLING_V1
     *
     * Polling automático:
     *   sólo consulta el estado LOCAL.
     *
     * Revisión manual:
     *   permite una conciliación puntual con MP.
     */
    const operationUrl =
      `/api/mercadopago/operations/${encodeURIComponent(op.id)}`;

    const res =
      manual
        ? await fetch(
            `${operationUrl}/reconcile`,
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json'
              },
              body: '{}'
            }
          )
        : await fetch(
            operationUrl,
            {
              method: 'GET',
              cache: 'no-store'
            }
          );

    const data =
      await res.json()
        .catch(() => ({}));

    if (!res.ok) {
      throw new Error(
        data.error ||
        'No se pudo verificar el pago'
      );
    }

    if (data.operation) {
      pointOperacionActual =
        data.operation;

      actualizarModalPoint(
        data.operation
      );
    }

    const estado =
      pointOperacionActual
        ?.estado_local;

    if (
      [
        'confirmada',
        'finalizada'
      ].includes(estado)
    ) {
      detenerPollingPoint();

      /*
       * Si backend ya la finalizó, finalize()
       * es idempotente y sirve para sincronizar
       * pedido + interfaz del POS.
       */
      await finalizarCobroPoint();

      return;
    }

    if (
      [
        'fallida',
        'cancelada',
        'expirada'
      ].includes(estado)
    ) {
      detenerPollingPoint();
      return;
    }

    if (
      estado === 'incierta' &&
      !pointOperacionActual
        ?.mp_order_id
    ) {
      detenerPollingPoint();

      const warning =
        document.getElementById(
          'point-status-warning'
        );

      if (warning) {
        warning.style.display =
          'block';

        warning.textContent =
          'La operación quedó en estado incierto y todavía no existe un ID de order confirmado. No inicies otro cobro.';
      }

      return;
    }

    if (!manual)
      programarPollingPoint();

  } catch (err) {
    /*
     * Error de red ≠ pago fallido.
     */
    const warning =
      document.getElementById(
        'point-status-warning'
      );

    if (warning) {
      warning.style.display =
        'block';

      warning.textContent =
        `No se pudo confirmar el estado: ${err.message}. No vuelvas a cobrar hasta verificarlo.`;
    }

    if (!manual)
      programarPollingPoint();

  } finally {
    pointPollEnCurso = false;
  }
}


async function revisarEstadoPointManual() {
  const warning =
    document.getElementById(
      'point-status-warning'
    );

  if (warning)
    warning.style.display = 'none';

  await reconciliarOperacionPoint(
    true
  );
}


/* ------------------------------------------------------------
 * FINALIZE EXACTLY-ONCE
 * ------------------------------------------------------------ */

async function finalizarCobroPoint() {
  if (
    !pointOperacionActual?.id ||
    pointFinalizando
  ) {
    return;
  }

  pointFinalizando = true;

  try {
    const res =
      await fetch(
        `/api/mercadopago/operations/${encodeURIComponent(pointOperacionActual.id)}/finalize`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json'
          },
          body: '{}'
        }
      );

    const data =
      await res.json()
        .catch(() => ({}));

    if (!res.ok) {
      throw new Error(
        data.error ||
        'Mercado Pago aprobó el pago, pero Restaurant Suite todavía no pudo liquidar la cuenta'
      );
    }

    if (data.operation) {
      pointOperacionActual =
        data.operation;

      actualizarModalPoint(
        data.operation
      );
    }

    detenerPollingPoint();

    const cobradoId =
      pedidoActivo?.id ||
      data.pedido?.id ||
      pointOperacionActual
        ?.pedido_id;

    if (cobradoId) {
      datosGlobales.pedidosAbiertos =
        (
          datosGlobales
            .pedidosAbiertos || []
        ).filter(
          p =>
            Number(p.id) !==
            Number(cobradoId)
        );
    }

    document.getElementById(
      'modal-cobro'
    ).style.display = 'none';

    pedidoActivo = null;
    comandaLocal = [];
    comandaInicialSnapshot = [];

    if (
      document.getElementById(
        'vista-comandero'
      )?.classList
        .contains('split-active')
    ) {
      cerrarComandero();

    } else if (
      zonaActual === 'salon'
    ) {
      renderPlanoSalon();

    } else {
      renderPedidosEspeciales();
    }

    cargarDatos();

  } catch (err) {
    const warning =
      document.getElementById(
        'point-status-warning'
      );

    if (warning) {
      warning.style.display =
        'block';

      warning.textContent =
        `El pago está confirmado, pero falta completar el registro local: ${err.message}. NO vuelvas a cobrar.`;
    }

  } finally {
    pointFinalizando = false;
  }
}


/* ------------------------------------------------------------
 * REINTENTO POINT SEGURO
 * ------------------------------------------------------------ */

async function reintentarCobroPointSeguro() {
  const anterior =
    pointOperacionActual;

  const estadosReintentables =
    new Set([
      'fallida',
      'cancelada',
      'expirada',
      'error'
    ]);

  if (
    !anterior?.id ||
    !estadosReintentables.has(
      anterior.estado_local
    )
  ) {
    return alert(
      'Esta operación todavía no tiene un resultado definitivo. Revisa su estado antes de intentar otro cobro.'
    );
  }

  if (
    !pedidoActivo?.id ||
    Number(pedidoActivo.id) !==
      Number(anterior.pedido_id)
  ) {
    return alert(
      'El pedido activo ya no coincide con la operación Point. Vuelve a abrir la cuenta antes de reintentar.'
    );
  }

  const retry =
    document.getElementById(
      'btn-point-retry'
    );

  if (retry)
    retry.disabled = true;

  try {
    /*
     * Antes de crear otra intención comprobamos
     * exclusivamente el estado LOCAL del backend.
     *
     * Si existe una operación activa, no generamos
     * un segundo cobro.
     */
    const res =
      await fetch(
        `/api/mercadopago/orders/${encodeURIComponent(
          pedidoActivo.id
        )}/active`,
        {
          method: 'GET',
          cache: 'no-store'
        }
      );

    const data =
      await res.json()
        .catch(() => ({}));

    if (!res.ok) {
      throw new Error(
        data.error ||
        'No fue posible comprobar si existe otro cobro Point activo.'
      );
    }

    if (data.operation) {
      pointOperacionActual =
        data.operation;

      actualizarModalPoint(
        data.operation
      );

      return alert(
        'Ya existe una operación Point activa para esta cuenta. No se creó un segundo cobro.'
      );
    }

    /*
     * Sólo después de comprobar que:
     *
     * - el intento anterior terminó;
     * - seguimos en el mismo pedido;
     * - no existe otra operación activa;
     *
     * descartamos el request_id anterior.
     */
    detenerPollingPoint();

    resetPointRequestIntent();

    pointOperacionActual = null;

    const warning =
      document.getElementById(
        'point-status-warning'
      );

    if (warning) {
      warning.style.display =
        'none';

      warning.textContent =
        '';
    }

    await iniciarCobroPoint();

  } catch (err) {
    const warning =
      document.getElementById(
        'point-status-warning'
      );

    if (warning) {
      warning.style.display =
        'block';

      warning.textContent =
        `No se inició otro cobro: ${err.message}`;
    }

  } finally {
    if (retry)
      retry.disabled = false;
  }
}


/* ------------------------------------------------------------
 * CREAR COBRO POINT
 * ------------------------------------------------------------ */

async function iniciarCobroPoint() {
  if (
    !permisoMetodoCobro(
      'tarjeta'
    )
  ) {
    return alert(
      '⛔ No tienes permiso para cobrar con Mercado Pago Point.'
    );
  }

  if (!pedidoActivo?.id) {
    return alert(
      'No hay un pedido activo para cobrar.'
    );
  }

  if (modoSplitPaymentActivo) {
    return alert(
      'El pago mixto con Point todavía no está habilitado. Usa cobro completo con tarjeta.'
    );
  }

  /*
   * MP_POINT_DISCOUNT_FRONTEND_V2
   *
   * El frontend sólo enviará descuento_id.
   * El backend recalcula subtotal, descuento
   * y total de manera autoritativa.
   */
  const descuento =
    document.getElementById(
      'cobro-descuento'
    )?.value || null;

  const select =
    document.getElementById(
      'point-v2-terminal-select'
    ) ||
    document.getElementById(
      'point-terminal-select'
    );

  if (!select?.value) {
    return alert(
      'Selecciona una terminal Mercado Pago Point.'
    );
  }

  const terminalId =
    select.value;

  const terminalAlias =
    select.selectedOptions?.[0]
      ?.dataset?.alias ||
    select.selectedOptions?.[0]
      ?.textContent ||
    terminalId;

  const pointPedidoId =
      pedidoActivo.id;

    const requestId =
      pointRequestIdFor(
        pointPedidoId,
        terminalId
      );

  pointPollInicio =
    Date.now();

  asegurarModalPoint();

  document.getElementById(
    'point-status-title'
  ).textContent =
    'Enviando a Point...';

  document.getElementById(
    'point-status-message'
  ).textContent =
    'Restaurant Suite está creando el cobro en Mercado Pago.';

  document.getElementById(
    'point-status-amount'
  ).textContent =
    `$${Number(
      totalOriginalCobro
    ).toFixed(2)}`;

  document.getElementById(
    'point-status-order'
  ).textContent =
    referenciaPedidoPoint();

  document.getElementById(
    'point-status-terminal'
  ).textContent =
    terminalAlias;

  document.getElementById(
    'point-status-warning'
  ).style.display =
    'none';

  abrirModalEstadoPoint();

  const main =
    document.getElementById(
      'btn-ejecutar-cobro-main'
    );

  if (main)
      main.disabled = true;

    /*
     * Sólo liberaremos el request_id después de
     * confirmar que el backend no dejó una operación
     * Point activa.
     */
    let pointCreateResponseReceived =
      false;

    try {
      /*
       * IMPORTANTE:
     * NO enviamos total desde el navegador.
     * Backend calcula/valida el importe.
     */
    const res =
      await fetch(
        '/api/mercadopago/orders',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json'
          },
          body: JSON.stringify({
        pedido_id:
          pedidoActivo.id,

        terminal_id:
          terminalId,

        request_id:
          requestId,

        /*
         * Sólo enviamos el ID.
         * El navegador NO envía el monto
         * del descuento ni el total.
         */
        descuento_id:
          descuento
      })
        }
      );

    pointCreateResponseReceived =
        true;

      const data =
        await res.json()
          .catch(() => ({}));

      /*
       * 202 puede representar creación
     * incierta que DEBE conservarse.
     */
    if (
      !res.ok &&
      res.status !== 202
    ) {
      throw new Error(
        data.error ||
        'No se pudo enviar el cobro a Point'
      );
    }

    if (!data.operation) {
      throw new Error(
        'El backend no devolvió la operación Point.'
      );
    }

    pointOperacionActual =
      data.operation;

    actualizarModalPoint(
      data.operation
    );

    const estado =
      data.operation
        .estado_local;

    if (
      estado === 'confirmada'
    ) {
      await finalizarCobroPoint();
      return;
    }

    if (
      [
        'fallida',
        'cancelada',
        'expirada'
      ].includes(estado)
    ) {
      return;
    }

    if (
      estado === 'incierta' &&
      !data.operation.mp_order_id
    ) {
      const warning =
        document.getElementById(
          'point-status-warning'
        );

      if (warning) {
        warning.style.display =
          'block';

        warning.textContent =
          'No podemos confirmar si Mercado Pago recibió la creación. No intentes un segundo cobro.';
      }

      return;
    }

    programarPollingPoint();

  } catch (err) {
      /*
       * Una respuesta HTTP definitiva puede haber creado
       * una operación local en estado error.
       *
       * Consultamos solamente nuestro backend local.
       * Si no existe operación activa para este pedido,
       * el siguiente intento debe usar request_id nuevo.
       *
       * Si esta comprobación falla, conservamos la clave.
       */
      if (pointCreateResponseReceived) {
        try {
          const activeRes =
            await fetch(
              `/api/mercadopago/orders/${encodeURIComponent(
                pointPedidoId
              )}/active`,
              {
                cache: 'no-store'
              }
            );

          const activeData =
            await activeRes.json()
              .catch(() => ({}));

          if (
            activeRes.ok &&
            activeData.operation
          ) {
            pointOperacionActual =
              activeData.operation;

            actualizarModalPoint(
              activeData.operation
            );
          } else if (activeRes.ok) {
            resetPointRequestIntent();
          }
        } catch {
          /*
           * Estado local no confirmado:
           * conservamos request_id por seguridad.
           */
        }
      }

      const warning =
        document.getElementById(
          'point-status-warning'
        );

    if (warning) {
      warning.style.display =
        'block';

      warning.textContent =
        err.message;
    }

    const title =
      document.getElementById(
        'point-status-title'
      );

    if (title)
      title.textContent =
        'No se pudo iniciar el cobro';

  } finally {
    if (main)
      main.disabled = false;
  }
}


/* ------------------------------------------------------------
 * RECUPERAR OPERACION ACTIVA AL REABRIR PEDIDO
 * ------------------------------------------------------------ */

async function restaurarOperacionPointPedido(
  pedidoId
) {
  if (
    !pedidoId ||
    !permisoMetodoCobro('tarjeta')
  ) {
    return null;
  }

  try {
    const res =
      await fetch(
        `/api/mercadopago/orders/${encodeURIComponent(pedidoId)}/active`,
        {
          cache: 'no-store'
        }
      );

    const data =
      await res.json()
        .catch(() => ({}));

    if (!res.ok)
      return null;

    if (!data.operation)
      return null;

    pointOperacionActual =
      data.operation;

    const fecha =
      data.operation.creada_en
        ? new Date(
            data.operation.creada_en
          ).getTime()
        : Date.now();

    pointPollInicio =
      Number.isFinite(fecha)
        ? fecha
        : Date.now();

    abrirModalEstadoPoint(
      data.operation
    );

    const estado =
      data.operation
        .estado_local;

    if (
      estado === 'confirmada'
    ) {
      await finalizarCobroPoint();

    } else if (
      [
        'pendiente',
        'en_terminal',
        'requiere_accion'
      ].includes(estado)
    ) {
      programarPollingPoint();
    }

    return data.operation;

  } catch (err) {
    console.warn(
      '[Point] No se pudo restaurar operación:',
      err.message
    );

    return null;
  }
}



/* ============================================================
 * MP_POINT_DEDICATED_MODAL_V2
 * MODAL EXCLUSIVO PARA COBRO CON TARJETA
 * ============================================================ */

let pointCancelando = false;


function asegurarModalPreparacionPoint() {
  let modal =
    document.getElementById(
      'modal-point-preparar'
    );

  if (modal)
    return modal;

  modal =
    document.createElement('div');

  modal.id =
    'modal-point-preparar';

  modal.className =
    'modal-overlay';

  modal.style.display =
    'none';

  modal.innerHTML = `
    <div
      class="modal-box"
      style="
        max-width:520px;
        width:min(92vw,520px);
        padding:22px;
      "
    >
      <div style="
        display:flex;
        align-items:center;
        gap:12px;
        margin-bottom:18px;
      ">
        <div style="
          width:46px;
          height:46px;
          border-radius:14px;
          background:#1f3a32;
          display:flex;
          align-items:center;
          justify-content:center;
          flex:0 0 auto;
        ">
          <span
            class="material-icons-round"
            style="
              color:#6dd58c;
              font-size:27px;
            "
          >
            credit_card
          </span>
        </div>

        <div>
          <div style="
            color:#888;
            font-size:.72rem;
            font-weight:700;
            letter-spacing:.08em;
            text-transform:uppercase;
          ">
            Mercado Pago Point
          </div>

          <h2 style="
            margin:2px 0 0;
            font-size:1.35rem;
            color:#fff;
          ">
            Cobro con tarjeta
          </h2>
        </div>
      </div>

      <div style="
        background:#18191f;
        border:1px solid #30323a;
        border-radius:14px;
        padding:16px;
        margin-bottom:16px;
      ">
        <div style="
          color:#999;
          font-size:.78rem;
        ">
          Total a cobrar
        </div>

        <div
          id="point-prep-amount"
          style="
            color:#6dd58c;
            font-size:2.15rem;
            line-height:1.1;
            font-weight:900;
            margin-top:3px;
          "
        >
          $0.00
        </div>

        <div
          id="point-prep-order"
          style="
            color:#aaa;
            font-size:.83rem;
            margin-top:8px;
          "
        >
          -
        </div>
      </div>

      <label
        for="point-v2-terminal-select"
        style="
          display:block;
          color:#ccc;
          font-size:.82rem;
          font-weight:700;
          margin-bottom:7px;
        "
      >
        ¿En qué terminal deseas cobrar?
      </label>

      <div style="
        display:flex;
        gap:8px;
        align-items:stretch;
      ">
        <select
          id="point-v2-terminal-select"
          class="input-field"
          style="
            flex:1 1 auto;
            min-width:0;
            height:46px;
            margin:0;
          "
        >
          <option value="">
            Cargando terminales...
          </option>
        </select>

        <button
          type="button"
          class="cat-btn"
          title="Actualizar terminales"
          onclick="cargarTerminalesPointV2(true)"
          style="
            width:46px;
            height:46px;
            padding:0;
            flex:0 0 46px;
            display:flex;
            align-items:center;
            justify-content:center;
          "
        >
          <span
            class="material-icons-round"
            style="font-size:20px"
          >
            refresh
          </span>
        </button>
      </div>

      <div
        id="point-v2-terminal-info"
        style="
          min-height:20px;
          color:#888;
          font-size:.76rem;
          margin-top:7px;
        "
      >
        Selecciona la Point que utilizará el cliente.
      </div>

      <div style="
        display:grid;
        grid-template-columns:1fr 1.35fr;
        gap:10px;
        margin-top:20px;
      ">
        <button
          type="button"
          class="cat-btn"
          onclick="volverModalCobroDesdePoint()"
          style="
            min-height:46px;
            padding:9px 12px;
          "
        >
          Volver
        </button>

        <button
          type="button"
          id="btn-point-v2-send"
          class="md-btn md-btn-primary"
          onclick="enviarCobroPointDesdeModal()"
          style="
            min-height:46px;
            padding:9px 14px;
            background:#2e7d32;
            font-weight:900;
          "
        >
          ENVIAR COBRO
        </button>
      </div>

      <div style="
        color:#777;
        font-size:.7rem;
        text-align:center;
        margin-top:12px;
        line-height:1.35;
      ">
        La cuenta sólo se liquidará cuando
        Mercado Pago confirme el pago.
      </div>
    </div>
  `;

  document.body.appendChild(
    modal
  );

  return modal;
}


async function cargarTerminalesPointV2(
  force = false
) {
  asegurarModalPreparacionPoint();

  const select =
    document.getElementById(
      'point-v2-terminal-select'
    );

  const info =
    document.getElementById(
      'point-v2-terminal-info'
    );

  if (!select)
    return [];

  if (
    !force &&
    select.dataset.loaded === '1'
  ) {
    return [];
  }

  select.disabled = true;

  select.innerHTML =
    '<option value="">Cargando terminales...</option>';

  if (info)
    info.textContent =
      'Consultando terminales...';

  try {
    const res =
      await fetch(
        '/api/mercadopago/terminals',
        {
          cache: 'no-store'
        }
      );

    const data =
      await res.json()
        .catch(() => ({}));

    if (!res.ok) {
      throw new Error(
        data.error ||
        'No se pudieron consultar las terminales.'
      );
    }

    let terminales =
      Array.isArray(data.detected)
        ? [...data.detected]
        : [];

    if (data.virtual_terminal) {
      const virtual =
        data.virtual_terminal;

      const virtualId =
        virtual.terminal_id ||
        virtual.id;

      if (
        virtualId &&
        !terminales.some(
          t =>
            String(
              t.terminal_id ||
              t.id
            ) ===
            String(virtualId)
        )
      ) {
        terminales.push(
          virtual
        );
      }
    }

    terminales =
      terminales.filter(
        t => t.activo !== false
      );

    select.innerHTML = '';

    for (const t of terminales) {
      const id =
        t.terminal_id ||
        t.id;

      if (!id)
        continue;

      const alias =
        t.alias ||
        t.name ||
        t.external_pos_id ||
        id;

      const option =
        document.createElement(
          'option'
        );

      option.value =
        String(id);

      option.textContent =
        String(alias);

      option.dataset.alias =
        String(alias);

      select.appendChild(
        option
      );
    }

    if (!select.options.length) {
      select.innerHTML =
        '<option value="">Sin terminales disponibles</option>';

      if (info)
        info.textContent =
          'No hay terminales Point disponibles.';

      return [];
    }

    select.dataset.loaded = '1';

    if (info) {
      info.textContent =
        `${select.options.length} terminal(es) disponible(s)`;
    }

    return terminales;

  } catch (err) {
    select.innerHTML =
      '<option value="">Error al consultar terminales</option>';

    if (info)
      info.textContent =
        err.message;

    throw err;

  } finally {
    select.disabled = false;
  }
}


async function abrirModalTarjetaPoint() {
  if (
    !permisoMetodoCobro(
      'tarjeta'
    )
  ) {
    return alert(
      '⛔ No tienes permiso para cobrar con tarjeta.'
    );
  }

  if (!pedidoActivo?.id) {
    return alert(
      'No hay un pedido activo.'
    );
  }

  if (modoSplitPaymentActivo) {
    return alert(
      'Point con pago mixto todavía no está habilitado.'
    );
  }

  /*
   * El descuento seleccionado permanece en
   * #cobro-descuento mientras abrimos Point.
   * El importe mostrado es sólo informativo:
   * el backend volverá a calcularlo.
   */
  const modal =
    asegurarModalPreparacionPoint();

  const general =
    document.getElementById(
      'modal-cobro'
    );

  if (general)
    general.style.display =
      'none';

  const amount =
    document.getElementById(
      'point-prep-amount'
    );

  const order =
    document.getElementById(
      'point-prep-order'
    );

  if (amount) {
    amount.textContent =
      `$${Number(
        totalOriginalCobro || 0
      ).toFixed(2)}`;
  }

  if (order) {
    order.textContent =
      `Pedido: ${referenciaPedidoPoint()}`;
  }

  modal.style.display =
    'flex';

  await cargarTerminalesPointV2()
    .catch(err =>
      console.warn(
        '[Point V2 terminals]',
        err.message
      )
    );
}


function volverModalCobroDesdePoint() {
  const modal =
    document.getElementById(
      'modal-point-preparar'
    );

  if (modal)
    modal.style.display =
      'none';

  const general =
    document.getElementById(
      'modal-cobro'
    );

  if (general)
    general.style.display =
      'flex';
}


async function enviarCobroPointDesdeModal() {
  const select =
    document.getElementById(
      'point-v2-terminal-select'
    );

  if (!select?.value) {
    return alert(
      'Selecciona una terminal Point.'
    );
  }

  const btn =
    document.getElementById(
      'btn-point-v2-send'
    );

  if (btn) {
    btn.disabled = true;
    btn.textContent =
      'ENVIANDO...';
  }

  try {
    const prep =
      document.getElementById(
        'modal-point-preparar'
      );

    if (prep)
      prep.style.display =
        'none';

    await iniciarCobroPoint();

  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent =
        'ENVIAR COBRO';
    }
  }
}


/* ------------------------------------------------------------
 * BOTON CANCELAR EN MODAL DE ESTADO
 * ------------------------------------------------------------ */

function asegurarBotonCancelarPointV2() {
  const modal =
    asegurarModalPoint();

  let btn =
    document.getElementById(
      'btn-point-cancel'
    );

  if (btn)
    return btn;

  const check =
    document.getElementById(
      'btn-point-check'
    );

  const container =
    check?.parentElement;

  if (!container)
    return null;

  btn =
    document.createElement(
      'button'
    );

  btn.type =
    'button';

  btn.id =
    'btn-point-cancel';

  btn.className =
    'cat-btn';

  btn.style.cssText = [
    'display:none',
    'background:#5b2024',
    'color:#ffb4ab',
    'border-color:#7d353a',
    'padding:8px 12px'
  ].join(';');

  btn.innerHTML =
    '<span class="material-icons-round" style="font-size:17px;vertical-align:middle;margin-right:4px">cancel</span>Cancelar cobro';

  btn.onclick =
    cancelarCobroPoint;

  container.insertBefore(
    btn,
    check
  );

  return btn;
}


function actualizarBotonCancelarPointV2(
  op
) {
  const btn =
    asegurarBotonCancelarPointV2();

  if (!btn)
    return;

  const permitido =
    window.restaurantSettings
      ?.permissions
      ?.pointCancel === true;

  const cancelable =
    [
      'creando',
      'pendiente',
      'en_terminal'
    ].includes(
      op?.estado_local
    );

  btn.style.display =
    permitido &&
    cancelable
      ? ''
      : 'none';

  btn.disabled =
    pointCancelando;
}


async function cancelarCobroPoint() {
  if (pointCancelando)
    return;

  const op =
    pointOperacionActual;

  if (!op?.id)
    return alert(
      'No hay una operación Point activa.'
    );

  if (
    window.restaurantSettings
      ?.permissions
      ?.pointCancel !== true
  ) {
    return alert(
      '⛔ No tienes permiso para cancelar cobros Point.'
    );
  }

  const ok =
    confirm(
      '¿Cancelar este cobro con tarjeta?\n\n' +
      'La cuenta NO se marcará como pagada. ' +
      'Restaurant Suite verificará la cancelación con Mercado Pago antes de permitir otro intento.'
    );

  if (!ok)
    return;

  pointCancelando = true;

  const btn =
    asegurarBotonCancelarPointV2();

  if (btn) {
    btn.disabled = true;
    btn.textContent =
      'Cancelando...';
  }

  const message =
    document.getElementById(
      'point-status-message'
    );

  if (message) {
    message.textContent =
      'Solicitando cancelación a Mercado Pago...';
  }

  try {
    const res =
      await fetch(
        `/api/mercadopago/operations/${encodeURIComponent(op.id)}/cancel`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json'
          },
          body: '{}'
        }
      );

    const data =
      await res.json()
        .catch(() => ({}));

    if (data.operation) {
      pointOperacionActual =
        data.operation;

      actualizarModalPoint(
        data.operation
      );
    }

    if (!res.ok) {
      throw new Error(
        data.error ||
        'Mercado Pago no confirmó la cancelación.'
      );
    }

    if (
      data.operation
        ?.estado_local ===
      'cancelada'
    ) {
      detenerPollingPoint();

      if (message) {
        message.textContent =
          'Cobro cancelado correctamente. La cuenta permanece abierta.';
      }

      return;
    }

    /*
     * Aceptada pero aún no confirmada:
     * seguimos verificando.
     */
    programarPollingPoint();

    const warning =
      document.getElementById(
        'point-status-warning'
      );

    if (warning) {
      warning.style.display =
        'block';

      warning.textContent =
        'La cancelación fue solicitada, pero todavía no está confirmada. No inicies otro cobro.';
    }

  } catch (err) {
    const warning =
      document.getElementById(
        'point-status-warning'
      );

    if (warning) {
      warning.style.display =
        'block';

      warning.textContent =
        `${err.message} No inicies otro cobro hasta confirmar el estado.`;
    }

  } finally {
    pointCancelando = false;

    if (btn) {
      btn.disabled = false;
      btn.innerHTML =
        '<span class="material-icons-round" style="font-size:17px;vertical-align:middle;margin-right:4px">cancel</span>Cancelar cobro';
    }

    actualizarBotonCancelarPointV2(
      pointOperacionActual
    );
  }
}

function abrirModalCobro() {
  if (!window.restaurantSettings?.permissions.charge) {
    return alert('⛔ Función restringida:\nLos meseros no tienen permisos para realizar cobros.');
  }

  if (!puedeGestionarMesa(pedidoActivo)) {
    return alert(`Mesa de: ${pedidoActivo.mesero}`);
  }

  let total = 0;
  if (comandaLocal && comandaLocal.length > 0) {
    total = comandaLocal.reduce(
      (acc, it) =>
        acc + (Number(it.cantidad) || 1) * (Number(it.precio_unitario || it.precio) || 0),
      0,
    );
  } else if (pedidoActivo && pedidoActivo.total) {
    total = parseFloat(pedidoActivo.total);
  }

  if (total <= 0) return;

  totalOriginalCobro = total;
  saldoRestanteCobro = total;
  pagosParcialesRegistrados = [];
  cobroOperacionId = nuevaClaveOperacion();
  modoSplitPaymentActivo = false;

  const cobroReferencia = ['delivery','para_llevar','takeout'].includes(pedidoActivo.tipo_servicio)
    ? (pedidoActivo.cliente_nombre || 'Pedido')
    : pedidoActivo.mesa_numero;
  document.getElementById('cobro-modal-header').innerText = `Cobro: ${cobroReferencia}`;
  document.getElementById('cobro-total-original').innerText = `$${totalOriginalCobro.toFixed(2)}`;
  document.getElementById('lbl-saldo-estado').innerText = 'Monto a Liquidar:';
  document.getElementById('btn-toggle-split-pay').innerText = 'Dividir Pago (Mixto)';
  document.getElementById('btn-ejecutar-cobro-main').innerText = 'CONTINUAR';

  const btnCash = document.getElementById('btn-pay-cash');
  if (btnCash) {
    document.querySelectorAll('#modal-cobro .cat-btn').forEach((b) => b.classList.remove('active'));
    btnCash.classList.add('active');
    document.getElementById('box-cobro-efectivo').style.display = 'block';
  }

  asegurarPanelPoint();

  if (!aplicarPermisosMetodosCobro()) {
    return alert(
      '⛔ Tu rol no tiene ningún método de cobro habilitado.'
    );
  }

  actualizarPantallaCobroRestante();

  /*
   * Si el navegador se recargó o el modal se cerró,
   * recuperamos la operación persistida.
   */
  if (pedidoActivo?.id) {
    restaurarOperacionPointPedido(
      pedidoActivo.id
    );
  }

  document.getElementById('chk-imprimir-recibo-cobro').checked = false;
  const descuentoPanel = document.getElementById('cobro-panel-descuento');
  if (descuentoPanel) descuentoPanel.style.display = 'none';
  const descuentoSelect = document.getElementById('cobro-descuento');
  if (descuentoSelect) descuentoSelect.value = '';
  const descuentoBtn = document.getElementById('btn-toggle-discount');
  if (descuentoBtn) descuentoBtn.innerHTML = '<span class="material-icons-round" style="font-size:16px">sell</span> Descuento';
  cargarDescuentosCobro();
  document.getElementById('modal-cobro').style.display = 'flex';
}

function activarModoSplitPayment() {
  modoSplitPaymentActivo = !modoSplitPaymentActivo;
  const btn = document.getElementById('btn-toggle-split-pay');
  const lblSaldo = document.getElementById('lbl-saldo-estado');
  const btnMain = document.getElementById('btn-ejecutar-cobro-main');

  if (modoSplitPaymentActivo) {
    btn.innerText = 'Cobro Completo';
    btn.style.background = '#1E88E5';
    btn.style.color = '#fff';
    lblSaldo.innerText = 'Restante por Pagar:';
    btnMain.innerText = 'REGISTRAR ABONO / PAGO';
  } else {
    btn.innerText = 'Dividir Pago (Mixto)';
    btn.style.background = '#333';
    btn.style.color = '#A8C7FA';
    lblSaldo.innerText = 'Monto a Liquidar:';
    btnMain.innerText = 'CONTINUAR';
    saldoRestanteCobro = totalOriginalCobro;
    pagosParcialesRegistrados = [];
  }
  actualizarPantallaCobroRestante();
}

function actualizarPantallaCobroRestante() {
  document.getElementById('cobro-total-display').innerText = `$${saldoRestanteCobro.toFixed(2)}`;
  document.getElementById('cobro-recibido').value = saldoRestanteCobro.toFixed(2);
  renderBotonesEfectivoRapido(saldoRestanteCobro);
  calcularCambioCobro();

  const contH = document.getElementById('box-pagos-parciales-historial');
  contH.innerHTML = '';
  if (pagosParcialesRegistrados.length > 0) {
    contH.innerHTML =
      '<strong style="color:#A8C7FA; display:block; margin-bottom:4px;">Abonos registrados:</strong>';
    pagosParcialesRegistrados.forEach((p) => {
      contH.innerHTML += `<div>✓ $${p.monto.toFixed(2)} cubiertos con ${p.metodo.toUpperCase()}</div>`;
    });
  }
}

function abrirCobroPedidoDirecto(pedidoId) {
  if (!window.restaurantSettings?.permissions.charge) {
    return alert('⛔ Función restringida:\nLos meseros no tienen permisos para realizar cobros.');
  }

  const p = (datosGlobales.pedidosAbiertos || []).find((x) => x.id === pedidoId);
  if (!p) return;

  if (!puedeGestionarMesa(p) && !(usuarioSesion && usuarioSesion.rol === 'repartidor')) {
    return alert(`Orden de: ${p.mesero}`);
  }

  pedidoActivo = p;
  comandaLocal = p.items || [];
  abrirModalCobro();
}

async function cargarDescuentosCobro() {
  const select = document.getElementById('cobro-descuento');
  if (!select) return;
  select.innerHTML = '<option value="">Sin descuento</option>';
  try {
    const res = await fetch('/api/items/descuentos', { cache: 'no-store' });
    const descuentos = await res.json();
    if (!res.ok) throw Error(descuentos.error || 'No se pudieron cargar los descuentos');
    datosGlobales.descuentos = Array.isArray(descuentos) ? descuentos : [];
    for (const d of datosGlobales.descuentos) {
      const o = document.createElement('option');
      o.value = d.id;
      o.dataset.tipo = d.tipo;
      o.dataset.valor = d.valor;
      o.textContent = `${d.nombre} · ${d.tipo === 'porcentaje' ? Number(d.valor) + '%' : '$' + Number(d.valor).toFixed(2)}`;
      select.appendChild(o);
    }
    const empty = document.getElementById('cobro-descuento-empty');
    if (empty) empty.style.display = datosGlobales.descuentos.length ? 'none' : 'block';
  } catch (e) {
    const empty = document.getElementById('cobro-descuento-empty');
    if (empty) { empty.style.display = 'block'; empty.textContent = e.message; }
  }
}
function togglePanelDescuentoCobro() {
  const panel = document.getElementById('cobro-panel-descuento');
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' || !panel.style.display ? 'block' : 'none';
}
function recalcularCobroConDescuento(){const s=document.getElementById('cobro-descuento'),o=s?.selectedOptions?.[0];let desc=0;const sub=comandaLocal.reduce((a,i)=>a+Number(i.cantidad)*Number(i.precio_unitario),0);if(o&&o.value){desc=o.dataset.tipo==='porcentaje'?sub*Number(o.dataset.valor)/100:Number(o.dataset.valor);desc=Math.min(sub,Math.max(0,desc))}totalOriginalCobro=sub-desc;saldoRestanteCobro=totalOriginalCobro;const r=document.getElementById('cobro-resumen-descuento');if(r)r.textContent=`Subtotal $${sub.toFixed(2)} · Descuento -$${desc.toFixed(2)} · Total $${totalOriginalCobro.toFixed(2)}`;const b=document.getElementById('btn-toggle-discount');if(b)b.innerHTML=o&&o.value?`<span class="material-icons-round" style="font-size:16px">sell</span> ${o.textContent}`:'<span class="material-icons-round" style="font-size:16px">sell</span> Descuento';const i=document.getElementById('cobro-recibido');if(i)i.value=totalOriginalCobro.toFixed(2);renderBotonesEfectivoRapido(totalOriginalCobro);calcularCambioCobro()}

function seleccionarMetodoCobro(metodo, btn) {
  if (!permisoMetodoCobro(metodo)) {
    return alert(
      '⛔ No tienes permiso para utilizar este método de cobro.'
    );
  }

  metodoCobroSeleccionado =
    metodo;

  document
    .querySelectorAll(
      '#modal-cobro .cat-btn'
    )
    .forEach(
      b => b.classList.remove(
        'active'
      )
    );

  if (btn)
    btn.classList.add('active');

  const esEfectivo =
    metodo === 'efectivo';

  const esPoint =
    metodo === 'tarjeta';

  const boxEfectivo =
    document.getElementById(
      'box-cobro-efectivo'
    );

  if (boxEfectivo) {
    boxEfectivo.style.display =
      esEfectivo
        ? 'block'
        : 'none';
  }

  const input =
    document.getElementById(
      'cobro-recibido'
    );

  if (input) {
    if (esPoint) {
      input.value =
        Number(
          totalOriginalCobro
        ).toFixed(2);

      input.readOnly = true;
    } else {
      input.readOnly = false;
    }
  }

  const pointPanel =
    asegurarPanelPoint();

  /*
   * MP-4B:
   * Point ya no se muestra dentro
   * del modal general de cobro.
   */
  pointPanel.style.display = 'none';

  if (esPoint) {
    abrirModalTarjetaPoint();
  }

  const btnMain =
    document.getElementById(
      'btn-ejecutar-cobro-main'
    );

  if (
    btnMain &&
    !modoSplitPaymentActivo
  ) {
    btnMain.innerText =
      esEfectivo
        ? 'CONTINUAR'
        : esPoint
          ? 'ENVIAR A POINT'
          : 'LIQUIDAR CUENTA';
  }
}

function renderBotonesEfectivoRapido(total){const b=document.getElementById('cobro-efectivo-rapido');if(!b)return;total=Number(total||0);const a=[total,Math.ceil(total/10)*10,Math.ceil(total/50)*50,200,250,500,1000].filter((v,i,x)=>v>=total&&x.indexOf(v)===i).slice(0,4);b.innerHTML=a.map(v=>`<button type="button" class="cat-btn" onclick="seleccionarEfectivoRapido(${v})">$${Number(v).toFixed(v%1?2:0)}</button>`).join('')}
function seleccionarEfectivoRapido(v){const i=document.getElementById('cobro-recibido');if(i){i.value=Number(v).toFixed(2);calcularCambioCobro()}}

function calcularCambioCobro() {
  const recibido = parseFloat(document.getElementById('cobro-recibido').value) || 0;
  const cambio = Math.max(0, recibido - saldoRestanteCobro);
  document.getElementById('cobro-txt-cambio').innerText = `$${cambio.toFixed(2)}`;
}

function obtenerMetodoSeleccionadoLimpio() {
  return metodoCobroSeleccionado;
}

async function procesarPagoAbonoOCierre() {
  const recibido = parseFloat(document.getElementById('cobro-recibido').value) || 0;
  if (recibido <= 0) return alert('Ingrese un monto válido.');

  const metodo = obtenerMetodoSeleccionadoLimpio();

  // MP5_MANUAL_CARD_BACKEND_NORMALIZATION_V1
  // La UI distingue tarjeta manual de Point.
  // El backend POS tradicional conserva el nombre
  // histórico `tarjeta` para la tarjeta manual.
  const metodoBackend =
    metodo === 'tarjeta_manual'
      ? 'tarjeta'
      : metodo;

  /*
   * Point es un flujo financiero independiente.
   * NUNCA debe caer en /api/pos/cobrar-cuenta.
   */
  if (metodo === 'tarjeta') {
    await iniciarCobroPoint();
    return;
  }

  if (metodo === 'efectivo') {
    if (!modoSplitPaymentActivo && recibido < totalOriginalCobro)
      return alert('Efectivo insuficiente');

    const montoAbonado = Math.min(saldoRestanteCobro, recibido);
    pagosParcialesRegistrados.push({ metodo: 'efectivo', monto: montoAbonado, recibido });
    saldoRestanteCobro -= montoAbonado;

    if (modoSplitPaymentActivo && saldoRestanteCobro > 0.01) {
      actualizarPantallaCobroRestante();
      return;
    }

    const totalCobrado = totalOriginalCobro;
    const ok = await ejecutarLiquidacionTotalSplitPayment({
      mantenerModalCambio: true,
      cambioInfo: { total: totalCobrado, pagaCon: recibido },
    });
    if (ok) mostrarPantallaConfirmacionEfectivo(totalCobrado, recibido);
    return;
  }

  if (!modoSplitPaymentActivo) {
    // MP5_MANUAL_CARD_PAYMENT_RECORD_V1
    pagosParcialesRegistrados = [{ metodo: metodoBackend, monto: totalOriginalCobro }];
    await ejecutarLiquidacionTotalSplitPayment();
    return;
  }

  const montoAbonado = Math.min(saldoRestanteCobro, recibido);
  pagosParcialesRegistrados.push({
    metodo: metodoBackend,
    monto: montoAbonado,
  });

  saldoRestanteCobro -= montoAbonado;

  if (saldoRestanteCobro > 0.01) {
    actualizarPantallaCobroRestante();
  } else {
    await ejecutarLiquidacionTotalSplitPayment();
  }
}

function mostrarPantallaConfirmacionEfectivo(total, pagaCon) {
  const cambio = Math.max(0, pagaCon - total);
  document.getElementById('conf-txt-total').innerText = `$${total.toFixed(2)}`;
  document.getElementById('conf-txt-pagacon').innerText = `$${pagaCon.toFixed(2)}`;
  document.getElementById('conf-txt-cambio').innerText = `$${cambio.toFixed(2)}`;

  document.getElementById('modal-cobro').style.display = 'none';
  document.getElementById('modal-confirmacion-efectivo').style.display = 'flex';
}

function cerrarConfirmacionCobro() {
  document.getElementById('modal-confirmacion-efectivo').style.display = 'none';
}

async function ejecutarLiquidacionTotalSplitPayment(options = {}) {
  if (window.restaurantSettings?.pos.confirmCharge && !confirm('¿Confirmar el cobro de la cuenta?'))
    return;
  const imprimirTicket = document.getElementById('chk-imprimir-recibo-cobro').checked;
  const metodoFinal =
    pagosParcialesRegistrados.length === 1 ? pagosParcialesRegistrados[0].metodo : 'mixto';
  const pagaConFinal =
    parseFloat(document.getElementById('cobro-recibido').value) || totalOriginalCobro;
  const cambioFinal = Math.max(0, pagaConFinal - totalOriginalCobro);

  const payload = {
    mesa: pedidoActivo ? pedidoActivo.mesa_numero : 'General',
    pedido_id: pedidoActivo ? pedidoActivo.id : null,
    cajero: usuarioSesion ? usuarioSesion.nombre : 'Caja',
    mesero: pedidoActivo ? pedidoActivo.mesero : 'General',
    metodo_pago: metodoFinal,
    pagos: pagosParcialesRegistrados,
    request_id: cobroOperacionId || (cobroOperacionId = nuevaClaveOperacion()),
    paga_con: pagaConFinal,
    cambio_llevar: cambioFinal,
    total: totalOriginalCobro,
    items: comandaLocal,
    imprimir_ticket: imprimirTicket,
    descuento_id: document.getElementById('cobro-descuento')?.value || null,
  };

  const res = await fetch('/api/pos/cobrar-cuenta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.json();
    alert(error.error || 'No se pudo cobrar');
    return;
  }
  if (res.ok) {
    const cobradoId = pedidoActivo ? pedidoActivo.id : null;
    document.getElementById('modal-cobro').style.display = 'none';
    if (cobradoId) {
      datosGlobales.pedidosAbiertos = (datosGlobales.pedidosAbiertos || []).filter(
        (p) => Number(p.id) !== Number(cobradoId),
      );
    }
    pedidoActivo = null;
    comandaLocal = [];
    comandaInicialSnapshot = [];
    if (document.getElementById('vista-comandero').classList.contains('split-active')) {
      cerrarComandero();
    } else if (zonaActual === 'salon') {
      renderPlanoSalon();
    } else {
      renderPedidosEspeciales();
    }
    cargarDatos();
    return true;
  }
  return false;
}

function abrirModalSplitTicket() {
  if (comandaLocal.length === 0) return alert('No hay artículos en la comanda para dividir.');

  splitItemsOrigen = JSON.parse(JSON.stringify(comandaLocal));
  splitItemsDestino = [];

  document.getElementById('split-lbl-origen').innerText = `${pedidoActivo.mesa_numero} (Origen)`;
  document.getElementById('split-lbl-destino').innerText = `${pedidoActivo.mesa_numero} - Sub 1`;

  renderSplitColumns();
  document.getElementById('modal-split-ticket').style.display = 'flex';
}

function renderSplitColumns() {
  const boxOrig = document.getElementById('split-box-origen');
  const boxDest = document.getElementById('split-box-destino');
  boxOrig.innerHTML = '';
  boxDest.innerHTML = '';

  let totalDestino = 0;

  splitItemsOrigen.forEach((it, idx) => {
    const sub = (Number(it.cantidad) || 1) * (Number(it.precio_unitario || it.precio) || 0);
    boxOrig.innerHTML += `
      <div class="split-item-row" onclick="transferirItemASplitDestino(${idx})">
        <div>
          <strong>${it.cantidad}x ${it.nombre}</strong>
          ${it.modificadores ? `<div style="font-size:0.75rem; color:#aaa;">+ ${it.modificadores}</div>` : ''}
        </div>
        <div style="color:#6DD58C; font-weight:700;">$${sub.toFixed(2)} →</div>
      </div>
    `;
  });

  splitItemsDestino.forEach((it, idx) => {
    const sub = (Number(it.cantidad) || 1) * (Number(it.precio_unitario || it.precio) || 0);
    totalDestino += sub;
    boxDest.innerHTML += `
      <div class="split-item-row" onclick="revertirItemASplitOrigen(${idx})">
        <div style="color:#F2B8B5; font-weight:700;">← Revertir</div>
        <div style="text-align:right;">
          <strong>${it.cantidad}x ${it.nombre}</strong>
          <div style="color:#6DD58C; font-weight:700;">$${sub.toFixed(2)}</div>
        </div>
      </div>
    `;
  });

  document.getElementById('split-txt-total-destino').innerText = `$${totalDestino.toFixed(2)}`;
}

function transferirItemASplitDestino(idx) {
  const it = splitItemsOrigen[idx];
  if (!it) return;

  if (it.cantidad > 1) {
    const cantTransferir =
      parseFloat(
        prompt(`¿Cuántos de los ${it.cantidad}x ${it.nombre} deseas pasar al sub-ticket?`, '1'),
      ) || 1;
    const cantValida = Math.min(it.cantidad, Math.max(0.1, cantTransferir));

    it.cantidad -= cantValida;
    const nuevoDest = { ...it, cantidad: cantValida };
    splitItemsDestino.push(nuevoDest);

    if (it.cantidad === 0) splitItemsOrigen.splice(idx, 1);
  } else {
    splitItemsDestino.push(it);
    splitItemsOrigen.splice(idx, 1);
  }

  renderSplitColumns();
}

function revertirItemASplitOrigen(idx) {
  const it = splitItemsDestino[idx];
  if (!it) return;

  splitItemsOrigen.push(it);
  splitItemsDestino.splice(idx, 1);
  renderSplitColumns();
}

async function dividirCuentaServidor() {
  const res = await fetch('/api/pos/dividir-cuenta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pedido_id: pedidoActivo?.id,
      origen: splitItemsOrigen,
      destino: splitItemsDestino,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error);
    return null;
  }
  return data.pedido;
}
async function guardarSubTicketSeparado() {
  const pedido = await dividirCuentaServidor();
  if (!pedido) return;
  document.getElementById('modal-split-ticket').style.display = 'none';
  cerrarComandero();
  await cargarDatos();
}
async function ejecutarCobroSubTicketInmediato() {
  if (!window.restaurantSettings?.permissions.charge) return alert('Tu rol no puede cobrar');
  const pedido = await dividirCuentaServidor();
  if (!pedido) return;
  document.getElementById('modal-split-ticket').style.display = 'none';
  pedidoActivo = pedido;
  comandaLocal = splitItemsDestino;
  abrirModalCobro();
}

async function limpiarComandaActual() {
  if (confirm('¿Vaciar y liberar esta mesa/comanda por completo?')) {
    try {
      const response = await fetch('/api/pos/vaciar-comanda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pedido_id: pedidoActivo ? pedidoActivo.id : null,
          mesa: pedidoActivo ? pedidoActivo.mesa_numero : null,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        alert(data.error);
        return;
      }
      comandaLocal = [];
      cerrarComandero();
    } catch (e) {
      cerrarComandero();
    }
  }
}

async function reimprimirTicketCliente() {
  if (!pedidoActivo || !pedidoActivo.id) return alert('El pedido debe estar guardado primero.');
  if (!window.restaurantSettings?.permissions.ticketReprint)
    return alert('Tu rol no tiene permiso para reimprimir tickets.');
  const res = await fetch('/api/pos/reimprimir-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pedido_id: pedidoActivo.id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return alert(data.error || 'No se pudo reimprimir el ticket.');
  alert('Ticket enviado a impresión.');
}

async function reimprimirComandaCocina() {
  if (!pedidoActivo || !pedidoActivo.id) return alert('La comanda debe ser guardada primero.');
  const res = await fetch('/api/pos/reimprimir-cocina', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pedido_id: pedidoActivo.id }),
  });
  if (res.ok) alert('Comanda enviada a cocina.');
}

function abrirModalEditarTicket() {
  if (!pedidoActivo) return;
  document.getElementById('edit-ticket-cliente').value = pedidoActivo.cliente_nombre || '';
  document.getElementById('edit-ticket-notas').value = pedidoActivo.referencias_entrega || '';
  document.getElementById('modal-editar-ticket').style.display = 'flex';
}

async function guardarEdicionTicket() {
  if (!pedidoActivo || !pedidoActivo.id) {
    pedidoActivo.cliente_nombre = document.getElementById('edit-ticket-cliente').value.trim();
    pedidoActivo.referencias_entrega = document.getElementById('edit-ticket-notas').value.trim();
    document.getElementById('modal-editar-ticket').style.display = 'none';
    return;
  }

  await fetch('/api/pos/editar-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pedido_id: pedidoActivo.id,
      cliente_nombre: document.getElementById('edit-ticket-cliente').value.trim(),
      notas: document.getElementById('edit-ticket-notas').value.trim(),
    }),
  });

  document.getElementById('modal-editar-ticket').style.display = 'none';
  cargarDatos();
}

function abrirModalAsignarMesero() {
  if (!pedidoActivo || !pedidoActivo.id) return alert('Debe guardar la orden primero.');
  document.getElementById('asig-mesero-principal').value = pedidoActivo.mesero || 'Mesero';

  const sel = document.getElementById('asig-mesero-secundario');
  sel.innerHTML = '<option value="">-- Ninguno (Solo Principal) --</option>';

  (datosGlobales.usuarios || []).forEach((u) => {
    if (u.nombre !== pedidoActivo.mesero) {
      sel.innerHTML += `<option value="${u.nombre}" ${pedidoActivo.mesero_secundario === u.nombre ? 'selected' : ''}>${u.nombre} (${u.rol.toUpperCase()})</option>`;
    }
  });

  document.getElementById('modal-asignar-mesero').style.display = 'flex';
}

async function guardarAsignacionMeseros() {
  const sec = document.getElementById('asig-mesero-secundario').value;
  await fetch('/api/pos/asignar-mesero', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pedido_id: pedidoActivo.id, mesero_secundario: sec }),
  });

  document.getElementById('modal-asignar-mesero').style.display = 'none';
  alert('Asignación guardada.');
  cargarDatos();
}

function abrirModalMoverMesa() {
  if (!pedidoActivo || !pedidoActivo.id) return alert('Debe guardar la orden primero.');
  const sel = document.getElementById('select-mover-mesa-destino');
  sel.innerHTML = '';

  for (let i = 1; i <= 14; i++) {
    const nom = `Mesa ${i}`;
    const ocupada = (datosGlobales.pedidosAbiertos || []).some(
      (p) => p.mesa_numero === nom && p.estado === 'abierto',
    );
    if (!ocupada) sel.innerHTML += `<option value="${nom}">${nom}</option>`;
  }

  document.getElementById('modal-mover-mesa').style.display = 'flex';
}

async function ejecutarMoverMesa() {
  const destino = document.getElementById('select-mover-mesa-destino').value;
  if (!destino) return alert('No hay mesas disponibles.');

  const res = await fetch('/api/pos/mover-mesa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pedido_id: pedidoActivo.id, nueva_mesa: destino }),
  });

  if (res.ok) {
    document.getElementById('modal-mover-mesa').style.display = 'none';
    cerrarComandero();
  } else {
    const err = await res.json();
    alert(err.error || 'Error al mover mesa');
  }
}

async function abrirCajonDirecto() {
  if (!window.restaurantSettings?.permissions.drawer) {
    return;
  }
  await fetch('/api/pos/abrir-cajon', { method: 'POST' });
}

function abrirModalDespachoPaso1(pedidoId) {
  const p = (datosGlobales.pedidosAbiertos || []).find((x) => x.id === pedidoId);
  if (!p) return;
  pedidoEnDespacho = p;

  const cont = document.getElementById('despacho-checklist-container');
  cont.innerHTML = '';
  (p.items || []).forEach((it, idx) => {
    cont.innerHTML += `
      <label class="checklist-row">
        <input type="checkbox" class="chk-desp-item" id="chk-it-${idx}">
        <span><strong>${it.cantidad}x ${it.nombre}</strong> ${it.modificadores ? `(+${it.modificadores})` : ''}</span>
      </label>
    `;
  });

  document.getElementById('modal-despacho-step1').style.display = 'flex';
}

function pasarADespachoPaso2() {
  const checkboxes = document.querySelectorAll('.chk-desp-item');
  const todosMarcados = Array.from(checkboxes).every((c) => c.checked);
  if (!todosMarcados && checkboxes.length > 0) {
    return alert('Marque todos los platillos empacados.');
  }

  document.getElementById('modal-despacho-step1').style.display = 'none';
  document.getElementById('despacho-total-display').innerText =
    `$${Number(pedidoEnDespacho.total).toFixed(2)}`;
  document.getElementById('despacho-paga-con').value = pedidoEnDespacho.total;
  calcularCambioDespacho();
  document.getElementById('modal-despacho-step2').style.display = 'flex';
}

function volverADespachoPaso1() {
  document.getElementById('modal-despacho-step2').style.display = 'none';
  document.getElementById('modal-despacho-step1').style.display = 'flex';
}

function seleccionarMetodoDespacho(metodo, btn) {
  document
    .querySelectorAll('#modal-despacho-step2 .cat-btn')
    .forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  const esEfectivo = metodo === 'efectivo';
  document.getElementById('box-despacho-efectivo').style.display = esEfectivo ? 'block' : 'none';
}

function calcularCambioDespacho() {
  if (!pedidoEnDespacho) return;
  const total = parseFloat(pedidoEnDespacho.total) || 0;
  const pagaCon = parseFloat(document.getElementById('despacho-paga-con').value) || 0;
  const cambio = Math.max(0, pagaCon - total);
  document.getElementById('despacho-txt-cambio').innerText = `$${cambio.toFixed(2)}`;
}

async function confirmarDespachoFinal() {
  const activeBtn = document.querySelector('#modal-despacho-step2 .cat-btn.active');
  let metodo = 'efectivo';
  if (activeBtn) {
    const t = activeBtn.innerText.toLowerCase();
    if (t.includes('trans')) metodo = 'transferencia';
    else if (t.includes('tarj')) metodo = 'tarjeta';
  }

  const pagaCon =
    parseFloat(document.getElementById('despacho-paga-con').value) || pedidoEnDespacho.total;
  if (metodo === 'efectivo' && pagaCon < Number(pedidoEnDespacho.total)) {
    return alert('El monto recibido no puede ser menor al total.');
  }
  const cambio = metodo === 'efectivo' ? Math.max(0, pagaCon - pedidoEnDespacho.total) : 0;

  const res = await fetch('/api/pos/despachar-delivery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pedido_id: pedidoEnDespacho.id,
      metodo_pago: metodo,
      paga_con: pagaCon,
      cambio_llevar: cambio,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return alert(data.error || 'No se pudo despachar el pedido.');
  }
  document.getElementById('modal-despacho-step2').style.display = 'none';
  document.getElementById('modal-despacho-step1').style.display = 'none';
  pedidoEnDespacho = null;
  await cargarDatos();
}

async function buscarClienteCRM(q) {
  const box = document.getElementById('crm-sugerencias-box');
  if (!q || q.length < 1) { box.style.display = 'none'; return; }
  try {
    const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}`);
    const list = await res.json();
    if (!res.ok) throw Error(list.error || 'No se pudieron consultar clientes');
    if (!list.length) { box.style.display = 'none'; return; }
    box.innerHTML = list.slice(0,12).map(c => `
      <button type="button" style="display:block;width:100%;text-align:left;padding:9px 12px;background:transparent;color:#fff;border:0;border-bottom:1px solid #333;cursor:pointer" onclick="seleccionarClienteCRMPorId(${Number(c.id)})">
        <strong>${escaparHtmlCRM(c.nombre)}</strong> ${c.telefono ? `(${escaparHtmlCRM(c.telefono)})` : ''}
        <div style="font-size:.75rem;color:#aaa">${escaparHtmlCRM(c.direccion || 'Sin dirección')}</div>
      </button>`).join('');
    box.style.display = 'block';
  } catch (e) { box.style.display='none'; console.error(e); }
}
function escaparHtmlCRM(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
async function seleccionarClienteCRMPorId(id) {
  try {
    const res = await fetch('/api/customers/' + id); const c = await res.json();
    if (!res.ok) throw Error(c.error || 'Cliente no encontrado');
    document.getElementById('pe-nombre').value = c.nombre || '';
    document.getElementById('pe-tel').value = c.telefono || '';
    document.getElementById('pe-dir').value = c.direccion || '';
    document.getElementById('pe-ref').value = c.referencias || '';
    document.getElementById('crm-sugerencias-box').style.display = 'none';
    document.getElementById('pe-buscar-crm').value = c.nombre || '';
    window.clienteCRMSeleccionadoId = c.id;
  } catch(e) { alert(e.message); }
}

function abrirModalDirectorioClientes() {
  cargarDirectorioCRM('');
  document.getElementById('modal-directorio-crm').style.display = 'flex';
}

async function cargarDirectorioCRM(q) {
  const res = await fetch(`/api/customers?q=${encodeURIComponent(q || '')}`);
  const list = await res.json();
  const cont = document.getElementById('dir-lista-container');
  cont.innerHTML = '';
  if (!res.ok) { cont.innerHTML = `<div style="color:#ff8a80;padding:16px">${escaparHtmlCRM(list.error || 'Error')}</div>`; return; }
  if (!list.length) { cont.innerHTML = '<div style="text-align:center;color:#888;padding:16px">Sin clientes registrados.</div>'; return; }
  list.forEach(c => { cont.innerHTML += `<div style="background:#1a1c24;border:1px solid #333;border-radius:8px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;gap:10px;align-items:center"><div><strong style="color:#A8C7FA">${escaparHtmlCRM(c.nombre)}</strong> ${c.telefono?`(${escaparHtmlCRM(c.telefono)})`:''}<div style="font-size:.8rem;color:#aaa">${escaparHtmlCRM(c.direccion || 'Sin dirección')}</div></div><button class="cat-btn" style="background:#1E88E5;color:#fff" onclick="iniciarPedidoDesdeDirectorioId(${Number(c.id)})">Pedir</button></div>`; });
}

async function iniciarPedidoDesdeDirectorioId(id) {
  try {
    const res=await fetch('/api/customers/'+id), c=await res.json();
    if(!res.ok) throw Error(c.error||'Cliente no encontrado');
    document.getElementById('modal-directorio-crm').style.display='none';
    const mesaTag=`DELIV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
    abrirComanderoMesa(mesaTag,{mesa_numero:mesaTag,tipo_servicio:'delivery',cliente_id:c.id,cliente_nombre:c.nombre,cliente_telefono:c.telefono||'',direccion_entrega:c.direccion||'',referencias:c.referencias||'',mesero:usuarioSesion?usuarioSesion.nombre:'Mesero',items:[]});
  } catch(e){alert(e.message);}
}

function abrirModalNuevoPedidoEspecial() {
  document.getElementById('pe-modal-titulo').innerText =
    zonaActual === 'delivery' ? 'Nuevo Domicilio' : 'Nuevo Para Llevar';
  document.getElementById('pe-campos-delivery').style.display =
    zonaActual === 'delivery' ? 'block' : 'none';
  document.getElementById('pe-nombre').value = '';
  document.getElementById('pe-tel').value = '';
  document.getElementById('pe-dir').value = '';
  document.getElementById('pe-ref').value = '';
  document.getElementById('pe-buscar-crm').value = '';
  window.clienteCRMSeleccionadoId = null;
  document.getElementById('modal-pedido-especial').style.display = 'flex';
}

async function iniciarCapturaComandaEspecial() {
  const nombre = document.getElementById('pe-nombre').value.trim();
  const tel = document.getElementById('pe-tel').value.trim();
  const dir = document.getElementById('pe-dir').value.trim();
  const ref = document.getElementById('pe-ref').value.trim();
  const guardarCRM = document.getElementById('pe-guardar-crm').checked;

  let clienteId = window.clienteCRMSeleccionadoId || null;
  if (zonaActual === 'delivery' && guardarCRM && nombre && !clienteId) {
    try {
      const crmRes = await fetch('/api/customers', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({nombre,telefono:tel,direccion:dir,referencias:ref}) });
      const crm = await crmRes.json();
      if (!crmRes.ok) throw Error(crm.error || 'No se pudo guardar el cliente');
      clienteId = crm.id || null;
    } catch (e) {
      return alert('No se pudo guardar el cliente: ' + e.message);
    }
  }

  document.getElementById('modal-pedido-especial').style.display = 'none';

  const mesaTag = `${zonaActual === 'delivery' ? 'DELIV' : 'LLEVAR'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
  abrirComanderoMesa(mesaTag, {
    mesa_numero: mesaTag,
    tipo_servicio: zonaActual === 'takeout' ? 'para_llevar' : zonaActual,
    cliente_id: clienteId,
    cliente_nombre: nombre,
    cliente_telefono: tel,
    direccion_entrega: dir,
    referencias: ref,
    mesero: usuarioSesion ? usuarioSesion.nombre : 'Mesero',
    items: [],
  });
}

function agregarMesaPersonalizadaPrompt() {
  const nom = prompt('Nombre o número de mesa:');
  if (nom) abrirComanderoMesa(nom);
}

function nuevaClaveOperacion() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('');
}

function cerrarModalAsignarClientePedido(){const m=document.getElementById('modal-asignar-cliente-pedido');if(m)m.style.display='none';volverSelectorClientePedido()}
async function abrirModalAsignarClientePedido(){if(!pedidoActivo){alert('Abre un pedido primero.');return}const m=document.getElementById('modal-asignar-cliente-pedido'),q=document.getElementById('buscar-cliente-pedido');volverSelectorClientePedido();m.style.display='flex';q.value='';q.oninput=()=>buscarClientesParaPedido(q.value);await buscarClientesParaPedido('');setTimeout(()=>q.focus(),50)}
function clienteEsGenerico(n){return /^(cliente|client|sin nombre|anonimo|anónimo)$/i.test(String(n||'').trim())}
async function buscarClientesParaPedido(q){const box=document.getElementById('lista-clientes-pedido');box.innerHTML='<div class="cliente-empty">Cargando…</div>';try{const r=await fetch('/api/customers?q='+encodeURIComponent(q||'')),rows=await r.json();if(!r.ok)throw new Error(rows.error||'No se pudieron cargar clientes');const visibles=rows.filter(c=>!clienteEsGenerico(c.nombre)).slice(0,60);box.innerHTML='';for(const c of visibles){const row=document.createElement('button');row.type='button';row.className='cliente-row';const info=document.createElement('div'),name=document.createElement('div'),meta=document.createElement('div'),icon=document.createElement('span');name.className='cliente-name';name.textContent=c.nombre;meta.className='cliente-meta';meta.textContent=[c.telefono,c.direccion].filter(Boolean).join(' · ')||'Sin teléfono ni dirección';icon.className='material-icons-round';icon.textContent='chevron_right';info.append(name,meta);row.append(info,icon);row.onclick=()=>asignarClientePedido(c.id);box.appendChild(row)}if(!visibles.length)box.innerHTML='<div class="cliente-empty">Sin coincidencias.</div>'}catch(e){box.innerHTML='';const d=document.createElement('div');d.className='cliente-empty';d.textContent=e.message;box.appendChild(d)}}
function mostrarNuevoClientePedido(){document.getElementById('cliente-selector-view').style.display='none';document.getElementById('cliente-new-form').style.display='block';document.getElementById('nuevo-cliente-error').textContent='';['nombre','telefono','direccion','referencias','notas'].forEach(x=>document.getElementById('nuevo-cliente-'+x).value='');setTimeout(()=>document.getElementById('nuevo-cliente-nombre').focus(),50)}
function volverSelectorClientePedido(){const a=document.getElementById('cliente-selector-view'),b=document.getElementById('cliente-new-form');if(a)a.style.display='block';if(b)b.style.display='none'}
async function guardarNuevoClientePedido(e){e.preventDefault();const err=document.getElementById('nuevo-cliente-error'),btn=document.getElementById('nuevo-cliente-guardar'),body={nombre:document.getElementById('nuevo-cliente-nombre').value.trim(),telefono:document.getElementById('nuevo-cliente-telefono').value.trim(),direccion:document.getElementById('nuevo-cliente-direccion').value.trim(),referencias:document.getElementById('nuevo-cliente-referencias').value.trim(),notas:document.getElementById('nuevo-cliente-notas').value.trim()};err.textContent='';if(!body.nombre||clienteEsGenerico(body.nombre)){err.textContent='Escribe el nombre real del cliente.';return}btn.disabled=true;try{const r=await fetch('/api/customers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),x=await r.json();if(!r.ok)throw new Error(x.error||'No se pudo guardar');if(!x.id)throw new Error('CRM no devolvió el cliente');await asignarClientePedido(x.id)}catch(ex){err.textContent=ex.message}finally{btn.disabled=false}}
async function asignarClientePedido(id){const r=await fetch('/api/customers/'+encodeURIComponent(id)),c=await r.json();if(!r.ok){alert(c.error||'Cliente no encontrado');return}pedidoActivo.cliente_id=c.id;pedidoActivo.cliente_nombre=c.nombre;pedidoActivo.cliente_telefono=c.telefono||null;if(pedidoActivo.tipo_servicio==='delivery'){pedidoActivo.direccion_entrega=c.direccion||pedidoActivo.direccion_entrega||null;pedidoActivo.referencias_entrega=c.referencias||pedidoActivo.referencias_entrega||null}if(pedidoActivo.id){const rr=await fetch('/api/pos/asignar-cliente',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pedido_id:pedidoActivo.id,cliente_id:c.id,direccion_entrega:pedidoActivo.direccion_entrega||null,referencias_entrega:pedidoActivo.referencias_entrega||null})}),x=await rr.json();if(!rr.ok){alert(x.error||'No se pudo asignar');return}}cerrarModalAsignarClientePedido();if(typeof renderTicket==='function')renderTicket();if(typeof cargarDatos==='function')await cargarDatos()}
async function quitarClientePedido(){if(!pedidoActivo)return;if(pedidoActivo.id){const r=await fetch('/api/pos/asignar-cliente',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pedido_id:pedidoActivo.id,cliente_id:null})});if(!r.ok){const x=await r.json();alert(x.error||'No se pudo quitar');return}}pedidoActivo.cliente_id=null;pedidoActivo.cliente_nombre=null;pedidoActivo.cliente_telefono=null;cerrarModalAsignarClientePedido();if(typeof renderTicket==='function')renderTicket();if(typeof cargarDatos==='function')await cargarDatos()}
