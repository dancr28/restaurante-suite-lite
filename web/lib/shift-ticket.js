const sharp = require('sharp');

const PAPER = {
  80: {
    pixels: 576,
    margin: 22,
    normal: 23,
    small: 19,
    section: 25,
    total: 31,
    status: 35,
  },
  58: {
    pixels: 384,
    margin: 15,
    normal: 18,
    small: 16,
    section: 20,
    total: 25,
    status: 29,
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

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value) {
  const n = num(value);
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function fecha(value) {
  if (!value) return '-';

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return clean(value);

  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
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

function textSvg(text, x, y, size, weight = 500, anchor = 'start') {
  return `<text
    x="${x}"
    y="${y}"
    font-family="DejaVu Sans"
    font-size="${size}"
    font-weight="${weight}"
    text-anchor="${anchor}"
    fill="#000">${esc(text)}</text>`;
}

function rasterToEscPos(bitmap, width, height) {
  const bytesPerRow = Math.ceil(width / 8);
  const data = Buffer.alloc(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = bitmap[y * width + x];

      if (pixel < 128) {
        const offset = y * bytesPerRow + Math.floor(x / 8);
        data[offset] |= 0x80 >> (x % 8);
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
    data,
    Buffer.from([0x0a, 0x0a, 0x0a]),
    Buffer.from([0x1d, 0x56, 0x00]),
  ]);
}

async function renderShiftBuffer(data, printer, business = {}) {
  const cfg = PAPER[Number(printer.width)] || PAPER[80];

  const W = cfg.pixels;
  const M = cfg.margin;
  const center = Math.floor(W / 2);
  const right = W - M;

  const elements = [];
  let y = 18;

  const addText = (text, size = cfg.normal, opts = {}) => {
    const {
      x = M,
      weight = 500,
      anchor = 'start',
      gap = 6,
    } = opts;

    y += size;
    elements.push(textSvg(text, x, y, size, weight, anchor));
    y += gap;
  };

  const addWrapped = (text, size = cfg.normal, opts = {}) => {
    const maxChars =
      opts.maxChars || (Number(printer.width) === 58 ? 31 : 46);

    const lines = wrapWords(text, maxChars);

    for (const line of lines) {
      addText(line, size, opts);
    }
  };

  const rule = (double = false) => {
    y += 7;

    elements.push(
      `<line x1="${M}" y1="${y}" x2="${right}" y2="${y}"
       stroke="#000" stroke-width="2"/>`,
    );

    if (double) {
      y += 5;

      elements.push(
        `<line x1="${M}" y1="${y}" x2="${right}" y2="${y}"
         stroke="#000" stroke-width="2"/>`,
      );
    }

    y += 10;
  };

  const section = (title) => {
    rule(true);

    addText(title, cfg.section, {
      x: center,
      anchor: 'middle',
      weight: 700,
      gap: 8,
    });

    rule();
  };

  const row = (label, value, opts = {}) => {
    const size = opts.size || cfg.normal;
    const weight = opts.weight || 500;

    y += size;

    elements.push(
      textSvg(label, M, y, size, weight, 'start'),
      textSvg(value, right, y, size, weight, 'end'),
    );

    y += opts.gap ?? 6;
  };

  /*
   * ENCABEZADO
   *
   * Igual que los otros tickets gráficos dejamos una zona superior
   * limpia para mantener una composición consistente.
   */
  y += Number(printer.width) === 58 ? 38 : 48;

  addText(clean(business.name || 'Los Compadres').toUpperCase(), 31, {
    x: center,
    anchor: 'middle',
    weight: 700,
    gap: 5,
  });

  addText('CORTE DE CAJA', Number(printer.width) === 58 ? 25 : 30, {
    x: center,
    anchor: 'middle',
    weight: 700,
    gap: 2,
  });

  addText('CORTE Z', Number(printer.width) === 58 ? 29 : 35, {
    x: center,
    anchor: 'middle',
    weight: 800,
    gap: 10,
  });

  rule(true);

  addText(`TURNO #${clean(data.turno_id || '-')}`, cfg.section, {
    weight: 700,
    gap: 8,
  });

  addWrapped(`Apertura: ${fecha(data.fecha_apertura)}`, cfg.small, {
    weight: 500,
    gap: 3,
  });

  addWrapped(`Cierre: ${fecha(data.fecha_cierre)}`, cfg.small, {
    weight: 500,
    gap: 3,
  });

  addWrapped(
    `Cajero apertura: ${clean(data.usuario_apertura || 'Cajero')}`,
    cfg.small,
    { gap: 3 },
  );

  addWrapped(
    `Cajero cierre: ${clean(data.usuario_cierre || 'Cajero')}`,
    cfg.small,
    { gap: 3 },
  );

  /*
   * VENTAS
   */
  section('DESGLOSE DE VENTAS');

  row('Efectivo', money(data.ventas_efectivo));
  row('Tarjeta', money(data.ventas_tarjeta));
  row('Transferencia', money(data.ventas_transferencia));

  rule();

  row('TOTAL VENTAS', money(data.total_ventas), {
    size: cfg.total,
    weight: 700,
    gap: 8,
  });

  /*
   * PROPINAS
   */
  section('PROPINAS');

  row('Efectivo', money(data.propina_efectivo));
  row('Tarjeta / transf.', money(data.propina_tarjeta));

  rule();

  row('TOTAL PROPINAS', money(data.total_propinas), {
    size: cfg.total,
    weight: 700,
    gap: 8,
  });

  /*
   * FLUJO DE EFECTIVO
   */
  section('FLUJO DE EFECTIVO');

  row('(+) Fondo inicial', money(data.monto_inicial));
  row('(+) Ventas efectivo', money(data.ventas_efectivo));
  row('(+) Entradas', money(data.total_pay_in));
  row('(-) Retiros', money(data.total_pay_out));

  rule(true);

  row('ESPERADO', money(data.efectivo_esperado), {
    size: cfg.total,
    weight: 700,
  });

  row('CONTADO', money(data.monto_final_real), {
    size: cfg.total,
    weight: 700,
    gap: 10,
  });

  /*
   * DIFERENCIA
   */
  const diferencia = num(data.diferencia_descuadre);

  let estado;
  let diferenciaTexto;

  if (Math.abs(diferencia) < 0.005) {
    estado = 'CAJA CUADRADA';
    diferenciaTexto = '$0.00';
  } else if (diferencia > 0) {
    estado = 'SOBRANTE';
    diferenciaTexto = `+${money(diferencia)}`;
  } else {
    estado = 'FALTANTE';
    diferenciaTexto = `-${money(Math.abs(diferencia))}`;
  }

  rule(true);

  addText(estado, cfg.status, {
    x: center,
    anchor: 'middle',
    weight: 800,
    gap: 2,
  });

  addText(diferenciaTexto, cfg.status, {
    x: center,
    anchor: 'middle',
    weight: 800,
    gap: 10,
  });

  /*
   * MOVIMIENTOS
   */
  section('MOVIMIENTOS DE CAJA');

  const movimientos = Array.isArray(data.movimientos)
    ? data.movimientos
    : [];

  if (!movimientos.length) {
    addText('Sin movimientos de caja', cfg.small, {
      x: center,
      anchor: 'middle',
      weight: 500,
      gap: 8,
    });
  } else {
    for (const mov of movimientos) {
      const entrada = mov.tipo === 'pay_in';

      addText(
        entrada ? 'ENTRADA' : 'RETIRO',
        cfg.small,
        {
          weight: 700,
          gap: 1,
        },
      );

      row(
        entrada ? '(+)' : '(-)',
        money(mov.monto),
        {
          size: cfg.normal,
          weight: 700,
          gap: 2,
        },
      );

      addWrapped(clean(mov.motivo || 'Movimiento'), cfg.small, {
        weight: 500,
        gap: 2,
      });

      if (mov.usuario_nombre) {
        addWrapped(`Por: ${clean(mov.usuario_nombre)}`, cfg.small, {
          weight: 500,
          gap: 2,
        });
      }

      if (mov.fecha) {
        addWrapped(`Fecha: ${fecha(mov.fecha)}`, cfg.small, {
          weight: 500,
          gap: 5,
        });
      }

      y += 5;
    }
  }

  /*
   * NOTAS
   */
  if (clean(data.notas_cierre)) {
    section('NOTAS DE CIERRE');

    addWrapped(data.notas_cierre, cfg.small, {
      weight: 500,
      gap: 4,
    });
  }

  /*
   * RESUMEN / FIRMA
   */
  rule(true);

  addText('RESUMEN DEL CORTE', cfg.section, {
    x: center,
    anchor: 'middle',
    weight: 700,
    gap: 9,
  });

  row('Ventas totales', money(data.total_ventas), {
    weight: 700,
  });

  row('Propinas', money(data.total_propinas));

  row('Movimientos', String(movimientos.length));

  row('Efectivo esperado', money(data.efectivo_esperado));

  row('Efectivo contado', money(data.monto_final_real));

  y += 22;

  addText('Firma responsable:', cfg.small, {
    weight: 500,
    gap: 30,
  });

  elements.push(
    `<line x1="${M + 35}" y1="${y}" x2="${right - 35}" y2="${y}"
     stroke="#000" stroke-width="2"/>`,
  );

  y += 18;

  addText(clean(data.usuario_cierre || 'Cajero'), cfg.small, {
    x: center,
    anchor: 'middle',
    weight: 600,
    gap: 14,
  });

  rule(true);

  addText('CORTE Z CERRADO', cfg.section, {
    x: center,
    anchor: 'middle',
    weight: 800,
    gap: 4,
  });

  addText(`Turno #${clean(data.turno_id || '-')}`, cfg.small, {
    x: center,
    anchor: 'middle',
    weight: 500,
    gap: 4,
  });

  addText(`Impreso: ${fecha(data.printed_at || new Date())}`, cfg.small, {
    x: center,
    anchor: 'middle',
    weight: 500,
    gap: 18,
  });

  const H = Math.max(y + 25, 300);

  const svg = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#fff"/>
      ${elements.join('\n')}
    </svg>
  `);

  const { data: raw, info } = await sharp(svg)
    .flatten({ background: '#ffffff' })
    .grayscale()
    .threshold(180)
    .raw()
    .toBuffer({ resolveWithObject: true });

  return rasterToEscPos(raw, info.width, info.height);
}

module.exports = {
  renderShiftBuffer,
};
