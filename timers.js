(()=>{
'use strict';
const DB_NAME='gerds-rezepte',DB_VERSION=4,STORE='timers';
const CHANGE_EVENT='gerds:timers-changed';
let dbPromise=null,timers=[],audioContext=null;
function openDb(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains('favorites'))db.createObjectStore('favorites',{keyPath:'recipeId'});
      if(!db.objectStoreNames.contains('shopping'))db.createObjectStore('shopping',{keyPath:'key'});
      if(!db.objectStoreNames.contains('recipePlans'))db.createObjectStore('recipePlans',{keyPath:'recipeId'});
      if(!db.objectStoreNames.contains('recipeNotes'))db.createObjectStore('recipeNotes',{keyPath:'recipeId'});
      if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});
    };
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  return dbPromise;
}
async function allRows(){const db=await openDb();if(!db.objectStoreNames.contains(STORE))return [];return new Promise((resolve,reject)=>{const req=db.transaction(STORE,'readonly').objectStore(STORE).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error)})}
async function put(row){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(row);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
async function removeRow(id){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const uid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const copy=x=>x?JSON.parse(JSON.stringify(x)):null;
function remainingMs(timer,now=Date.now()){if(timer?.status==='paused')return Math.max(0,Number(timer.pausedRemainingMs)||0);if(timer?.status==='running')return Math.max(0,(Number(timer.endsAt)||0)-now);return 0}
function clock(ms){const total=Math.max(0,Math.ceil((Number(ms)||0)/1000)),h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function duration(seconds){return window.GerdTimerParser?.format?.(seconds)||`${Math.round(seconds/60)} Min.`}
function current(){const rank={finished:0,running:1,paused:2};return timers.filter(t=>['running','paused','finished'].includes(t.status)).sort((a,b)=>(rank[a.status]-rank[b.status])||((a.endsAt||Infinity)-(b.endsAt||Infinity)))}
function findCandidate(recipeId,stepIndex,candidateKey){return [...timers].reverse().find(t=>t.recipeId===recipeId&&Number(t.cookStepIndex)===Number(stepIndex)&&t.candidateKey===candidateKey&&['running','paused','finished'].includes(t.status))||null}
function findByStepKey(recipeId,stepKey,candidateKey){return [...timers].reverse().find(t=>t.recipeId===recipeId&&t.stepKey===stepKey&&t.candidateKey===candidateKey&&['running','paused'].includes(t.status))||null}
function emit(){renderDock();renderManager();window.dispatchEvent(new CustomEvent(CHANGE_EVENT,{detail:{timers:current().map(copy)}}))}
function primeAudio(){try{const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;if(!audioContext)audioContext=new Ctx();if(audioContext.state==='suspended')audioContext.resume().catch(()=>{})}catch{}}
function chime(){try{primeAudio();if(!audioContext)return;const now=audioContext.currentTime;[[0,880],[.18,1046.5],[.36,1318.5]].forEach(([delay,freq])=>{const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.frequency.value=freq;gain.gain.setValueAtTime(.0001,now+delay);gain.gain.exponentialRampToValueAtTime(.16,now+delay+.015);gain.gain.exponentialRampToValueAtTime(.0001,now+delay+.22);osc.connect(gain).connect(audioContext.destination);osc.start(now+delay);osc.stop(now+delay+.24)})}catch{}}
function promptNotifications(){if(!('Notification' in window)||Notification.permission!=='default'||document.getElementById('timerPermission'))return;try{if(localStorage.getItem('gerds-timer-notification-choice-v1'))return}catch{}const box=document.createElement('div');box.id='timerPermission';box.className='timer-permission';box.innerHTML='<div><strong>Timer-Benachrichtigungen</strong><span>Auch beim Weiterkochen benachrichtigt werden.</span></div><button type="button" data-allow>Erlauben</button><button type="button" data-later>Später</button>';document.body.appendChild(box);box.querySelector('[data-allow]').addEventListener('click',async()=>{try{await Notification.requestPermission()}catch{}try{localStorage.setItem('gerds-timer-notification-choice-v1','asked')}catch{}box.remove()});box.querySelector('[data-later]').addEventListener('click',()=>{try{localStorage.setItem('gerds-timer-notification-choice-v1','later')}catch{}box.remove()})}
async function notify(timer){if(!document.hidden||!('Notification' in window)||Notification.permission!=='granted')return;const url=new URL('./',location.href);url.hash=`rezept=${encodeURIComponent(timer.recipeId)}`;try{const reg=await navigator.serviceWorker?.ready;await reg?.showNotification?.(`${timer.label} – Zeit ist um`,{body:timer.recipeTitle,tag:`gerds-timer-${timer.id}`,renotify:true,icon:'assets/images/icon-192.png',badge:'assets/images/icon-192.png',data:{url:url.href,recipeId:timer.recipeId,stepIndex:timer.cookStepIndex}})}catch{}}
function alertFinished(timer,late=false){
  let stack=document.getElementById('timerAlerts');
  if(!stack){stack=document.createElement('div');stack.id='timerAlerts';stack.className='timer-alerts';stack.setAttribute('aria-live','assertive');document.body.appendChild(stack)}
  document.getElementById(`timer-alert-${timer.id}`)?.remove();
  const extra=Math.max(0,Number(timer.rangeExtraSeconds)||((timer.maxSeconds||0)-(timer.durationSeconds||0))),box=document.createElement('div');
  box.className='timer-alert';box.id=`timer-alert-${timer.id}`;
  box.innerHTML=`<div class="timer-alert-copy"><span>Zeit ist um</span><strong>${esc(timer.label)}</strong><small>${esc(timer.recipeTitle)} · Schritt ${timer.cookStepIndex+1}${late?' · inzwischen abgelaufen':''}</small></div><div class="timer-alert-actions"><button class="timer-alert-primary" data-goto>Zum Schritt</button>${extra?`<button data-extra="${extra}">+${esc(duration(extra))}</button>`:''}<button class="timer-icon-button" data-done aria-label="Timer erledigt">×</button></div>`;
  stack.appendChild(box);
  box.querySelector('[data-extra]')?.addEventListener('click',()=>addTime(timer.id,extra));
  box.querySelector('[data-goto]').addEventListener('click',()=>gotoStep(timer.id));
  box.querySelector('[data-done]').addEventListener('click',()=>stop(timer.id))
}
async function finish(timer,late=false){if(!timer||timer.status!=='running')return;timer.status='finished';timer.finishedAt=Date.now();timer.updatedAt=Date.now();await put(timer);emit();alertFinished(timer,late);if(!late){chime();try{navigator.vibrate?.([220,120,220,120,360])}catch{}}notify(timer)}
function updateLive(now=Date.now()){document.querySelectorAll('[data-live-timer-id]').forEach(el=>{const timer=timers.find(t=>t.id===el.dataset.liveTimerId);if(!timer)return;el.textContent=timer.status==='finished'?'Zeit ist um':timer.status==='paused'?`Pause · ${clock(remainingMs(timer,now))}`:clock(remainingMs(timer,now))})}
function tick(){const now=Date.now();for(const timer of timers)if(timer.status==='running'&&Number(timer.endsAt)<=now)void finish(timer);updateLive(now);renderDock()}
async function start(payload,context){
  if(context){
    const candidate=payload||{};
    payload={recipeId:context.recipeId,recipeTitle:context.recipeTitle,cookStepIndex:context.stepIndex,stepKey:context.stepKey,phase:context.phase,source:context.source,stepText:context.stepText||'',candidateKey:candidate.key,label:candidate.label&&candidate.label!=='Timer'?candidate.label:(context.phase||'Timer'),durationSeconds:candidate.durationSeconds,minSeconds:candidate.minSeconds,maxSeconds:candidate.maxSeconds,rangeExtraSeconds:candidate.rangeExtraSeconds};
  }
  primeAudio();
  const old=findCandidate(payload.recipeId,payload.cookStepIndex,payload.candidateKey);if(old&&old.status!=='finished')return copy(old);
  const seconds=Math.max(5,Math.round(Number(payload.durationSeconds)||0));if(!seconds)return null;
  const now=Date.now(),minSeconds=Math.max(5,Math.round(Number(payload.minSeconds)||seconds)),maxSeconds=Math.max(seconds,Math.round(Number(payload.maxSeconds)||seconds));
  const timer={id:`timer:${uid()}`,recipeId:String(payload.recipeId||''),recipeTitle:String(payload.recipeTitle||'Rezept'),cookStepIndex:Number(payload.cookStepIndex)||0,stepKey:String(payload.stepKey||''),phase:String(payload.phase||''),source:String(payload.source||''),stepText:String(payload.stepText||''),candidateKey:String(payload.candidateKey||''),label:String(payload.label||'Timer'),minSeconds,maxSeconds,rangeExtraSeconds:Math.max(0,Number(payload.rangeExtraSeconds)||maxSeconds-minSeconds),durationSeconds:seconds,status:'running',startedAt:now,endsAt:now+seconds*1000,pausedRemainingMs:null,createdAt:now,updatedAt:now};
  timers.push(timer);await put(timer);emit();promptNotifications();return copy(timer);
}
async function pause(id){const t=timers.find(x=>x.id===id);if(!t||t.status!=='running')return;t.pausedRemainingMs=remainingMs(t);t.endsAt=null;t.status='paused';t.updatedAt=Date.now();await put(t);emit()}
async function resume(id){const t=timers.find(x=>x.id===id);if(!t||t.status!=='paused')return;t.endsAt=Date.now()+Math.max(1000,t.pausedRemainingMs||1000);t.pausedRemainingMs=null;t.status='running';t.updatedAt=Date.now();primeAudio();await put(t);emit()}
async function addTime(id,seconds){const t=timers.find(x=>x.id===id);seconds=Math.max(1,Math.round(Number(seconds)||0));if(!t||!seconds)return;if(t.status==='paused')t.pausedRemainingMs=Math.max(0,t.pausedRemainingMs||0)+seconds*1000;else{t.endsAt=Math.max(Date.now(),Number(t.endsAt)||Date.now())+seconds*1000;t.status='running'}t.durationSeconds=(t.durationSeconds||0)+seconds;t.finishedAt=null;t.updatedAt=Date.now();if(t.rangeExtraSeconds&&seconds>=t.rangeExtraSeconds)t.rangeExtraSeconds=0;document.getElementById(`timer-alert-${id}`)?.remove();primeAudio();await put(t);emit();return copy(t)}
async function restart(id,seconds){const t=timers.find(x=>x.id===id);if(!t)return null;seconds=Math.max(5,Math.round(Number(seconds)||t.minSeconds||t.durationSeconds||60));const extension=t.status==='finished'&&t.rangeExtraSeconds&&seconds===t.rangeExtraSeconds,now=Date.now();t.durationSeconds=seconds;t.startedAt=now;t.endsAt=now+seconds*1000;t.pausedRemainingMs=null;t.status='running';t.finishedAt=null;t.updatedAt=now;if(extension){t.minSeconds=seconds;t.maxSeconds=seconds;t.rangeExtraSeconds=0}else t.rangeExtraSeconds=Math.max(0,(t.maxSeconds||seconds)-(t.minSeconds||seconds));document.getElementById(`timer-alert-${id}`)?.remove();primeAudio();await put(t);emit();return copy(t)}
async function stop(id){const i=timers.findIndex(t=>t.id===id);if(i<0)return;timers.splice(i,1);document.getElementById(`timer-alert-${id}`)?.remove();try{await removeRow(id)}catch(error){console.warn('Timer konnte nicht gelöscht werden.',error)}emit()}
function gotoStep(id){const t=timers.find(x=>x.id===id);if(!t)return;closeManager();if(window.GerdCookMode?.openAt?.(t.cookStepIndex,t.recipeId))return;try{sessionStorage.setItem('gerds-open-cook-step',JSON.stringify({recipeId:t.recipeId,stepIndex:t.cookStepIndex}))}catch{}location.href=`./?cookStep=${t.cookStepIndex}#rezept=${encodeURIComponent(t.recipeId)}`}
function rowHtml(t){
  const status=t.status==='finished'?'Zeit ist um':t.status==='paused'?'Pausiert':clock(remainingMs(t)),extra=Math.max(0,Number(t.rangeExtraSeconds)||0),id=esc(t.id);
  const primary=t.status==='running'
    ?`<button class="timer-row-primary" data-action="pause" data-id="${id}">Pause</button>`
    :t.status==='paused'
      ?`<button class="timer-row-primary" data-action="resume" data-id="${id}">Weiter</button>`
      :extra
        ?`<button class="timer-row-primary" data-action="extra" data-seconds="${extra}" data-id="${id}">+${esc(duration(extra))}</button>`
        :`<button class="timer-row-primary" data-action="stop" data-id="${id}">Erledigt</button>`;
  const menu=`<details class="timer-row-menu"><summary aria-label="Weitere Timeraktionen" title="Weitere Aktionen">•••</summary><div class="timer-row-menu-panel">${t.status!=='finished'?`<button data-action="plus" data-id="${id}">+1 Minute</button>`:''}<button data-action="goto" data-id="${id}">Zum Schritt</button>${t.status==='finished'&&extra?`<button data-action="stop" data-id="${id}">Erledigt</button>`:t.status!=='finished'?`<button class="is-danger" data-action="stop" data-id="${id}">Timer beenden</button>`:''}</div></details>`;
  return `<article class="timer-row ${t.status==='finished'?'is-finished':''}"><div class="timer-row-copy"><span>${esc(t.recipeTitle)} · Schritt ${t.cookStepIndex+1}</span><strong>${esc(t.label)}</strong><b data-live-timer-id="${id}">${status}</b></div><div class="timer-row-controls">${primary}${menu}</div></article>`
}
function ensureManager(){
  if(document.getElementById('timerManager'))return;
  document.body.insertAdjacentHTML('beforeend','<dialog class="timer-manager" id="timerManager"><div class="timer-manager-head"><div><span>Beim Kochen</span><h2>Timer</h2><p>Alle laufenden und abgelaufenen Küchen-Timer.</p></div><button class="timer-manager-close" data-close aria-label="Schließen">×</button></div><div class="timer-list" data-timer-list></div></dialog>');
  const dialog=document.getElementById('timerManager');
  dialog.querySelector('[data-close]').addEventListener('click',closeManager);
  dialog.addEventListener('click',event=>{
    if(event.target===dialog){closeManager();return}
    const b=event.target.closest('[data-action]');if(!b)return;
    b.closest('.timer-row-menu')?.removeAttribute('open');
    const id=b.dataset.id,a=b.dataset.action;
    if(a==='pause')pause(id);if(a==='resume')resume(id);if(a==='plus')addTime(id,60);if(a==='extra')addTime(id,Number(b.dataset.seconds)||0);if(a==='goto')gotoStep(id);if(a==='stop')stop(id)
  })
}
function renderManager(){
  ensureManager();
  const list=document.querySelector('[data-timer-list]');if(!list)return;
  const rows=current();
  list.innerHTML=rows.length?rows.map(rowHtml).join(''):'<div class="timer-empty"><strong>Kein Timer aktiv</strong><span>Timer erscheinen hier, sobald du sie aus einem Kochschritt startest.</span></div>';
  list.querySelectorAll('.timer-row-menu').forEach(menu=>menu.addEventListener('toggle',()=>{if(!menu.open)return;list.querySelectorAll('.timer-row-menu[open]').forEach(other=>{if(other!==menu)other.removeAttribute('open')})}))
}
function openManager(){ensureManager();renderManager();const d=document.getElementById('timerManager');if(d.showModal)d.showModal();else d.setAttribute('open','')}
function closeManager(){const d=document.getElementById('timerManager');if(!d)return;if(d.open&&d.close)d.close();else d.removeAttribute('open')}
function renderDock(){let dock=document.getElementById('timerDock'),rows=current();if(!rows.length){dock?.remove();return}if(!dock){dock=document.createElement('button');dock.id='timerDock';dock.type='button';dock.className='timer-dock';dock.addEventListener('click',openManager);document.body.appendChild(dock)}const finished=rows.find(t=>t.status==='finished'),next=rows.find(t=>t.status==='running')||rows.find(t=>t.status==='paused');if(finished){dock.classList.add('is-finished');dock.innerHTML=`<span>⏱</span><strong>Zeit ist um</strong><small>${esc(finished.label)}</small>`}else if(rows.length===1&&next){dock.classList.remove('is-finished');dock.innerHTML=`<span>⏱</span><strong>${esc(next.label)}</strong><small data-live-timer-id="${esc(next.id)}">${next.status==='paused'?`Pause · ${clock(remainingMs(next))}`:clock(remainingMs(next))}</small>`}else{dock.classList.remove('is-finished');dock.innerHTML=`<span>⏱</span><strong>${rows.length} Timer</strong><small>${next?clock(remainingMs(next)):'anzeigen'}</small>`}}
async function init(){try{timers=(await allRows()).filter(t=>t?.id);const now=Date.now();for(const t of timers)if(t.status==='running'&&Number(t.endsAt)<=now){t.status='finished';t.finishedAt=t.endsAt||now;t.updatedAt=now;await put(t);alertFinished(t,true)}}catch(error){console.warn('Timer konnten nicht geladen werden.',error)}emit();setInterval(tick,500);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')tick()})}
function get(id){return copy(timers.find(t=>t.id===id)||null)}
function list(){return current().map(copy)}
function forCandidate(recipeId,stepKey,candidateKey){return copy(findByStepKey(recipeId,stepKey,candidateKey))}
window.GerdTimers={start,pause,resume,addTime,restart,stop,get,list,active:()=>current().filter(t=>t.status==='running'||t.status==='paused').map(copy),forCandidate,formatClock:clock,displayDuration:duration,remainingMs,openManager,gotoStep,getAll:list,getForStep:(recipeId,stepIndex,key)=>copy(findCandidate(recipeId,stepIndex,key)),EVENT:CHANGE_EVENT};
init();
})();