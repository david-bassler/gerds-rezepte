(()=>{
'use strict';

const STORAGE_KEY='gerds-shopping-order-v1';
const REFLOW_DURATION=180;
let queued=false;
let drag=null;
const rowAnimations=new WeakMap();

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

function animateReflow(list,mutate){
  const rows=rowsOf(list).filter(row=>row!==drag?.row);
  const before=new Map(rows.map(row=>[row,row.getBoundingClientRect().top]));
  rows.forEach(row=>rowAnimations.get(row)?.cancel());
  mutate();
  if(reducedMotion())return;
  rows.forEach(row=>{
    const previousTop=before.get(row),nextTop=row.getBoundingClientRect().top;
    const delta=previousTop-nextTop;
    if(Math.abs(delta)<1)return;
    const animation=row.animate(
      [{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],
      {duration:REFLOW_DURATION,easing:'cubic-bezier(.2,.72,.25,1)'}
    );
    rowAnimations.set(row,animation);
    const clear=()=>{if(rowAnimations.get(row)===animation)rowAnimations.delete(row)};
    animation.onfinish=clear;
    animation.oncancel=clear;
  });
}

function createGhost(row,event){
  const rect=row.getBoundingClientRect();
  const ghost=row.cloneNode(true);
  ghost.classList.add('shopping-drag-ghost');
  ghost.removeAttribute('data-shop-key');
  ghost.setAttribute('aria-hidden','true');
  ghost.querySelectorAll('button,input,a,summary').forEach(el=>el.tabIndex=-1);
  ghost.style.left=`${rect.left}px`;
  ghost.style.top=`${rect.top}px`;
  ghost.style.width=`${rect.width}px`;
  ghost.style.height=`${rect.height}px`;
  ghost.style.setProperty('--drag-x','0px');
  ghost.style.setProperty('--drag-y','0px');
  document.body.append(ghost);
  return {ghost,originX:event.clientX,originY:event.clientY};
}
function positionGhost(event){
  if(!drag)return;
  drag.ghost.style.setProperty('--drag-x',`${event.clientX-drag.originX}px`);
  drag.ghost.style.setProperty('--drag-y',`${event.clientY-drag.originY}px`);
}
function movePlaceholder(target,after){
  if(!drag||target===drag.row||target.parentElement!==drag.list)return;
  const reference=after?target.nextElementSibling:target;
  if(reference===drag.row||drag.row.nextElementSibling===reference)return;
  if(reference===null&&!drag.row.nextElementSibling)return;
  animateReflow(drag.list,()=>drag.list.insertBefore(drag.row,reference));
}

function startDrag(event){
  if(event.pointerType==='mouse'&&event.button!==0)return;
  const handle=event.currentTarget,row=handle.closest('.shopping-row'),list=row?.parentElement;
  if(!row||!list?.classList.contains('shopping-list'))return;
  const floating=createGhost(row,event);
  drag={pointerId:event.pointerId,handle,row,list,...floating};
  row.classList.add('is-drag-placeholder');
  document.body.classList.add('shopping-drag-active');
  try{handle.setPointerCapture(event.pointerId)}catch{}
  event.preventDefault();
}
function moveDrag(event){
  if(!drag||event.pointerId!==drag.pointerId)return;
  event.preventDefault();
  positionGhost(event);
  const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.shopping-row');
  if(!target||target===drag.row||target.parentElement!==drag.list)return;
  const rect=target.getBoundingClientRect();
  movePlaceholder(target,event.clientY>rect.top+rect.height/2);
}
function finishDrag(event){
  if(!drag||event.pointerId!==drag.pointerId)return;
  const {handle,row,list,ghost}=drag;
  persistDomOrder(list);
  drag=null;
  row.classList.remove('is-drag-placeholder');
  ghost.remove();
  document.body.classList.remove('shopping-drag-active');
  try{handle.releasePointerCapture(event.pointerId)}catch{}
}

function keyboardMove(event){
  if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
  const row=event.currentTarget.closest('.shopping-row'),list=row?.parentElement;
  if(!row||!list)return;
  event.preventDefault();
  animateReflow(list,()=>{
    if(event.key==='ArrowUp'){
      const previous=row.previousElementSibling;if(previous)list.insertBefore(row,previous);
    }else if(event.key==='ArrowDown'){
      const next=row.nextElementSibling;if(next)list.insertBefore(row,next.nextElementSibling);
    }else if(event.key==='Home')list.prepend(row);
    else if(event.key==='End')list.append(row);
  });
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