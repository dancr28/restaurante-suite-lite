"use strict";

const sharp =
  require("sharp");

const PAPER = {
  80: {
    pixels: 576,
    margin: 24,
    normal: 22,
    small: 18,
    title: 31,
    total: 30,
  },

  58: {
    pixels: 384,
    margin: 16,
    normal: 19,
    small: 16,
    title: 27,
    total: 27,
  },
};


function clean(value) {
  return String(
    value ?? ""
  ).trim();
}


function esc(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


function money(value) {
  return (
    "$" +
    Number(
      value || 0
    ).toFixed(2)
  );
}


function wrapWords(
  value,
  maxChars
) {
  const words =
    clean(value)
      .split(/\s+/)
      .filter(Boolean);

  if (!words.length) {
    return [];
  }

  const out = [];
  let line = "";

  for (let word of words) {
    while (
      word.length >
      maxChars
    ) {
      if (line) {
        out.push(line);
        line = "";
      }

      out.push(
        word.slice(
          0,
          maxChars
        )
      );

      word =
        word.slice(
          maxChars
        );
    }

    const next =
      line
        ? `${line} ${word}`
        : word;

    if (
      next.length >
      maxChars
    ) {
      if (line) {
        out.push(line);
      }

      line = word;
    } else {
      line = next;
    }
  }

  if (line) {
    out.push(line);
  }

  return out;
}


function textElement(
  text,
  x,
  y,
  size,
  weight = 500,
  anchor = "start"
) {
  return `
    <text
      x="${x}"
      y="${y}"
      font-family="DejaVu Sans"
      font-size="${size}"
      font-weight="${weight}"
      text-anchor="${anchor}"
      fill="#000"
    >${esc(text)}</text>
  `;
}


function rasterCommand(
  raw,
  width,
  height,
  channels
) {
  const bytesPerRow =
    Math.ceil(
      width / 8
    );

  const raster =
    Buffer.alloc(
      bytesPerRow *
      height
    );

  for (
    let y = 0;
    y < height;
    y++
  ) {
    for (
      let x = 0;
      x < width;
      x++
    ) {
      const pixel =
        raw[
          (
            y * width +
            x
          ) * channels
        ];

      if (pixel < 128) {
        const offset =
          y * bytesPerRow +
          Math.floor(
            x / 8
          );

        raster[offset] |=
          0x80 >>
          (x % 8);
      }
    }
  }

  return Buffer.concat([
    Buffer.from([
      0x1b, 0x40,

      0x1d, 0x76,
      0x30, 0x00,

      bytesPerRow & 0xff,
      (bytesPerRow >> 8) & 0xff,

      height & 0xff,
      (height >> 8) & 0xff,
    ]),

    raster,

    Buffer.from(
      "\n\n"
    ),
  ]);
}


async function svgToEscPos(
  svg,
  width,
  cut = true
) {
  const {
    data,
    info,
  } =
    await sharp(
      Buffer.from(svg)
    )
      .flatten({
        background: "#fff",
      })
      .greyscale()
      .threshold(180)
      .raw()
      .toBuffer({
        resolveWithObject:
          true,
      });

  const out = [
    rasterCommand(
      data,
      info.width,
      info.height,
      info.channels
    ),

    Buffer.from(
      "\n\n"
    ),
  ];

  if (cut) {
    out.push(
      Buffer.from([
        0x1d,
        0x56,
        0x42,
        0x00,
      ])
    );
  }

  return Buffer.concat(out);
}


async function renderPayrollBuffer(
  kind,
  data,
  printer,
  business = {}
) {
  const cfg =
    PAPER[
      Number(
        printer.width
      )
    ] ||
    PAPER[80];

  const W = cfg.pixels;
  const M = cfg.margin;
  const center =
    Math.floor(
      W / 2
    );

  let y = 24;

  const elements = [];

  const add = (
    value,
    size = cfg.normal,
    opts = {}
  ) => {
    const {
      x = M,
      weight = 500,
      anchor = "start",
      gap = 6,
    } = opts;

    y += size;

    elements.push(
      textElement(
        value,
        x,
        y,
        size,
        weight,
        anchor
      )
    );

    y += gap;
  };


  const pair = (
    left,
    right,
    size = cfg.normal,
    weight = 500
  ) => {
    y += size;

    elements.push(
      textElement(
        left,
        M,
        y,
        size,
        weight,
        "start"
      )
    );

    elements.push(
      textElement(
        right,
        W - M,
        y,
        size,
        weight,
        "end"
      )
    );

    y += 5;
  };


  const rule = () => {
    y += 7;

    elements.push(`
      <line
        x1="${M}"
        y1="${y}"
        x2="${W - M}"
        y2="${y}"
        stroke="#000"
        stroke-width="2"
      />
    `);

    y += 8;
  };


  const centered =
    (
      value,
      size,
      weight = 700
    ) =>
      add(
        value,
        size,
        {
          x: center,
          anchor: "middle",
          weight,
          gap: 5,
        }
      );


  centered(
    clean(
      business.name ||
      "Restaurante"
    ).toUpperCase(),
    cfg.normal,
    700
  );


  let title = "";

  if (kind === "payroll") {
    title =
      "RECIBO DE NOMINA";
  } else if (kind === "tips") {
    title =
      "RECIBO DE PROPINAS";
  } else if (
    kind ===
    "loan_agreement"
  ) {
    title =
      "PAGARE / PRESTAMO";
  } else if (
    kind ===
    "loan_payment"
  ) {
    title =
      data.balance_after <= 0
        ? "PRESTAMO LIQUIDADO"
        : "ABONO A PRESTAMO";
  } else if (
    kind ===
    "employee_charge"
  ) {
    title =
      "CONSUMO EMPLEADO";
  } else {
    title =
      "ESTADO DE PRESTAMO";
  }

  centered(
    title,
    cfg.title,
    700
  );

  if (data.folio) {
    centered(
      data.folio,
      cfg.small,
      600
    );
  }

  rule();


  if (kind === "payroll") {

    add(
      `Empleado: ${
        clean(
          data.empleado
        ) || "-"
      }`,
      cfg.normal,
      {
        weight: 600,
      }
    );

    add(
      `${clean(
        data.fecha_inicio
      )} a ${clean(
        data.fecha_fin
      )}`,
      cfg.small
    );

    pair(
      "Dias",
      String(
        data.dias_trabajados ||
        0
      )
    );

    pair(
      "Sueldo",
      money(
        data.sueldo_base_total
      )
    );

    if (
      Number(
        data.comision_postres ||
        0
      )
    ) {
      pair(
        "Comision",
        money(
          data.comision_postres
        )
      );
    }

    if (
      Number(
        data.propina_asignada ||
        0
      )
    ) {
      pair(
        "Propinas",
        money(
          data.propina_asignada
        )
      );
    }

    if (
      Number(
        data.prestamo_descuento ||
        0
      )
    ) {
      pair(
        "Prestamo",
        "-" +
        money(
          data.prestamo_descuento
        ),
        cfg.normal,
        600
      );
    }

    if (
      Number(
        data.consumo_descuento ||
        0
      )
    ) {
      pair(
        "Consumos",
        "-" +
        money(
          data.consumo_descuento
        ),
        cfg.normal,
        600
      );
    }

    rule();

    pair(
      "TOTAL",
      money(
        data.total_pagar
      ),
      cfg.total,
      700
    );

    if (
      Number(
        data.saldo_prestamo ||
        0
      ) > 0
    ) {
      pair(
        "Saldo prestamo",
        money(
          data.saldo_prestamo
        ),
        cfg.small,
        600
      );
    }

    if (
      Number(
        data.saldo_consumos ||
        0
      ) > 0
    ) {
      pair(
        "Consumos pendientes",
        money(
          data.saldo_consumos
        ),
        cfg.small,
        600
      );
    }

  } else if (
    kind === "tips"
  ) {

    add(
      `Empleado: ${
        clean(
          data.empleado
        ) || "-"
      }`,
      cfg.normal,
      {
        weight: 600,
      }
    );

    add(
      `${clean(
        data.fecha_inicio
      )} a ${clean(
        data.fecha_fin
      )}`,
      cfg.small
    );

    if (
      data.metodo_propina ===
      "puntos"
    ) {
      pair(
        "Puntos",
        String(
          Number(
            data.puntos_propina ||
            0
          )
        ),
        cfg.normal,
        600
      );

      pair(
        "Valor/punto",
        money(
          data.valor_punto
        ),
        cfg.small,
        500
      );
    }

    if (
      Number(
        data.propina_base || 0
      )
    ) {
      pair(
        "Base",
        money(
          data.propina_base
        )
      );
    }

    if (
      Number(
        data.propina_puntualidad ||
        0
      )
    ) {
      pair(
        "Puntualidad",
        money(
          data.propina_puntualidad
        )
      );
    }

    if (
      Number(
        data.propina_mesas || 0
      )
    ) {
      pair(
        "Mesas",
        money(
          data.propina_mesas
        )
      );
    }

    rule();

    pair(
      "PROPINA",
      money(
        data.propina_asignada
      ),
      cfg.total,
      700
    );

  } else if (
    kind ===
    "loan_agreement"
  ) {

    add(
      clean(
        data.empleado
      ),
      cfg.normal,
      {
        weight: 700,
      }
    );

    if (data.fecha) {
      add(
        data.fecha,
        cfg.small
      );
    }

    pair(
      "Prestamo",
      money(
        data.amount_original
      ),
      cfg.normal,
      700
    );

    pair(
      "Cuota/pago",
      money(
        data.installment_amount
      )
    );

    pair(
      "Modalidad",
      clean(
        data.payment_frequency
      ).toUpperCase()
    );

    if (data.concept) {
      rule();

      add(
        "Concepto:",
        cfg.small,
        {
          weight: 600,
        }
      );

      for (
        const line of
        wrapWords(
          data.concept,
          Number(
            printer.width
          ) === 58
            ? 28
            : 43
        )
      ) {
        add(
          line,
          cfg.small
        );
      }
    }

    rule();

    for (
      const line of
      wrapWords(
        "Reconozco haber recibido el monto indicado y autorizo los descuentos acordados.",
        Number(
          printer.width
        ) === 58
          ? 29
          : 44
      )
    ) {
      add(
        line,
        cfg.small
      );
    }

    y += 22;

    centered(
      "________________________",
      cfg.small,
      500
    );

    centered(
      "Firma empleado",
      cfg.small,
      500
    );

    y += 12;

    centered(
      "________________________",
      cfg.small,
      500
    );

    centered(
      "Firma responsable",
      cfg.small,
      500
    );

  } else if (
    kind ===
    "loan_payment"
  ) {

    add(
      clean(
        data.empleado
      ),
      cfg.normal,
      {
        weight: 700,
      }
    );

    pair(
      "Abono",
      money(
        data.amount
      ),
      cfg.normal,
      700
    );

    pair(
      "Saldo anterior",
      money(
        data.balance_before
      )
    );

    pair(
      "Saldo nuevo",
      money(
        data.balance_after
      ),
      cfg.normal,
      700
    );

    if (data.note) {
      add(
        clean(
          data.note
        ),
        cfg.small
      );
    }

  } else if (
    kind ===
    "employee_charge"
  ) {

    add(
      clean(
        data.empleado
      ),
      cfg.normal,
      {
        weight: 700,
      }
    );

    rule();

    for (
      const line of
      wrapWords(
        data.concept,
        Number(
          printer.width
        ) === 58
          ? 27
          : 42
      )
    ) {
      add(
        line,
        cfg.normal,
        {
          weight: 600,
        }
      );
    }

    pair(
      "Cantidad",
      String(
        Number(
          data.quantity || 1
        )
      )
    );

    pair(
      "Precio",
      money(
        data.unit_price
      )
    );

    rule();

    pair(
      "TOTAL",
      money(
        data.total_amount
      ),
      cfg.total,
      700
    );

    if (
      Number(
        data.remaining_amount ||
        0
      ) !==
      Number(
        data.total_amount ||
        0
      )
    ) {
      pair(
        "Pendiente",
        money(
          data.remaining_amount
        ),
        cfg.small,
        600
      );
    }

    if (data.notes) {
      add(
        clean(
          data.notes
        ),
        cfg.small
      );
    }

  } else {

    add(
      clean(
        data.empleado
      ),
      cfg.normal,
      {
        weight: 700,
      }
    );

    pair(
      "Monto inicial",
      money(
        data.amount_original
      )
    );

    pair(
      "Cuota",
      money(
        data.installment_amount
      )
    );

    pair(
      "Saldo",
      money(
        data.balance
      ),
      cfg.total,
      700
    );

    pair(
      "Estado",
      clean(
        data.status
      ).toUpperCase(),
      cfg.small,
      600
    );

    if (
      Array.isArray(
        data.movements
      ) &&
      data.movements.length
    ) {
      rule();

      add(
        "Ultimos movimientos",
        cfg.small,
        {
          weight: 700,
        }
      );

      for (
        const m of
        data.movements.slice(
          0,
          5
        )
      ) {
        pair(
          clean(
            m.fecha
          ).slice(
            0,
            10
          ),
          "-" +
          money(
            m.amount
          ),
          cfg.small
        );
      }
    }
  }


  y += 18;

  const height =
    Math.max(
      y + 20,
      140
    );

  const svg = `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="${W}"
      height="${height}"
      viewBox="0 0 ${W} ${height}"
    >
      <rect
        width="100%"
        height="100%"
        fill="#fff"
      />

      ${elements.join("\n")}
    </svg>
  `;

  return svgToEscPos(
    svg,
    W,
    printer.cut !== false
  );
}


module.exports = {
  renderPayrollBuffer,
};
