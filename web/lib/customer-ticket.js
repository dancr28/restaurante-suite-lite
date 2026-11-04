const sharp = require('sharp');
const path = require('node:path');

const PAPER = {
  80: {
    pixels: 576,
    margin: 22,
    normalSize: 25,
    productSize: 27,
    totalSize: 38,
  },
  58: {
    pixels: 384,
    margin: 15,
    normalSize: 20,
    productSize: 22,
    totalSize: 31,
  },
};

function clean(value) {
  return String(value ?? '').trim();
}

function esc(value) {
  return clean(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(value) {
  return '$' + Number(value || 0).toFixed(2);
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
      .map((x) => (typeof x === 'string' ? x : x?.nombre || x?.name || x?.opcion || x?.label || ''))
      .filter(Boolean);
  }

  if (typeof value === 'object') {
    return Object.values(value)
      .flat()
      .map((x) => (typeof x === 'string' ? x : x?.nombre || x?.name || x?.opcion || x?.label || ''))
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

function mesaText(value) {
  const raw = clean(value);

  if (!raw) return '-';

  return /^mesa\b/i.test(raw) ? raw : `Mesa ${raw}`;
}

function parseDataUrlImage(value) {
  const raw = clean(value);
  const match = raw.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  return match ? Buffer.from(match[1], 'base64') : null;
}

function lineText(text, x, y, size, weight = 500, anchor = 'start') {
  return `<text
    x="${x}"
    y="${y}"
    font-family="DejaVu Sans"
    font-size="${size}"
    font-weight="${weight}"
    text-anchor="${anchor}"
    fill="#000">${esc(text)}</text>`;
}

async function renderCustomerTicket(kind, data, printer, business = {}) {
  const money = (value) =>
    new Intl.NumberFormat(business.locale || 'es-MX', {
      style: 'currency',
      currency: business.currency || 'MXN',
    }).format(Number(value) || 0);
  const cfg = PAPER[Number(printer.width)] || PAPER[80];
  const W = cfg.pixels;
  const M = cfg.margin;
  const center = Math.floor(W / 2);

  const elements = [];
  let y = 20;
  let reviewQrTop = null;
  let reviewQrSize = 0;
  let reviewQr = null;

  const addText = (text, size = cfg.normalSize, opts = {}) => {
    const { x = M, weight = 500, anchor = 'start', gap = 7 } = opts;

    y += size;
    elements.push(lineText(text, x, y, size, weight, anchor));
    y += gap;
  };

  const rule = (double = false) => {
    y += 8;

    elements.push(
      `<line x1="${M}" y1="${y}" x2="${W - M}" y2="${y}"
       stroke="#000" stroke-width="2"/>`,
    );

    if (double) {
      y += 6;
      elements.push(
        `<line x1="${M}" y1="${y}" x2="${W - M}" y2="${y}"
         stroke="#000" stroke-width="2"/>`,
      );
    }

    y += 13;
  };

  // Encabezado y espacio reservado para el logo.
  const logoTop = y;
  const logoHeight = Number(printer.width) === 58 ? 105 : 135;
  if (data.printing?.showLogo !== false) y += logoHeight + 10;

  addText(clean(business.name || 'Los Compadres').toUpperCase(), 31, {
    x: center,
    anchor: 'middle',
    weight: 700,
    gap: 6,
  });

  if (business.header) addText(business.header, 20, { x: center, anchor: 'middle' });
  if (business.rfc) addText('RFC: ' + business.rfc, 18, { x: center, anchor: 'middle' });
  if (data.folio || data.pedido_id)
    addText('Folio: ' + (business.ticketPrefix || '') + (data.folio || data.pedido_id), 20);
  if (data.cajero) addText('Cajero: ' + data.cajero, 20);
  const title = kind === 'prebill' ? 'PRECUENTA' : 'CUENTA';

  addText(title, 34, {
    x: center,
    anchor: 'middle',
    weight: 700,
    gap: 10,
  });

  if (kind === 'prebill') {
    addText('SIN PAGAR', 20, {
      x: center,
      anchor: 'middle',
      weight: 600,
      gap: 10,
    });
  }

  rule(true);

  const servicioEspecial = ['delivery', 'para_llevar', 'takeout'].includes(data.tipo_servicio);

  if (!servicioEspecial && (data.mesa || data.mesa_numero)) {
    addText(mesaText(data.mesa || data.mesa_numero), 28, {
      weight: 700,
      gap: 3,
    });

  } else if (data.tipo_servicio === 'delivery') {
    /*
     * DELIVERY_ADDRESS_HEADER_V2
     *
     * En delivery no mostramos el identificador interno DELIV como mesa.
     * Mostramos directamente:
     *
     * A DOMICILIO
     * <domicilio>
     */
    addText('A DOMICILIO', 26, {
      weight: 700,
      gap: 3,
    });

    if (data.direccion_entrega) {
      for (const line of wrapWords(
        clean(data.direccion_entrega),
        Number(printer.width) === 58 ? 28 : 42,
      )) {
        addText(line, 22, {
          weight: 600,
          gap: 2,
        });
      }
    }

  } else if (servicioEspecial) {
    addText('PARA LLEVAR', 26, {
      weight: 700,
      gap: 3,
    });
  }

  if (data.mesero) {
    addText(`Mesero: ${data.mesero}`, 23, {
      weight: 600,
      gap: 3,
    });
  }

  addText(`Hora: ${timeOnly(data.printed_at)}`, 22, {
    weight: 500,
    gap: 3,
  });

  if (data.cliente_nombre) {
    addText(`Cliente: ${data.cliente_nombre}`, 22, { weight: 500, gap: 3 });
  }

  if (data.tipo_servicio === 'delivery' && data.cliente_telefono) {
    for (const line of wrapWords(
      `Telefono: ${data.cliente_telefono}`,
      Number(printer.width) === 58 ? 28 : 42,
    )) {
      addText(line, 19, { weight: 500, gap: 2 });
    }
  }

  if (data.tipo_servicio === 'delivery' && data.referencias_entrega) {
    for (const line of wrapWords(
      `Referencias: ${data.referencias_entrega}`,
      Number(printer.width) === 58 ? 28 : 42,
    )) {
      addText(line, 18, { weight: 500, gap: 2 });
    }
  }

  rule();

  // Productos
  for (const item of data.items || []) {
    const qty = Number(item.cantidad || 0);
    const qtyText = Number.isInteger(qty) ? qty : qty.toFixed(2);

    const totalItem = Number(item.cantidad || 0) * Number(item.precio_unitario || 0);

    const price = money(totalItem);

    // Reserva una columna fija para el precio para evitar solapamientos.
    const maxNameChars = Number(printer.width) === 58 ? 15 : 24;

    const productLines = wrapWords(`${qtyText}x ${clean(item.nombre)}`, maxNameChars);

    productLines.forEach((line, index) => {
      if (index === productLines.length - 1) {
        addText(line, cfg.productSize, {
          weight: 600,
          gap: 2,
        });

        // Precio total del renglón alineado a la derecha.
        elements.push(lineText(price, W - M, y - 9, cfg.productSize, 600, 'end'));
      } else {
        addText(line, cfg.productSize, {
          weight: 600,
          gap: 2,
        });
      }
    });

    if (Number(item.es_variable) === 1 && Number(item.precio_unitario) > 0) {
      addText(`Precio variable: ${money(item.precio_unitario)} c/u`, 18, {
        x: M + 16,
        weight: 600,
        gap: 1,
      });
    }

    for (const mod of normalizeModifiers(item.modificadores)) {
      const modLines = wrapWords(`+ ${mod}`, Number(printer.width) === 58 ? 26 : 38);

      for (const line of modLines) {
        addText(line, Number(printer.width) === 58 ? 18 : 21, {
          x: M + 16,
          weight: 500,
          gap: 1,
        });
      }
    }

    if (clean(item.notas)) {
      for (const line of wrapWords(`Nota: ${item.notas}`, Number(printer.width) === 58 ? 25 : 37)) {
        addText(line, Number(printer.width) === 58 ? 18 : 21, {
          x: M + 16,
          weight: 600,
          gap: 1,
        });
      }
    }

    y += 9;
  }

  rule(true);

  // Total grande
  y += cfg.totalSize;

  elements.push(lineText('TOTAL', M, y, cfg.totalSize, 700, 'start'));

  elements.push(lineText(money(data.total), W - M, y, cfg.totalSize, 700, 'end'));

  y += 15;

  if (kind === 'receipt') {
    if (data.metodo_pago) {
      addText(`Pago: ${data.metodo_pago}`, 22, {
        weight: 500,
        gap: 2,
      });
    }

    if (data.paga_con !== undefined && data.paga_con !== null) {
      addText(`Recibido: ${money(data.paga_con)}`, 22, {
        weight: 500,
        gap: 2,
      });
    }

    if (data.cambio_llevar !== undefined && data.cambio_llevar !== null) {
      addText(`Cambio: ${money(data.cambio_llevar)}`, 24, {
        weight: 700,
        gap: 3,
      });
    }
  }

  y += 12;

  addText('PROPINA NO INCLUIDA', 22, {
    x: center,
    anchor: 'middle',
    weight: 700,
    gap: 10,
  });

  if (clean(business.address)) {
    for (const line of wrapWords(business.address, Number(printer.width) === 58 ? 30 : 44)) {
      addText(line, 18, {
        x: center,
        anchor: 'middle',
        weight: 400,
        gap: 1,
      });
    }
  }

  if (clean(business.phone)) {
    addText(business.phone, 18, {
      x: center,
      anchor: 'middle',
      weight: 400,
      gap: 2,
    });
  }

  addText(business.footer || 'Gracias por tu visita', 20, {
    x: center,
    anchor: 'middle',
    weight: 500,
    gap: 8,
  });

  if (business.reviewQrEnabled && clean(business.reviewQrUrl) && clean(business.reviewQrImage)) {
    const qrSource = parseDataUrlImage(business.reviewQrImage);

    if (qrSource) {
      y += 8;
      const caption = clean(business.reviewQrText || 'Escanea y déjanos tu reseña');
      for (const line of wrapWords(caption, Number(printer.width) === 58 ? 24 : 34)) {
        addText(line, 20, {
          x: center,
          anchor: 'middle',
          weight: 600,
          gap: 2,
        });
      }

      reviewQrSize = Number(printer.width) === 58 ? 132 : 176;
      reviewQrTop = Math.max(0, Math.floor(y + 8));
      y += reviewQrSize + 16;

      reviewQr = await sharp(qrSource)
        .flatten({ background: '#ffffff' })
        .resize({
          width: reviewQrSize,
          height: reviewQrSize,
          fit: 'contain',
          background: '#ffffff',
        })
        .png()
        .toBuffer();
    }
  }

  y += 20;

  const height = Math.max(300, Math.ceil(y));

  const svg = `
  <svg width="${W}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#fff"/>
    ${elements.join('\n')}
  </svg>`;

  // Renderizamos primero todo el ticket SIN el logo.
  const base = sharp(Buffer.from(svg));

  // Preparamos el logo conservando proporción.
  const logoPath = path.join(__dirname, '..', 'assets', 'ticket', 'logo.png');

  const logoWidth = Math.min(
    data.printing?.logoWidth || 300,
    Number(printer.width) === 58 ? 220 : 320,
  );

  const logo =
    data.printing?.showLogo === false
      ? null
      : await sharp(logoPath)
          .flatten({ background: '#ffffff' })
          .resize({
            width: logoWidth,
            height: logoHeight,
            fit: 'contain',
            background: '#ffffff',
          })
          .png()
          .toBuffer();

  const overlays = [];
  if (logo)
    overlays.push({
      input: logo,
      left: Math.floor((W - logoWidth) / 2),
      top: logoTop,
    });
  if (reviewQr)
    overlays.push({
      input: reviewQr,
      left: Math.floor((W - reviewQrSize) / 2),
      top: reviewQrTop,
    });

  const composed = await base
    .composite(overlays)
    .flatten({ background: '#ffffff' })
    .greyscale()
    .threshold(180)
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    raw: composed.data,
    width: composed.info.width,
    height: composed.info.height,
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
}

async function renderCustomerBuffer(kind, data, printer, business = {}) {
  const image = await renderCustomerTicket(kind, data, printer, business);

  return Buffer.concat([
    rasterToEscPos(image.raw, image.width, image.height),
    Buffer.from('\n\n\n', 'ascii'),
    printer.cut ? Buffer.from([0x1d, 0x56, 0x42, 0x00]) : Buffer.alloc(0),
  ]);
}

module.exports = {
  renderCustomerTicket,
  renderCustomerBuffer,
};
