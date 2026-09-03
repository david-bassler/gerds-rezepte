(()=>{
'use strict';
const DATA=window.GERDS_REZEPTE;
if(!DATA)return;

const CUISINE_ICON_ORDER=['Deutsch','Österreichisch','Schweizerisch','Italienisch','Französisch','Spanisch','Griechisch','Ungarisch','Balkan','Britisch / Irisch','Nordisch','US-amerikanisch','Tex-Mex','Karibisch','Kreolisch','Indisch','Chinesisch','Thailändisch','Indonesisch','Nordafrikanisch / Maghreb','Mediterran','Asiatisch','Klassisch-europäisch','International / Fusion'];
const SPRITE_X=[0,20,40,60,80,100];
const CARD_SPRITE_Y=[3.125,34.375,65.625,96.875];
const CARD_IMAGE_TREATMENT={
  'neue-kartoffeln-garnelen-gruner-spargel-sahne-1.webp':{sizeY:146,posY:60},
  'neue-kartoffeln-garnelen-gruner-spargel-sahne-2.webp':{sizeY:124,posY:54},
  'schweineschnitzel-kartoffelkruste-schmand-1.webp':{sizeY:128,posY:52},
  'schweineschnitzel-kartoffelkruste-schmand-2.webp':{sizeY:128,posY:50},
  'spaghetti-alle-vongole-1.webp':{sizeY:144,posY:58},
  'spaghetti-alle-vongole-2.webp':{sizeY:126,posY:52},
  'spareribs-barbecue-1.webp':{sizeY:122,posY:54},
  'spareribs-barbecue-2.webp':{sizeY:124,posY:52},
  'spargel-grun-riesengarnelen-sahne-neue-kartoffeln-1.webp':{sizeY:146,posY:60},
  'spargel-grun-riesengarnelen-sahne-neue-kartoffeln-2.webp':{sizeY:124,posY:54}
};
const esc=s=>String(s??'').replace(/[&<>']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;'}[c]));
function initials(title){return String(title||'').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()}
function visualHtml(recipe){
  if(recipe.images?.length){
    const src=String(recipe.images[0]||''),name=src.split('/').pop()||'',conf=CARD_IMAGE_TREATMENT[name]||{sizeY:130,posY:54};
    return `<div class="card-visual has-image" data-favorite-visual="1" style="--card-image:url('${encodeURI(src)}');--card-size-y:${conf.sizeY}%;--card-pos-y:${conf.posY}%;"></div>`;
  }
  const idx=CUISINE_ICON_ORDER.indexOf(recipe.cuisine);
  if(idx>=0){
    const col=idx%6,row=Math.floor(idx/6),style=`background-position:${SPRITE_X[col]}% ${CARD_SPRITE_Y[row]}%;`;
    return `<div class="card-visual no-image" data-favorite-visual="1"><span class="card-cuisine-icon" aria-hidden="true" style="${style}"></span><span class="sr-only">${esc(recipe.cuisine)}</span></div>`;
  }
  return `<div class="card-visual no-image" data-favorite-visual="1"><span class="card-initials">${esc(initials(recipe.title))}</span></div>`;
}
function decorate(){
  if(location.hash!=='#favoriten'&&document.body.dataset.route!=='favorites')return;
  document.querySelectorAll('[data-open-favorite]').forEach(button=>{
    const current=button.querySelector('.card-visual');
    if(!current||current.dataset.favoriteVisual==='1')return;
    const recipe=DATA.recipes.find(r=>r.id===button.dataset.openFavorite);
    if(!recipe)return;
    current.outerHTML=visualHtml(recipe);
  });
}
let queued=false;
function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorate()})}
new MutationObserver(queue).observe(document.body,{childList:true,subtree:true});
window.addEventListener('popstate',queue);
queue();
})();
