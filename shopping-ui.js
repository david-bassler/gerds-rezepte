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
function openRecipe(id){
  history.pushState({route:'detail',id,fromArchive:false},'',`#rezept=${encodeURIComponent(id)}`);
  location.reload();
}
function ensurePrintButton(){
  const actions=document.querySelector('.list-page .list-actions');
  if(!actions||actions.querySelector('#printShopping'))return;
  const button=document.createElement('button');
  button.type='button';
  button.id='printShopping';
  button.className='shopping-print-button';
  button.textContent='Drucken';
  button.addEventListener('click',()=>window.print());
  actions.prepend(button);
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
  if(!isShoppingPage())return;
  const list=document.querySelector('.shopping-list');
  if(!list)return;
  const token=++refreshToken;
  let items;
  try{items=await getShopping()}catch(error){console.warn('Rezeptquellen der Einkaufsliste konnten nicht geladen werden.',error);return}
  if(token!==refreshToken||!isShoppingPage())return;
  const byKey=new Map(items.map(item=>[item.key,item]));
  ensurePrintButton();
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
  if(refreshQueued)return;
  refreshQueued=true;
  requestAnimationFrame(refresh);
}
const observer=new MutationObserver(queueRefresh);
observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('popstate',queueRefresh);
queueRefresh();
})();