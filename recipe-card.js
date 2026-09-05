(()=>{
'use strict';

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

const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const formatNumber=n=>new Intl.NumberFormat('de-DE',{maximumFractionDigits:2}).format(n);
const isOne=n=>Math.abs(Number(n)-1)<1e-9;
const portionLabel=n=>`${formatNumber(n)} ${isOne(n)?'Portion':'Portionen'}`;
function fmtDuration(min){if(!Number.isFinite(min)||min<=0)return '—';if(min<60)return `${min} Min.`;const h=Math.floor(min/60),m=min%60;return m?`${h} Std. ${m} Min.`:`${h} Std.`}
function baseLabel(r){if(r.scaleType==='batch')return `${formatNumber(r.baseScale)} kg Ansatz`;if(r.scaleType==='factor')return '1 × Rezept';return portionLabel(r.baseScale)}
function initials(title){return String(title||'').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()}
function cuisineVisual(cuisine,title){
  const idx=CUISINE_ICON_ORDER.indexOf(cuisine);
  if(idx<0)return `<span class="card-initials">${esc(initials(title))}</span>`;
  const col=idx%6,row=Math.floor(idx/6);
  return `<span class="card-cuisine-icon" aria-hidden="true" style="background-position:${SPRITE_X[col]}% ${CARD_SPRITE_Y[row]}%;"></span><span class="sr-only">${esc(cuisine)}</span>`;
}
function imageVisual(src){
  const clean=String(src||''),name=clean.split('/').pop()||'',conf=CARD_IMAGE_TREATMENT[name]||{sizeY:130,posY:54};
  return `<div class="card-visual has-image" style="--card-image:url('${encodeURI(clean)}');--card-size-y:${conf.sizeY}%;--card-pos-y:${conf.posY}%;"></div>`;
}
function visual(r){return r.images?.length?imageVisual(r.images[0]):`<div class="card-visual no-image">${cuisineVisual(r.cuisine,r.title)}</div>`}
function render(r){
  const subrecipes=Array.isArray(r.subrecipes)?r.subrecipes:[];
  const tags=Array.isArray(r.prominentTags)?r.prominentTags.filter(Boolean).slice(0,2):[];
  const cuisine=[r.cuisine,r.region].filter(Boolean).join(' · ');
  return `<article class="recipe-card"><button class="open-card" type="button" data-recipe="${esc(r.id)}">${visual(r)}<div class="card-body"><span class="category">${esc(r.category)}</span><h3>${esc(r.title)}</h3><div class="card-context"><span>${esc(cuisine)}</span><span aria-hidden="true">·</span><span>${fmtDuration(r.durationMinutes)}</span><span aria-hidden="true">·</span><span>${esc(baseLabel(r))}</span></div>${tags.length?`<div class="card-tags-text">${tags.map(esc).join(' · ')}</div>`:''}${subrecipes.length?`<div class="card-subrecipe-note">${subrecipes.length} Unterrezept${subrecipes.length===1?'':'e'}</div>`:''}</div></button></article>`;
}

window.GerdRecipeCard=Object.freeze({render});
})();
