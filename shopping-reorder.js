(()=>{
'use strict';

const STORAGE_KEY='gerds-shopping-order-v1';
let queued=false;
let sortable=null;
let activeList=null;

function isShoppingPage(){return location.hash==='#einkaufsliste'||document.body.dataset.route==='shopping'}
function reducedMotion(){return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches}
function rowsOf(list){return [...list.querySelectorAll(':scope > .shopping-row')]}
function readOrder(){
  try{const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(value)?value.filter(x=>typeof x==='string'):[]}
  catch{return []}
}
function saveOrder(keys){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(keys))}
  catch(error){console.warn('Reihenfolge der Einkaufsliste konnte nicht gespeichert werden.',error)}
}
function rowKey(row){return row?.dataset.shopKey||row?.querySelector('[data-shop-done]')?.dataset.shopDone||''}
function currentKeys(list){return rowsOf(list).map(rowKey).filter(Boolean)}
function persistDomOrder(list){saveOrder(currentKeys(list))}
function dragIcon(){return '<svg viewBox="0 0 18 22" aria-hidden="true"><circle cx="5" cy="5" r="1.35"/><circle cx="13" cy="5" r="1.35"/><circle cx="5" cy="11" r="1.35"/><circle cx="13" cy="11" r="1.35"/><circle cx="5" cy="17" r="1.35"/><circle cx="13" cy="17" r="1.35"/></svg>'}

function keyboardMove(event){
  if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
  const row=event.currentTarget.closest('.shopping-row'),list=row?.parentElement;
  if(!row||!list)return;
  event.preventDefault();
  if(event.key==='ArrowUp'){
    const previous=row.previousElementSibling;if(previous)list.insertBefore(row,previous);
  }else if(event.key==='ArrowDown'){
    const next=row.nextElementSibling;if(next)list.insertBefore(row,next.nextElementSibling);
  }else if(event.key==='Home')list.prepend(row);
  else if(event.key==='End')list.append(row);
  persistDomOrder(list);
  event.currentTarget.focus();
}

function ensureHandle(row){
  const key=rowKey(row);if(!key)return;
  row.dataset.shopKey=key;
  let handle=row.querySelector(':scope > .shopping-drag-handle');
  if(!handle){
    handle=document.createElement('button');
    handle.type='button';
    handle.className='shopping-drag-handle';
    handle.dataset.shopDrag=key;
    handle.innerHTML=dragIcon();
    row.prepend(handle);
  }
  const name=row.querySelector('.shopping-name strong')?.textContent?.trim()||'Einkaufsartikel';
  handle.setAttribute('aria-label',`${name} verschieben`);
  handle.title=window.Sortable?'Ziehen zum Verschieben · Pfeiltasten funktionieren ebenfalls':'Mit Pfeiltasten verschieben';
  if(!handle.dataset.keyboardBound){
    handle.dataset.keyboardBound='1';
    handle.addEventListener('keydown',keyboardMove);
  }
}

function applyStoredOrder(list){
  const rows=rowsOf(list);
  if(!rows.length){saveOrder([]);return}
  rows.forEach(ensureHandle);
  const byKey=new Map(rows.map(row=>[rowKey(row),row]));
  const current=rows.map(rowKey).filter(Boolean);
  const saved=readOrder();
  const order=[...saved.filter(key=>byKey.has(key)),...current.filter(key=>!saved.includes(key))];
  order.forEach((key,index)=>{
    const row=byKey.get(key),at=list.children[index];
    if(row&&at!==row)list.insertBefore(row,at||null);
  });
  if(saved.length!==order.length||saved.some((key,index)=>key!==order[index]))saveOrder(order);
}

function destroySortable(){
  if(sortable){try{sortable.destroy()}catch{}sortable=null}
  activeList=null;
  document.body.classList.remove('shopping-drag-active');
}
function initSortable(list){
  if(activeList===list&&sortable)return;
  destroySortable();
  activeList=list;
  if(!window.Sortable){
    console.warn('Drag & Drop ist nicht verfügbar; die Einkaufsliste bleibt per Tastatur sortierbar.');
    return;
  }
  sortable=window.Sortable.create(list,{
    draggable:'.shopping-row',
    handle:'.shopping-drag-handle',
    animation:reducedMotion()?0:170,
    easing:'cubic-bezier(.2,.72,.25,1)',
    ghostClass:'shopping-sortable-ghost',
    chosenClass:'shopping-sortable-chosen',
    dragClass:'shopping-sortable-drag',
    forceFallback:false,
    fallbackOnBody:true,
    fallbackTolerance:4,
    swapThreshold:.62,
    scroll:true,
    scrollSensitivity:64,
    scrollSpeed:12,
    onStart(){document.body.classList.add('shopping-drag-active')},
    onEnd(){
      persistDomOrder(list);
      document.body.classList.remove('shopping-drag-active');
      queueSync();
    }
  });
}

function sync(){
  queued=false;
  if(document.body.classList.contains('shopping-drag-active'))return;
  if(!isShoppingPage()){destroySortable();return}
  const list=document.querySelector('.shopping-list');
  if(!list){destroySortable();return}
  applyStoredOrder(list);
  initSortable(list);
}
function queueSync(){
  if(document.body.classList.contains('shopping-drag-active')||queued)return;
  queued=true;
  requestAnimationFrame(sync);
}

new MutationObserver(queueSync).observe(document.body,{childList:true,subtree:true});
window.addEventListener('popstate',queueSync);
queueSync();
})();
