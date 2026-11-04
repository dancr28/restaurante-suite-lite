'use strict';
const moduleNames = {
  business: 'Tu restaurante',
  pos: 'Punto de venta',
  orders: 'Pedidos',
  eta: 'Tiempos y carga de cocina',
  kds: 'Cocina · KDS',
  printing: 'Impresoras y tickets',
  attendance: 'Asistencia',
  biometric: 'Lector biométrico',
  whatsapp: 'WhatsApp',
  notifications: 'Notificaciones',
  ui: 'Interfaz',
  security: 'Seguridad y permisos',
  devices: 'Red y dispositivos',
};
const moduleIcons = {
  pos: 'point_of_sale',
  orders: 'receipt_long',
  eta: 'timer',
  attendance: 'schedule',
  notifications: 'notifications',
  ui: 'palette',
  security: 'admin_panel_settings',
  devices: 'devices',
};
const existingFields = {
  business: ['name', 'phone', 'address', 'footer', 'reviewQrEnabled', 'reviewQrText', 'reviewQrUrl', 'reviewQrImage', 'surveyEnabled', 'surveyDining', 'surveyTakeout', 'surveyDelivery', 'surveyTitle', 'surveyMessage', 'surveyQuestion1', 'surveyQuestion2', 'surveyQuestion3', 'surveyMetric1', 'surveyMetric2', 'surveyMetric3', 'surveyMetric4', 'surveyMetric5', 'surveyFooter'],
  biometric: [
    'enabled',
    'attendanceEnabled',
    'drawerEnabled',
    'drawerAdminOnly',
    'drawerCooldownSeconds',
    'readerName',
  ],
  whatsapp: ['enabled', 'opens', 'closes', 'closedDays', 'deliveryNote', 'transferInstructions'],
};
let settingsDirty = false;
document.addEventListener('input', () => {
  settingsDirty = true;
});
window.addEventListener('beforeunload', (e) => {
  if (settingsDirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});
window.addEventListener('settings-saved', () => {
  settingsDirty = false;
});
async function initializeModules() {
  const schema = await api('/api/devices/schema');
  for (const [module, fields] of Object.entries(schema)) {
    const viewId = { business: 'restaurant', printing: 'printers' }[module] || module;
    let section = document.querySelector(`[data-settings-view="${viewId}"]`);
    if (!section) {
      section = el('section', undefined, 'settings-view');
      section.dataset.settingsView = viewId;
      section.append(el('h2', moduleNames[module]));
      document.querySelector('.settings-container').append(section);
      const card = el('button', undefined, 'settings-menu-card');
      const icon = el('div', undefined, 'settings-card-icon');
      icon.append(el('span', moduleIcons[module] || 'tune', 'material-icons-round'));
      const content = el('div', undefined, 'settings-card-content');
      content.append(
        el('strong', moduleNames[module]),
        el('span', 'Preferencias y reglas de operación'),
      );
      card.append(
        icon,
        content,
        el('span', 'chevron_right', 'material-icons-round settings-chevron'),
      );
      card.onclick = () =>
        openSettingsView(viewId, moduleNames[module], 'Preferencias del sistema');
      document.querySelector('.settings-grid').append(card);
      SETTINGS_META[viewId] = { title: moduleNames[module], subtitle: 'Preferencias del sistema' };
    }
    const panel = el('div', undefined, 'settings-panel');
    const grid = el('div', undefined, 'grid');
    const switchList = el('div', undefined, 'settings-switch-list');
    if (module === 'kds')
      panel.append(
        el(
          'p',
          'Restaurant Suite es la fuente única de configuración KDS. Los grupos, categorías, productos y reglas se administran aquí; Android recibe y muestra exactamente lo que el servidor le envía.',
          'settings-info-box',
        ),
      );
    if (module === 'security')
      panel.append(
        el(
          'p',
          'Admin conserva acceso. Solo los administradores pueden modificar esta tarjeta. Los cambios de permisos se aplican a la siguiente petición.',
        ),
      );
    for (const [key, f] of Object.entries(fields)) {
      if (existingFields[module]?.includes(key) || f.internal) continue;
      const current = state[module][key];
      const update = (v) => {
        state[module][key] = v;
        if (module === 'whatsapp') state.bot[key] = v;
        settingsDirty = true;
      };
      if (f.type === 'boolean') {
        const row = el('label', undefined, 'settings-switch-row');
        const info = el('div');
        info.append(el('strong', f.label), el('span', 'Activar o desactivar esta opción.'));
        const input = el('input');
        input.type = 'checkbox';
        input.checked = Boolean(current);
        input.id = 'setting-' + module + '-' + key;
        input.onchange = () => update(input.checked);
        row.append(info, input);
        switchList.append(row);
        continue;
      }
      const label = el('label', f.label);
      let input;
      if (f.type === 'roles') {
        const box = el('fieldset');
        box.append(el('legend', f.label));
        for (const role of f.options) {
          const item = el('label', undefined, 'check'),
            check = el('input');
          check.type = 'checkbox';
          check.checked = current.includes(role);
          check.disabled = role === 'admin';
          check.onchange = () =>
            update(Array.from(box.querySelectorAll('input:checked')).map((x) => x.value));
          check.value = role;
          item.append(check, document.createTextNode(role));
          box.append(item);
        }
        grid.append(box);
        continue;
      }
      if (f.type === 'enum') {
        input = el('select');
        for (const option of f.options) {
          const item = el('option', String(option));
          item.value = option;
          input.append(item);
        }
        input.value = current;
        input.onchange = () =>
          update(typeof f.default === 'number' ? Number(input.value) : input.value);
      } else {
        input = el('input');
        input.type = f.type === 'number' ? 'number' : f.type === 'time' ? 'time' : 'text';
        input.value = Array.isArray(current) ? current.join(',') : current;
        if (f.min !== undefined) input.min = f.min;
        if (f.max !== undefined) {
          if (f.type === 'number') input.max = f.max;
          else input.maxLength = f.max;
        }
        input.oninput = () =>
          update(
            f.type === 'number'
              ? Number(input.value)
              : f.type === 'days'
                ? input.value
                    .split(',')
                    .filter((x) => x.trim())
                    .map(Number)
                : input.value,
          );
      }
      input.id = 'setting-' + module + '-' + key;
      label.htmlFor = input.id;
      label.append(input);
      grid.append(label);
    }
    if (switchList.children.length) panel.append(switchList);
    if (grid.children.length) panel.append(grid);
    section.append(panel);
    if (module === 'devices' || module === 'notifications') {
      const box = el('div', undefined, 'settings-panel');
      box.id = 'overview-' + module;
      section.append(action('Actualizar estado', refreshOverview), box);
    }
    if (module === 'attendance') {
      const link = el('a', 'Abrir nómina: propinas, comisiones y cálculo');
      link.href = '/payroll.html';
      panel.append(link);
    }
  }
  await refreshOverview().catch((e) =>
    notice('Configuración cargada. No se pudo consultar el estado: ' + e.message, true),
  );
  openSettingsFromHash();
}
async function refreshOverview() {
  const data = await api('/api/devices/overview');
  for (const kind of ['devices', 'notifications']) {
    const box = document.getElementById('overview-' + kind);
    box.replaceChildren();
    const rows = kind === 'devices' ? data.devices : data.alerts;
    for (const row of rows) {
      const card = el('article', undefined, 'card');
      card.append(el('strong', row.name || row.message));
      if (row.status) card.append(el('p', row.status));
      if (row.detail) card.append(el('p', row.detail));
      box.append(card);
    }
    if (!rows.length) box.append(el('p', 'Sin alertas activas.'));
  }
}
