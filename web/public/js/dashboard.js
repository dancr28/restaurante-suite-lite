document.addEventListener('DOMContentLoaded', () => {
  cargarMetricasDashboard('todo');
});

async function cargarMetricasDashboard(rango = 'todo') {
  try {
    const res = await fetch(`/api/dashboard/metricas?rango=${rango}`);
    const data = await res.json();

    if (!data || !data.kpis) return;

    const k = data.kpis;

    // Asignación de KPIs principales
    actualizarTextoElemento(
      ['kpi-ventas-netas', 'txt-ventas-netas'],
      `$${k.ventas_netas.toFixed(2)}`,
    );
    actualizarTextoElemento(
      ['kpi-ganancia-bruta', 'txt-ganancia-bruta'],
      `$${k.ganancia_bruta.toFixed(2)}`,
    );
    actualizarTextoElemento(
      ['kpi-costo-insumos', 'txt-costo-insumos'],
      `$${k.costo_total.toFixed(2)}`,
    );
    actualizarTextoElemento(
      ['kpi-ticket-promedio', 'txt-ticket-promedio'],
      `$${k.ticket_promedio.toFixed(2)}`,
    );

    // Renderizar Tablas y Gráficas si los contenedores existen
    renderTablaProductos(data.ventas_por_producto || []);
    renderVentasCategorias(data.ventas_por_categoria || []);
    renderMetodosCobro(data.metodos_cobro || []);
  } catch (err) {
    console.error('Error cargando métricas del dashboard:', err);
  }
}

function actualizarTextoElemento(ids, valor) {
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerText = valor;
  });
}

function renderTablaProductos(lista) {
  const cont =
    document.getElementById('tabla-desglose-platillos') ||
    document.getElementById('body-productos-dashboard');
  if (!cont) return;
  cont.innerHTML = '';

  if (lista.length === 0) {
    cont.innerHTML =
      '<tr><td colspan="6" style="text-align:center; color:#888; padding:12px;">Sin ventas en el período.</td></tr>';
    return;
  }

  lista.forEach((item) => {
    cont.innerHTML += `
      <tr style="border-bottom: 1px solid #2a2c38;">
        <td style="padding: 8px;"><strong>${item.nombre}</strong></td>
        <td style="padding: 8px; color:#aaa;">${item.categoria}</td>
        <td style="padding: 8px; text-align:center;">${item.cantidad_vendida}</td>
        <td style="padding: 8px; color:#6DD58C; font-weight:700;">$${Number(item.ingresos_totales).toFixed(2)}</td>
        <td style="padding: 8px; color:#aaa;">$${Number(item.costo_total).toFixed(2)}</td>
        <td style="padding: 8px; color:#A8C7FA; font-weight:700;">$${Number(item.ganancia).toFixed(2)}</td>
      </tr>
    `;
  });
}

function renderVentasCategorias(lista) {
  const cont = document.getElementById('box-ventas-categoria');
  if (!cont) return;
  cont.innerHTML = '';

  if (lista.length === 0) {
    cont.innerHTML = '<div style="color:#888; padding:10px;">Sin ventas en el período.</div>';
    return;
  }

  lista.forEach((c) => {
    cont.innerHTML += `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; background:#1e2029; padding:8px 12px; border-radius:6px;">
        <span style="color:${c.color || '#A8C7FA'}; font-weight:700;">${c.categoria} (${c.articulos_vendidos})</span>
        <strong style="color:#6DD58C;">$${Number(c.total_ingresos).toFixed(2)}</strong>
      </div>
    `;
  });
}

function renderMetodosCobro(lista) {
  const cont = document.getElementById('box-metodos-cobro');
  if (!cont) return;
  cont.innerHTML = '';

  if (lista.length === 0) {
    cont.innerHTML = '<div style="color:#888; padding:10px;">Sin registros.</div>';
    return;
  }

  lista.forEach((m) => {
    cont.innerHTML += `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; background:#1e2029; padding:8px 12px; border-radius:6px;">
        <span style="color:#fff; text-transform:uppercase;">${m.metodo} (${m.total_pedidos})</span>
        <strong style="color:#6DD58C;">$${Number(m.total_monto).toFixed(2)}</strong>
      </div>
    `;
  });
}
