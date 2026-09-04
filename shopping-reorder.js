(()=>{
'use strict';

const STORAGE_KEY='gerds-shopping-order-v1';
const VERSION=4;
const CATEGORY_PREFIX='category:';
const ITEM_PREFIX='item:';
const DEFAULT_CATEGORY_ORDER=[
  'produce','bakery','meat','fish','dairy','chilled','pantry','canned','baking','spices','sauces','drinks','frozen','household','other'
];
const CATEGORIES={
  produce:{label:'Obst & Gemüse'},
  bakery:{label:'Brot & Backwaren'},
  meat:{label:'Fleisch & Wurst'},
  fish:{label:'Fisch & Meeresfrüchte'},
  dairy:{label:'Molkerei & Eier'},
  chilled:{label:'Kühlregal'},
  pantry:{label:'Nudeln, Reis & Vorrat'},
  canned:{label:'Konserven & Gläser'},
  baking:{label:'Backen & Süßes'},
  spices:{label:'Gewürze & Würzmittel'},
  sauces:{label:'Öle, Essig & Saucen'},
  drinks:{label:'Getränke'},
  frozen:{label:'Tiefkühl'},
  household:{label:'Haushalt & Drogerie'},
  other:{label:'Sonstiges'}
};

let queued=false;
let drag=null;
let persistQueued=false;

function isShoppingPage(){return location.hash==='#einkaufsliste'||document.body.dataset.route==='shopping'}
function isDragging(){return document.body.classList.contains('shopping-drag-active')}
function isEditing(){return !!document.querySelector('.shopping-row.is-editing')}
function norm(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim()}
function directRows(list){return [...list.querySelectorAll(':scope > .shopping-row')]}
function allRows(list){return [...list.querySelectorAll('.shopping-row')]}
function rowKey(row){return row?.dataset.shopKey||row?.dataset.shoppingKey||row?.querySelector('[data-shop-done]')?.dataset.shopDone||''}
function tokenForRow(row){const key=rowKey(row);return key?`${ITEM_PREFIX}${key}`:''}
function tokenForCategory(id){return `${CATEGORY_PREFIX}${id}`}
function categoryFromToken(token){return String(token||'').startsWith(CATEGORY_PREFIX)?String(token).slice(CATEGORY_PREFIX.length):''}
function itemFromToken(token){return String(token||'').startsWith(ITEM_PREFIX)?String(token).slice(ITEM_PREFIX.length):''}
function dragIcon(){return '<svg viewBox="0 0 18 22" aria-hidden="true"><circle cx="5" cy="5" r="1.35"/><circle cx="13" cy="5" r="1.35"/><circle cx="5" cy="11" r="1.35"/><circle cx="13" cy="11" r="1.35"/><circle cx="5" cy="17" r="1.35"/><circle cx="13" cy="17" r="1.35"/></svg>'}

function categoryForArticle(value){
  const a=norm(value);
  const has=(...parts)=>parts.some(part=>a.includes(part));
  const word=part=>new RegExp(`(?:^| )${part}(?: |$)`).test(a);
  if(has('tiefkuhl','tiefgefroren')||word('tk')||word('gefroren'))return 'frozen';
  if(has('rind','kalb','schwein','lamm','hammel','huhn','huhner','hahn','pute','truthahn','ente','gans','wild','reh','hirsch','kaninchen','hackfleisch','mett','speck','bacon','schinken','dorrfleisch','cabanossi','chorizo','salami','wurst','leber','kasseler','filetsteak','schnitzel','kotelett','roulade'))return 'meat';
  if(has('fisch','lachs','forelle','kabeljau','dorsch','seelachs','heilbutt','zander','barsch','hering','makrele','sardine','thunfisch','seezunge','aal','garnele','shrimp','scampi','krebs','krabbe','hummer','languste','muschel','vongole','tintenfisch','calamari','oktopus'))return 'fish';
  if(has('apfel','birne','banane','zitrone','limette','orange','mandarine','clementine','grapefruit','beere','erdbeer','himbeer','brombeer','johannisbeer','heidelbeer','kirsche','pfirsich','aprikose','pflaume','zwetschge','traube','melone','ananas','mango','kiwi','avocado','feige','granatapfel','kartoffel','zwiebel','knoblauch','schalotte','lauch','porree','mohre','karotte','sellerie','paprika','tomate','gurke','zucchini','aubergine','kohl','blumenkohl','brokkoli','spargel','bohne','erbse','spinat','mangold','salat','rucola','radicchio','fenchel','kurbis','rettich','radies','rote bete','chicoree','artischocke','chili','peperoni','champignon','pilz','steinpilz','pfifferling','petersilie','schnittlauch','basilikum','dill','koriander','minze','thymian','rosmarin','salbei','estragon','kerbel','majoran','kresse','ingwer','oregano','krauterstrauss','krauterstrausschen'))return 'produce';
  if(has('brot','toast','brotchen','semmel','wrap','baguette','ciabatta','croissant','brezel','fladenbrot','pumpernickel'))return 'bakery';
  if(has('milch','butter','sahne','schmand','saure sahne','creme fraiche','creme double','quark','joghurt','yoghurt','kefir','buttermilch','eigelb','eiweiss','eiklar','parmesan','pecorino','mozzarella','feta','gouda','emmentaler','gruyere','cheddar','camembert','brie','ricotta','mascarpone','frischkase','gorgonzola','roquefort','bergkase','sbrinz','vollei')||word('ei')||word('eier')||word('kase'))return 'dairy';
  if(has('tofu','frische pasta','frischer blatterteig','frischer pizzateig','fertigteig','hefeteig','murbeteig')||word('gnocchi'))return 'chilled';
  if(has('olivenol','olivenoel','sonnenblumenol','sonnenblumenoel','rapsol','rapsoel','erdnussol','erdnussoel','sesamol','sesamoel','walnussol','walnussoel','truffelol','truffeloel','essig','senf','ketchup','mayonnaise','mayo','sojasauce','sojasosse','worcester','tabasco','sambal','chilisauce','fischsauce','austernsauce','pesto','dressing','balsamico','ajvar','pflanzenol','pflanzenoel')||word('ol')||word('oel'))return 'sauces';
  if(has('dosentomate','tomatenmark','kapern','cornichon','gewurzgurke','eingelegt','konserve','artischockenherz','sardellenfilet','maiskorn')||word('dose')||word('glas')||word('olive')||word('oliven')||word('sardelle')||word('sardellen'))return 'canned';
  if(has('mehl','zucker','puderzucker','vanillezucker','backpulver','natron','starke','speisestarke','kakao','schokolade','kuverture','gelatine','hefe','mandel','haselnuss','walnuss','pekannuss','pistazie','kokos','rosine','korinthe','marzipan','nougat','honig','sirup','sultanine','sauerteig','backmalz'))return 'baking';
  if(has('paprikapulver','curry','kurkuma','muskat','zimt','nelke','kardamom','kreuzkummel','koriandersaat','senfkorn','lorbeer','wacholder','safran','gewurz','chilipulver','cayenne','vanille','bruhwurfel','bruhe','fond','pfefferkorn','piment','maccis','meersalz')||word('salz')||word('pfeffer')||word('kummel'))return 'spices';
  if(has('champagner','prosecco','sherry','portwein','cognac','brandy','wodka','whisky','likor','mineralwasser','limonade','rotwein','weisswein')||word('wein')||word('bier')||word('sekt')||word('rum')||word('saft')||word('wasser')||word('cola'))return 'drinks';
  if(has('nudel','pasta','spaghetti','tagliatelle','penne','makaroni','lasagne','risotto','couscous','bulgur','polenta','linsen','kichererbse','quinoa','haferflocke','gries','griess','paniermehl','semmelbrosel','pinienkern','sesam','cornflakes','ravioli','langkornreis','kaffee','espresso','tee','musli','muesli')||word('reis'))return 'pantry';
  if(has('spulmittel','spuelmittel','reiniger','seife','shampoo','duschgel','zahncreme','zahnpasta','toilettenpapier','kuchenrolle','kuechenrolle','mullbeutel','muellbeutel','aluminiumfolie','frischhaltefolie','backpapier','schwamm','serviette','taschentuch'))return 'household';
  return 'other';
}

function rowArticle(row){
  return row?.querySelector('.shopping-inline-article')?.value?.trim()||row?.querySelector('.shopping-name strong')?.textContent?.trim()||'';
}
function rowCategory(row){
  const category=categoryForArticle(rowArticle(row));
  row.dataset.shoppingCategory=category;
  return category;
}
function readState(){
  try{
    const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(Array.isArray(raw))return {version:1,legacyOrder:raw.filter(x=>typeof x==='string'),categoryOrder:[...DEFAULT_CATEGORY_ORDER],sequence:[]};
    if(raw&&typeof raw==='object'){
      return {
        version:Number(raw.version)||VERSION,
        categoryOrder:Array.isArray(raw.categoryOrder)?raw.categoryOrder.filter(id=>CATEGORIES[id]):[...DEFAULT_CATEGORY_ORDER],
        sequence:Array.isArray(raw.sequence)?raw.sequence.filter(x=>typeof x==='string'):[],
        legacyOrder:[]
      };
    }
  }catch{}
  return {version:VERSION,categoryOrder:[...DEFAULT_CATEGORY_ORDER],sequence:[],legacyOrder:[]};
}
function normalizedCategoryOrder(saved=[]){
  return [...saved.filter((id,index)=>CATEGORIES[id]&&saved.indexOf(id)===index),...DEFAULT_CATEGORY_ORDER.filter(id=>!saved.includes(id))];
}
function flattenDom(list){
  return [...list.children].map(node=>{
    if(node.classList.contains('shopping-category-header'))return tokenForCategory(node.dataset.category);
    if(node.classList.contains('shopping-row'))return tokenForRow(node);
    return '';
  }).filter(Boolean);
}
function saveState(list){
  const previous=readState(),sequence=flattenDom(list);
  const visibleOrder=sequence.map(categoryFromToken).filter(Boolean);
  const categoryOrder=[...visibleOrder,...normalizedCategoryOrder(previous.categoryOrder).filter(id=>!visibleOrder.includes(id))];
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:VERSION,categoryOrder,sequence}))}
  catch(error){console.warn('Reihenfolge der Einkaufsliste konnte nicht gespeichert werden.',error)}
}
function queuePersist(list){
  if(!list||persistQueued)return;
  persistQueued=true;
  requestAnimationFrame(()=>{
    persistQueued=false;
    decorateRows(list);
    saveState(list);
  });
}
function buildInitialSequence(rows,state){
  const order=normalizedCategoryOrder(state.categoryOrder);
  const legacyIndex=new Map((state.legacyOrder||[]).map((key,index)=>[key,index]));
  const byCategory=new Map(order.map(id=>[id,[]]));
  rows.forEach((row,index)=>{
    const category=rowCategory(row),bucket=byCategory.get(category)||[];
    bucket.push({row,index,key:rowKey(row)});byCategory.set(category,bucket);
  });
  const sequence=[];
  for(const category of order){
    const bucket=byCategory.get(category)||[];
    if(!bucket.length)continue;
    bucket.sort((a,b)=>{
      const ai=legacyIndex.has(a.key)?legacyIndex.get(a.key):Infinity;
      const bi=legacyIndex.has(b.key)?legacyIndex.get(b.key):Infinity;
      return ai-bi||a.index-b.index;
    });
    sequence.push(tokenForCategory(category),...bucket.map(x=>`${ITEM_PREFIX}${x.key}`));
  }
  return sequence;
}
function normalizeSequence(rows,state){
  const rowByKey=new Map(rows.map(row=>[rowKey(row),row]));
  const categoryOrder=normalizedCategoryOrder(state.categoryOrder);
  const presentCategories=new Set(rows.map(rowCategory));
  let sequence=state.sequence?.length?[...state.sequence]:buildInitialSequence(rows,state);
  sequence=sequence.filter(token=>{
    const category=categoryFromToken(token);
    if(category)return presentCategories.has(category);
    const key=itemFromToken(token);
    return key&&rowByKey.has(key);
  });
  const seen=new Set();
  sequence=sequence.filter(token=>seen.has(token)?false:(seen.add(token),true));
  for(const category of categoryOrder){
    if(!presentCategories.has(category))continue;
    const token=tokenForCategory(category);
    if(sequence.includes(token))continue;
    let insertAt=sequence.length;
    for(const later of categoryOrder.slice(categoryOrder.indexOf(category)+1)){
      const i=sequence.indexOf(tokenForCategory(later));
      if(i>=0){insertAt=i;break}
    }
    sequence.splice(insertAt,0,token);
  }
  for(const row of rows){
    const token=tokenForRow(row);
    if(sequence.includes(token))continue;
    const category=rowCategory(row),headerIndex=sequence.indexOf(tokenForCategory(category));
    let insertAt=headerIndex>=0?headerIndex+1:sequence.length;
    while(insertAt<sequence.length){
      const key=itemFromToken(sequence[insertAt]),candidate=key?rowByKey.get(key):null;
      if(!candidate||rowCategory(candidate)!==category)break;
      insertAt++;
    }
    sequence.splice(insertAt,0,token);
  }
  return {sequence,categoryOrder,rowByKey};
}
function headerHtml(id,count){
  const label=CATEGORIES[id]?.label||CATEGORIES.other.label;
  return `<div class="shopping-category-header" data-category="${id}"><button type="button" class="shopping-category-drag" aria-label="${label} verschieben" title="Kategorie ziehen">${dragIcon()}</button><div><strong>${label}</strong><small>${count} Artikel</small></div></div>`;
}
function flattenLegacyDom(list){
  const rows=allRows(list);
  rows.forEach(row=>row.remove());
  list.querySelectorAll('.shopping-category-block,.shopping-category-header,.shopping-drop-indicator').forEach(node=>node.remove());
  rows.forEach(row=>list.appendChild(row));
  return rows;
}
function applySequence(list){
  const rows=flattenLegacyDom(list);
  if(!rows.length)return;
  rows.forEach(row=>{row.dataset.shopKey=rowKey(row);rowCategory(row)});
  const state=readState(),normalized=normalizeSequence(rows,state);
  const counts=new Map();
  rows.forEach(row=>counts.set(rowCategory(row),(counts.get(rowCategory(row))||0)+1));
  const nodes=new Map(rows.map(row=>[tokenForRow(row),row]));
  normalized.categoryOrder.forEach(category=>{
    if(!counts.get(category))return;
    const header=document.createRange().createContextualFragment(headerHtml(category,counts.get(category))).firstElementChild;
    nodes.set(tokenForCategory(category),header);
  });
  normalized.sequence.forEach(token=>{const node=nodes.get(token);if(node)list.appendChild(node)});
  decorateRows(list);
  const current=readState();
  if(current.version!==VERSION||current.legacyOrder?.length||JSON.stringify(current.sequence)!==JSON.stringify(normalized.sequence))saveState(list);
}
function nearestPreviousCategory(row){
  let node=row?.previousElementSibling;
  while(node){
    if(node.classList.contains('shopping-category-header'))return node.dataset.category||'';
    node=node.previousElementSibling;
  }
  return '';
}
function decorateRows(list){
  directRows(list).forEach(row=>{
    ensureRowHandle(row);
    const attached=nearestPreviousCategory(row)===rowCategory(row);
    row.classList.toggle('shopping-is-loose',!attached);
    let badge=row.querySelector('.shopping-category-badge');
    if(!attached){
      if(!badge){
        badge=document.createElement('span');
        badge.className='shopping-category-badge';
        row.querySelector('.shopping-name')?.appendChild(badge);
      }
      if(badge)badge.textContent=CATEGORIES[rowCategory(row)]?.label||CATEGORIES.other.label;
    }else badge?.remove();
  });
}
function categoryOwnedRows(header){
  const category=header?.dataset.category,rows=[];
  let node=header?.nextElementSibling;
  while(node&&!node.classList.contains('shopping-category-header')){
    if(node.classList.contains('shopping-row')&&rowCategory(node)===category)rows.push(node);
    node=node.nextElementSibling;
  }
  return rows;
}
function categoryNodes(header){return header?[header,...categoryOwnedRows(header)]:[]}
function moveNodesBefore(nodes,reference,list){
  const moving=new Set(nodes);
  if(reference&&moving.has(reference))return;
  nodes.forEach(node=>list.insertBefore(node,reference||null));
}
function previousHeader(header){
  let node=header?.previousElementSibling;
  while(node){if(node.classList.contains('shopping-category-header'))return node;node=node.previousElementSibling}
  return null;
}
function nextHeader(header){
  let node=header?.nextElementSibling;
  while(node){if(node.classList.contains('shopping-category-header'))return node;node=node.nextElementSibling}
  return null;
}
function moveCategoryKeyboard(header,key){
  const list=header?.parentElement;if(!list)return;
  const nodes=categoryNodes(header);
  if(key==='ArrowUp'){
    const previous=previousHeader(header);if(previous)moveNodesBefore(nodes,previous,list);
  }else if(key==='ArrowDown'){
    const next=nextHeader(header);if(next){const after=nextHeader(next);moveNodesBefore(nodes,after,list)}
  }else if(key==='Home'){
    const first=list.querySelector(':scope > .shopping-category-header');if(first&&first!==header)moveNodesBefore(nodes,first,list);
  }else if(key==='End')moveNodesBefore(nodes,null,list);
  queuePersist(list);
}
function moveItemKeyboard(row,key){
  const list=row?.parentElement;if(!list)return;
  if(key==='ArrowUp'){
    const previous=row.previousElementSibling;if(previous)list.insertBefore(row,previous);
  }else if(key==='ArrowDown'){
    const next=row.nextElementSibling;if(next)list.insertBefore(row,next.nextElementSibling);
  }else if(key==='Home')list.prepend(row);
  else if(key==='End')list.append(row);
  queuePersist(list);
}
function keyboardMove(event){
  if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
  const handle=event.currentTarget;
  const header=handle.closest('.shopping-category-header');
  const row=handle.closest('.shopping-row');
  if(!header&&!row)return;
  event.preventDefault();
  if(header)moveCategoryKeyboard(header,event.key);else moveItemKeyboard(row,event.key);
  requestAnimationFrame(()=>handle.focus());
}
function ensureRowHandle(row){
  const key=rowKey(row);if(!key||row.classList.contains('is-editing'))return;
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
  const name=rowArticle(row)||'Einkaufsartikel';
  handle.setAttribute('aria-label',`${name} verschieben`);
  handle.title='Ziehen zum Verschieben · Pfeiltasten funktionieren ebenfalls';
  if(!handle.dataset.keyboardBound){
    handle.dataset.keyboardBound='1';
    handle.addEventListener('keydown',keyboardMove);
  }
}
function bindCategoryHandles(list){
  list.querySelectorAll('.shopping-category-drag').forEach(handle=>{
    if(handle.dataset.keyboardBound)return;
    handle.dataset.keyboardBound='1';
    handle.addEventListener('keydown',keyboardMove);
  });
}
function makeGhost(type,source,nodes){
  const ghost=document.createElement('div');
  ghost.className=`shopping-drag-ghost is-${type}`;
  if(type==='category'){
    const header=source.cloneNode(true);
    header.querySelectorAll('button').forEach(button=>button.remove());
    ghost.appendChild(header);
    const count=document.createElement('small');
    count.textContent=`${Math.max(0,nodes.length-1)} Artikel werden mitverschoben`;
    ghost.appendChild(count);
  }else{
    const copy=source.cloneNode(true);
    copy.querySelectorAll('button,input,.shopping-sources').forEach(node=>node.remove());
    ghost.appendChild(copy);
  }
  document.body.appendChild(ghost);
  return ghost;
}
function placeGhost(event){
  if(!drag?.ghost)return;
  drag.ghost.style.transform=`translate3d(${Math.round(event.clientX+14)}px,${Math.round(event.clientY+14)}px,0)`;
}
function ensureIndicator(list){
  let indicator=list.querySelector(':scope > .shopping-drop-indicator');
  if(!indicator){indicator=document.createElement('div');indicator.className='shopping-drop-indicator'}
  return indicator;
}
function targetReferenceForCategory(list,y,sourceHeader){
  const headers=[...list.querySelectorAll(':scope > .shopping-category-header')].filter(header=>header!==sourceHeader);
  for(const header of headers){
    const rect=header.getBoundingClientRect();
    if(y<rect.top+rect.height/2)return header;
  }
  return null;
}
function targetReferenceForItem(list,y,sourceRow){
  const candidates=[...list.children].filter(node=>node!==sourceRow&&!node.classList.contains('shopping-drop-indicator'));
  for(const node of candidates){
    const rect=node.getBoundingClientRect();
    if(y<rect.top+rect.height/2)return node;
  }
  return null;
}
function showDropTarget(event){
  if(!drag)return;
  const list=drag.list,indicator=ensureIndicator(list);
  const reference=drag.type==='category'
    ?targetReferenceForCategory(list,event.clientY,drag.source)
    :targetReferenceForItem(list,event.clientY,drag.source);
  if(reference)list.insertBefore(indicator,reference);else list.appendChild(indicator);
  drag.reference=reference;
}
function autoScroll(y){
  const edge=72,speed=15;
  if(y<edge)window.scrollBy(0,-speed);
  else if(y>innerHeight-edge)window.scrollBy(0,speed);
}
function beginDrag(event){
  if(!drag||drag.started)return;
  drag.started=true;
  document.body.classList.add('shopping-drag-active');
  drag.nodes.forEach(node=>node.classList.add('shopping-drag-source'));
  drag.ghost=makeGhost(drag.type,drag.source,drag.nodes);
  placeGhost(event);
  showDropTarget(event);
}
function cleanupDrag(){
  const current=drag;if(!current)return;
  current.nodes.forEach(node=>node.classList.remove('shopping-drag-source'));
  current.ghost?.remove();
  current.list.querySelector(':scope > .shopping-drop-indicator')?.remove();
  document.body.classList.remove('shopping-drag-active');
  drag=null;
}
function finishDrag(cancel=false){
  const current=drag;if(!current)return;
  const {list,type,source,nodes,reference,started}=current;
  if(started&&!cancel){
    if(type==='category')moveNodesBefore(nodes,reference,list);
    else if(reference!==source)list.insertBefore(source,reference||null);
  }
  cleanupDrag();
  if(started&&!cancel){decorateRows(list);saveState(list)}
  queueSync();
}
function pointerDown(event){
  if(!isShoppingPage()||isDragging()||isEditing())return;
  if(event.pointerType==='mouse'&&event.button!==0)return;
  const categoryHandle=event.target.closest('.shopping-category-drag');
  const rowHandle=event.target.closest('.shopping-drag-handle');
  const handle=categoryHandle||rowHandle;
  if(!handle)return;
  const list=handle.closest('.shopping-list');if(!list)return;
  const source=categoryHandle?handle.closest('.shopping-category-header'):handle.closest('.shopping-row');
  if(!source)return;
  event.preventDefault();
  const type=categoryHandle?'category':'item';
  drag={
    type,list,source,nodes:type==='category'?categoryNodes(source):[source],
    pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,
    started:false,ghost:null,reference:null
  };
  try{handle.setPointerCapture?.(event.pointerId)}catch{}
}
function pointerMove(event){
  if(!drag||event.pointerId!==drag.pointerId)return;
  const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
  if(!drag.started&&Math.hypot(dx,dy)<5)return;
  event.preventDefault();
  beginDrag(event);
  placeGhost(event);
  showDropTarget(event);
  autoScroll(event.clientY);
}
function pointerUp(event){
  if(!drag||event.pointerId!==drag.pointerId)return;
  event.preventDefault();
  finishDrag(false);
}
function pointerCancel(event){
  if(!drag||event.pointerId!==drag.pointerId)return;
  finishDrag(true);
}
function sync(){
  queued=false;
  if(isDragging()||isEditing())return;
  if(!isShoppingPage())return;
  const list=document.querySelector('.shopping-list');if(!list)return;
  applySequence(list);
  bindCategoryHandles(list);
}
function queueSync(){
  if(isDragging()||isEditing()||queued)return;
  queued=true;
  requestAnimationFrame(sync);
}

document.addEventListener('pointerdown',pointerDown);
document.addEventListener('pointermove',pointerMove,{passive:false});
document.addEventListener('pointerup',pointerUp);
document.addEventListener('pointercancel',pointerCancel);
new MutationObserver(queueSync).observe(document.body,{childList:true,subtree:true,characterData:true});
window.addEventListener('popstate',queueSync);
queueSync();

window.GerdShoppingOrderDebug={
  readState,
  flatten:()=>{const list=document.querySelector('.shopping-list');return list?flattenDom(list):[]},
  categories:()=>[...document.querySelectorAll('.shopping-list > .shopping-category-header')].map(header=>header.dataset.category),
  rebuild:()=>{const list=document.querySelector('.shopping-list');if(list)applySequence(list)},
  categoryForArticle
};
})();