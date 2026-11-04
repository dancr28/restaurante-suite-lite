let recibosCache = [];
let reciboSeleccionado = null;
let usuarioSesion = null;

document.addEventListener('DOMContentLoaded', () => {
  const raw = localStorage.getItem('empleado_sesion');
  if (raw) usuarioSesion = JSON.parse(raw);
  cargarRecibos();
});

async function cargarRecibos() {
  const cont = document.getElementById('lista-recibos-master');
  try {
    const res = await fetch('/api/receipts');
    if (!res.ok) throw new Error('Error al consultar el servidor');
    recibosCache = await res.json();
    renderListaRecibos(recibosCache);
  } catch (err) {
    console.error('Error cargando recibos:', err);
    if (cont) {
      cont.innerHTML = `
        <div style="text-align:center; color:#EF9A9A; padding:30px;">
          <span class="material-icons-round" style="font-size:36px;">error_outline</span>
          <div style="margin-top:6px;">No se pudieron cargar los recibos.</div>
          <button class="cat-btn" style="background:#252838; color:#A8C7FA; margin-top:10px;" onclick="cargarRecibos()">Reintentar</button>
        </div>
      `;
    }
  }
}

function renderListaRecibos(lista) {
  const cont = document.getElementById('lista-recibos-master');
  if (!cont) return;
  cont.innerHTML = '';

  if (!lista || lista.length === 0) {
    cont.innerHTML =
      '<div style="text-align:center; color:#888; padding:30px;">No hay recibos registrados.</div>';
    return;
  }

  // Agrupar por fecha
  const grupos = {};
  lista.forEach((r) => {
    const fechaObj = new Date(r.fecha_creacion || r.created_at || Date.now());
    const fechaClave = fechaObj.toLocaleDateString('es-MX', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    if (!grupos[fechaClave]) grupos[fechaClave] = [];
    grupos[fechaClave].push(r);
  });

  for (const [fechaTexto, items] of Object.entries(grupos)) {
    cont.innerHTML += `<div class="receipt-date-header">${fechaTexto}</div>`;
    items.forEach((r) => {
      const hora = new Date(r.fecha_creacion || r.created_at || Date.now()).toLocaleTimeString(
        'es-MX',
        { hour: '2-digit', minute: '2-digit' },
      );
      const esReembolso = r.estado === 'reembolsado';
      const esActivo = reciboSeleccionado && reciboSeleccionado.id === r.id;

      cont.innerHTML += `
        <div class="receipt-item-card ${esActivo ? 'active' : ''}" onclick="seleccionarRecibo(${r.id})">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="color:${esReembolso ? '#F2B8B5' : '#fff'}; font-size:0.95rem;">
              #${r.id} - ${r.mesa_numero || 'Venta'}
            </strong>
            <span style="font-size:0.95rem; font-weight:900; color:${esReembolso ? '#F2B8B5' : '#6DD58C'};">
              ${esReembolso ? '-' : ''}$${Number(r.total).toFixed(2)}
            </span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px; font-size:0.75rem; color:#888;">
            <span>${hora} • ${r.mesero || 'Caja'}</span>
            <span style="text-transform:uppercase; color:${esReembolso ? '#E53935' : '#A8C7FA'};">
              ${r.metodo_pago || 'efectivo'} ${esReembolso ? '(Reembolso)' : ''}
            </span>
          </div>
        </div>
      `;
    });
  }
}

function filtrarRecibosEnLista() {
  const q = (document.getElementById('input-buscar-recibo').value || '').toLowerCase().trim();
  if (!q) {
    renderListaRecibos(recibosCache);
    return;
  }

  const filtrados = recibosCache.filter(
    (r) =>
      String(r.id).includes(q) ||
      (r.mesa_numero && r.mesa_numero.toLowerCase().includes(q)) ||
      (r.cliente_nombre && r.cliente_nombre.toLowerCase().includes(q)) ||
      (r.mesero && r.mesero.toLowerCase().includes(q)),
  );
  renderListaRecibos(filtrados);
}

function seleccionarRecibo(id) {
  const r = recibosCache.find((x) => x.id === id);
  if (!r) return;
  reciboSeleccionado = r;

  document.querySelectorAll('.receipt-item-card').forEach((el) => el.classList.remove('active'));
  renderListaRecibos(recibosCache);

  const empty = document.getElementById('detail-empty-state');
  const content = document.getElementById('detail-content');
  const panel = document.getElementById('panel-receipt-detail');

  if (empty) empty.style.display = 'none';
  if (content) content.style.display = 'block';
  if (panel) panel.classList.add('mobile-view-open');

  const btnReembolso = document.getElementById('btn-reembolsar-action');
  if (btnReembolso) {
    btnReembolso.style.display = r.estado === 'reembolsado' ? 'none' : 'inline-flex';
  }

  renderTicketTermicoPreview(r);
}

function cerrarDetalleMobile() {
  const panel = document.getElementById('panel-receipt-detail');
  if (panel) panel.classList.remove('mobile-view-open');
}

function renderTicketTermicoPreview(r) {
  const box = document.getElementById('thermal-preview-container');
  if (!box) return;

  const fechaStr = new Date(r.fecha_creacion || r.created_at || Date.now()).toLocaleString('es-MX');
  const items = r.items || [];

  let itemsHtml = '';
  items.forEach((it) => {
    const sub = (Number(it.cantidad || 1) * Number(it.precio_unitario || 0)).toFixed(2);
    itemsHtml += `
      <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
        <span>${it.cantidad}x ${it.nombre}</span>
        <span>$${sub}</span>
      </div>
      ${it.modificadores ? `<div style="font-size:0.75rem; color:#555; margin-left:10px;">+ ${it.modificadores}</div>` : ''}
    `;
  });

  box.innerHTML = `
    <div style="text-align:center;">
      <h2 style="margin:0; font-size:1.2rem; font-weight:900;">LOS COMPADRES</h2>
      <div style="font-size:0.8rem; margin-top:2px;">TICKET DE VENTA</div>
      ${r.estado === 'reembolsado' ? '<div style="color:#d32f2f; font-weight:900; margin-top:4px;">*** REEMBOLSADO ***</div>' : ''}
    </div>
    <hr>
    <div style="font-size:0.8rem; line-height:1.3;">
      <div><strong>Folio:</strong> #${r.id}</div>
      <div><strong>Mesa/Orden:</strong> ${r.mesa_numero || 'General'}</div>
      <div><strong>Atendió:</strong> ${r.mesero || 'General'}</div>
      <div><strong>Fecha:</strong> ${fechaStr}</div>
      ${r.cliente_nombre ? `<div><strong>Cliente:</strong> ${r.cliente_nombre}</div>` : ''}
    </div>
    <hr>
    <div style="font-size:0.85rem;">
      ${itemsHtml || '<div style="color:#888; text-align:center;">Sin partidas registradas</div>'}
    </div>
    <hr>
    <div style="display:flex; justify-content:space-between; font-size:1.1rem; font-weight:900;">
      <span>TOTAL:</span>
      <span>$${Number(r.total).toFixed(2)}</span>
    </div>
    <div style="font-size:0.8rem; margin-top:4px; text-align:right;">
      <div>Método: ${String(r.metodo_pago || 'efectivo').toUpperCase()}</div>
      ${r.paga_con ? `<div>Paga con: $${Number(r.paga_con).toFixed(2)}</div>` : ''}
      ${r.cambio ? `<div>Cambio: $${Number(r.cambio).toFixed(2)}</div>` : ''}
    </div>
    ${
      r.motivo_reembolso
        ? `
      <hr>
      <div style="font-size:0.75rem; color:#d32f2f;">
        <strong>Motivo Reembolso:</strong> ${r.motivo_reembolso}
      </div>
    `
        : ''
    }
    <hr>
    <div style="text-align:center; font-size:0.8rem; margin-top:8px;">
      ¡Gracias por su preferencia!
    </div>
  `;
}

async function reimprimirReciboActual() {
  if (!reciboSeleccionado) return;
  try {
    const res = await fetch(`/api/receipts/reimprimir/${reciboSeleccionado.id}`, {
      method: 'POST',
    });
    if (res.ok) alert('✓ Ticket enviado a la impresora térmica.');
    else alert('No se pudo reimprimir el ticket.');
  } catch (e) {
    alert('Error al conectar con la impresora.');
  }
}

function abrirModalReembolso() {
  if (!reciboSeleccionado) return;
  const box = document.getElementById('reembolso-info-box');
  if (box) {
    box.innerHTML = `
      <div><strong>Folio:</strong> #${reciboSeleccionado.id} - ${reciboSeleccionado.mesa_numero}</div>
      <div><strong>Monto a Reembolsar:</strong> <span style="color:#6DD58C; font-weight:900;">$${Number(reciboSeleccionado.total).toFixed(2)}</span></div>
      <div><strong>Forma de Pago Original:</strong> ${String(reciboSeleccionado.metodo_pago || 'efectivo').toUpperCase()}</div>
    `;
  }
  document.getElementById('reembolso-motivo').value = '';
  document.getElementById('modal-reembolso').style.display = 'flex';
}

async function ejecutarReembolsoFinal() {
  if (!reciboSeleccionado) return;
  const motivo = document.getElementById('reembolso-motivo').value.trim();
  const restock = document.getElementById('reembolso-restock').checked;

  if (!motivo) return alert('El motivo del reembolso es obligatorio.');

  const res = await fetch('/api/receipts/reembolso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pedido_id: reciboSeleccionado.id,
      motivo: motivo,
      usuario_nombre: usuarioSesion ? usuarioSesion.nombre : 'Admin',
      restock_items: restock,
    }),
  });

  if (res.ok) {
    document.getElementById('modal-reembolso').style.display = 'none';
    alert('✓ Reembolso procesado e impreso.');
    await cargarRecibos();
    seleccionarRecibo(reciboSeleccionado.id);
  } else {
    const err = await res.json();
    alert(`Error: ${err.error || 'No se pudo procesar el reembolso'}`);
  }
}
