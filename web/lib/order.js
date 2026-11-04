function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
function amount(value, name = 'Monto') {
  if (value === null || value === '' || typeof value === 'boolean') fail(name + ' inválido');
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 99999999) fail(name + ' inválido');
  return Math.round((n + Number.EPSILON) * 100);
}
function validateItems(items) {
  if (!Array.isArray(items) || items.length > 200) fail('Comanda inválida');
  for (const it of items) {
    if (!it || !Number.isInteger(Number(it.producto_id)) || Number(it.producto_id) <= 0)
      fail('Producto inválido');
    const q = Number(it.cantidad);
    if (
  it.kds_line_id !== undefined &&
  (
    typeof it.kds_line_id !== 'string' ||
    !/^[A-Za-z0-9_-]{8,64}$/.test(it.kds_line_id)
  )
) {
  fail('Identificador de línea KDS inválido');
}
    if (
      !Number.isFinite(q) ||
      q <= 0 ||
      q > 10000 ||
      Math.abs(q * 100 - Math.round(q * 100)) > 1e-6
    )
      fail('Cantidad inválida');
    amount(it.precio_unitario);
    if (typeof it.nombre !== 'string' || it.nombre.length > 150) fail('Nombre inválido');
  }
}
function itemKey(it) {
  return JSON.stringify([
    Number(it.producto_id),
    it.nombre,
    Number(it.precio_unitario),
    it.modificadores || '',
    it.notas || '',
    Number(it.numero_plato) || 1,
  ]);
}
function deltaItems(previous, next) {
  const before = new Map(),
    after = new Map();
  for (const [items, map] of [
    [previous, before],
    [next, after],
  ])
    for (const it of items) {
      const k = itemKey(it);
      const entry = map.get(k) || { ...it, cantidad: 0 };
      entry.cantidad += Number(it.cantidad);
      map.set(k, entry);
    }
  const added = [],
    removed = [];
  for (const k of new Set([...before.keys(), ...after.keys()])) {
    const d = (after.get(k)?.cantidad || 0) - (before.get(k)?.cantidad || 0);
    if (d > 0) added.push({ ...after.get(k), cantidad: d });
    if (d < 0) removed.push({ ...before.get(k), cantidad: -d });
  }
  return { added, removed };
}
function paymentParts(body, total) {
  const parts = body.pagos || [{ metodo: body.metodo_pago || 'efectivo', monto: total / 100 }];
  if (!Array.isArray(parts) || !parts.length || parts.length > 20) fail('Pagos inválidos');
  const result = { efectivo: 0, tarjeta: 0, transferencia: 0 };
  for (const p of parts) {
    if (!Object.hasOwn(result, p.metodo)) fail('Método de pago inválido');
    result[p.metodo] += amount(p.monto);
  }
  if (Object.values(result).reduce((a, b) => a + b, 0) !== total)
    fail('Los pagos no coinciden con el total');
  return result;
}
module.exports = { fail, amount, validateItems, itemKey, deltaItems, paymentParts };
