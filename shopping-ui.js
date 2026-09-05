(()=>{
'use strict';
const DATA=window.GERDS_REZEPTE;
if(!DATA)return;

const DB_NAME='gerds-rezepte';
const STORE='shopping';
const SORT_CLASS='shopping-sort-mode';
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
function esc(s){return String(s??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}
function isShoppingPage(){return location.hash==='#einkaufsliste'||document.body.dataset.route==='shopping'}
function isDragging(){return document.body.classList.contains('shopping-drag-active')}
function isManual(item){return !!(item&&(item.manual===true||item.kind==='manual'||String(item.key||'').startsWith('manual:')))}
function openRecipe(id){
  history.pushState({route:'detail',id,fromArchive:false},'',`#rezept=${encodeURIComponent(id)}`);
  location.reload();
}
function closeMenus(except=null){
  document.querySelectorAll('.shopping-actions-menu[open],.shopping-row-menu[open]').forEach(menu=>{
    if(menu!==except)menu.removeAttribute('open');
  });
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
    if(child.classList.contains('shopping-category-header')){
      const label=child.querySelector('strong')?.textContent?.trim();
      if(label){if(lines.length&&lines[lines.length-1]!=='')lines.push('');lines.push(label)}
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
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)){window.alert('Bitte eine gültige E-Mail-Adresse eingeben.');return}
  const link=document.createElement('a');
  link.href=`mailto:${address}?subject=${encodeURIComponent('Gerds Einkaufsliste')}&body=${encodeURIComponent(shoppingMailBody())}`;
  link.hidden=true;document.body.appendChild(link);link.click();link.remove();
}
async function shareShopping(){
  const data={title:'Gerds Einkaufsliste',text:shoppingMailBody()};
  if(typeof navigator.share!=='function'){sendShoppingByMail();return}
  try{await navigator.share(data)}
  catch(error){if(error?.name!=='AbortError'){console.warn('Teilen der Einkaufsliste fehlgeschlagen; E-Mail-Fallback wird verwendet.',error);sendShoppingByMail()}}
}
async function copyShopping(){
  const value=shoppingMailBody();
  try{
    if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(value);
    else{
      const area=document.createElement('textarea');area.value=value;area.setAttribute('readonly','');area.style.cssText='position:fixed;opacity:0';
      document.body.appendChild(area);area.select();if(!document.execCommand('copy'))throw new Error('copy command failed');area.remove();
    }
    const button=document.getElementById('copyShopping');
    if(button){const previous=button.textContent;button.textContent='Kopiert';setTimeout(()=>{if(button.isConnected)button.textContent=previous},1400)}
  }catch(error){console.warn('Einkaufsliste konnte nicht kopiert werden.',error);window.alert('Die Einkaufsliste konnte nicht in die Zwischenablage kopiert werden.')}
}
function sortToolbar(){
  let toolbar=document.querySelector('.shopping-sort-toolbar');
  if(toolbar)return toolbar;
  const list=document.querySelector('.shopping-list');if(!list)return null;
  toolbar=document.createElement('div');
  toolbar.className='shopping-sort-toolbar';
  toolbar.innerHTML='<div><strong>Anordnung bearbeiten</strong><span>Kategorien oder einzelne Artikel an den Griffen verschieben.</span></div><button type="button" data-sort-done>Fertig</button>';
  list.before(toolbar);
  toolbar.querySelector('[data-sort-done]').addEventListener('click',()=>setSortMode(false));
  return toolbar;
}
function setSortMode(active){
  if(!isShoppingPage())active=false;
  document.body.classList.toggle(SORT_CLASS,!!active);
  if(active){sortToolbar();closeMenus()}
  else document.querySelector('.shopping-sort-toolbar')?.remove();
  const toggle=document.getElementById('toggleShoppingSort');
  if(toggle)toggle.textContent=active?'Anordnung beenden':'Anordnung bearbeiten';
}
function ensureActionButtons(){
  const actions=document.querySelector('.list-page .list-actions');
  if(!actions)return;
  actions.querySelector('#mailShopping')?.remove();
  let menu=actions.querySelector('#shoppingActionsMenu');
  if(!menu){
    menu=document.createElement('details');
    menu.id='shoppingActionsMenu';
    menu.className='shopping-actions-menu';
    menu.innerHTML='<summary aria-label="Weitere Listenaktionen" title="Weitere Aktionen">•••</summary><div class="shopping-actions-panel"><button type="button" id="toggleShoppingSort">Anordnung bearbeiten</button><button type="button" id="shareShopping">Teilen</button><button type="button" id="copyShopping">Kopieren</button><button type="button" id="printShopping">Drucken</button><hr><button type="button" class="is-danger" id="clearShoppingMenu">Liste leeren</button></div>';
    actions.appendChild(menu);
    menu.addEventListener('toggle',()=>{if(menu.open)closeMenus(menu)});
    menu.querySelector('#toggleShoppingSort').addEventListener('click',()=>setSortMode(!document.body.classList.contains(SORT_CLASS)));
    menu.querySelector('#shareShopping').addEventListener('click',shareShopping);
    menu.querySelector('#copyShopping').addEventListener('click',copyShopping);
    menu.querySelector('#printShopping').addEventListener('click',()=>window.print());
    menu.querySelector('#clearShoppingMenu').addEventListener('click',()=>{
      if(window.confirm('Einkaufsliste wirklich leeren?'))document.getElementById('clearShopping')?.click();
    });
  }
}
function recipeLinksHtml(recipes){
  if(!recipes.length)return '';
  const count=recipes.length;
  return `<div class="shopping-row-sources"><span>Aus ${count} Rezept${count===1?'':'en'}</span>${recipes.map(recipe=>`<a href="#rezept=${encodeURIComponent(recipe.id)}" data-shopping-recipe="${esc(recipe.id)}">${esc(recipe.title)}</a>`).join('')}</div>`;
}
function rowMenuHtml(item,recipes){
  const manual=isManual(item);
  return `${manual?'<button type="button" data-row-action="edit">Bearbeiten</button>':''}${recipeLinksHtml(recipes)}<button type="button" class="is-danger" data-row-action="remove">Entfernen</button>`;
}
function decorateRowMenu(row,item,recipes){
  const panel=row.querySelector('[data-shop-row-menu-panel]');if(!panel)return;
  const signature=`${isManual(item)?'m':'r'}|${recipes.map(recipe=>recipe.id).join('|')}`;
  if(panel.dataset.signature!==signature){panel.dataset.signature=signature;panel.innerHTML=rowMenuHtml(item,recipes)}
  const menu=row.querySelector('.shopping-row-menu');
  if(menu&&!menu.dataset.bound){
    menu.dataset.bound='1';
    menu.addEventListener('toggle',()=>{if(menu.open)closeMenus(menu)});
  }
  panel.querySelector('[data-row-action="edit"]')?.addEventListener('click',()=>{menu?.removeAttribute('open');row.querySelector('[data-shop-edit]')?.click()},{once:true});
  panel.querySelector('[data-row-action="remove"]')?.addEventListener('click',()=>{menu?.removeAttribute('open');row.querySelector('[data-shop-remove]')?.click()},{once:true});
  panel.querySelectorAll('[data-shopping-recipe]').forEach(link=>{
    if(link.dataset.bound)return;
    link.dataset.bound='1';
    link.addEventListener('click',event=>{event.preventDefault();openRecipe(link.dataset.shoppingRecipe)});
  });
}
async function refresh(){
  refreshQueued=false;
  if(!isShoppingPage()){
    setSortMode(false);
    return;
  }
  if(isDragging())return;
  const list=document.querySelector('.shopping-list');if(!list)return;
  ensureActionButtons();
  const token=++refreshToken;
  let items;
  try{items=await getShopping()}catch(error){console.warn('Rezeptquellen der Einkaufsliste konnten nicht geladen werden.',error);return}
  if(token!==refreshToken||isDragging()||!isShoppingPage())return;
  const byKey=new Map(items.map(item=>[item.key,item]));
  list.querySelectorAll('.shopping-row').forEach(row=>{
    const key=row.querySelector('[data-shop-done]')?.dataset.shopDone;
    if(!key)return;
    const item=byKey.get(key);
    const recipes=sourceRecipeIds(item).map(recipeById).filter(Boolean).sort((a,b)=>a.title.localeCompare(b.title,'de'));
    decorateRowMenu(row,item,recipes);
  });
}
function queueRefresh(){
  if(isDragging()||refreshQueued)return;
  refreshQueued=true;requestAnimationFrame(refresh);
}
document.addEventListener('click',event=>{
  if(!event.target.closest('.shopping-actions-menu,.shopping-row-menu'))closeMenus();
});
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  if(document.body.classList.contains(SORT_CLASS)){setSortMode(false);return}
  closeMenus();
});
new MutationObserver(queueRefresh).observe(document.body,{childList:true,subtree:true});
window.addEventListener('popstate',queueRefresh);
window.addEventListener('hashchange',queueRefresh);
queueRefresh();
})();