'use strict';

/*
 * MP_POINT_PRINT_RENDERER_V1
 *
 * Convierte una comanda Restaurant Suite al formato
 * de impresión personalizada soportado por Point Smart.
 *
 * Este archivo NO envía nada a Mercado Pago.
 */

const mp = require('./mercadopago.service');
const sharp = require('sharp');
const {
  renderKitchen
} = require('../lib/kitchen-ticket');

const MIN_CONTENT = 100;
const MAX_CONTENT = 4096;
const SAFE_TARGET = 3950;

function clean(value) {
  return String(value ?? '')
    .replace(/[{}]/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function crop(value, max) {
  const text = clean(value);

  if (text.length <= max)
    return text;

  return text.slice(0, Math.max(0, max - 3)).trimEnd() + '...';
}

function wrap(value, width = 32) {
  const text = clean(value);

  if (!text)
    return [];

  const words = text.split(/\s+/);
  const lines = [];
  let line = '';

  for (let word of words) {
    while (word.length > width) {
      if (line) {
        lines.push(line);
        line = '';
      }

      lines.push(word.slice(0, width));
      word = word.slice(width);
    }

    if (!word)
      continue;

    const candidate =
      line
        ? line + ' ' + word
        : word;

    if (candidate.length > width) {
      if (line)
        lines.push(line);

      line = word;
    } else {
      line = candidate;
    }
  }

  if (line)
    lines.push(line);

  return lines;
}

function normalizeModifiers(value) {
  if (!value)
    return [];

  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === 'string'
          ? item
          : item?.nombre ||
            item?.name ||
            item?.opcion ||
            item?.label ||
            ''
      )
      .map(clean)
      .filter(Boolean);
  }

  if (typeof value === 'object') {
    return Object.values(value)
      .flat()
      .map((item) =>
        typeof item === 'string'
          ? item
          : item?.nombre ||
            item?.name ||
            item?.opcion ||
            item?.label ||
            ''
      )
      .map(clean)
      .filter(Boolean);
  }

  const raw = clean(value);

  if (!raw)
    return [];

  try {
    return normalizeModifiers(JSON.parse(raw));
  } catch {
    return raw
      .split(/\n|,\s*|\s*\+\s*/)
      .map(clean)
      .filter(Boolean);
  }
}

// MP_POINT_PRINT_RENDERER_V2
// Renderer de texto nativo optimizado para Point Smart 2.
// Formato validado físicamente:
// - producto: grande + negrita
// - modificadores/notas: negrita normal
// - separación fuerte entre grupos de numero_plato
// - encabezados principales: grande + negrita

function pointMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : '$0.00';
}

function pointTimeOnly(value) {
  if (value === null || value === undefined || value === '') return '';

  const raw = String(value).trim();

  const direct = raw.match(/(?:^|[ T,])(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (direct) {
    return `${String(direct[1]).padStart(2, '0')}:${direct[2]}`;
  }

  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  return raw.slice(0, 24);
}

function pointGroupItems(items) {
  const groups = [];

  for (const item of Array.isArray(items) ? items : []) {
    const rawPlate = item?.numero_plato ?? item?.numeroPlato ?? null;
    const plate =
      rawPlate === null || rawPlate === undefined || rawPlate === ''
        ? null
        : String(rawPlate);

    const last = groups[groups.length - 1];

    if (!last || last.plate !== plate) {
      groups.push({
        plate,
        items: [item],
      });
    } else {
      last.items.push(item);
    }
  }

  return groups;
}

function pointStyle(text, {
  align = 'left',
  bold = false,
  large = false,
} = {}) {
  const value = clean(text);
  if (!value) return '';

  let body = value;

  if (large) body = `{w}${body}{/w}`;
  if (bold) body = `{b}${body}{/b}`;

  return `{${align}}${body}{/${align}}{br}`;
}

function line(text, style = '') {
  return pointStyle(text, {
    align: 'left',
    bold: style === 'b',
    large: style === 'w',
  });
}

function center(text, style = '') {
  return pointStyle(text, {
    align: 'center',
    bold: style === 'b',
    large: style === 'w',
  });
}

function boldLine(text) {
  return pointStyle(text, {
    align: 'left',
    bold: true,
  });
}

function boldCenter(text) {
  return pointStyle(text, {
    align: 'center',
    bold: true,
  });
}

function largeBoldLine(text) {
  return pointStyle(text, {
    align: 'left',
    bold: true,
    large: true,
  });
}

function largeBoldCenter(text) {
  return pointStyle(text, {
    align: 'center',
    bold: true,
    large: true,
  });
}

function separator() {
  return '{left}{b}================================{/b}{/left}{br}';
}

function blankLine() {
  return '{br}';
}

function renderKitchenCustom(kind, data = {}) {
  const MIN_CONTENT = 100;
  const MAX_CONTENT = 4096;
  const SAFE_TARGET = 3950;

  const tokens = [];
  let length = 0;
  let truncated = false;

  const push = (token, reserve = 0) => {
    if (!token) return true;

    if (length + token.length + reserve > SAFE_TARGET) {
      truncated = true;
      return false;
    }

    tokens.push(token);
    length += token.length;
    return true;
  };

  const pushAlways = (token) => {
    if (!token) return;
    tokens.push(token);
    length += token.length;
  };

  const normalizedKind = String(kind || '').trim().toLowerCase();
  const isCancel = normalizedKind === 'cancel';
  const isExtra =
    Boolean(data?.extra) ||
    Boolean(data?.es_extra) ||
    String(data?.tipo || '').toLowerCase() === 'extra';

  if (isCancel) {
    pushAlways(largeBoldCenter('CANCELACION'));
  }

  if (isExtra) {
    pushAlways(largeBoldCenter('EXTRA'));
  }

  const turno =
    data?.numero_turno ??
    data?.turno ??
    data?.turno_numero ??
    data?.order_number ??
    null;

  if (turno !== null && turno !== undefined && turno !== '') {
    pushAlways(largeBoldCenter(`TURNO #${turno}`));
  }

  const mesa =
    data?.mesa_numero ??
    data?.mesa ??
    data?.table ??
    null;

  const serviceRaw = String(
    data?.tipo_servicio ??
    data?.servicio ??
    data?.service ??
    ''
  ).trim();

  const service = serviceRaw.toUpperCase();

  if (mesa !== null && mesa !== undefined && mesa !== '') {
    const mesaLimpia = String(mesa)
      .replace(/^\\s*mesa\\s*/i, '')
      .trim();
    pushAlways(largeBoldCenter(`MESA ${mesaLimpia}`));
  } else if (service) {
    pushAlways(largeBoldCenter(service));
  }

  if (
    mesa !== null &&
    mesa !== undefined &&
    mesa !== '' &&
    service &&
    !['COMEDOR', 'MESA'].includes(service)
  ) {
    pushAlways(largeBoldCenter(service));
  }

  const printedAt =
    data?.printed_at ??
    data?.fecha ??
    data?.created_at ??
    '';

  const hour = pointTimeOnly(printedAt);

  if (hour) {
    pushAlways(line(`Hora: ${hour}`));
  }

  const mesero =
    data?.mesero ??
    data?.waiter ??
    data?.usuario_nombre ??
    '';

  if (mesero) {
    pushAlways(boldLine(`Mesero: ${mesero}`));
  }

  const cliente =
    data?.cliente_nombre ??
    data?.cliente?.nombre ??
    data?.cliente ??
    '';

  if (cliente && typeof cliente !== 'object') {
    pushAlways(boldLine(`Cliente: ${cliente}`));
  }

  const telefono =
    data?.cliente_telefono ??
    data?.telefono ??
    data?.cliente?.telefono ??
    '';

  if (telefono) {
    pushAlways(line(`Tel: ${telefono}`));
  }

  const domicilio =
    data?.cliente_domicilio ??
    data?.domicilio ??
    data?.direccion ??
    data?.cliente?.domicilio ??
    data?.cliente?.direccion ??
    '';

  if (domicilio) {
    for (const part of wrap(`Domicilio: ${domicilio}`, 30)) {
      pushAlways(line(part));
    }
  }

  const referencias =
    data?.cliente_referencias ??
    data?.referencias ??
    data?.cliente?.referencias ??
    '';

  if (referencias) {
    for (const part of wrap(`Ref: ${referencias}`, 30)) {
      pushAlways(line(part));
    }
  }

  pushAlways(separator());

  const groups = pointGroupItems(data?.items);

  outer:
  for (let gi = 0; gi < groups.length; gi += 1) {
    const group = groups[gi];

    if (gi > 0) {
      if (!push(separator(), 180)) break;
    }

    for (const item of group.items) {
      const qtyRaw =
        item?.cantidad ??
        item?.qty ??
        item?.quantity ??
        1;

      const qty = Number(qtyRaw);
      const qtyText = Number.isFinite(qty) ? qty : qtyRaw;

      const name =
        item?.nombre ??
        item?.name ??
        item?.producto ??
        item?.descripcion ??
        'PRODUCTO';

      const productText = `${qtyText}x ${name}`;

      for (const part of wrap(productText, 18)) {
        if (!push(largeBoldLine(part), 220)) {
          break outer;
        }
      }

      const variablePrice =
        item?.precio_variable ??
        item?.variable_price ??
        item?.precioVariable;

      if (
        variablePrice !== undefined &&
        variablePrice !== null &&
        variablePrice !== '' &&
        Number.isFinite(Number(variablePrice))
      ) {
        for (const part of wrap(
          `PRECIO VARIABLE: ${pointMoney(variablePrice)} C/U`,
          30
        )) {
          if (!push(boldLine(part), 200)) {
            break outer;
          }
        }
      }

      const modifiers = normalizeModifiers(
        item?.modificadores ??
        item?.modifiers ??
        item?.extras ??
        []
      );

      for (const modifier of modifiers) {
        const text = String(modifier || '').trim();
        if (!text) continue;

        for (const part of wrap(`+ ${text}`, 30)) {
          if (!push(boldLine(part), 200)) {
            break outer;
          }
        }
      }

      const notes =
        item?.notas ??
        item?.nota ??
        item?.notes ??
        item?.observaciones ??
        '';

      if (notes) {
        for (const part of wrap(`NOTA: ${notes}`, 30)) {
          if (!push(boldLine(part), 200)) {
            break outer;
          }
        }
      }

      if (!push(blankLine(), 160)) {
        break outer;
      }
    }
  }

  if (truncated) {
    pushAlways(separator());
    pushAlways(boldCenter('COMANDA MUY LARGA'));
    pushAlways(boldCenter('REVISA EL PEDIDO EN KDS'));
    pushAlways(separator());
  }

  let content = tokens.join('');

  if (content.length < MIN_CONTENT) {
    content += '{br}'.repeat(
      Math.ceil((MIN_CONTENT - content.length) / 4)
    );
  }

  if (content.length > MAX_CONTENT) {
    throw new Error(
      `Contenido Point excede ${MAX_CONTENT} caracteres (${content.length}).`
    );
  }

  return content;
}

/*
 * MP_POINT_IMAGE_RENDERER_V1
 *
 * Point usa exactamente el raster de cocina de 58 mm.
 *
 * Flujo:
 * renderKitchen -> raster monocromático -> PNG -> Base64
 *
 * No crea acciones por sí misma.
 */
async function renderKitchenImage(
  kind,
  data = {}
) {
  const image =
    await renderKitchen(
      kind,
      data,
      {
        width: 58,
        cut: false
      }
    );

  if (
    !image ||
    !Buffer.isBuffer(image.raw) ||
    Number(image.width) !== 384 ||
    !Number.isInteger(Number(image.height)) ||
    Number(image.height) <= 0
  ) {
    throw new Error(
      'Renderer Point 58 mm produjo una imagen inválida'
    );
  }

  const png =
    await sharp(
      image.raw,
      {
        raw: {
          width:
            Number(image.width),

          height:
            Number(image.height),

          channels: 1
        }
      }
    )
      .png({
        compressionLevel: 9,
        palette: true
      })
      .toBuffer();

  const metadata =
    await sharp(png).metadata();

  if (
    metadata.format !== 'png' ||
    Number(metadata.width) !== 384 ||
    !Number.isInteger(
      Number(metadata.height)
    ) ||
    Number(metadata.height) <= 0
  ) {
    throw new Error(
      'PNG Point 58 mm inválido'
    );
  }

  const content =
    png.toString('base64');

  if (
    !content ||
    content.length % 4 !== 0
  ) {
    throw new Error(
      'Base64 Point inválido'
    );
  }

  return {
    content,
    png,
    width:
      Number(metadata.width),

    height:
      Number(metadata.height),

    bytes:
      png.length
  };
}


/*
 * Mantiene disponible el renderer custom como fallback.
 * El flujo normal Point usa imagen PNG.
 */
async function sendKitchenPrintCustom({
  terminalId,
  externalReference,
  idempotencyKey,
  kind,
  data
}) {
  const content =
    renderKitchenCustom(
      kind,
      data
    );

  return mp.createPointPrintAction({
    terminalId,
    externalReference,
    idempotencyKey,
    content
  });
}


async function sendKitchenPrint({
  terminalId,
  externalReference,
  idempotencyKey,
  kind,
  data
}) {
  // E3: impresión de texto nativo sin PNG.
  return sendKitchenPrintCustom({
    terminalId,
    externalReference,
    idempotencyKey,
    kind,
    data
  });
}

/*
 * MP_POINT_PRINT_RECONCILE_V1
 *
 * Consulta una acción de impresión previamente creada.
 * No genera nuevas impresiones.
 */
async function getPrintAction({
  actionId
}) {
  return mp.getPointAction(
    actionId
  );
}


module.exports = {
  renderKitchenCustom,
  renderKitchenImage,
  sendKitchenPrintCustom,
  sendKitchenPrint,
  getPrintAction
};
