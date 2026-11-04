// Only this renderer emits ESC/POS control bytes. User text cannot inject commands.
function ascii(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e\n]/g, '')
    .replace(/[\r\t]/g, ' ');
}
function wrap(value, width) {
  const out = [];
  for (const para of ascii(value).split('\n')) {
    let line = '';
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (word.length > width) {
        if (line) {
          out.push(line);
          line = '';
        }
        out.push(word.slice(0, width));
        word = word.slice(width);
      }
      if (!word) continue;
      if (line.length + word.length + 1 > width) {
        out.push(line);
        line = word;
      } else line += (line ? ' ' : '') + word;
    }
    out.push(line);
  }
  return out;
}
function columns(left, right, width) {
  right = ascii(right);
  if (right.length >= width) return [...wrap(left, width), ...wrap(right, width)];
  const ls = wrap(left, Math.max(1, width - right.length - 1));
  const tail = ls.pop() || '';
  return [...ls, tail + ' '.repeat(width - tail.length - right.length) + right];
}
const money = (x) => '$' + Number(x || 0).toFixed(2);
function render(kind, data, printer, business = {}) {
  const width = printer.columns || (printer.width === 58 ? 32 : 48),
    lines = [];
  const push = (t) => lines.push(...wrap(t, width));
  const pair = (a, b) => lines.push(...columns(a, b, width));
  const rule = () => lines.push('-'.repeat(width));
  const title =
    {
      kitchen: 'COMANDA DE COCINA',
      cancel: 'CANCELACION',
      receipt: 'RECIBO DE PAGO',
      payroll: 'RECIBO DE NOMINA',
      tips: 'RECIBO DE PROPINAS',
      prebill: 'PRECUENTA - SIN PAGAR',
      refund: 'REEMBOLSO',
      shift: 'CORTE DE CAJA',
      test: 'PRUEBA DE IMPRESION',
    }[kind] || kind;
  push(business.name || 'Restaurante');
  push(title);
  rule();
  push(
    'Folio: ' +
      (data.folio || data.pedido_id || data.id || '-') +
      '  Turno: ' +
      (data.numero_turno || data.turno_id || '-'),
  );
  push('Mesa: ' + (data.mesa || data.mesa_numero || '-'));
  push(
    'Fecha: ' +
      (data.printed_at || new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })),
  );
  if (data.mesero || data.cajero) push('Atiende: ' + (data.mesero || data.cajero));
  if (data.cliente_nombre) push('Cliente: ' + data.cliente_nombre);
  if (data.cliente_telefono) push('Tel: ' + data.cliente_telefono);
  rule();
  for (const it of data.items || []) {
    if (['kitchen', 'cancel'].includes(kind)) push(it.cantidad + ' x ' + it.nombre + (it.es_variable && Number(it.precio_unitario)>0 ? '  ' + money(it.precio_unitario) : ''));
    else
      pair(
        it.cantidad + ' x ' + it.nombre,
        money(Number(it.cantidad) * Number(it.precio_unitario)),
      );
    if (it.modificadores) push('  + ' + it.modificadores);
    if (it.notas) push('  NOTA: ' + it.notas);
    if (['kitchen', 'cancel'].includes(kind)) push('');
  }
  if (kind === 'tips') {
    push('Empleado: ' + (data.empleado || '-'));
    push('Rol: ' + (data.rol || '-'));
    push('Periodo: ' + (data.fecha_inicio || '-') + ' al ' + (data.fecha_fin || '-'));
    rule();
    if (Number(data.propina_base || 0)) pair('Base', money(data.propina_base));
    if (Number(data.propina_puntualidad || 0)) pair('Puntualidad', money(data.propina_puntualidad));
    if (Number(data.propina_mesas || 0)) pair('Mesas', money(data.propina_mesas));
    pair('PROPINA TOTAL', money(data.propina_asignada));
  } else if (kind === 'payroll') {
    push('Empleado: ' + (data.empleado || '-'));
    push('Rol: ' + (data.rol || '-'));
    push(
      'Periodo: ' +
        (data.fecha_inicio || '-') +
        ' al ' +
        (data.fecha_fin || '-')
    );

    rule();

    pair('Dias trabajados', String(data.dias_trabajados || 0));
    pair('Horas', Number(data.horas_totales || 0).toFixed(2));
    pair(
      'Puntualidad',
      Number(data.porcentaje_puntualidad || 0).toFixed(1) + '%'
    );
    pair(
      'Retardo acumulado',
      String(data.minutos_retardo || 0) + ' min'
    );

    if (data.rol === 'mesero') {
      pair('Mesas atendidas', String(data.mesas_atendidas || 0));
      pair('Postres vendidos', String(data.postres_vendidos || 0));
    }

    rule();
    push('SUELDO');

    pair('Sueldo base', money(data.sueldo_base_total));
    pair('Comision postres', money(data.comision_postres));

    rule();
    push('PROPINAS');

    if (data.rol === 'mesero') {
      pair('Base', money(data.propina_base));
      pair('Puntualidad', money(data.propina_puntualidad));
      pair('Mesas', money(data.propina_mesas));
    }

    pair('Propina total', money(data.propina_asignada));

    rule();
    pair('TOTAL A PAGAR', money(data.total_pagar));

  } else if (kind === 'shift') {
    pair('Ventas totales', money(data.total_ventas)); pair('Efectivo', money(data.ventas_efectivo)); pair('Tarjeta', money(data.ventas_tarjeta)); pair('Transferencia', money(data.ventas_transferencia)); pair('Propinas totales', money(data.total_propinas)); if(Number(data.propina_efectivo||0))pair('  Efectivo',money(data.propina_efectivo)); if(Number(data.propina_tarjeta||0))pair('  Tarj/Transf',money(data.propina_tarjeta)); pair('Fondo',money(data.monto_inicial)); pair('Entradas',money(data.total_pay_in)); pair('Retiros',money(data.total_pay_out)); pair('Esperado',money(data.efectivo_esperado)); pair('Contado',money(data.monto_final_real)); const dif=Number(data.diferencia_descuadre||0); if(dif)push(`Diferencia: ${dif>0?'+':''}${money(dif)} (${dif>0?'SOBRANTE':'FALTANTE'})`); for(const m of data.movimientos||[])if(m.tipo==='pay_out')pair('RETIRO | '+(m.motivo||''),money(m.monto));
  } else if (!['kitchen', 'cancel', 'test'].includes(kind)) {
    rule();
    pair('TOTAL', money(data.total));
    if (data.metodo_pago) push('Pago: ' + data.metodo_pago);
    if (kind === 'receipt') {
      pair('Efectivo recibido', money(data.paga_con));
      pair('Cambio', money(data.cambio_llevar));
    }
  }
  if (data.direccion_entrega) push('Direccion: ' + data.direccion_entrega);
  if (data.referencias_entrega) push('Referencia: ' + data.referencias_entrega);
  if (data.motivo) push('Motivo: ' + data.motivo);
  if (kind === 'test') {
    push('Ancho: ' + printer.width + ' mm / ' + width + ' columnas');
    push('1234567890'.repeat(8));
    pair('Producto de nombre largo con extras', money(1234.5));
  }
  rule();
  if (['receipt', 'prebill'].includes(kind)) {
    push(business.address || '');
    push(business.phone || '');
    push(business.footer || 'Gracias');
  }
  const text = lines.join('\n');
  const buffer = Buffer.from(
    '\x1b@\x1bM\x00\x1bt\x00' + text + '\n\n\n' + (printer.cut ? '\x1dV\x42\x00' : ''),
    'ascii',
  );
  return { text, buffer, columns: width, lines };
}
module.exports = { ascii, wrap, columns, render };
