async function renderSidebarGlobal() {
  await window.restaurantReady;
  if (document.getElementById('global-sidebar-drawer')) return;

  const sesionRaw = localStorage.getItem('empleado_sesion');
  const sesion = sesionRaw ? JSON.parse(sesionRaw) : { nombre: 'Invitado', rol: 'mesero' };
  const esAdmin = sesion.rol === 'admin';
  const esRepartidor = sesion.rol === 'repartidor';
  const esMesero = sesion.rol === 'mesero';
  const tieneAccesoConta = esAdmin || sesion.rol === 'contabilidad';

  // Bloqueo estricto por URL directa a nomina
  if (
    (window.location.pathname.includes('payroll') || window.location.pathname.includes('nomina')) &&
    !(window.restaurantSettings?.permissions.payroll ?? esAdmin)
  ) {
    alert('Acceso no autorizado. Este modulo no se encuentra disponible.');
    window.location.href = '/pos.html';
    return;
  }

  // Bloqueo estricto por URL directa a contabilidad
  if (
    window.location.pathname.includes('accounting') &&
    !(window.restaurantSettings?.permissions.reports ?? tieneAccesoConta)
  ) {
    alert('Acceso restringido al area de contabilidad.');
    window.location.href = '/pos.html';
    return;
  }

  const drawer = document.createElement('div');
  drawer.id = 'global-sidebar-drawer';
  drawer.innerHTML = `
    <div class="drawer-overlay" id="sidebar-overlay" onclick="toggleSidebarGlobal()"></div>
    <aside class="sidebar" id="main-sidebar">
      <div class="sidebar-header">
        <h3 style="margin:0; color:#A8C7FA;">LOS COMPADRES</h3>
        <span style="font-size:0.8rem; color:#aaa;">${sesion.nombre} (${String(sesion.rol || '').toUpperCase()})</span>
      </div>
      <div class="sidebar-menu">
        <div style="padding:8px 14px 4px;color:#6f7688;font-size:.66rem;font-weight:800;letter-spacing:.08em">OPERACIÓN</div>
        <a href="/index.html" class="sidebar-item ${window.location.pathname === '/' || window.location.pathname.includes('index') ? 'active' : ''}"><span class="material-icons-round">fingerprint</span> Terminal y Asistencia</a>
        ${(window.restaurantSettings?.permissions.pos ?? (esAdmin || esMesero || esRepartidor)) ? `<a href="/pos.html" class="sidebar-item ${window.location.pathname.includes('pos') ? 'active' : ''}"><span class="material-icons-round">point_of_sale</span> ${esRepartidor ? 'Pedidos A Domicilio' : 'Punto de Venta'}</a>` : ''}
        <a href="/shifts.html" class="sidebar-item ${window.location.pathname.includes('shift') ? 'active' : ''}"><span class="material-icons-round">lock_clock</span> Turno de Caja</a>
        ${esAdmin ? `<a href="/whatsapp.html" class="sidebar-item ${window.location.pathname.includes('whatsapp') ? 'active' : ''}"><span class="material-icons-round">chat</span> Centro de WhatsApp</a>` : ''}

        <div style="padding:12px 14px 4px;color:#6f7688;font-size:.66rem;font-weight:800;letter-spacing:.08em">GESTIÓN</div>
        <a href="/inventory.html" class="sidebar-item ${window.location.pathname.includes('inventory') ? 'active' : ''}"><span class="material-icons-round">inventory_2</span> Inventarios</a>
        <a href="/customers.html" class="sidebar-item ${window.location.pathname.includes('customers') ? 'active' : ''}"><span class="material-icons-round">contacts</span> Clientes</a>
        <a href="/items.html" class="sidebar-item ${window.location.pathname.includes('item') ? 'active' : ''}"><span class="material-icons-round">restaurant_menu</span> Menú / Artículos</a>
        <a href="/payroll.html" class="sidebar-item ${window.location.pathname.includes('payroll') || window.location.pathname.includes('nomina') ? 'active' : ''}"><span class="material-icons-round">payments</span> Nómina y Propinas</a>
        <a href="/receipts.html" class="sidebar-item ${window.location.pathname.includes('receipt') || window.location.pathname.includes('recibo') ? 'active' : ''}"><span class="material-icons-round">receipt_long</span> Recibos</a>

        <div style="padding:12px 14px 4px;color:#6f7688;font-size:.66rem;font-weight:800;letter-spacing:.08em">ADMINISTRACIÓN</div>
        <a href="/dashboard.html" class="sidebar-item ${window.location.pathname.includes('dashboard') ? 'active' : ''}"><span class="material-icons-round">analytics</span> Dashboard Analítico</a>
        <a href="/accounting.html" class="sidebar-item ${window.location.pathname.includes('accounting') ? 'active' : ''}"><span class="material-icons-round">account_balance_wallet</span> Contabilidad</a>
        <a href="/admin.html" class="sidebar-item ${window.location.pathname.includes('admin') ? 'active' : ''}"><span class="material-icons-round">admin_panel_settings</span> Administración</a>
        <a href="/settings.html" class="sidebar-item ${window.location.pathname.includes('setting') ? 'active' : ''}"><span class="material-icons-round">settings</span> Configuración</a>

        <a href="/index.html" class="sidebar-item" onclick="event.preventDefault();fetch('/api/auth/logout',{method:'POST'}).finally(()=>{localStorage.removeItem('empleado_sesion');location.href='/index.html';})">
          <span class="material-icons-round">logout</span> Cerrar Sesion
        </a>
      </div>
    </aside>
  `;
  document.body.appendChild(drawer);
  const permissions = window.restaurantSettings?.permissions;
  if (permissions)
    for (const [url, permission] of Object.entries({
      dashboard: 'reports',
      receipts: 'reports',
      payroll: 'payroll',
      accounting: 'reports',
      shifts: 'shifts',
      inventory: 'inventory',
      customers: 'customers',
      items: 'catalog',
      admin: 'employees',
      settings: 'settings',
      pos: 'pos',
    })) {
      const link = drawer.querySelector('a[href="/' + url + '.html"]');
      if (link && !permissions[permission]) link.remove();
    }
  const brand = drawer.querySelector('.sidebar-header h3');
  if (brand) brand.textContent = window.restaurantSettings?.business.name || 'Los Compadres';
}

function toggleSidebarGlobal() {
  const sb = document.getElementById('main-sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (sb && ov) {
    sb.classList.toggle('open');
    ov.classList.toggle('open');
  }
}

document.addEventListener('DOMContentLoaded', renderSidebarGlobal);
