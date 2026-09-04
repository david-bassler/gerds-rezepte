(()=>{
'use strict';

const DB_NAME='gerds-rezepte';
const DB_VERSION=4;
const STORE='timers';
const EVENT='gerds:timers-changed';
const TICK_MS=500;
let dbPromise=null;
let timers=new Map();
let ready=false;
let tickHandle=0;
let audioContext=null;

const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const uuid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

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
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return dbPromise;
}
async function getAll(){const db=await openDb();return new Promise((resolve,reject)=>{const req=db.transaction(STORE,'readonly').objectStore(STORE).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error)})}
async function put(value){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(value);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
async function del(id){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}

function remainingMs(timer,now=Date.now()){
  if(timer.status==='paused')return Math.max(0,Number(timer.remainingMs)||0);
  if(timer.status==='running')return Math.max(0,Number(timer.endsAt||0)-now);
  return 0;
}
function formatClock(ms){
  const total=Math.max(0,Math.ceil(ms/1000));
  const h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;
  if(h)return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}
function displayDuration(seconds){return window.GerdTimerParser?.format?.(seconds)||`${Math.round(seconds/60)} Min.`}
function emit(){
  renderGlobal();
  window.dispatchEvent(new CustomEvent(EVENT,{detail:{timers:list()}}));
}
function list(){return [...timers.values()].sort((a,b)=>{
  const rank={finished:0,running:1,paused:2};
  const d=(rank[a.status]??9)-(rank[b.status]??9);
  if(d)return d;
  return Number(a.endsAt||a.finishedAt||a.startedAt||0)-Number(b.endsAt||b.finishedAt||b.startedAt||0);
})}
function active(){return list().filter(t=>t.status==='running'||t.status==='paused')}
function get(id){return timers.get(id)||null}
function forCandidate(recipeId,stepKey,candidateKey){
  return list().find(t=>t.recipeId===recipeId&&t.stepKey===stepKey&&t.candidateKey===candidateKey&&(t.status==='running'||t.status==='paused'))||null;
}
async function persist(timer){timers.set(timer.id,timer);await put(timer);emit();return timer}
function unlockAudio(){
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)return;
    audioContext=audioContext||new Ctx();
    if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
  }catch{}
}
function beep(){
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)return;
    audioContext=audioContext||new Ctx();
    const play=()=>{
      const now=audioContext.currentTime;
      [0,.28,.56].forEach((offset,index)=>{
        const osc=audioContext.createOscillator(),gain=audioContext.createGain();
        osc.type='sine';osc.frequency.value=index===2?880:740;
        gain.gain.setValueAtTime(.0001,now+offset);
        gain.gain.exponentialRampToValueAtTime(.22,now+offset+.02);
        gain.gain.exponentialRampToValueAtTime(.0001,now+offset+.19);
        osc.connect(gain);gain.connect(audioContext.destination);
        osc.start(now+offset);osc.stop(now+offset+.21);
      });
    };
    if(audioContext.state==='suspended')audioContext.resume().then(play).catch(()=>{});else play();
  }catch{}
}
function vibrate(){try{navigator.vibrate?.([250,120,250,120,420])}catch{}}
async function notify(timer){
  if(!('Notification' in window)||Notification.permission!=='granted')return;
  try{
    const registration=await navigator.serviceWorker?.ready;
    if(!registration)return;
    await registration.showNotification(`${timer.label} · Timer abgelaufen`,{
      body:`${timer.recipeTitle} · ${displayDuration(timer.durationSeconds)}`,
      icon:'assets/images/icon-192.png',
      badge:'assets/images/icon-192.png',
      tag:`gerds-timer-${timer.id}`,
      renotify:true,
      data:{timerId:timer.id,recipeId:timer.recipeId,stepIndex:timer.stepIndex}
    });
  }catch(error){console.warn('Timer-Benachrichtigung fehlgeschlagen.',error)}
}
function finishToast(timer){
  document.getElementById(`timer-finished-${CSS.escape(timer.id)}`)?.remove();
  const el=document.createElement('div');
  el.className='timer-finished-toast';
  el.id=`timer-finished-${timer.id}`;
  const extra=Number(timer.rangeExtraSeconds)||0;
  el.innerHTML=`<div><span>Timer abgelaufen</span><strong>${esc(timer.label)}</strong><small>${esc(timer.recipeTitle)}</small></div><div class="timer-finished-actions">${extra?`<button type="button" data-timer-extra>+${esc(displayDuration(extra))}</button>`:''}<button type="button" data-timer-step>Zum Schritt</button><button type="button" class="timer-finished-dismiss" aria-label="Meldung schließen">×</button></div>`;
  document.body.appendChild(el);
  el.querySelector('[data-timer-extra]')?.addEventListener('click',()=>{restart(timer.id,extra);el.remove()});
  el.querySelector('[data-timer-step]')?.addEventListener('click',()=>openStep(timer));
  el.querySelector('.timer-finished-dismiss')?.addEventListener('click',()=>el.remove());
}
async function markFinished(timer,{alert=true}={}){
  if(!timer||timer.status!=='running')return;
  timer={...timer,status:'finished',finishedAt:Date.now(),endsAt:Number(timer.endsAt)||Date.now()};
  timers.set(timer.id,timer);
  try{await put(timer)}catch(error){console.warn('Timerstatus konnte nicht gespeichert werden.',error)}
  if(alert){beep();vibrate();notify(timer);finishToast(timer)}
  emit();
}
function checkExpired({alert=true}={}){
  const now=Date.now();
  for(const timer of [...timers.values()])if(timer.status==='running'&&Number(timer.endsAt)<=now)markFinished(timer,{alert});
}
function ensureTick(){
  if(tickHandle)return;
  tickHandle=setInterval(()=>{
    checkExpired({alert:true});
    renderCountdowns();
  },TICK_MS);
}
async function start(candidate,context={}){
  await whenReady();
  unlockAudio();
  const duration=Math.max(1,Math.round(Number(candidate.durationSeconds||candidate.minSeconds)||0));
  const now=Date.now();
  const timer={
    id:`timer:${uuid()}`,
    recipeId:String(context.recipeId||''),
    recipeTitle:String(context.recipeTitle||'Rezept'),
    stepKey:String(context.stepKey||''),
    stepIndex:Number.isInteger(context.stepIndex)?context.stepIndex:0,
    phase:String(context.phase||''),
    source:String(context.source||''),
    candidateKey:String(candidate.key||''),
    label:String(candidate.label&&candidate.label!=='Timer'?candidate.label:(context.phase||'Timer')),
    durationSeconds:duration,
    minSeconds:Number(candidate.minSeconds)||duration,
    maxSeconds:Number(candidate.maxSeconds)||duration,
    rangeExtraSeconds:Number(candidate.rangeExtraSeconds)||0,
    startedAt:now,
    endsAt:now+duration*1000,
    remainingMs:null,
    status:'running',
    createdAt:now,
    updatedAt:now
  };
  return persist(timer);
}
async function pause(id){
  const timer=get(id);if(!timer||timer.status!=='running')return null;
  return persist({...timer,status:'paused',remainingMs:remainingMs(timer),pausedAt:Date.now(),updatedAt:Date.now()});
}
async function resume(id){
  const timer=get(id);if(!timer||timer.status!=='paused')return null;
  unlockAudio();
  const ms=Math.max(1000,Number(timer.remainingMs)||1000),now=Date.now();
  return persist({...timer,status:'running',endsAt:now+ms,remainingMs:null,pausedAt:null,updatedAt:now});
}
async function addTime(id,seconds){
  const timer=get(id);if(!timer)return null;
  seconds=Math.round(Number(seconds)||0);if(!seconds)return timer;
  const now=Date.now();
  if(timer.status==='paused')return persist({...timer,remainingMs:Math.max(1000,remainingMs(timer)+seconds*1000),updatedAt:now});
  if(timer.status==='finished')return restart(id,seconds);
  return persist({...timer,endsAt:Math.max(now,Number(timer.endsAt)||now)+seconds*1000,updatedAt:now});
}
async function restart(id,seconds){
  const timer=get(id);if(!timer)return null;
  unlockAudio();
  const duration=Math.max(1,Math.round(Number(seconds)||timer.durationSeconds||60)),now=Date.now();
  document.getElementById(`timer-finished-${CSS.escape(id)}`)?.remove();
  return persist({...timer,durationSeconds:duration,startedAt:now,endsAt:now+duration*1000,remainingMs:null,status:'running',finishedAt:null,updatedAt:now,rangeExtraSeconds:0});
}
async function stop(id){
  timers.delete(id);
  try{await del(id)}catch(error){console.warn('Timer konnte nicht gelöscht werden.',error)}
  document.getElementById(`timer-finished-${CSS.escape(id)}`)?.remove();
  emit();
}
function openStep(timer){
  if(!timer)return;
  document.querySelector('.timer-finished-toast')?.remove();
  const open=()=>window.GerdCookMode?.openAt?.(timer.stepIndex,timer.recipeId);
  if((location.hash||'')===`#rezept=${encodeURIComponent(timer.recipeId)}`&&document.querySelector('.detail')){open();return}
  try{sessionStorage.setItem('gerds-open-cook-step',JSON.stringify({recipeId:timer.recipeId,stepIndex:timer.stepIndex}))}catch{}
  location.href=`./#rezept=${encodeURIComponent(timer.recipeId)}`;
  location.reload();
}
async function requestNotifications(){
  if(!('Notification' in window))return 'unsupported';
  if(Notification.permission!=='default')return Notification.permission;
  try{return await Notification.requestPermission()}catch{return Notification.permission}
}
function timerRow(timer){
  const finished=timer.status==='finished',paused=timer.status==='paused';
  const clock=finished?'Fertig':formatClock(remainingMs(timer));
  return `<article class="global-timer-row ${finished?'is-finished':''}" data-global-timer="${esc(timer.id)}"><button type="button" class="global-timer-main" data-global-timer-step><span>${esc(timer.label)}</span><strong data-timer-clock>${esc(clock)}</strong><small>${esc(timer.recipeTitle)}</small></button><div class="global-timer-controls">${finished?(timer.rangeExtraSeconds?`<button type="button" data-global-extra>+${esc(displayDuration(timer.rangeExtraSeconds))}</button>`:''):`<button type="button" data-global-pause>${paused?'Weiter':'Pause'}</button><button type="button" data-global-add>+1 Min.</button>`}<button type="button" data-global-stop>${finished?'Entfernen':'Beenden'}</button></div></article>`;
}
function ensureGlobal(){
  let root=document.getElementById('globalTimers');
  if(root)return root;
  root=document.createElement('div');
  root.id='globalTimers';root.className='global-timers';
  root.innerHTML='<button type="button" class="global-timer-toggle" data-global-timer-toggle aria-expanded="false"><span aria-hidden="true">⏱</span><strong data-global-timer-summary>Timer</strong></button><div class="global-timer-panel" data-global-timer-panel hidden><div class="global-timer-head"><strong>Timer</strong><button type="button" data-global-timer-close aria-label="Timer schließen">×</button></div><div data-global-timer-list></div><button type="button" class="global-timer-notifications" data-global-notifications hidden>Benachrichtigungen erlauben</button></div>';
  document.body.appendChild(root);
  root.querySelector('[data-global-timer-toggle]').addEventListener('click',()=>togglePanel());
  root.querySelector('[data-global-timer-close]').addEventListener('click',()=>togglePanel(false));
  root.querySelector('[data-global-notifications]').addEventListener('click',async()=>{await requestNotifications();renderGlobal()});
  root.addEventListener('click',event=>{
    const row=event.target.closest('[data-global-timer]');if(!row)return;
    const id=row.dataset.globalTimer,timer=get(id);if(!timer)return;
    if(event.target.closest('[data-global-timer-step]'))openStep(timer);
    else if(event.target.closest('[data-global-pause]'))timer.status==='paused'?resume(id):pause(id);
    else if(event.target.closest('[data-global-add]'))addTime(id,60);
    else if(event.target.closest('[data-global-extra]'))restart(id,timer.rangeExtraSeconds||60);
    else if(event.target.closest('[data-global-stop]'))stop(id);
  });
  return root;
}
function togglePanel(force){
  const root=ensureGlobal(),panel=root.querySelector('[data-global-timer-panel]'),button=root.querySelector('[data-global-timer-toggle]');
  const open=typeof force==='boolean'?force:panel.hidden;
  panel.hidden=!open;button.setAttribute('aria-expanded',String(open));
}
function renderCountdowns(){
  document.querySelectorAll('[data-global-timer]').forEach(row=>{
    const timer=get(row.dataset.globalTimer),clock=row.querySelector('[data-timer-clock]');
    if(timer&&clock)clock.textContent=timer.status==='finished'?'Fertig':formatClock(remainingMs(timer));
  });
  const current=active();
  const summary=document.querySelector('[data-global-timer-summary]');
  if(summary&&current.length===1)summary.textContent=`${current[0].label} · ${formatClock(remainingMs(current[0]))}`;
}
function renderGlobal(){
  if(!ready)return;
  const root=ensureGlobal(),all=list(),activeTimers=all.filter(t=>t.status==='running'||t.status==='paused'),finished=all.filter(t=>t.status==='finished');
  root.classList.toggle('has-timers',all.length>0);
  const summary=root.querySelector('[data-global-timer-summary]');
  if(activeTimers.length===1)summary.textContent=`${activeTimers[0].label} · ${formatClock(remainingMs(activeTimers[0]))}`;
  else if(activeTimers.length>1)summary.textContent=`${activeTimers.length} Timer laufen`;
  else if(finished.length)summary.textContent=`${finished.length} Timer fertig`;
  else summary.textContent='Timer';
  root.querySelector('[data-global-timer-list]').innerHTML=all.map(timerRow).join('')||'<p class="global-timer-empty">Keine Timer aktiv.</p>';
  const permission=root.querySelector('[data-global-notifications]');
  permission.hidden=!(all.length&&'Notification' in window&&Notification.permission==='default');
  if(!all.length)togglePanel(false);
}
function whenReady(){return ready?Promise.resolve():new Promise(resolve=>window.addEventListener('gerds:timers-ready',resolve,{once:true}))}

(async()=>{
  try{
    const rows=await getAll();
    timers=new Map(rows.filter(x=>x?.id).map(x=>[x.id,x]));
  }catch(error){console.warn('Timer konnten nicht geladen werden.',error)}
  ready=true;
  checkExpired({alert:true});
  renderGlobal();
  ensureTick();
  window.dispatchEvent(new Event('gerds:timers-ready'));
})();

window.GerdTimers={start,pause,resume,addTime,restart,stop,get,list,active,forCandidate,remainingMs,formatClock,displayDuration,requestNotifications,openStep,whenReady,EVENT};
})();