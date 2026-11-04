const { createHmac, timingSafeEqual } = require('node:crypto');
function hashPin(pin, secret) {
  if (!/^\d{4}$/.test(String(pin)))
    throw Object.assign(new Error('El PIN debe tener 4 dígitos'), { status: 400 });
  return createHmac('sha256', secret).update(String(pin)).digest('hex');
}
function equal(a, b) {
  const x = Buffer.from(a || ''),
    y = Buffer.from(b || '');
  return x.length === y.length && timingSafeEqual(x, y);
}
module.exports = { hashPin, equal };
