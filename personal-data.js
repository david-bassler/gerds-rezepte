(()=>{
'use strict';

const DB_NAME='gerds-rezepte';
const FORMAT='gerds-rezepte-backup';
const BACKUP_VERSION=1;
const STORES=['favorites','shopping','recipePlans','recipeNotes'];
const STORAGE_KEYS=['gerds-shopping-order-v1'];
let dbPromise=null;

function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function openDb(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return dbPromise;
}
async function readStore(name){
  const db=await openDb();
  if(!db.objectStoreNames.contains(name))return [];
  return new Promise((resolve,reject)=>{
    const req=db.transaction(name,'readonly').objectStore(name).getAll();
    req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=()=>reject(req.error);
  });
}
function readLocalValue(key){
  try{
    const raw=localStorage.getItem(key);
    if(raw===null)return null;
    try{return JSON.parse(raw)}catch{return raw}
  }catch{return null}
}
async function snapshot(){
  const entries=await Promise.all(STORES.map(async name=>[name,await readStore(name)]));
  const local={};
  for(const key of STORAGE_KEYS)local[key]=readLocalValue(key);
  return {
    format:FORMAT,
    version:BACKUP_VERSION,
    exportedAt:new Date().toISOString(),
    app:'Gerds Rezepte',
    stores:Object.fromEntries(entries),
    localStorage:local
  };
}
function counts(data){
  const stores=data?.stores||{};
  return {
    favorites:Array.isArray(stores.favorites)?stores.favorites.length:0,
    shopping:Array.isArray(stores.shopping)?stores.shopping.length:0,
    notes:Array.isArray(stores.recipeNotes)?stores.recipeNotes.length:0,
    plans:Array.isArray(stores.recipePlans)?stores.recipePlans.length:0
  };
}
function summaryText(data){
  const c=counts(data);
  return `${c.favorites} Favorit${c.favorites===1?'':'en'} · ${c.shopping} Einkaufsartikel · ${c.notes} Notiz${c.notes===1?'':'en'}`;
}
function validateBackup(data){
  if(!data||typeof data!=='object'||data.format!==FORMAT)throw new Error('Die Datei ist keine Sicherung von Gerds Rezepte.');
  if(!Number.isInteger(data.version)||data.version<1)throw new Error('Die Sicherungsdatei hat keine gültige Version.');
  if(data.version>BACKUP_VERSION)throw new Error('Diese Sicherung stammt aus einer neueren App-Version und kann hier noch nicht importiert werden.');
  if(!data.stores||typeof data.stores!=='object')throw new Error('Die Sicherungsdatei enthält keine gespeicherten Daten.');
  let known=0;
  for(const name of STORES){
    const value=data.stores[name];
    if(value===undefined)continue;
    if(!Array.isArray(value))throw new Error(`Der Datenbereich „${name}“ ist beschädigt.`);
    if(value.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw new Error(`Der Datenbereich „${name}“ enthält ungültige Einträge.`);
    known++;
  }
  if(!known)throw new Error('Die Sicherungsdatei enthält keine bekannten persönlichen Daten.');
  return data;
}
async function restore(data){
  const db=await openDb();
  const available=STORES.filter(name=>db.objectStoreNames.contains(name));
  if(!available.length)throw new Error('Die lokalen Datenspeicher sind nicht verfügbar.');
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(available,'readwrite');
    for(const name of available){
      const os=tx.objectStore(name);
      os.clear();
      const rows=Array.isArray(data.stores[name])?data.stores[name]:[];
      rows.forEach(row=>os.put(row));
    }
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error('Import fehlgeschlagen.'));
    tx.onabort=()=>reject(tx.error||new Error('Import wurde abgebrochen.'));
  });
  for(const key of STORAGE_KEYS){
    try{
      const value=data.localStorage?.[key];
      if(value===undefined||value===null)localStorage.removeItem(key);
      else localStorage.setItem(key,typeof value==='string'?value:JSON.stringify(value));
    }catch(error){console.warn('Lokale Zusatzdaten konnten nicht importiert werden.',error)}
  }
}
function download(name,text){
  const blob=new Blob([text],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download=name;
  link.hidden=true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function dateLabel(value){
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'unbekannt':new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(date);
}
function ensureUi(){
  let trigger=document.getElementById('personalDataOpen');
  if(!trigger){
    const footer=document.querySelector('.footer-inner');
    if(footer){
      trigger=document.createElement('button');
      trigger.type='button';
      trigger.id='personalDataOpen';
      trigger.className='personal-data-open';
      trigger.textContent='Daten sichern';
      footer.appendChild(trigger);
    }
  }
  if(!document.getElementById('personalDataDialog')){
    document.body.insertAdjacentHTML('beforeend',`
      <dialog class="personal-data-dialog" id="personalDataDialog" aria-labelledby="personalDataTitle">
        <div class="personal-data-head">
          <div><span class="category">Nur auf diesem Gerät</span><h2 id="personalDataTitle">Meine Daten</h2></div>
          <button type="button" class="personal-data-close" data-personal-data-close aria-label="Schließen">×</button>
        </div>
        <p>Favoriten, Einkaufsliste, Portionspläne und persönliche Notizen werden lokal im Browser gespeichert. Mit einer Sicherung kannst du sie aufbewahren oder auf ein anderes Gerät übertragen.</p>
        <div class="personal-data-summary" data-personal-data-summary>Gespeicherte Daten werden geladen …</div>
        <div class="personal-data-actions">
          <button type="button" class="personal-data-primary" id="personalDataExport">Sicherung exportieren</button>
          <button type="button" id="personalDataImport">Sicherung importieren</button>
          <input type="file" id="personalDataFile" accept=".json,application/json" hidden>
        </div>
        <p class="personal-data-hint"><strong>Import:</strong> Der Inhalt der Sicherung ersetzt die aktuell auf diesem Gerät gespeicherten persönlichen Daten.</p>
        <div class="personal-data-status" data-personal-data-status role="status" aria-live="polite"></div>
      </dialog>`);
  }
  bind();
}
function openDialog(){
  const dialog=document.getElementById('personalDataDialog');
  const summary=document.querySelector('[data-personal-data-summary]');
  if(!dialog)return;
  if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
  if(summary){
    summary.textContent='Gespeicherte Daten werden geladen …';
    snapshot().then(data=>summary.textContent=summaryText(data)).catch(()=>summary.textContent='Gespeicherte Daten konnten nicht gelesen werden.');
  }
}
function closeDialog(){
  const dialog=document.getElementById('personalDataDialog');
  if(!dialog)return;
  if(dialog.close)dialog.close();else dialog.removeAttribute('open');
}
function setStatus(text,error=false){
  const status=document.querySelector('[data-personal-data-status]');
  if(!status)return;
  status.textContent=text;
  status.classList.toggle('is-error',error);
}
function bind(){
  const trigger=document.getElementById('personalDataOpen');
  const dialog=document.getElementById('personalDataDialog');
  if(trigger&&!trigger.dataset.bound){
    trigger.dataset.bound='1';
    trigger.addEventListener('click',openDialog);
  }
  if(!dialog||dialog.dataset.bound)return;
  dialog.dataset.bound='1';
  dialog.querySelector('[data-personal-data-close]')?.addEventListener('click',closeDialog);
  dialog.addEventListener('click',event=>{if(event.target===dialog)closeDialog()});
  document.getElementById('personalDataExport')?.addEventListener('click',async()=>{
    setStatus('Sicherung wird erstellt …');
    try{
      const data=await snapshot();
      const day=new Date().toISOString().slice(0,10);
      download(`gerds-rezepte-backup-${day}.json`,JSON.stringify(data,null,2));
      setStatus(`Sicherung erstellt: ${summaryText(data)}.`);
    }catch(error){
      console.warn('Persönliche Daten konnten nicht exportiert werden.',error);
      setStatus('Die Sicherung konnte nicht erstellt werden.',true);
    }
  });
  const input=document.getElementById('personalDataFile');
  document.getElementById('personalDataImport')?.addEventListener('click',()=>{if(input){input.value='';input.click()}});
  input?.addEventListener('change',async()=>{
    const file=input.files?.[0];if(!file)return;
    setStatus('Sicherung wird geprüft …');
    try{
      const data=validateBackup(JSON.parse(await file.text()));
      const info=summaryText(data);
      const ok=window.confirm(`Sicherung vom ${dateLabel(data.exportedAt)} importieren?\n\n${info}\n\nDie aktuell gespeicherten persönlichen Daten auf diesem Gerät werden ersetzt.`);
      if(!ok){setStatus('Import abgebrochen.');return}
      setStatus('Daten werden wiederhergestellt …');
      await restore(data);
      window.alert('Die persönlichen Daten wurden erfolgreich wiederhergestellt. Die App wird jetzt neu geladen.');
      location.reload();
    }catch(error){
      console.warn('Persönliche Daten konnten nicht importiert werden.',error);
      setStatus(error?.message||'Die Sicherung konnte nicht importiert werden.',true);
    }
  });
}
ensureUi();
})();
