const $=id=>document.getElementById(id);let chats=[],selectedPeer=null;
async function api(u,m='GET',b){const r=await fetch(u,{method:m,headers:{'Content-Type':'application/json'},...(b!==undefined?{body:JSON.stringify(b)}:{})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Error');return d}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function stateLabel(s){return({bot:'BOT ACTIVO',human:'ATENCIÓN HUMANA',paused:'PAUSADO',needs_attention:'NECESITA ATENCIÓN'})[s]||s}function identity(c){return c.name||c.displayPhone||c.phone||'Cliente de WhatsApp'}function secondary(c){const p=c.displayPhone||c.phone||'';return p&&p!==identity(c)?p:''}
function showTab(id){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.id===id));document.querySelectorAll('.tabbtn').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));if(id==='inbox')loadChats();if(id==='control')loadControl();if(id==='knowledge')loadKnowledge();if(id==='questions')loadQuestions();if(id==='proofs')loadProofs();if(id==='ai')loadAi()}document.querySelectorAll('.tabbtn').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
async function loadAi(){try{const a=await api('/api/whatsapp-admin/ai-status'),g=!!a.gemini?.configured,o=!!a.openai?.configured;$('ai-pills').innerHTML=`<span class="pill"><span class="dot ${g?'ok':''}"></span>Gemini ${g?'listo':'sin clave'}</span><span class="pill"><span class="dot ${o?'ok':''}"></span>OpenAI ${o?'listo':'sin clave'}</span>`;$('gemini-state').textContent=g?'Clave configurada · '+(a.gemini.model||'modelo automático'):'Sin clave configurada';$('openai-state').textContent=o?'Clave configurada · '+(a.openai.model||'modelo automático'):'Sin clave configurada'}catch{$('ai-pills').innerHTML='<span class="pill">IA no disponible</span>'}}
async function saveSecret(p){const i=$(p+'-key'),key=i.value.trim();if(!key)return notice('Escribe una API key.',true);try{await api('/api/whatsapp-admin/ai-secrets','POST',p==='gemini'?{geminiKey:key}:{openaiKey:key});i.value='';notice('Clave guardada correctamente.');await loadAi()}catch(e){notice(e.message,true)}}async function clearSecret(p){if(!confirm('¿Eliminar la clave?'))return;try{await api('/api/whatsapp-admin/ai-secrets','POST',p==='gemini'?{clearGemini:true}:{clearOpenai:true});notice('Clave eliminada.');await loadAi()}catch(e){notice(e.message,true)}}function notice(m,e=false){const n=$('secret-notice');n.textContent=m;n.className='notice'+(e?' error':'');n.style.display='block';setTimeout(()=>n.style.display='none',5000)}document.querySelectorAll('[data-save-secret]').forEach(b=>b.onclick=()=>saveSecret(b.dataset.saveSecret));document.querySelectorAll('[data-clear-secret]').forEach(b=>b.onclick=()=>clearSecret(b.dataset.clearSecret));
async function loadChats(){try{chats=await api('/api/whatsapp-admin/chats');renderChatList();if(selectedPeer){const c=chats.find(x=>x.peer===selectedPeer);if(c)renderConversation(c)}}catch(e){$('chat-list').innerHTML='<div class="empty">'+esc(e.message)+'</div>'}}
function renderChatList(){$('chat-list').innerHTML=chats.length?chats.map(c=>`<div class="chat-item ${c.peer===selectedPeer?'active':''}" data-key="${c.key}"><div class="chat-name">${esc(identity(c))}</div><div class="chat-meta">${esc(secondary(c))}${secondary(c)?' · ':''}${esc(stateLabel(c.state))}</div></div>`).join(''):'<div class="empty">Aún no hay conversaciones.</div>';document.querySelectorAll('.chat-item').forEach(el=>el.onclick=()=>{const c=chats.find(x=>String(x.key)===el.dataset.key);if(!c)return;selectedPeer=c.peer;renderChatList();renderConversation(c)})}
function renderConversation(c){$('conversation').innerHTML=`<div class="conv-head"><div><strong>${esc(identity(c))}</strong>${secondary(c)?`<div class="chat-meta">${esc(secondary(c))}</div>`:''}</div><select id="chat-state" style="width:auto;margin:0"><option value="bot">BOT ACTIVO</option><option value="human">ATENCIÓN HUMANA</option><option value="paused">PAUSADO</option><option value="needs_attention">NECESITA ATENCIÓN</option></select></div><div class="messages" id="messages">${(c.messages||[]).slice(-80).map(m=>`<div class="bubble ${m.direction==='out'?'out':''}"><small>${m.direction==='out'?'Restaurante':'Cliente'}</small>${esc(m.text)}</div>`).join('')||'<div class="empty">Sin mensajes.</div>'}</div><div class="composer"><textarea id="reply-text" rows="3" placeholder="Escribe una respuesta como restaurante..."></textarea><div class="row" style="justify-content:space-between"><span class="muted" style="font-size:12px">Al responder manualmente, el bot pasa a atención humana.</span><button class="wa-btn primary" id="send-reply"><span class="material-icons-round">send</span>Enviar</button></div></div>`;$('chat-state').value=c.state||'bot';$('chat-state').onchange=async()=>{await api('/api/whatsapp-admin/chats/state','POST',{peer:c.peer,state:$('chat-state').value});await loadChats()};$('send-reply').onclick=async()=>{const t=$('reply-text'),message=t.value.trim();if(!message)return;await api('/api/whatsapp-admin/chats/reply','POST',{peer:c.peer,message});t.value='';setTimeout(loadChats,700)};const m=$('messages');m.scrollTop=m.scrollHeight}
async function loadKnowledge(){
  try{
    const [training,learned]=await Promise.all([
      api('/api/whatsapp-admin/knowledge/training'),
      api('/api/whatsapp-admin/knowledge/learned')
    ]);

    const box=$('training-text');

    if(box)
      box.value=training.text||'';

    $('knowledge-list').innerHTML=
      learned.map(k=>`
        <article class="wa-card section item">
          <p>${esc(k.contenido)}</p>
          <button
            class="wa-btn danger small"
            onclick="disableKnowledge(${k.id})"
          >
            Olvidar
          </button>
        </article>
      `).join('') ||
      '<div class="empty">Todavía no hay respuestas aprendidas.</div>';

  }catch(e){
    const list=$('knowledge-list');

    if(list)
      list.innerHTML=
        '<div class="empty">'+esc(e.message)+'</div>';
  }
}

async function saveTraining(){
  const text=
    $('training-text')?.value||'';

  const status=
    $('training-status');

  try{
    if(status)
      status.textContent='Guardando...';

    const result=
      await api(
        '/api/whatsapp-admin/knowledge/training',
        'POST',
        {text}
      );

    if(status)
      status.textContent=
        'Guardado · '+
        result.entries+
        ' reglas';

    await loadKnowledge();

  }catch(e){
    if(status)
      status.textContent=
        'Error: '+e.message;
  }
}

async function disableKnowledge(id){
  await api(
    '/api/whatsapp-admin/knowledge/'+id,
    'DELETE'
  );

  loadKnowledge();
}

setTimeout(()=>{
  const b=$('save-training');

  if(b)
    b.onclick=saveTraining;
},0);

async function loadQuestions(){const rows=await api('/api/whatsapp-admin/questions');$('questions-list').innerHTML=rows.map(q=>`<article class="wa-card section item"><div class="row"><strong>Consulta #${q.id}</strong><span class="tag">${esc(q.estado)}</span>${q.telefono?`<span class="muted">${esc(q.telefono)}</span>`:''}</div><p><strong>Cliente:</strong> ${esc(q.pregunta)}</p>${q.respuesta?`<p><strong>Respuesta:</strong> ${esc(q.respuesta)}</p>`:`<textarea id="qa-${q.id}" rows="3" placeholder="Respuesta para el cliente"></textarea><div class="row"><button class="wa-btn primary" onclick="answer(${q.id})">Responder</button><button class="wa-btn danger" onclick="discard(${q.id})">Descartar</button></div>`}${q.respuesta&&!q.knowledge_id?`<div style="margin-top:10px"><button class="wa-btn small" onclick="learn(${q.id})">Agregar al conocimiento</button></div>`:''}</article>`).join('')||'<div class="empty">No hay consultas pendientes.</div>'}async function answer(id){await api('/api/whatsapp-admin/questions/'+id+'/answer','POST',{answer:$('qa-'+id).value});loadQuestions()}async function discard(id){await api('/api/whatsapp-admin/questions/'+id+'/discard','POST',{});loadQuestions()}async function learn(id){await api('/api/whatsapp-admin/questions/'+id+'/knowledge','POST',{});loadQuestions();loadKnowledge()}
async function loadMetrics(){try{const m=await api('/api/whatsapp-admin/metrics');const cards=[['Conversaciones',m.chats],['Atención humana',m.human],['Pedidos · 30 días',m.orders],['Ventas WA · 30 días','$'+Number(m.sales||0).toFixed(2)],['Clientes con pedido',m.customers],['Comprobantes pendientes',m.pendingProofs]];$('wa-metrics').innerHTML=cards.map(x=>`<div style="padding:12px;border:1px solid var(--border-color);border-radius:12px"><div class="chat-meta">${esc(x[0])}</div><strong style="font-size:20px">${esc(x[1])}</strong></div>`).join('')}catch(e){$('wa-metrics').innerHTML='<div class="muted">'+esc(e.message)+'</div>'}}
$('refresh-metrics').onclick=loadMetrics;$('refresh-all').onclick=()=>Promise.all([loadControl(),loadAi(),loadChats(),loadMetrics()]);Promise.all([loadControl(),loadAi(),loadChats(),loadMetrics()]).catch(console.error);

async function loadProofs(){try{const rows=await api('/api/whatsapp-admin/proofs');$('proofs-list').innerHTML=rows.map(r=>{const p=r.proof||{},x=p.extraction||{};return `<article class="wa-card section item"><div class="row" style="justify-content:space-between"><div><strong>${esc(r.name||r.phone||'Cliente de WhatsApp')}</strong><div class="chat-meta">${r.phone?esc(r.phone)+' · ':''}${p.orderId?'Pedido #'+esc(p.orderId):'Sin pedido vinculado'}</div></div><span class="tag">${esc(String(p.state||'received').toUpperCase())}</span></div>${x.amount?`<p>Monto detectado: <strong>$${Number(x.amount).toFixed(2)}</strong>${x.reference?' · Ref. '+esc(x.reference):''}</p>`:'<p class="muted">Sin datos automáticos confiables. Revisa el comprobante en WhatsApp.</p>'}${p.state==='received'?`<div class="row"><button class="wa-btn primary" onclick="proofState('${esc(r.peer)}','verified')">Verificar</button><button class="wa-btn danger" onclick="proofState('${esc(r.peer)}','rejected')">Rechazar</button></div>`:''}</article>`}).join('')||'<div class="empty">No hay comprobantes recibidos.</div>'}catch(e){$('proofs-list').innerHTML='<div class="empty">'+esc(e.message)+'</div>'}}
async function proofState(peer,state){const note=prompt(state==='verified'?'Nota de verificación (opcional)':'Motivo de rechazo (opcional)')||'';await api('/api/whatsapp-admin/proofs/state','POST',{peer,state,note});await loadProofs()}

let waControl=null,waGroups=[];
function modeText(mode,enabled){if(!enabled)return ['⛔ BOT DETENIDO','No se procesan mensajes ni se permiten envíos automáticos.'];if(mode==='full')return ['🟢 OPERACIÓN COMPLETA','Clientes + Admin + Contabilidad habilitados.'];if(mode==='internal')return ['🧪 PRUEBAS · ADMIN + CONTABILIDAD','Los clientes no reciben respuestas automáticas ni manuales desde este centro.'];return ['🧪 PRUEBAS · SÓLO ADMIN','Sólo el grupo Admin puede interactuar con el bot. Clientes y Contabilidad están bloqueados.'];}
function renderControl(){if(!waControl)return;const [t,h]=modeText(waControl.mode,waControl.enabled),b=$('mode-banner');$('mode-title').textContent=t;$('mode-help').textContent=h;b.className='mode-banner '+(waControl.mode==='full'&&waControl.enabled?'live':'safe');const st=waControl.status||{};$('connection-pill').textContent=(st.ready?'● Conectado':'○ Sin conexión')+(st.account?' · '+st.account:'');$('bot-enabled').checked=waControl.enabled;$('bot-mode').value=waControl.mode;fillGroups();}
function fillGroups(){for(const [id,current] of [['admin-group',waControl?.adminGroupPeer||''],['accounting-group',waControl?.accountingGroupPeer||'']]){const el=$(id);if(!el)continue;const rows=[{peer:'',name:'Sin configurar'},...waGroups];if(current&&!rows.some(x=>x.peer===current))rows.push({peer:current,name:'Grupo guardado (no detectado ahora)'});el.innerHTML=rows.map(g=>`<option value="${esc(g.peer)}">${esc(g.name)}</option>`).join('');el.value=current;}}
async function loadControl(){try{waControl=await api('/api/whatsapp-admin/control');renderControl()}catch(e){$('mode-title').textContent='No pude leer el estado';$('mode-help').textContent=e.message}}
async function detectGroups(){try{waGroups=await api('/api/whatsapp-admin/groups');fillGroups();controlNotice(waGroups.length?`Detecté ${waGroups.length} grupo(s).`:'No encontré grupos. Verifica que WhatsApp esté conectado.',!waGroups.length)}catch(e){controlNotice(e.message,true)}}
function controlNotice(m,e=false){const n=$('control-notice');n.textContent=m;n.className='notice'+(e?' error':'');n.style.display='block'}
async function saveControl(forceDisabled=false){try{const body={enabled:forceDisabled?false:$('bot-enabled').checked,mode:$('bot-mode').value,adminGroupPeer:$('admin-group').value,accountingGroupPeer:$('accounting-group').value};waControl={...(waControl||{}),...await api('/api/whatsapp-admin/control','POST',body)};await loadControl();controlNotice(forceDisabled?'Bot detenido. La sesión de WhatsApp sigue vinculada.':'Configuración guardada.')}catch(e){controlNotice(e.message,true)}}
$('detect-groups').onclick=detectGroups;$('save-control').onclick=()=>saveControl(false);$('emergency-stop').onclick=()=>{if(confirm('¿Detener respuestas y automatizaciones de WhatsApp sin cerrar la sesión?'))saveControl(true)};
loadControl();
