'use strict';
const $ = (id) => document.getElementById(id);
function node(tag, text) {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
}
let busy = false;
let knownTickets = null;
let audioContext;
function sound(volume) {
  if (!audioContext) return;
  const oscillator = audioContext.createOscillator(),
    gain = audioContext.createGain();
  gain.gain.value = (volume / 100) * 0.15;
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.2);
}
async function load() {
  if (busy || !$('screen').value) return;
  busy = true;
  try {
    const res = await fetch('/api/kitchen/' + encodeURIComponent($('screen').value));
    const data = await res.json();
    if (!res.ok) throw Error(data.error);
    const cfg = data.settings;
    if (cfg.sound && knownTickets && data.tickets.some((t) => !knownTickets.has(t.id)))
      sound(cfg.volume);
    knownTickets = new Set(data.tickets.map((t) => t.id));
    $('tickets').style.fontSize = cfg.fontSize + 'px';
    $('name').textContent = data.screen.name;
    $('connection').textContent = 'Actualizado ' + new Date().toLocaleTimeString();
    $('tickets').replaceChildren();
    for (const t of data.tickets) {
      const p = t.payload,
        card = node('article', '');
      card.className = 'card ticket ' + t.status + (p.cancellation ? ' cancellation' : '');
      const age = (Date.now() - new Date(t.created_at).getTime()) / 60000;
      if (age >= cfg.criticalMinutes) card.classList.add('settings-critical');
      else if (age >= cfg.warningMinutes) card.classList.add('settings-warning');
      if (cfg.showWaiter && p.mesero) card.append(node('p', p.mesero));
      if (cfg.showTime) card.append(node('p', new Date(t.created_at).toLocaleTimeString()));
      card.append(
        node('h2', (p.cancellation ? 'CANCELAR · ' : '') + 'Pedido #' + t.pedido_id),
        node('p', cfg.showTable ? p.mesa || p.mesa_numero || '' : ''),
        node('span', t.status),
      );
      const ul = node('ul', '');
      for (const it of p.items || []) {
        const li = node('li', it.cantidad + ' x ' + it.nombre);
        if (it.modificadores) li.append(node('p', it.modificadores));
        if (cfg.showNotes && it.notas) li.append(node('strong', 'NOTA: ' + it.notas));
        ul.append(li);
      }
      card.append(ul);
      const next = {
        pending: ['Iniciar', 'preparing'],
        preparing: ['Listo', 'ready'],
        ready: ['Retirar', 'done'],
      }[t.status];
      if (next) {
        const b = node('button', next[0]);
        b.onclick = async () => {
          b.disabled = true;
          try {
            const res = await fetch('/api/kitchen/tickets/' + t.id, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ version: t.version, status: next[1] }),
            });
            if (!res.ok) {
              const e = await res.json();
              alert(e.error);
            }
            await load();
          } finally {
            b.disabled = false;
          }
        };
        card.append(b);
      }
      if (cfg.allowRecall && ['preparing', 'ready'].includes(t.status)) {
        const recall = node('button', 'Volver a pendiente');
        recall.onclick = async () => {
          const response = await fetch('/api/kitchen/tickets/' + t.id, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ version: t.version, status: 'pending' }),
          });
          if (!response.ok) alert((await response.json()).error);
          await load();
        };
        card.append(recall);
      }
      $('tickets').append(card);
    }
    if (!data.tickets.length) $('tickets').append(node('p', 'No hay comandas pendientes.'));
  } catch (e) {
    $('connection').textContent = 'Sin actualización: ' + e.message;
  } finally {
    busy = false;
  }
}
(async () => {
  await window.restaurantReady;
  const res = await fetch('/api/kitchen/screens');
  if (!res.ok) {
    $('connection').textContent = 'Inicia sesión con un usuario de cocina o administrador.';
    return;
  }
  const screens = await res.json();
  for (const s of screens) {
    const o = node('option', s.name);
    o.value = s.id;
    $('screen').append(o);
  }
  const wanted = new URLSearchParams(location.search).get('screen');
  if (screens.some((s) => s.id === wanted)) $('screen').value = wanted;
  $('screen').onchange = load;
  await load();
  const audio = node('button', 'Activar audio');
  audio.onclick = async () => {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();
    audio.textContent = 'Audio activado';
  };
  $('connection').after(audio);
  setInterval(load, window.restaurantSettings?.kds.pollMs ?? 4000);
})();
