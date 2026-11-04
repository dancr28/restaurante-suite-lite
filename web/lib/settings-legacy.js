const { randomUUID } = require('node:crypto');
const net = require('node:net');
const defaults = {
  business: { name: 'Los Compadres', phone: '', address: '', footer: 'Gracias por tu visita' },
  printers: [],
  screens: [],
  biometric: {
    enabled: true,
    attendanceEnabled: true,
    drawerEnabled: false,
    drawerAdminOnly: true,
    drawerCooldownSeconds: 5,
    readerName: 'Lector biométrico principal',
  },
  bot: {
    enabled: false,
    closedDays: [2, 3],
    opens: '09:00',
    closes: '18:00',
    deliveryNote: 'Cobertura y costo de envío por confirmar con el encargado.',
    transferInstructions: 'Consulta al encargado los datos de transferencia.',
  },
};
function text(x, max = 200) {
  if (typeof x !== 'string' || x.length > max || /[<>\x00-\x1f]/.test(x))
    throw Object.assign(new Error('Texto de configuración inválido'), { status: 400 });
  return x.trim();
}
function validate(input) {
  if (
    !input ||
    !Array.isArray(input.printers) ||
    !Array.isArray(input.screens) ||
    input.printers.length > 12 ||
    input.screens.length > 12
  )
    throw Object.assign(new Error('Configuración inválida'), { status: 400 });
  const clean = {
    business: {},
    printers: [],
    screens: [],
    biometric: {},
    bot: {},
  };
  for (const key of ['name', 'phone', 'address', 'footer'])
    clean.business[key] = text(input.business?.[key] || '');
  const ids = new Set();

  /* PRINT_CATEGORY_ROUTING_D1
   * Configuración solamente.
   * No cambia el envío de trabajos de impresión.
   */
  function categoryIds(printer) {
    const values = printer.category_ids ?? [];
    if (!Array.isArray(values) || values.length > 500) {
      throw Object.assign(
        new Error('Categorías de impresora inválidas'),
        { status: 400 }
      );
    }
    const ids = values.map((value) => {
      const number = Number(value);
      if (!Number.isSafeInteger(number) || number <= 0) {
        throw Object.assign(
          new Error('ID de categoría inválido'),
          { status: 400 }
        );
      }
      return number;
    });
    return [...new Set(ids)];
  }

  /* MP_POINT_PRINTER_CONFIG_V1 */
  for (const p of input.printers) {
    const id = text(p.id || '', 64);

    if (
      !/^[a-zA-Z0-9-]{1,64}$/.test(id) ||
      ids.has(id)
    ) {
      throw Object.assign(
        new Error('ID de impresora inválido'),
        { status: 400 }
      );
    }

    ids.add(id);

    const transport =
      p.transport === 'mercadopago_point'
        ? 'mercadopago_point'
        : 'tcp';

    const kinds = Array.isArray(p.kinds)
      ? [
          ...new Set(
            p.kinds
              .map((x) => text(x, 40))
              .filter(Boolean)
          )
        ]
      : [];

    if (transport === 'mercadopago_point') {
      /* MP_POINT_PRINTER_KINDS_V1 */

      const unsupportedPointKinds =
        kinds.filter(
          (kind) =>
            ![
              'kitchen',
              'cancel'
            ].includes(kind)
        );

      if (unsupportedPointKinds.length) {
        throw Object.assign(
          new Error(
            'Mercado Pago Point actualmente solo admite '
            + 'Comandas y Cancelaciones'
          ),
          { status: 400 }
        );
      }

      const terminalId =
        text(
          p.terminal_id ||
          p.terminalId ||
          '',
          160
        );

      if (
        !terminalId ||
        !/^[A-Za-z0-9_-]{5,160}$/.test(
          terminalId
        )
      ) {
        throw Object.assign(
          new Error(
            'Terminal Mercado Pago Point inválida'
          ),
          { status: 400 }
        );
      }

      clean.printers.push({
        id,
        name: text(
          p.name || 'Mercado Pago Point',
          60
        ),
        enabled: p.enabled !== false,

        transport:
          'mercadopago_point',

        terminal_id:
          terminalId,

        terminal_alias:
          text(
            p.terminal_alias ||
            p.terminalAlias ||
            '',
            100
          ),

        width: 80,
        columns: 48,
        cut: false,

        category_ids: categoryIds(p),
        kinds
      });

      continue;
    }

    const host =
      text(
        p.host ||
        p.ip ||
        '',
        255
      );

    const port =
      Number(
        p.port ?? 9100
      );

    if (
      !host ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    ) {
      throw Object.assign(
        new Error(
          'IP o puerto de impresora inválido'
        ),
        { status: 400 }
      );
    }

    const width =
      Number(p.width) === 58
        ? 58
        : 80;

    const columns =
      Number(p.columns) > 0
        ? Math.min(
            80,
            Math.max(
              20,
              Math.trunc(
                Number(p.columns)
              )
            )
          )
        : (
            width === 58
              ? 32
              : 48
          );

    clean.printers.push({
      id,
      name: text(
        p.name || 'Impresora',
        60
      ),
      enabled: p.enabled !== false,

      transport: 'tcp',

      host,
      port,

      width,
      columns,

      cut:
        p.cut !== false,

      category_ids: categoryIds(p),
      kinds
    });
  }

  const bio = input.biometric || {};

  const cooldown = Number(bio.drawerCooldownSeconds ?? 5);

  if (!Number.isInteger(cooldown) || cooldown < 1 || cooldown > 60) {
    throw Object.assign(new Error('Cooldown biométrico inválido'), { status: 400 });
  }

  clean.biometric = {
    enabled: bio.enabled !== false,

    attendanceEnabled: bio.attendanceEnabled !== false,

    drawerEnabled: bio.drawerEnabled === true,

    drawerAdminOnly: bio.drawerAdminOnly !== false,

    drawerCooldownSeconds: cooldown,

    readerName: text(bio.readerName || 'Lector biométrico principal', 60),
  };

  const b = input.bot || {};
  if (
    !/^\d{2}:\d{2}$/.test(b.opens || '') ||
    !/^\d{2}:\d{2}$/.test(b.closes || '') ||
    b.opens >= '24:00' ||
    b.closes >= '24:00' ||
    b.opens.slice(3) >= '60' ||
    b.closes.slice(3) >= '60'
  )
    throw Object.assign(new Error('Horario inválido'), { status: 400 });
  clean.bot = {
    enabled: b.enabled === true,
    closedDays: [
      ...new Set((b.closedDays || []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)),
    ],
    opens: b.opens,
    closes: b.closes,
    deliveryNote: text(b.deliveryNote || '', 400),
    transferInstructions: text(b.transferInstructions || '', 400),
  };
  return clean;
}
module.exports = { validate, defaults };
