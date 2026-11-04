'use strict';
const sharp = require('sharp');

const P = {
  80: { w: 576, m: 22, font: 22 },
  58: { w: 384, m: 14, font: 18 },
};

const clean = (v) => String(v ?? '')
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  .trim();
const esc = (v) => clean(v)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function wrap(v, n) {
  const words = clean(v).split(/\s+/).filter(Boolean);
  const out = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > n && line) {
      out.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) out.push(line);
  return out;
}

async function renderSurveyBuffer(payload = {}, printer = {}) {
  const b = payload.business || {};
  const cfg = P[Number(printer.width)] || P[80];
  const short = Number(printer.width) === 58;
  const W = cfg.w;
  const M = cfg.m;
  const C = W / 2;
  const innerW = W - M * 2;
  const elements = [];
  let y = short ? 14 : 18;

  const text = (v, size = cfg.font, opts = {}) => {
    y += opts.top ?? size;
    elements.push(
      `<text x="${opts.x ?? M}" y="${y}" font-family="DejaVu Sans" font-size="${size}" font-weight="${opts.weight ?? 500}" text-anchor="${opts.anchor ?? 'start'}" fill="#000"${opts.italic ? ' font-style="italic"' : ''}>${esc(v)}</text>`,
    );
    y += opts.gap ?? 6;
  };

  const center = (v, size = cfg.font, weight = 500, opts = {}) =>
    text(v, size, { x: C, anchor: 'middle', weight, ...opts });

  const line = (x1, y1, x2, y2, sw = 1.5) => {
    elements.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-width="${sw}"/>`);
  };

  const rect = (x, top, w, h, r = 8, sw = 1.5) => {
    elements.push(`<rect x="${x}" y="${top}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="none" stroke="#000" stroke-width="${sw}"/>`);
  };

  const square = (cx, cy, size, sw = 1.5) => {
    const s = size / 2;
    rect(cx - s, cy - s, size, size, 2, sw);
  };

  const businessName = clean(b.name || 'Los Compadres').toUpperCase();
  const title = clean(b.surveyTitle || 'ENCUESTA DE SERVICIO');
  const message = clean(
    b.surveyMessage || '¿Nos podrias responder esta pequeña encuesta para mejorar nuestros servicios?'
  );
  const footer = clean(
    b.surveyFooter || '¡Gracias por tu valioso tiempo, esperamos poder servirte nuevamente!'
  );

  // Cinco métricas configurables desde Restaurant Suite.
  const questions = [
    clean(b.surveyMetric1 || 'Atencion del personal'),
    clean(b.surveyMetric2 || 'Calidad de los alimentos'),
    clean(b.surveyMetric3 || 'Rapidez en el servicio'),
    clean(b.surveyMetric4 || 'Limpieza de las instalaciones'),
    clean(b.surveyMetric5 || 'Relacion precio / calidad'),
  ].filter(Boolean).slice(0, 5);

  center(businessName, short ? 22 : 28, 800, { top: short ? 18 : 22, gap: 1 });
  center(title, short ? 13 : 15, 700, { top: 13, gap: 6 });

  const msgLines = [
    ...wrap(message, short ? 29 : 42),
    ...wrap('Tu opinion nos ayuda a mejorar. Marca del 1 al 5 en cada punto.', short ? 31 : 48),
  ];
  const infoTop = y + 4;
  const infoH = 14 + msgLines.length * (short ? 16 : 19);
  rect(M, infoTop, innerW, infoH, 10, 1.3);
  y = infoTop + 3;
  for (const ln of msgLines) {
    center(ln, short ? 12 : 14, 500, { top: short ? 12 : 14, gap: 1 });
  }
  y = infoTop + infoH + 8;

  // Compact rating table
  const tableTop = y + 2;
  const qCol = Math.round(innerW * (short ? 0.56 : 0.58));
  const npsColW = innerW - qCol;
  const rateCol = npsColW / 5;
  const headerH = short ? 28 : 34;
  const rowBaseH = short ? 33 : 38;
  const wrappedQuestions = questions.map((q) => wrap(q, short ? 20 : 26));
  const rowHeights = wrappedQuestions.map((lines) => rowBaseH + Math.max(0, lines.length - 1) * (short ? 13 : 15));
  const tableH = headerH + rowHeights.reduce((a, b) => a + b, 0);
  rect(M, tableTop, innerW, tableH, 10, 1.6);
  line(M + qCol, tableTop, M + qCol, tableTop + tableH, 1.2);
  for (let i = 1; i < 5; i++) {
    line(M + qCol + rateCol * i, tableTop, M + qCol + rateCol * i, tableTop + tableH, 1);
  }
  line(M, tableTop + headerH, M + innerW, tableTop + headerH, 1.2);

  elements.push(`<text x="${M + 10}" y="${tableTop + (short ? 19 : 22)}" font-family="DejaVu Sans" font-size="${short ? 13 : 15}" font-weight="700" fill="#000">Evalua</text>`);
  for (let i = 0; i < 5; i++) {
    const cx = M + qCol + rateCol * i + rateCol / 2;
    elements.push(`<text x="${cx}" y="${tableTop + (short ? 19 : 22)}" font-family="DejaVu Sans" font-size="${short ? 13 : 15}" font-weight="700" text-anchor="middle" fill="#000">${i + 1}</text>`);
  }

  let rowTop = tableTop + headerH;
  wrappedQuestions.forEach((lines, idx) => {
    const rowH = rowHeights[idx];
    if (idx < wrappedQuestions.length - 1) line(M, rowTop + rowH, M + innerW, rowTop + rowH, 1);
    let qy = rowTop + (short ? 15 : 18);
    for (const ln of lines) {
      elements.push(`<text x="${M + 10}" y="${qy}" font-family="DejaVu Sans" font-size="${short ? 13 : 15}" font-weight="700" fill="#000">${esc(ln)}</text>`);
      qy += short ? 13 : 15;
    }
    const cy = rowTop + rowH / 2 + 3;
    for (let i = 0; i < 5; i++) {
      const cx = M + qCol + rateCol * i + rateCol / 2;
      square(cx, cy, short ? 14 : 16, 1.2);
    }
    rowTop += rowH;
  });
  y = tableTop + tableH + 6;

  // Recommendation block 1-10
  text('¿Nos recomendarias con tus familiares y/o amigos?', short ? 15 : 18, { weight: 700, top: short ? 15 : 18, gap: 6 });
  const recTop = y + 2;
  const recPad = short ? 6 : 10;
  const recW = innerW - recPad * 2;
  const recStep = recW / 10;
  const recH = short ? 42 : 48;
  rect(M, recTop, innerW, recH, 8, 1.3);
  for (let i = 0; i < 10; i++) {
    const cx = M + recPad + recStep * i + recStep / 2;
    elements.push(`<text x="${cx}" y="${recTop + (short ? 14 : 16)}" font-family="DejaVu Sans" font-size="${short ? 11 : 13}" font-weight="700" text-anchor="middle" fill="#000">${i + 1}</text>`);
    square(cx, recTop + (short ? 30 : 34), short ? 12 : 14, 1.1);
  }
  y = recTop + recH + 6;

  // Comments
  text('Comentarios adicionales', short ? 15 : 18, { weight: 700, top: short ? 14 : 16, gap: 4 });
  const comTop = y + 2;
  const comH = short ? 54 : 62;
  rect(M, comTop, innerW, comH, 8, 1.2);
  for (let i = 1; i <= 2; i++) {
    line(M + 8, comTop + i * (comH / 3), M + innerW - 8, comTop + i * (comH / 3), 0.9);
  }
  y = comTop + comH + 6;

  // Attended by
  const attended = clean(payload.cajero || payload.atendidoPor || '');
  if (attended) {
    const atTop = y + 2;
    const atH = short ? 28 : 32;
    rect(M, atTop, innerW, atH, 8, 1.2);
    elements.push(`<text x="${M + 10}" y="${atTop + (short ? 18 : 21)}" font-family="DejaVu Sans" font-size="${short ? 12 : 14}" font-weight="600" fill="#000">Atendio: ${esc(attended)}</text>`);
    y = atTop + atH + 6;
  }

  const footerLines = wrap(footer, short ? 30 : 44);
  for (const ln of footerLines) {
    center(ln, short ? 14 : 17, 700, { top: short ? 14 : 16, gap: 2, italic: true });
  }
  y += short ? 40 : 48;

  const svg = Buffer.from(
    `<svg width="${W}" height="${Math.ceil(y)}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/>${elements.join('')}</svg>`
  );
  const { data, info } = await sharp(svg)
    .flatten({ background: '#fff' })
    .greyscale()
    .threshold(182)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bpr = Math.ceil(info.width / 8);
  const bits = Buffer.alloc(bpr * info.height);
  for (let yy = 0; yy < info.height; yy++) {
    for (let x = 0; x < info.width; x++) {
      if (data[yy * info.width + x] < 128) {
        bits[yy * bpr + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  return Buffer.concat([
    Buffer.from([0x1b, 0x40]),
    Buffer.from([0x1d, 0x76, 0x30, 0, bpr & 255, (bpr >> 8) & 255, info.height & 255, (info.height >> 8) & 255]),
    bits,
    Buffer.from([10, 10, 10, 10, 10, 10, 0x1d, 0x56, 0]),
  ]);
}

module.exports = { renderSurveyBuffer };
