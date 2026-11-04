const sharp = require('sharp');

const PAPER = {
  80: {
    pixels: 576,
    margin: 20,
    productSize: 34,
    modifierSize: 27,
    noteSize: 28,
  },
  58: {
    pixels: 384,
    margin: 14,
    productSize: 27,
    modifierSize: 22,
    noteSize: 23,
  },
};

const money = (value) => `$${Number(value || 0).toFixed(2)}`;

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clean(value) {
  return String(value ?? '').trim();
}

function wrapWords(value, maxChars) {
  const words = clean(value).split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const lines = [];
  let line = '';

  for (let word of words) {
    while (word.length > maxChars) {
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }

    if (!word) continue;

    const candidate = line ? `${line} ${word}` : word;

    if (candidate.length > maxChars) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function normalizeModifiers(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((x) =>
        typeof x === 'string'
          ? x
          : x?.nombre || x?.name || x?.opcion || x?.label || '',
      )
      .filter(Boolean);
  }

  if (typeof value === 'object') {
    return Object.values(value)
      .flat()
      .map((x) =>
        typeof x === 'string'
          ? x
          : x?.nombre || x?.name || x?.opcion || x?.label || '',
      )
      .filter(Boolean);
  }

  const raw = clean(value);
  if (!raw) return [];

  try {
    return normalizeModifiers(JSON.parse(raw));
  } catch {
    return raw
      .split(/\n|,\s*|\s*\+\s*/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
}

function timeOnly(value) {
  if (!value) {
    return new Date().toLocaleTimeString('es-MX', {
      timeZone: 'America/Mexico_City',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const str = String(value);
  const match = str.match(/(\d{1,2}:\d{2})(?::\d{2})?/);
  return match ? match[1] : str;
}

function groupItems(items = []) {
  const groups = [];
  let current = null;

  for (const item of items) {
    const plate =
      item.numero_plato === null ||
      item.numero_plato === undefined ||
      item.numero_plato === ''
        ? '__none__'
        : String(item.numero_plato);

    if (!current || current.plate !== plate) {
      current = { plate, items: [] };
      groups.push(current);
    }

    current.items.push(item);
  }

  return groups;
}

function lineText(text, x, y, size, weight = 700, anchor = 'start') {
  return `<text
    x="${x}"
    y="${y}"
    font-family="DejaVu Sans"
    font-size="${size}"
    font-weight="${weight}"
    text-anchor="${anchor}"
    fill="#000">${esc(text)}</text>`;
}

async function renderKitchen(kind, data, printer) {
  const cfg = PAPER[Number(printer.width)] || PAPER[80];
  const W = cfg.pixels;
  const M = cfg.margin;
  const center = Math.floor(W / 2);

  const elements = [];
  let y = 35;

  const addText = (text, size, opts = {}) => {
    const {
      x = M,
      weight = 700,
      anchor = 'start',
      gap = 8,
    } = opts;

    y += size;
    elements.push(lineText(text, x, y, size, weight, anchor));
    y += gap;
  };

  const separator = () => {
    y += 7;
    elements.push(
      `<line x1="${M}" y1="${y}" x2="${W - M}" y2="${y}"
        stroke="#000" stroke-width="4"/>`,
    );
    y += 7;
    elements.push(
      `<line x1="${M}" y1="${y}" x2="${W - M}" y2="${y}"
        stroke="#000" stroke-width="2"/>`,
    );
    y += 16;
  };

  if (kind === 'cancel') {
    addText('CANCELACION', 42, {
      x: center,
      anchor: 'middle',
      weight: 700,
      gap: 12,
    });
  }

  if (kind === 'kitchen' && data.es_adicional) {
    addText('EXTRA', 52, {
      x: center,
      anchor: 'middle',
      weight: 700,
      gap: 12,
    });
    separator();
  }

  const turno = data.numero_turno || data.turno_id || data.folio || '-';
  addText(`TURNO #${turno}`, 45, {
    x: center,
    anchor: 'middle',
    weight: 700,
    gap: 5,
  });

  const servicioEspecial = ['delivery', 'para_llevar', 'takeout'].includes(data.tipo_servicio);
  if (!servicioEspecial && (data.mesa || data.mesa_numero)) {
    const mesaRaw = clean(data.mesa || data.mesa_numero);
    const mesaTexto = /^mesa\b/i.test(mesaRaw) ? mesaRaw : `Mesa ${mesaRaw}`;
    addText(mesaTexto.toUpperCase(), 42, { x: center, anchor: 'middle', weight: 700, gap: 12 });
  } else if (servicioEspecial) {
    addText(data.tipo_servicio === 'delivery' ? 'A DOMICILIO' : 'PARA LLEVAR', 34, { x: center, anchor: 'middle', weight: 700, gap: 8 });
  }

  if (data.mesero) addText(`Mesero: ${data.mesero}`, 25, { weight: 700, gap: 3 });
  if (data.cliente_nombre) addText(`Cliente: ${data.cliente_nombre}`, 24, { weight: 600, gap: 3 });
  if (data.tipo_servicio === 'delivery' && data.direccion_entrega)
    addText(`Direccion: ${data.direccion_entrega}`, 22, { weight: 600, gap: 3 });
  if (data.tipo_servicio === 'delivery' && data.referencias_entrega)
    addText(`Ref: ${data.referencias_entrega}`, 20, { weight: 500, gap: 3 });

  addText(`Hora: ${timeOnly(data.printed_at)}`, 24, {
    weight: 600,
    gap: 6,
  });

  separator();

  const groups = groupItems(data.items || []);

  groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) separator();

    for (const item of group.items) {
      const qty = Number(item.cantidad || 0);
      const qtyText = Number.isInteger(qty) ? qty : qty.toFixed(2);

      const productLines = wrapWords(
        `${qtyText}x ${clean(item.nombre)}`,
        Number(printer.width) === 58 ? 21 : 27,
      );

      for (const line of productLines) {
        addText(line, cfg.productSize, {
          weight: 700,
          gap: 4,
        });
      }

      if (Number(item.es_variable) === 1 && Number(item.precio_unitario) > 0) {
        addText(
          `PRECIO VARIABLE: ${money(item.precio_unitario)} C/U`,
          Number(printer.width) === 58 ? 18 : 21,
          {
            x: M + 18,
            weight: 700,
            gap: 2,
          },
        );
      }

      const modifiers = normalizeModifiers(item.modificadores);

      for (const mod of modifiers) {
        const modLines = wrapWords(`+ ${mod}`, Number(printer.width) === 58 ? 25 : 34);

        for (const line of modLines) {
          addText(line, cfg.modifierSize, {
            x: M + 18,
            weight: 600,
            gap: 2,
          });
        }
      }

      if (clean(item.notas)) {
        const noteLines = wrapWords(
          `NOTA: ${item.notas}`,
          Number(printer.width) === 58 ? 23 : 31,
        );

        for (const line of noteLines) {
          addText(line, cfg.noteSize, {
            x: M + 18,
            weight: 700,
            gap: 2,
          });
        }
      }

      y += 13;
    }
  });

  separator();

  y += 25;

  const height = Math.max(200, Math.ceil(y));

  const svg = `
  <svg width="${W}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#fff"/>
    ${elements.join('\n')}
  </svg>`;

  const { data: raw, info } = await sharp(Buffer.from(svg))
    .flatten({ background: '#ffffff' })
    .greyscale()
    .threshold(180)
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    raw,
    width: info.width,
    height: info.height,
  };
}

function rasterToEscPos(raw, width, height) {
  const bytesPerRow = Math.ceil(width / 8);
  const bitmap = Buffer.alloc(bytesPerRow * height, 0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = raw[y * width + x];

      if (pixel < 128) {
        const offset = y * bytesPerRow + Math.floor(x / 8);
        bitmap[offset] |= 0x80 >> (x % 8);
      }
    }
  }

  const xL = bytesPerRow & 0xff;
  const xH = (bytesPerRow >> 8) & 0xff;
  const yL = height & 0xff;
  const yH = (height >> 8) & 0xff;

  return Buffer.concat([
    Buffer.from([0x1b, 0x40]),
    Buffer.from([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]),
    bitmap,
  ]);
}const BEEP_COMMAND = Buffer.from([0x1B, 0x42, 0x04, 0x03]);

function buildBeepCommand() {
    return BEEP_COMMAND;
}

async function renderKitchenBuffer(kind, data, printer) {
  const image = await renderKitchen(kind, data, printer);

  return Buffer.concat([
    rasterToEscPos(image.raw, image.width, image.height),
    Buffer.from('\n\n\n', 'ascii'),
    buildBeepCommand(),
    printer.cut ? Buffer.from([0x1d, 0x56, 0x42, 0x00]) : Buffer.alloc(0),
  ]);
}


module.exports = {
  renderKitchen,
  rasterToEscPos,
  renderKitchenBuffer,
};
