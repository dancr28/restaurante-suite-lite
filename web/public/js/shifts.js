// Control de Turnos de Caja (Shifts)
async function abrirModuloTurnoCaja() {
  await window.restaurantReady;
  if (!window.restaurantSettings?.permissions.shifts)
    return alert('Tu rol no puede administrar la caja');
  const res = await fetch('/api/shifts/estado-actual');
  const data = await res.json();

  if (data.turno_abierto && data.turno) {
    document.getElementById('turno-titulo').innerText = 'Turno de Caja Abierto (Corte X)';
    document.getElementById('box-turno-abrir').style.display = 'none';
    document.getElementById('box-turno-operando').style.display = 'block';
    cargarResumenCorteXData(data.turno);
  } else {
    document.getElementById('turno-titulo').innerText = 'Apertura de Turno de Caja';
    document.getElementById('box-turno-abrir').style.display = 'block';
    document.getElementById('box-turno-operando').style.display = 'none';
  }

  const modal = document.getElementById('modal-turno-caja');
  if (modal) {
    modal.style.zIndex = '950';
    modal.style.display = 'flex';
  }
}

function cargarResumenCorteXData(r) {
  if (document.getElementById('cx-fondo-inicial'))
    document.getElementById('cx-fondo-inicial').innerText =
      `$${Number(r.monto_inicial || 0).toFixed(2)}`;
  if (document.getElementById('cx-ventas-efectivo'))
    document.getElementById('cx-ventas-efectivo').innerText =
      `$${Number(r.ventas_efectivo || 0).toFixed(2)}`;
  if (document.getElementById('cx-ventas-tarjeta'))
    document.getElementById('cx-ventas-tarjeta').innerText =
      `$${Number(r.ventas_tarjeta || 0).toFixed(2)}`;
  if (document.getElementById('cx-ventas-transf'))
    document.getElementById('cx-ventas-transf').innerText =
      `$${Number(r.ventas_transferencia || 0).toFixed(2)}`;
  if (document.getElementById('cx-pay-in'))
    document.getElementById('cx-pay-in').innerText = `+$${Number(r.total_pay_in || 0).toFixed(2)}`;
  if (document.getElementById('cx-pay-out'))
    document.getElementById('cx-pay-out').innerText =
      `-$${Number(r.total_pay_out || 0).toFixed(2)}`;
  if (document.getElementById('cx-efectivo-esperado'))
    document.getElementById('cx-efectivo-esperado').innerText =
      `$${Number(r.efectivo_esperado || 0).toFixed(2)}`;

  const btnCerrar = document.getElementById('btn-cerrar-turno-action');
  if (btnCerrar) btnCerrar.dataset.turnoId = r.id;
}

async function abrirTurnoCajaAction() {
  const monto = parseFloat(document.getElementById('turno-monto-apertura').value) || 0;
  const res = await fetch('/api/shifts/abrir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario_id: sesion.id, monto_inicial: monto }),
  });

  if (res.ok) {
    if (document.getElementById('modal-turno-caja'))
      document.getElementById('modal-turno-caja').style.display = 'none';
    if (document.getElementById('bloqueo-turno-pos'))
      document.getElementById('bloqueo-turno-pos').style.display = 'none';
    alert('Turno de caja abierto correctamente.');
    if (typeof cargarDatos === 'function') cargarDatos();
  } else {
    const err = await res.json();
    alert(err.error || 'Error al abrir turno');
  }
}

async function registrarMovimientoEfectivo(tipo) {
  const monto = prompt(
    `Monto para ${tipo === 'pay_in' ? 'Entrada (Pay In)' : 'Retiro (Pay Out)'}:`,
  );
  if (!monto || isNaN(monto) || parseFloat(monto) <= 0) return;
  const motivo = prompt('Motivo o concepto del movimiento:');
  if (!motivo) return;

  await fetch('/api/shifts/movimiento', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario_nombre: sesion.nombre, tipo, monto, motivo }),
  });

  alert('Movimiento registrado en caja.');
  abrirModuloTurnoCaja();
}

async function cerrarTurnoCajaAction() {
  await window.restaurantReady;
  if (!window.restaurantSettings?.permissions.shifts)
    return alert('Tu rol no puede administrar la caja');
  const real = prompt('Efectivo real contado en caja:');
  if (real === null || isNaN(real)) return;
  const notas = prompt('Observaciones o notas de cierre (opcional):');

  const res = await fetch('/api/shifts/cerrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      monto_final_real: parseFloat(real) || 0,
      notas_cierre: notas || '',
      usuario_id: sesion.id,
      usuario_nombre: sesion.nombre,
    }),
  });

  const data = await res.json();
  if (res.ok) {
    alert(
      `Corte Z completado e impreso.\nEsperado: $${Number(data.esperado).toFixed(2)}\nReal: $${Number(data.real).toFixed(2)}\nDiferencia: $${Number(data.diferencia).toFixed(2)}`,
    );
    if (document.getElementById('modal-turno-caja'))
      document.getElementById('modal-turno-caja').style.display = 'none';
    if (typeof cargarDatos === 'function') cargarDatos();
  } else {
    alert(data.error || 'Error al cerrar turno');
  }
}
