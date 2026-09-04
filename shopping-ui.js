(()=>{
'use strict';
const DATA=window.GERDS_REZEPTE;
if(!DATA)return;

const DB_NAME='gerds-rezepte';
const STORE='shopping';
let dbPromise=null;
let refreshQueued=false;
let refreshToken=0;

function openDb(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return dbPromise;
}
async function getShopping(){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const req=db.transaction(STORE,'readonly').objectStore(STORE).getAll();
    req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=()=>reject(req.error);
  });
}
function recipeById(id){return DATA.recipes.find(r=>r.id===id)}
function sourceRecipeIds(item){
  const ids=[];
  for(const contribution of item?.contributions||[]){
    const sourceIds=Array.isArray(contribution.sourceIds)&&contribution.sourceIds.length?contribution.sourceIds:[contribution.recipeId];
    for(const id of sourceIds)if(id&&!ids.includes(id))ids.push(id);
  }
  return ids;
}
function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function isShoppingPage(){return location.hash==='#einkaufsliste'||document.body.dataset.route==='shopping'}
function isDragging(){return document.body.classList.contains('shopping-drag-active')}
function openRecipe(id){
  history.pushState({route:'detail',id,fromArchive:false},'',`#rezept=${encodeURIComponent(id)}`);
  location.reload();
}
function shoppingMailBody(){
  const list=document.querySelector('.shopping-list');
  if(!list)return ['Einkaufsliste','','Gerds Rezepte'].join('\n');
  const lines=[];
  const appendRow=row=>{
    const done=!!row.querySelector('[data-shop-done]')?.checked;
    const article=row.querySelector('.shopping-inline-article')?.value?.trim()||row.querySelector('.shopping-name strong')?.textContent?.trim()||'';
    const amount=row.querySelector('.shopping-inline-amount')?.value?.trim()||row.querySelector('.shopping-amount')?.textContent?.trim()||'';
    const loose=row.querySelector('.shopping-category-badge')?.textContent?.trim();
    const suffix=loose?` [${loose}]`:'';
    const line=`${done?'☑':'☐'} ${amount?amount+' ':''}${article}${suffix}`.trim();
    if(line)lines.push(line);
  };
  for(const child of [...list.children]){
    if(child.classList.contains('shopping-category-block')){
      const label=child.querySelector(':scope > .shopping-category-header strong')?.textContent?.trim();
      if(label){if(lines.length&&lines[lines.length-1]!=='')lines.push('');lines.push(label)}
      child.querySelectorAll(':scope > .shopping-category-items > .shopping-row').forEach(appendRow);
      continue;
    }
    if(child.classList.contains('shopping-row'))appendRow(child);
  }
  return ['Einkaufsliste','',...lines,'','Gerds Rezepte'].join('\n');
}
function sendShoppingByMail(){
  const value=window.prompt('An welche E-Mail-Adresse soll die Einkaufsliste gesendet werden?');
  if(value===null)return;
  const address=value.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)){
    window.alert('Bitte eine gültige E-Mail-Adresse eingeben.');
    return;
  }
  const subject=encodeURIComponent('Gerds Einkaufsliste');
  const body=encodeURIComponent(shoppingMailBody());
  const link=document.createElement('a');
  link.href=`mailto:${address}?subject=${subject}&body=${body}`;
  link.hidden=true;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
async function shareShopping(){
  const data={title:'Gerds Einkaufsliste',text:shoppingMailBody()};
  if(typeof navigator.share!=='function'){sendShoppingByMail();return}
  try{
    await navigator.share(data);
  }catch(error){
    if(error?.name==='AbortError')return;
    console.warn('Teilen der Einkaufsliste fehlgeschlagen; E-Mail-Fallback wird verwendet.',error);
    sendShoppingByMail();
  }
}
async function copyShopping(){
  const text=shoppingMailBody();
  try{
    if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
    else{
      const area=document.createElement('textarea');
      area.value=text;
      area.setAttribute('readonly','');
      area.style.position='fixed';
      area.style.opacity='0';
      document.body.appendChild(area);
      area.select();
      if(!document.execCommand('copy'))throw new Error('copy command failed');
      area.remove();
    }
    const button=document.getElementById('copyShopping');
    if(button){
      const previous=button.textContent;
      button.textContent='Kopiert';
      window.setTimeout(()=>{if(button.isConnected)button.textContent=previous},1400);
    }
  }catch(error){
    console.warn('Einkaufsliste konnte nicht kopiert werden.',error);
    window.alert('Die Einkaufsliste konnte nicht in die Zwischenablage kopiert werden.');
  }
}
function ensureActionButtons(){
  const actions=document.querySelector('.list-page .list-actions');
  if(!actions)return;
  actions.querySelector('#mailShopping')?.remove();
  if(!actions.querySelector('#printShopping')){
    const button=document.createElement('button');
    button.type='button';
    button.id='printShopping';
    button.className='shopping-print-button';
    button.textContent='Drucken';
    button.addEventListener('click',()=>window.print());
    actions.prepend(button);
  }
  if(!actions.querySelector('#copyShopping')){
    const button=document.createElement('button');
    button.type='button';
    button.id='copyShopping';
    button.className='shopping-copy-button';
    button.textContent='Kopieren';
    button.addEventListener('click',copyShopping);
    actions.prepend(button);
  }
  if(!actions.querySelector('#shareShopping')){
    const button=document.createElement('button');
    button.type='button';
    button.id='shareShopping';
    button.className='shopping-share-button';
    button.textContent='Teilen';
    button.title=typeof navigator.share==='function'?'Einkaufsliste teilen':'Einkaufsliste per E-Mail senden';
    button.addEventListener('click',shareShopping);
    actions.prepend(button);
  }
}
function sourceDetailsHtml(recipes,signature){
  const count=recipes.length;
  if(!count)return '';
  return `<details class="shopping-sources" data-source-signature="${esc(signature)}"><summary>${count} Rezept${count===1?'':'e'} anzeigen</summary><div class="shopping-source-links">${recipes.map(r=>`<a href="#rezept=${encodeURIComponent(r.id)}" data-shopping-recipe="${esc(r.id)}">${esc(r.title)}</a>`).join('')}</div></details>`;
}
function bindRecipeLinks(root=document){
  root.querySelectorAll('[data-shopping-recipe]').forEach(link=>{
    if(link.dataset.bound)return;
    link.dataset.bound='1';
    link.addEventListener('click',event=>{event.preventDefault();openRecipe(link.dataset.shoppingRecipe)});
  });
}
async function refresh(){
  refreshQueued=false;
  if(isDragging()||!isShoppingPage())return;
  const list=document.querySelector('.shopping-list');
  if(!list)return;
  const token=++refreshToken;
  let items;
  try{items=await getShopping()}catch(error){console.warn('Rezeptquellen der Einkaufsliste konnten nicht geladen werden.',error);return}
  if(token!==refreshToken||isDragging()||!isShoppingPage())return;
  const byKey=new Map(items.map(item=>[item.key,item]));
  ensureActionButtons();
  list.querySelectorAll('.shopping-row').forEach(row=>{
    const key=row.querySelector('[data-shop-done]')?.dataset.shopDone;
    const name=row.querySelector('.shopping-name');
    if(!key||!name)return;
    const item=byKey.get(key);
    const recipes=sourceRecipeIds(item).map(recipeById).filter(Boolean).sort((a,b)=>a.title.localeCompare(b.title,'de'));
    const signature=recipes.map(r=>r.id).join('|');
    const existing=name.querySelector('.shopping-sources');
    if(!recipes.length){existing?.remove();return}
    if(existing?.dataset.sourceSignature===signature){bindRecipeLinks(existing);return}
    existing?.remove();
    name.insertAdjacentHTML('beforeend',sourceDetailsHtml(recipes,signature));
    bindRecipeLinks(name);
  });
}
function queueRefresh(){
  if(isDragging()||refreshQueued)return;
  refreshQueued=true;
  requestAnimationFrame(refresh);
}
const observer=new MutationObserver(queueRefresh);
observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('popstate',queueRefresh);
queueRefresh();
})();