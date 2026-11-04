'use strict';
// Each exposed field has a consumer. Hardware-only operations are deliberately not switches.
const bool = (label, value) => ({ label, type: 'boolean', default: value });
const num = (label, value, min, max) => ({ label, type: 'number', default: value, min, max });
const str = (label, value, max = 200) => ({ label, type: 'string', default: value, max });
const choice = (label, value, options) => ({ label, type: 'enum', default: value, options });
const roles = ['admin', 'mesero', 'cocina', 'repartidor', 'empleado'];
const grants = (label, value) => ({ label, type: 'roles', default: value, options: roles });
const schema = {
  business: {
    name: str('Nombre comercial', 'Los Compadres'),
    phone: str('Teléfono', ''),
    address: str('Dirección', ''),
    footer: str('Pie del ticket', 'Gracias por tu visita'),
    rfc: str('RFC (opcional)', '', 20),
    header: str('Encabezado del ticket', ''),
    currency: choice('Moneda de presentación (no convierte precios)', 'MXN', ['MXN', 'USD', 'EUR']),
    locale: choice('Formato regional', 'es-MX', ['es-MX', 'es-ES', 'en-US']),
    timeZone: {
      ...str('Zona horaria de presentación y horarios del bot', 'America/Mexico_City', 80),
      type: 'timezone',
    },
    hour12: bool('Mostrar hora en formato de 12 horas', false),
    ticketPrefix: str('Prefijo visible de ticket', '', 20),
    reviewQrEnabled: bool('Imprimir QR de reseñas', false),
    reviewQrText: str('Texto arriba del QR', '¡Déjanos tu reseña!', 160),
    reviewQrUrl: str('Enlace del QR', '', 1500),
    reviewQrImage: { ...str('QR generado', '', 300000), internal: true },
    surveyEnabled: bool('Imprimir encuesta separada con la precuenta', true),
    surveyDining: bool('Encuesta en comedor', true),
    surveyTakeout: bool('Encuesta para llevar', false),
    surveyDelivery: bool('Encuesta en delivery', false),
    surveyTitle: str('Título de la encuesta', '¿CÓMO LO HICIMOS?', 80),
    surveyMessage: str('Mensaje de la encuesta', 'Tu opinión nos ayuda a mejorar.', 180),
    surveyQuestion1: str('Pregunta 1', '¿Cómo calificas el servicio?', 120),
    surveyQuestion2: str('Pregunta 2', '¿Cómo calificas tus alimentos?', 120),
    surveyQuestion3: str('Pregunta 3', '¿Cómo fue el tiempo de espera?', 120),

    // Métricas utilizadas por el formato compacto actual.
    // Las preguntas anteriores se conservan por compatibilidad
    // con configuraciones guardadas.
    surveyMetric1: str('Métrica 1', 'Atención del personal', 120),
    surveyMetric2: str('Métrica 2', 'Calidad de los alimentos', 120),
    surveyMetric3: str('Métrica 3', 'Rapidez en el servicio', 120),
    surveyMetric4: str('Métrica 4', 'Limpieza de las instalaciones', 120),
    surveyMetric5: str('Métrica 5', 'Relación precio / calidad', 120),
    surveyFooter: str('Cierre de la encuesta', '¡Gracias por visitarnos!', 120),
  },
  pos: {
    allowAnonymous: bool('Permitir venta sin cliente', true),
    requireName: bool('Exigir nombre del cliente', false),
    requirePhone: bool('Exigir teléfono del cliente', false),
    allowNotes: bool('Permitir notas por producto', true),
    allowOpenPrice: bool('Permitir artículos de precio abierto', true),
    confirmRemove: bool('Confirmar al quitar productos', false),
    confirmCharge: bool('Confirmar antes de cobrar', false),
    syncMs: num('Actualización del POS (ms)', 1500, 1000, 30000),
  },
  orders: {
    dineIn: bool('Servicio en mesa', true),
    takeout: bool('Para llevar', true),
    delivery: bool('A domicilio', true),
    warningMinutes: num('Advertencia de pedido (min)', 10, 1, 240),
    criticalMinutes: num('Pedido crítico (min)', 20, 2, 480),
    estimatedMinutes: num('Tiempo estimado para mensajes (min)', 30, 1, 240),
  },
  eta: {
    enabled: bool('Usar tiempo estimado dinámico', true),
    minimumMinutes: num('ETA mínima (min)', 15, 1, 240),
    maximumMinutes: num('ETA máxima (min)', 90, 5, 480),
    rangeMarginMinutes: num('Margen del rango ± (min)', 5, 0, 60),
    minutesPerOrder: num('Minutos extra por pedido activo', 3, 0, 30),
    itemsIncluded: num('Artículos incluidos antes de penalizar carga', 8, 0, 100),
    minutesPerExtraItem: num('Minutos extra por artículo sobre la carga base', 1, 0, 15),
    deliveryExtraMinutes: num('Margen domicilio sin ubicación (min)', 10, 0, 120),
    deliveryDistanceEnabled: bool('Ajustar domicilio por distancia GPS', true),
    restaurantLatitude: str('Latitud del restaurante', '20.6597', 20),
    restaurantLongitude: str('Longitud del restaurante', '-103.3496', 20),
    deliveryRoadFactorPercent: num('Factor de distancia por calles (%)', 125, 100, 200),
    deliveryKm1: num('Primer tramo de reparto (km)', 1, 0.1, 20),
    deliveryMinutes1: num('Minutos de reparto · tramo 1', 5, 0, 120),
    deliveryKm2: num('Segundo tramo de reparto (km)', 2, 0.2, 30),
    deliveryMinutes2: num('Minutos de reparto · tramo 2', 8, 0, 120),
    deliveryReferenceRadiusKm: num('Radio máximo de referencia (km)', 3, 0.5, 50),
    deliveryMinutes3: num('Minutos de reparto · tramo final', 12, 0, 180),
    historyDays: num('Días de historial KDS utilizados', 30, 1, 180),
    historyWeight: num('Peso del historial real (%)', 35, 0, 100),
  },
  kds: {
    pollMs: num('Actualización de cocina web (ms)', 4000, 1000, 30000),
    warningMinutes: num('Umbral amarillo (min)', 10, 1, 240),
    criticalMinutes: num('Umbral rojo (min)', 20, 2, 480),
    showWaiter: bool('Mostrar mesero', true),
    showTable: bool('Mostrar mesa', true),
    showNotes: bool('Mostrar notas', true),
    showTime: bool('Mostrar hora de creación', true),
    fontSize: num('Tamaño de letra en cocina web', 18, 14, 36),
    maxTickets: num('Máximo de comandas en cocina web', 100, 1, 200),
    newestFirst: bool('Mostrar nuevas primero', false),
    allowRecall: bool('Permitir volver a pendiente', false),
    showDineIn: bool('Mostrar servicio en mesa', true),
    showTakeout: bool('Mostrar para llevar', true),
    showDelivery: bool('Mostrar domicilio', true),
    sound: bool('Aviso sonoro de nueva comanda (requiere activar audio)', false),
    volume: num('Volumen (%)', 50, 0, 100),
  },
  printing: {
    /* PRINT_CATEGORY_ROUTING_E2 */
    categoryRoutingEnabled: bool(
      'Distribuir comandas por categorías',
      false
    ),
    receiptCopies: num('Copias de recibos', 1, 1, 5),
    kitchenCopies: num('Copias de comandas', 1, 1, 5),
    autoReceipt: bool('Imprimir siempre al cobrar', false),
    autoKitchen: bool('Imprimir al enviar a cocina', true),
    showPhone: bool('Mostrar teléfono', true),
    showAddress: bool('Mostrar dirección', true),
    showCashier: bool('Mostrar cajero', true),
    showWaiter: bool('Mostrar mesero', true),
    showPayment: bool('Mostrar método de pago', true),
    showLogo: bool('Imprimir logo existente', true),
    logoWidth: num('Ancho del logo (px)', 300, 80, 320),
    drawerOnCash: bool('Abrir cajón al cobrar efectivo', false),
    drawerOnShift: bool('Abrir cajón al iniciar turno', true),
    drawerPin: choice('Pin del cajón', 0, [0, 1]),
    drawerOnMs: num('Pulso encendido (ms, múltiplo de 2)', 50, 2, 510),
    drawerOffMs: num('Pulso apagado (ms, múltiplo de 2)', 500, 2, 510),
    timeoutMs: num('Espera de impresora (ms)', 5000, 1000, 30000),
    maxAttempts: num('Intentos de impresión sin datos enviados', 3, 1, 5),
    retrySeconds: num('Espera entre reintentos (s)', 10, 2, 300),
  },
  attendance: {
    startTime: { ...str('Hora de entrada (compartida con nómina)', '07:30'), type: 'time' },
    toleranceMinutes: num('Tolerancia (compartida con nómina)', 5, 0, 120),
    method: choice('Método de marcaje', 'both', ['both', 'pin', 'fingerprint']),
    minPunchSeconds: num('Mínimo entre entrada y salida (s)', 5, 0, 3600),
    requireExitPass: bool('Exigir pase de salida a empleados', true),
  },
  biometric: {
    enabled: bool('Lector habilitado', true),
    attendanceEnabled: bool('Usar como checador', true),
    drawerEnabled: bool('Abrir cajón con huella', false),
    drawerAdminOnly: bool('Cajón solo para administradores', true),
    drawerCooldownSeconds: num('Espera entre aperturas (s)', 5, 1, 60),
    readerName: str('Nombre del lector', 'Lector biométrico principal', 60),
    minConfidence: num('Confianza mínima (0 no exige reporte)', 0, 0, 255),
    enrollmentEnabled: bool('Permitir enrolamiento', true),
    enrollmentTimeoutSeconds: num('Tiempo de enrolamiento (s)', 120, 15, 600),
    maxFingerprints: num('Mayor ID de huella admitido por el sensor', 998, 2, 998),
  },
  whatsapp: {
    enabled: bool('Bot de WhatsApp activo', false),
    botMode: choice('Modo de operación', 'admin_only', ['admin_only', 'internal', 'full']),
    adminGroupPeer: str('Chat / grupo Admin', '', 180),
    accountingGroupPeer: str('Chat / grupo Contabilidad', '', 180),
    closedDays: { label: 'Días cerrados (0 domingo a 6 sábado)', type: 'days', default: [2, 3] },
    opens: { ...str('Apertura', '09:00'), type: 'time' },
    closes: { ...str('Cierre', '18:00'), type: 'time' },
    deliveryNote: str(
      'Condiciones de entrega',
      'Cobertura y costo de envío por confirmar con el encargado.',
      400,
    ),
    transferInstructions: str(
      'Instrucciones públicas de transferencia',
      'Realiza la transferencia y envíanos tu comprobante por este mismo chat.',
      400,
    ),

    transferBank: str(
      'Banco para transferencias',
      '',
      100,
    ),

    transferHolder: str(
      'Titular de la cuenta',
      '',
      160,
    ),

    transferClabe: str(
      'CLABE',
      '',
      30,
    ),
    welcomeMessage: str('Bienvenida ({business})', '¡Hola! {business}', 800),
    closedMessage: str(
      'Fuera de horario ({opens}, {closes})',
      'Gracias por escribirnos. En este momento estamos fuera de nuestro horario de servicio. Nuestro horario es de {opens} a {closes}. Puedes dejarnos tu mensaje y con gusto te atenderemos cuando volvamos a estar disponibles.',
      800,
    ),
    receivedMessage: str(
      'Pedido recibido ({id}, {total}, {currency})',
      'Pedido #{id} recibido por {currency} {total}. Está pendiente de aceptación del restaurante y confirmación de envío. Aún no se ha registrado ningún pago.',
      800,
    ),
    acceptedMessage: str(
      'Pedido aceptado ({id}, {total}, {minutes})',
      'Tu pedido #{id} fue aceptado y enviado a cocina. Total de productos: {currency} {total}. Tiempo estimado: {minutes} min. El pago se verifica por separado.',
      800,
    ),
    pauseMinutes: num('Pausa por atención humana (min)', 15, 1, 240),
    minimumOrder: num('Mínimo de productos por pedido', 0, 0, 100000),
    requireReferences: bool('Exigir referencias de entrega', false),
    requireOpenShift: bool(
      'Exigir turno de caja abierto para recibir pedidos de WhatsApp',
      false,
    ),
    voiceTranscription: bool('Transcribir notas de voz automáticamente', true),
    sendToKitchenOnConfirm: bool(
      'Enviar a cocina inmediatamente al confirmar el cliente',
      true,
    ),
    aiEnabled: bool('Usar asistencia inteligente para lenguaje natural', false),
    aiFallback: bool('Continuar con flujo estructurado si la IA no está disponible', true),
  },
  notifications: {
    web: bool('Mostrar alertas en la web', true),
    whatsappAdmin: bool('Enviar alertas operativas al WhatsApp configurado en .env', false),
    printErrors: bool('Errores de impresión', true),
    kdsOffline: bool('KDS sin conexión', true),
    biometricOffline: bool('Biométrico sin conexión', true),
    whatsappOffline: bool('WhatsApp sin conexión', true),
    lateOrders: bool('Pedidos atrasados', true),
    attendance: bool('Notificaciones existentes de asistencia', true),
    cooldownMinutes: num('Mínimo entre alertas repetidas (min)', 15, 1, 1440),
  },
  ui: {
    theme: choice('Tema', 'dark', ['dark', 'light']),
    density: choice('Densidad', 'normal', ['compact', 'normal', 'large']),
    fontSize: num('Tamaño de letra base', 16, 14, 24),
    animations: bool('Animaciones', true),
    toastMs: num('Duración de avisos (ms)', 3200, 1000, 15000),
    posColumns: num('Columnas de productos en pantallas grandes', 4, 2, 8),
  },
  security: {
    sessionHours: num('Duración de nuevas sesiones (h)', 8, 1, 24),
    loginAttempts: num('Intentos de acceso por minuto', 10, 3, 30),
    settings: grants('Administrar configuración y dispositivos', ['admin']),
    employees: grants('Administrar empleados', ['admin']),
    payroll: grants('Administrar nómina', ['admin']),
    reports: grants('Reportes, recibos y contabilidad', ['admin']),
    catalog: grants('Modificar catálogo', ['admin']),
    shifts: grants('Administrar caja', ['admin']),
    pos: grants('Acceder a pedidos', ['admin', 'mesero', 'repartidor']),
    charge: grants('Acceder al módulo de cobro', ['admin']),

    chargeCash: grants(
      'Cobrar en efectivo',
      ['admin']
    ),

    chargeTransfer: grants(
      'Cobrar por transferencia',
      ['admin']
    ),

    // MP5_CHARGE_CARD_PERMISSION_V1
    chargeCard: grants(
      'Cobrar con tarjeta manual / terminal externa',
      ['admin']
    ),
    chargePoint: grants(
      'Cobrar con tarjeta · Mercado Pago Point',
      ['admin']
    ),

    chargeMixed: grants(
      'Realizar cobros mixtos',
      ['admin']
    ),

    pointCancel: grants(
      'Cancelar cobro pendiente de Mercado Pago Point',
      ['admin']
    ),

    pointRefund: grants(
      'Reembolsar pago de Mercado Pago Point',
      ['admin']
    ),
    ticketPrint: grants('Imprimir tickets', ['admin', 'mesero', 'repartidor']),
    ticketReprint: grants('Reimprimir tickets', ['admin', 'repartidor']),
    discounts: grants('Aplicar descuentos', ['admin']),
    customers: grants('Clientes / CRM', ['admin', 'mesero', 'repartidor']),
    inventory: grants('Consultar inventario', ['admin']),
    inventoryAdjust: grants('Ajustar inventario', ['admin']),
    cancel: grants('Cancelar cuentas', ['admin']),
    dispatch: grants('Despachar domicilio', ['admin', 'repartidor']),
    drawer: grants('Abrir cajón manualmente', ['admin']),
    kitchen: grants('Operar cocina', ['admin', 'mesero', 'cocina']),
    kdsConfig: grants('Administrar pantallas y eventos KDS', ['admin']),
    enrollment: grants('Enrolar huellas', ['admin']),
  },
  devices: {
    biometricOfflineSeconds: num('Biométrico sin conexión después de (s)', 7, 5, 120),
    kdsOfflineSeconds: num('KDS sin contacto después de (s)', 30, 10, 600),
    requestTimeoutMs: num('Espera de conexión KDS/WhatsApp (ms)', 3000, 1000, 15000),
    monitorSeconds: num('Intervalo de supervisión (s)', 30, 10, 300),
    wearableOfflineSeconds: num('Avisador offline después de (s)', 90, 30, 600),
    wearableHeartbeatSeconds: num('Heartbeat recomendado avisador (s)', 30, 10, 300),
    wearableTestDurationMs: num('Duración prueba avisador (ms)', 5000, 1000, 30000),
    rfidOfflineSeconds: num('Estación RFID offline después de (s)', 90, 30, 600),
    rfidHeartbeatSeconds: num('Heartbeat recomendado estación RFID (s)', 30, 10, 300),
    rfidEnrollmentSeconds: num('Ventana de enrolamiento RFID (s)', 60, 15, 300),
  },
};
const defaults = Object.fromEntries(
  Object.entries(schema).map(([m, fields]) => [
    m,
    Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, structuredClone(f.default)])),
  ]),
);
function invalid(path) {
  throw Object.assign(Error('Configuración inválida: ' + path), { status: 400 });
}
function validateModule(module, input, base = defaults[module]) {
  if (!schema[module] || !input || typeof input !== 'object' || Array.isArray(input))
    invalid(module);
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(input)) {
    const f = schema[module][key],
      path = module + '.' + key;
    if (!Object.hasOwn(schema[module], key)) invalid(path);
    if (f.type === 'boolean' && typeof value !== 'boolean') invalid(path);
    if (f.type === 'number' && (!Number.isInteger(value) || value < f.min || value > f.max))
      invalid(path);
    if (f.type === 'enum' && !f.options.includes(value)) invalid(path);
    if (['roles', 'days'].includes(f.type)) {
      if (
        !Array.isArray(value) ||
        value.length > 7 ||
        new Set(value).size !== value.length ||
        value.some((v) =>
          f.type === 'roles' ? !roles.includes(v) : !Number.isInteger(v) || v < 0 || v > 6,
        )
      )
        invalid(path);
      if (f.type === 'roles' && !value.includes('admin'))
        invalid(path + ' (admin debe conservar acceso)');
    }
    if (['string', 'timezone', 'time'].includes(f.type)) {
      if (typeof value !== 'string' || value.length > f.max || /[<>\x00-\x1f]/.test(value))
        invalid(path);
      if (f.type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) invalid(path);
      if (f.type === 'timezone') {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
        } catch {
          invalid(path);
        }
      }
    }
    result[key] = typeof value === 'string' ? value.trim() : structuredClone(value);
  }
  if (['orders', 'kds'].includes(module) && result.warningMinutes >= result.criticalMinutes)
    invalid(module + ': amarillo debe ser menor que rojo');
  if (module === 'orders' && !result.dineIn && !result.takeout && !result.delivery)
    invalid('orders: habilita al menos un servicio');
  if (module === 'printing' && (result.drawerOnMs % 2 || result.drawerOffMs % 2))
    invalid('printing: pulsos en múltiplos de 2 ms');
  return result;
}
function migrate(saved = {}, payroll = {}) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) invalid('documento guardado');
  if (saved.schemaVersion && saved.schemaVersion > 4) invalid('versión más reciente no compatible');
  const out = { schemaVersion: 4, revision: saved.revision || 0 };
  for (const module of Object.keys(schema)) {
    const legacy = module === 'whatsapp' ? saved.bot : null;
    out[module] = validateModule(module, saved[module] || legacy || {});
  }
  if (payroll.horario)
    out.attendance = validateModule('attendance', {
      ...out.attendance,
      startTime: payroll.horario.hora_entrada ?? out.attendance.startTime,
      toleranceMinutes: payroll.horario.tolerancia_minutos ?? out.attendance.toleranceMinutes,
    });
  out.printers = structuredClone(saved.printers || []);
  out.screens = structuredClone(saved.screens || []);
  out.bot = { ...out.whatsapp, timeZone: out.business.timeZone };
  return out;
}
function template(text, values) {
  return text.replace(/\{(\w+)\}/g, (match, key) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}
module.exports = { schema, defaults, validateModule, migrate, template, roles };
