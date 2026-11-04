'use strict';
function can(cfg, role, action) {
  return cfg.security[action]?.includes(role) === true;
}
function actionFor(path, method) {
  const section = path.split('/')[1];
  if (path === '/runtime-settings') return null;
  if (path.startsWith('/admin/enrolar-huella/')) return 'enrollment';
  if (section === 'devices' && path.startsWith('/devices/kds')) return 'kdsConfig';
  if (['settings', 'devices'].includes(section)) return 'settings';
  if (section === 'admin') return 'employees';
  if (section === 'payroll') return 'payroll';
  if (section === 'receipts' && method === 'POST' && path.startsWith('/receipts/reimprimir/')) return 'ticketReprint';
  if (['accounting', 'dashboard', 'receipts'].includes(section)) return 'reports';
  if (section === 'items' && method !== 'GET') return 'catalog';
  if (section === 'customers') return 'customers';
  if (section === 'inventory') return method === 'GET' ? 'inventory' : 'inventoryAdjust';
  if (section === 'kitchen') return 'kitchen';
  if (section === 'shifts' && path !== '/shifts/estado-actual') return 'shifts';
  if (section === 'mercadopago') {
    // MP5_POINT_PERMISSION_ROUTING_V1
    //
    // Nuevo cobro Point -> chargePoint.
    // Cancelación -> pointCancel.
    // Reembolso -> pointRefund.
    // Operaciones ya existentes -> acceso POS.
    if (path.endsWith('/cancel')) return 'pointCancel';
    if (path.endsWith('/refund')) return 'pointRefund';

    if (
      /^\/mercadopago\/operations\/\d+(?:\/(?:reconcile|finalize))?$/.test(path)
    )
      return 'pos';

    if (
      /^\/mercadopago\/orders\/\d+\/(?:active|history)$/.test(path)
    )
      return 'pos';

    return 'chargePoint';
  }

  if (section === 'pos')
    return (
      {
        '/pos/cobrar-cuenta': 'charge',
        '/pos/abrir-cajon': 'drawer',
        '/pos/imprimir-precuenta': 'ticketPrint',
        '/pos/reimprimir-cocina': 'ticketReprint',
        '/pos/reimprimir-ticket': 'ticketReprint',
        '/pos/vaciar-comanda': 'cancel',
        '/pos/despachar-delivery': 'dispatch',
      }[path] || 'pos'
    );
  return null;
}
module.exports = { can, actionFor };
