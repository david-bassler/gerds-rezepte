(()=>{
'use strict';

const MODE_CLASS='cook-mode-active';
const SWIPE_DISTANCE=70;
let state=null;
let wakeLock=null;
let swipe=null;
let tipTimer=0;

function currentRecipe(){
  const match=(location.hash||'').match(/^#rezept=(.+)$/);
  if(!match)return null;
  const id=decodeURIComponent(match[1]);
  return window.GERDS_REZEPTE?.recipes?.find(recipe=>recipe.id===id)||null;
}
function isDetail(){return !!currentRecipe()&&!!document.querySelector('.detail')}
function isActive(){return !!state&&document.body.classList.contains(MODE_CLASS)}
function text(el){return el?.textContent?.replace(/\s+/g,' ').trim()||''}
function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function phaseSteps(root,label,source=''){
  if(!root)return [];
  return [...root.querySelectorAll(':scope > .steps > li')].map((li,index)=>({
    label,source,index:index+1,text:text(li.querySelector('span')||li)
  }));
}
function collectSteps(){
  const steps=[];
  const sections=[...document.querySelectorAll('.recipe-content .process-section')];
  for(const section of sections){
    const label=text(section.querySelector('.section-title'))||'Zubereitung';
    steps.push(...phaseSteps(section,label));
  }
  for(const details of document.querySelectorAll('#subrecipes .subrecipe')){
    const source=text(details.querySelector(':scope > summary'))||'Unterrezept';
    const inner=details.querySelector('.sub-inner');
    if(!inner)continue;
    const headings=[...inner.querySelectorAll('h3')];
    for(const heading of headings){
      const label=text(heading);
      const list=heading.nextElementSibling;
      if(list?.classList.contains('steps')){
        [...list.querySelectorAll(':scope > li')].forEach((li,index)=>steps.push({
          label,source,index:index+1,text:text(li.querySelector('span')||li)
        }));
      }
    }
  }
  return steps;
}
function collectIngredients(){
  const groups=[];
  const add=(title,root)=>{
    if(!root)return;
    const rows=[];
    for(const li of root.querySelectorAll('.ingredient')){
      const amount=text(li.querySelector('.amount'));
      const name=text(li.querySelector('.ingredient-name'));
      if(name)rows.push({amount,name});
    }
    if(rows.length)groups.push({title,rows});
  };
  add('Hauptrezept',document.getElementById('mainIngredients'));
  document.querySelectorAll('#subrecipes .subrecipe').forEach(details=>{
    add(text(details.querySelector(':scope > summary'))||'Unterrezept',details);
  });
  return groups;
}
function ingredientHtml(groups){
  return groups.map(group=>`<section class="cook-ingredient-group"><h3>${esc(group.title)}</h3><ul>${group.rows.map(row=>`<li><strong>${esc(row.amount)}</strong><span>${esc(row.name)}</span></li>`).join('')}</ul></section>`).join('');
}
function ensureButton(){
  if(!isDetail())return;
  const actions=document.querySelector('.detail-actions');
  if(!actions||actions.querySelector('#cookModeLaunch'))return;
  const button=document.createElement('button');
  button.type='button';
  button.id='cookModeLaunch';
  button.className='cook-mode-launch';
  button.textContent='Kochmodus';
  button.addEventListener('click',enter);
  actions.prepend(button);
}
async function acquireWakeLock(){
  if(!isActive()||!navigator.wakeLock?.request||document.visibilityState!=='visible')return;
  try{
    wakeLock=await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release',()=>{wakeLock=null},{once:true});
  }catch{}
}
function releaseWakeLock(){
  try{wakeLock?.release()}catch{}
  wakeLock=null;
}
function usesTouch(){return matchMedia?.('(pointer: coarse)').matches||window.innerWidth<=820}
function showTip(){
  if(!usesTouch()||sessionStorage.getItem('gerds-cook-swipe-tip'))return;
  sessionStorage.setItem('gerds-cook-swipe-tip','1');
  const tip=document.createElement('div');
  tip.className='cook-swipe-tip';
  tip.innerHTML='<span aria-hidden="true">←</span><strong>Wischen</strong><span aria-hidden="true">→</span><small>für vor und zurück</small>';
  document.querySelector('.cook-mode')?.appendChild(tip);
  requestAnimationFrame(()=>tip.classList.add('is-visible'));
  clearTimeout(tipTimer);
  tipTimer=setTimeout(()=>{tip.classList.remove('is-visible');setTimeout(()=>tip.remove(),220)},2400);
}
function render(){
  if(!state)return;
  const mode=document.querySelector('.cook-mode');
  const step=state.steps[state.index];
  if(!mode||!step)return;
  const phase=mode.querySelector('[data-cook-phase]');
  const source=mode.querySelector('[data-cook-source]');
  const number=mode.querySelector('[data-cook-number]');
  const body=mode.querySelector('[data-cook-step]');
  const counter=mode.querySelector('[data-cook-counter]');
  const progress=mode.querySelector('[data-cook-progress]');
  const prev=mode.querySelector('[data-cook-prev]');
  const next=mode.querySelector('[data-cook-next]');
  phase.textContent=step.label;
  source.textContent=step.source||state.recipe.title;
  source.hidden=!step.source;
  number.textContent=String(state.index+1);
  body.textContent=step.text;
  counter.textContent=`${state.index+1} von ${state.steps.length}`;
  progress.style.width=`${((state.index+1)/state.steps.length)*100}%`;
  prev.disabled=state.index===0;
  next.textContent=state.index===state.steps.length-1?'Fertig':'Weiter';
  mode.dataset.phase=step.label.toLowerCase();
}
function go(delta){
  if(!state)return;
  const next=state.index+delta;
  if(next<0)return;
  if(next>=state.steps.length){leave();return}
  state.index=next;
  render();
}
function toggleIngredients(force){
  const sheet=document.querySelector('.cook-ingredients');
  const backdrop=document.querySelector('.cook-ingredients-backdrop');
  if(!sheet||!backdrop)return;
  const open=typeof force==='boolean'?force:!sheet.classList.contains('is-open');
  sheet.classList.toggle('is-open',open);
  backdrop.classList.toggle('is-open',open);
  sheet.setAttribute('aria-hidden',String(!open));
  document.querySelector('[data-cook-ingredients]')?.setAttribute('aria-expanded',String(open));
}
function enter(){
  const recipe=currentRecipe(),steps=collectSteps();
  if(!recipe||!steps.length){
    window.alert('Für dieses Rezept sind keine Arbeitsschritte hinterlegt.');
    return;
  }
  const ingredients=collectIngredients();
  state={recipe,steps,ingredients,index:0};
  document.body.classList.add(MODE_CLASS);
  const overlay=document.createElement('div');
  overlay.className='cook-mode';
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-label',`Kochmodus: ${recipe.title}`);
  overlay.innerHTML=`
    <div class="cook-mode-top">
      <div class="cook-mode-title"><span>Kochmodus</span><strong>${esc(recipe.title)}</strong></div>
      <div class="cook-mode-tools">
        <button type="button" data-cook-ingredients aria-expanded="false">Zutaten</button>
        <button type="button" class="cook-mode-close" data-cook-close aria-label="Kochmodus schließen">×</button>
      </div>
    </div>
    <div class="cook-progress-track" aria-hidden="true"><span data-cook-progress></span></div>
    <main class="cook-step-wrap">
      <div class="cook-step-card">
        <div class="cook-step-meta">
          <div><span data-cook-phase></span><small data-cook-source></small></div>
          <span class="cook-step-count" data-cook-counter></span>
        </div>
        <div class="cook-step-main">
          <span class="cook-step-number" data-cook-number></span>
          <p data-cook-step></p>
        </div>
      </div>
    </main>
    <div class="cook-mode-nav">
      <button type="button" data-cook-prev>← Zurück</button>
      <button type="button" class="cook-next" data-cook-next>Weiter</button>
    </div>
    <div class="cook-ingredients-backdrop"></div>
    <aside class="cook-ingredients" aria-hidden="true">
      <div class="cook-ingredients-head"><div><span>Zutaten</span><strong>Aktuell skalierte Mengen</strong></div><button type="button" data-cook-ingredients-close aria-label="Zutaten schließen">×</button></div>
      <div class="cook-ingredients-body">${ingredientHtml(ingredients)}</div>
    </aside>`;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-cook-close]').addEventListener('click',leave);
  overlay.querySelector('[data-cook-prev]').addEventListener('click',()=>go(-1));
  overlay.querySelector('[data-cook-next]').addEventListener('click',()=>go(1));
  overlay.querySelector('[data-cook-ingredients]').addEventListener('click',()=>toggleIngredients());
  overlay.querySelector('[data-cook-ingredients-close]').addEventListener('click',()=>toggleIngredients(false));
  overlay.querySelector('.cook-ingredients-backdrop').addEventListener('click',()=>toggleIngredients(false));
  render();
  acquireWakeLock();
  showTip();
}
function leave(){
  if(!isActive())return;
  clearTimeout(tipTimer);
  toggleIngredients(false);
  document.querySelector('.cook-mode')?.remove();
  document.body.classList.remove(MODE_CLASS);
  state=null;
  swipe=null;
  releaseWakeLock();
}
function startSwipe(event){
  if(!isActive()||event.pointerType==='mouse'||event.target.closest('button,.cook-ingredients'))return;
  swipe={id:event.pointerId,x:event.clientX,y:event.clientY};
}
function moveSwipe(event){
  if(!swipe||event.pointerId!==swipe.id)return;
  const dx=event.clientX-swipe.x,dy=event.clientY-swipe.y;
  if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.15)event.preventDefault();
}
function endSwipe(event){
  if(!swipe||event.pointerId!==swipe.id)return;
  const dx=event.clientX-swipe.x,dy=event.clientY-swipe.y;
  swipe=null;
  if(Math.abs(dx)<SWIPE_DISTANCE||Math.abs(dx)<Math.abs(dy)*1.25)return;
  go(dx<0?1:-1);
}
document.addEventListener('pointerdown',startSwipe);
document.addEventListener('pointermove',moveSwipe,{passive:false});
document.addEventListener('pointerup',endSwipe);
document.addEventListener('pointercancel',()=>{swipe=null});
document.addEventListener('keydown',event=>{
  if(!isActive())return;
  if(event.key==='Escape'){if(document.querySelector('.cook-ingredients.is-open'))toggleIngredients(false);else leave();return}
  if(document.querySelector('.cook-ingredients.is-open'))return;
  if(event.key==='ArrowLeft')go(-1);
  else if(event.key==='ArrowRight')go(1);
});
document.addEventListener('visibilitychange',()=>{
  if(!isActive())return;
  if(document.visibilityState==='visible')acquireWakeLock();else releaseWakeLock();
});
window.addEventListener('popstate',()=>{if(isActive())leave()});

let queued=false;
function sync(){queued=false;if(isActive()&&!isDetail())leave();else ensureButton()}
function queue(){if(queued)return;queued=true;requestAnimationFrame(sync)}
new MutationObserver(queue).observe(document.body,{childList:true,subtree:true});
queue();
})();