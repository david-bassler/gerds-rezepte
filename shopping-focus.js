(()=>{
'use strict';

const MODE_CLASS='shopping-focus-mode';
const TIP_DURATION=2800;
const SWIPE_DISTANCE=84;
let queued=false;
let tipTimer=0;
let swipe=null;

function isShoppingPage(){return location.hash==='#einkaufsliste'||document.body.dataset.route==='shopping'}
function isActive(){return document.body.classList.contains(MODE_CLASS)}
function isDragging(){return document.body.classList.contains('shopping-drag-active')}
function usesTouchHint(){return window.matchMedia?.('(pointer: coarse)').matches||window.innerWidth<=680}

function ensureLaunchButton(){
  if(!isShoppingPage()||!document.querySelector('.shopping-list'))return;
  const actions=document.querySelector('.list-page .list-actions');
  if(!actions||actions.querySelector('#shoppingFocusMode'))return;
  const button=document.createElement('button');
  button.type='button';
  button.id='shoppingFocusMode';
  button.className='shopping-focus-launch';
  button.textContent='Einkaufsmodus';
  button.addEventListener('click',enterMode);
  actions.prepend(button);
}

function showTip(){
  clearTimeout(tipTimer);
  document.querySelector('.shopping-focus-overlay')?.remove();
  const overlay=document.createElement('div');
  overlay.className='shopping-focus-overlay';
  overlay.setAttribute('role','status');
  overlay.setAttribute('aria-live','polite');
  overlay.innerHTML=usesTouchHint()
    ?'<div class="shopping-focus-tip"><span class="shopping-focus-arrow" aria-hidden="true">→</span><strong>Nach rechts wischen</strong><span>zurück zur normalen Ansicht</span></div>'
    :'<div class="shopping-focus-tip"><strong>Esc drücken</strong><span>zurück zur normalen Ansicht</span></div>';
  document.body.append(overlay);
  requestAnimationFrame(()=>overlay.classList.add('is-visible'));
  tipTimer=setTimeout(()=>hideTip(),TIP_DURATION);
}
function hideTip(){
  clearTimeout(tipTimer);
  tipTimer=0;
  const overlay=document.querySelector('.shopping-focus-overlay');
  if(!overlay)return;
  overlay.classList.remove('is-visible');
  setTimeout(()=>overlay.remove(),220);
}

function enterMode(){
  if(isActive()||!isShoppingPage())return;
  document.body.classList.remove('shopping-sort-mode');
  document.querySelector('.shopping-sort-toolbar')?.remove();
  document.body.classList.add(MODE_CLASS);
  showTip();
  const request=document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen;
  if(request){
    try{Promise.resolve(request.call(document.documentElement)).catch(()=>{})}catch{}
  }
}
function leaveMode({exitFullscreen=true}={}){
  if(!isActive())return;
  document.body.classList.remove(MODE_CLASS);
  hideTip();
  swipe=null;
  if(exitFullscreen){
    const exit=document.exitFullscreen||document.webkitExitFullscreen;
    if((document.fullscreenElement||document.webkitFullscreenElement)&&exit){
      try{Promise.resolve(exit.call(document)).catch(()=>{})}catch{}
    }
  }
}

function startSwipe(event){
  if(!isActive()||event.pointerType==='mouse')return;
  swipe={id:event.pointerId,x:event.clientX,y:event.clientY};
}
function moveSwipe(event){
  if(!swipe||event.pointerId!==swipe.id)return;
  const dx=event.clientX-swipe.x,dy=event.clientY-swipe.y;
  if(dx>10&&Math.abs(dx)>Math.abs(dy)*1.15)event.preventDefault();
}
function finishSwipe(event){
  if(!swipe||event.pointerId!==swipe.id)return;
  const dx=event.clientX-swipe.x,dy=event.clientY-swipe.y;
  swipe=null;
  if(dx>=SWIPE_DISTANCE&&Math.abs(dy)<=Math.max(64,dx*.55))leaveMode();
}

function sync(){
  queued=false;
  if(isDragging())return;
  if(!isShoppingPage()){
    if(isActive())leaveMode();
    return;
  }
  ensureLaunchButton();
}
function queueSync(){if(isDragging()||queued)return;queued=true;requestAnimationFrame(sync)}

new MutationObserver(queueSync).observe(document.body,{childList:true,subtree:true});
window.addEventListener('popstate',queueSync);
document.addEventListener('pointerdown',startSwipe);
document.addEventListener('pointermove',moveSwipe,{passive:false});
document.addEventListener('pointerup',finishSwipe);
document.addEventListener('pointercancel',()=>{swipe=null});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&isActive())leaveMode()});
document.addEventListener('fullscreenchange',()=>{if(isActive()&&!document.fullscreenElement)leaveMode({exitFullscreen:false})});
document.addEventListener('webkitfullscreenchange',()=>{if(isActive()&&!document.webkitFullscreenElement&&!document.fullscreenElement)leaveMode({exitFullscreen:false})});
queueSync();
})();