'use strict';
function check(cfg, body) {
  const fail = (message) => {
    throw Object.assign(Error(message), { status: 400 });
  };
  const type = body.tipo_servicio || 'comedor';
  const flag = { comedor: 'dineIn', para_llevar: 'takeout', delivery: 'delivery' }[type];
  if (!flag || !cfg.orders[flag]) fail('Este tipo de servicio está deshabilitado');
  if ((!cfg.pos.allowAnonymous || cfg.pos.requireName) && !String(body.cliente_nombre || '').trim())
    fail('Nombre del cliente requerido');
  if (cfg.pos.requirePhone && !String(body.cliente_telefono || '').trim())
    fail('Teléfono del cliente requerido');
}
module.exports = { check };
