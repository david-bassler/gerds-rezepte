(()=>{
'use strict';

const STORAGE_KEY='gerds-shopping-order-v1';
let queued=false;
let drag=null;

function isShoppingPage(){return location.hash==='#einkaufsliste'||document.body.dataset.route==='shopping'}
function readOrder(){
  try{const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(value)?value.filter(x=>typeof x==='string'):[]}
  catch{return []}
}
function saveOrder(keys){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(keys))}
  catch(error){console.warn('Reihenfolge der Einkaufsliste konnte nicht gespeichert werden.',error)}
}
function rowKey(row){return row?.dataset.shopKey||row?.querySelector('[data-shop-done]')?.dataset.shopDone||''}
function currentKeys(list){return [...list.querySelectorAll(':scope > .shopping-row')].map(rowKey).filter(Boolean)}
function persistDomOrder(list){saveOrder(currentKeys(list))}
function dragIcon(){return '<svg viewBox="0 0 18 22" aria-hidden="true"><circle cx="5" cy="5" r="1.35"/><circle cx="13" cy="5" r="1.35"/><circle cx="5" cy="11" r="1.35"/><circle cx="13" cy="11" r="1.35"/><circle cx="5" cy="17" r="1.35"/><circle cx="13" cy="17" r="1.35"/></svg>'}
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
  handle.title='Ziehen zum Verschieben · Pfeiltasten funktionieren ebenfalls';
  if(handle.dataset.dragBound)return;
  handle.dataset.dragBound='1';
  handle.addEventListener('pointerdown',startDrag);
  handle.addEventListener('pointermove',moveDrag);
  handle.addEventListener('pointerup',finishDrag);
  handle.addEventListener('pointercancel',finishDrag);
  handle.addEventListener('keydown',keyboardMove);
}
function applyStoredOrder(list){
  const rows=[...list.querySelectorAll(':scope > .shopping-row')];
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
function startDrag(event){
  if(event.pointerType==='mouse'&&event.button!==0)return;
  const handle=event.currentTarget,row=handle.closest('.shopping-row'),list=row?.parentElement;
  if(!row||!list?.classList.contains('shopping-list'))return;
  drag={pointerId:event.pointerId,handle,row,list};
  row.classList.add('is-dragging');
  document.body.classList.add('shopping-drag-active');
  try{handle.setPointerCapture(event.pointerId)}catch{}
  event.preventDefault();
}
function moveDrag(event){
  if(!drag||event.pointerId!==drag.pointerId)return;
  event.preventDefault();
  const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.shopping-row');
  if(!target||target===drag.row||target.parentElement!==drag.list)return;
  const rect=target.getBoundingClientRect();
  const after=event.clientY>rect.top+rect.height/2;
  const reference=after?target.nextElementSibling:target;
  if(reference!==drag.row)drag.list.insertBefore(drag.row,reference);
}
function finishDrag(event){
  if(!drag||event.pointerId!==drag.pointerId)return;
  const {handle,row,list}=drag;
  persistDomOrder(list);
  drag=null;
  row.classList.remove('is-dragging');
  document.body.classList.remove('shopping-drag-active');
  try{handle.releasePointerCapture(event.pointerId)}catch{}
}
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
function sync(){
  queued=false;
  if(drag||!isShoppingPage())return;
  const list=document.querySelector('.shopping-list');
  if(list)applyStoredOrder(list);
}
function queueSync(){
  if(drag||queued)return;
  queued=true;
  requestAnimationFrame(sync);
}

new MutationObserver(queueSync).observe(document.body,{childList:true,subtree:true});
window.addEventListener('popstate',queueSync);
queueSync();
})();
