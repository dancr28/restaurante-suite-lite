'use strict';
const SERVICE_COLUMNS = {
  comedor: 'disponible_comedor',
  para_llevar: 'disponible_para_llevar',
  delivery: 'disponible_delivery',
};
function normalizeService(value) {
  const v=String(value||'').trim().toLowerCase();
  if (v==='takeout' || v==='llevar' || v==='para llevar') return 'para_llevar';
  if (v==='domicilio' || v==='envio' || v==='envío') return 'delivery';
  if (v==='mesa' || v==='salon' || v==='salón') return 'comedor';
  return SERVICE_COLUMNS[v] ? v : null;
}
function allowed(row, service, parent=null) {
  const type=normalizeService(service);
  if (!type) return false;
  const col=SERVICE_COLUMNS[type];
  const value=row?.[col];
  if (value===null || value===undefined) return parent ? Boolean(parent[col]) : true;
  return Boolean(Number(value));
}
function label(service) {
  return {comedor:'comedor',para_llevar:'para llevar',delivery:'domicilio'}[normalizeService(service)] || service;
}
module.exports={SERVICE_COLUMNS,normalizeService,allowed,label};
