(()=>{
'use strict';

const STORAGE_KEY='gerds-shopping-order-v1';
const VERSION=3;
const CATEGORY_PREFIX='category:';
const ITEM_PREFIX='item:';
const SORT_GROUP='gerds-shopping';
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
let layoutSortable=null;
let itemSortables=[];
let activeList=null;
let persistQueued=false;

function isShoppingPage(){return location.hash==='#einkaufsliste'||document.body.dataset.route==='shopping'}
function isDragging(){return document.body.classList.contains('shopping-drag-active')}
function isEditing(){return !!document.querySelector('.shopping-row.is-editing')}
function reducedMotion(){return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches}
function norm(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim()}
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
  const sequence=[];
  for(const child of [...list.children]){
    if(child.classList.contains('shopping-category-block')){
      const id=child.dataset.category;
      if(id)sequence.push(tokenForCategory(id));
      child.querySelectorAll(':scope > .shopping-category-items > .shopping-row').forEach(row=>sequence.push(tokenForRow(row)));
    }else if(child.classList.contains('shopping-row'))sequence.push(tokenForRow(child));
  }
  return sequence.filter(Boolean);
}
function saveState(list){
  const previous=readState();
  const sequence=flattenDom(list);
  const visibleOrder=sequence.map(categoryFromToken).filter(Boolean);
  const categoryOrder=[...visibleOrder,...normalizedCategoryOrder(previous.categoryOrder).filter(id=>!visibleOrder.includes(id))];
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:VERSION,categoryOrder,sequence}))}
  catch(error){console.warn('Reihenfolge der Einkaufsliste konnte nicht gespeichert werden.',error)}
}
function queuePersist(list){
  if(persistQueued)return;
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
  const seen=new Set(),deduped=[];
  for(const token of sequence)if(!seen.has(token)){seen.add(token);deduped.push(token)}
  sequence=deduped;
  for(const category of categoryOrder){
    if(!presentCategories.has(category))continue;
    const token=tokenForCategory(category);
    if(sequence.includes(token))continue;
    const categoryPosition=categoryOrder.indexOf(category);
    let insertAt=sequence.length;
    for(let i=categoryPosition+1;i<categoryOrder.length;i++){
      const nextIndex=sequence.indexOf(tokenForCategory(categoryOrder[i]));
      if(nextIndex>=0){insertAt=nextIndex;break}
    }
    sequence.splice(insertAt,0,token);
  }
  for(const row of rows){
    const key=rowKey(row),token=`${ITEM_PREFIX}${key}`;
    if(sequence.includes(token))continue;
    const category=rowCategory(row),headerIndex=sequence.indexOf(tokenForCategory(category));
    let insertAt=headerIndex>=0?headerIndex+1:sequence.length;
    while(insertAt<sequence.length){
      const candidateKey=itemFromToken(sequence[insertAt]);
      const candidate=candidateKey?rowByKey.get(candidateKey):null;
      if(!candidate||rowCategory(candidate)!==category)break;
      insertAt++;
    }
    sequence.splice(insertAt,0,token);
  }
  return {sequence,categoryOrder,rowByKey};
}
function headerHtml(id,count){
  const label=CATEGORIES[id]?.label||CATEGORIES.other.label;
  return `<div class="shopping-category-header"><button type="button" class="shopping-category-drag" aria-label="${label} verschieben" title="Kategorie verschieben">${dragIcon()}</button><div><strong>${label}</strong><small>${count} Artikel</small></div></div>`;
}
function blockHtml(id,count){
  return `<section class="shopping-category-block" data-category="${id}">${headerHtml(id,count)}<div class="shopping-category-items" data-category-items="${id}"></div></section>`;
}
function applySequence(list){
  const rows=allRows(list);
  if(!rows.length)return;
  rows.forEach(row=>{row.dataset.shopKey=rowKey(row);rowCategory(row);row.remove()});
  list.querySelectorAll(':scope > .shopping-category-block,:scope > .shopping-category-header').forEach(node=>node.remove());

  const state=readState(),normalized=normalizeSequence(rows,state);
  const counts=new Map();
  rows.forEach(row=>counts.set(rowCategory(row),(counts.get(rowCategory(row))||0)+1));
  const rowByToken=new Map(rows.map(row=>[tokenForRow(row),row]));
  const blocks=new Map();
  for(const category of normalized.categoryOrder){
    if(!counts.get(category))continue;
    const block=document.createRange().createContextualFragment(blockHtml(category,counts.get(category))).firstElementChild;
    blocks.set(category,block);
  }

  let activeBlock=null;
  for(const token of normalized.sequence){
    const category=categoryFromToken(token);
    if(category){
      const block=blocks.get(category);
      if(block){list.appendChild(block);activeBlock=block}
      continue;
    }
    const row=rowByToken.get(token);
    if(!row)continue;
    const categoryId=rowCategory(row);
    if(activeBlock?.dataset.category===categoryId){
      activeBlock.querySelector('.shopping-category-items')?.appendChild(row);
    }else{
      list.appendChild(row);
      activeBlock=null;
    }
  }
  for(const row of rows)if(!row.isConnected)list.appendChild(row);
  decorateRows(list);
  const currentState=readState();
  if(currentState.version!==VERSION||currentState.legacyOrder?.length||JSON.stringify(currentState.sequence)!==JSON.stringify(normalized.sequence))saveState(list);
}
function decorateRows(list){
  list.querySelectorAll('.shopping-row').forEach(row=>{
    ensureRowHandle(row);
    const parentBlock=row.closest('.shopping-category-block');
    const attached=!!parentBlock&&parentBlock.dataset.category===rowCategory(row);
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
function categoryBlocks(list){return [...list.querySelectorAll(':scope > .shopping-category-block')]}
function previousCategoryBlock(block){
  let node=block?.previousElementSibling;
  while(node){if(node.classList.contains('shopping-category-block'))return node;node=node.previousElementSibling}
  return null;
}
function nextCategoryBlock(block){
  let node=block?.nextElementSibling;
  while(node){if(node.classList.contains('shopping-category-block'))return node;node=node.nextElementSibling}
  return null;
}
function moveCategoryKeyboard(block,direction){
  const list=block?.parentElement;if(!list)return;
  if(direction<0){const previous=previousCategoryBlock(block);if(previous)previous.before(block)}
  else{const next=nextCategoryBlock(block);if(next)next.after(block)}
  queuePersist(list);
}
function keyboardMove(event){
  if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
  const handle=event.currentTarget;
  const block=handle.closest('.shopping-category-block');
  if(block&&handle.classList.contains('shopping-category-drag')){
    event.preventDefault();
    const list=block.parentElement;
    if(event.key==='ArrowUp')moveCategoryKeyboard(block,-1);
    else if(event.key==='ArrowDown')moveCategoryKeyboard(block,1);
    else if(event.key==='Home')list.prepend(block);
    else if(event.key==='End')list.append(block);
    queuePersist(list);handle.focus();return;
  }
  const row=handle.closest('.shopping-row'),container=row?.parentElement;
  if(!row||!container)return;
  event.preventDefault();
  const siblings=[...container.children].filter(node=>node.classList.contains('shopping-row'));
  const index=siblings.indexOf(row);
  if(event.key==='ArrowUp'&&index>0)container.insertBefore(row,siblings[index-1]);
  else if(event.key==='ArrowDown'&&index>=0&&index<siblings.length-1)siblings[index+1].after(row);
  else if(event.key==='Home')container.prepend(row);
  else if(event.key==='End')container.append(row);
  queuePersist(row.closest('.shopping-list'));
  handle.focus();
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
  handle.title=window.Sortable?'Ziehen zum Verschieben · Pfeiltasten funktionieren ebenfalls':'Mit Pfeiltasten verschieben';
  if(!handle.dataset.keyboardBound){handle.dataset.keyboardBound='1';handle.addEventListener('keydown',keyboardMove)}
}
function bindCategoryHandles(list){
  list.querySelectorAll('.shopping-category-drag').forEach(handle=>{
    if(handle.dataset.keyboardBound)return;
    handle.dataset.keyboardBound='1';
    handle.addEventListener('keydown',keyboardMove);
  });
}
function destroySortables(){
  if(layoutSortable){try{layoutSortable.destroy()}catch{}layoutSortable=null}
  itemSortables.forEach(instance=>{try{instance.destroy()}catch{}});
  itemSortables=[];
  activeList=null;
  document.body.classList.remove('shopping-drag-active');
}
function dragStart(){document.body.classList.add('shopping-drag-active')}
function dragEnd(list){
  document.body.classList.remove('shopping-drag-active');
  queuePersist(list);
  queueSync();
}
function canPutIntoCategory(to,from,dragEl){
  if(!dragEl?.classList.contains('shopping-row'))return false;
  const block=to.el.closest('.shopping-category-block');
  return !!block&&rowCategory(dragEl)===block.dataset.category;
}
function initSortables(list){
  if(activeList===list&&layoutSortable)return;
  destroySortables();
  activeList=list;
  bindCategoryHandles(list);
  if(!window.Sortable){
    console.warn('Drag & Drop ist nicht verfügbar; die Einkaufsliste bleibt per Tastatur sortierbar.');
    return;
  }

  layoutSortable=window.Sortable.create(list,{
    group:{name:SORT_GROUP,pull:true,put:(to,from,dragEl)=>dragEl?.classList.contains('shopping-row')},
    draggable:'.shopping-category-block,.shopping-row.shopping-is-loose',
    handle:'.shopping-category-drag,.shopping-drag-handle',
    animation:reducedMotion()?0:170,
    easing:'cubic-bezier(.2,.72,.25,1)',
    ghostClass:'shopping-sortable-ghost',
    chosenClass:'shopping-sortable-chosen',
    dragClass:'shopping-sortable-drag',
    forceFallback:false,
    fallbackOnBody:true,
    fallbackTolerance:4,
    swapThreshold:.58,
    scroll:true,
    scrollSensitivity:64,
    scrollSpeed:12,
    onStart:dragStart,
    onAdd:event=>{event.item.classList.add('shopping-is-loose');dragEnd(list)},
    onEnd:()=>dragEnd(list)
  });

  list.querySelectorAll('.shopping-category-items').forEach(items=>{
    const instance=window.Sortable.create(items,{
      group:{name:SORT_GROUP,pull:true,put:canPutIntoCategory},
      draggable:'.shopping-row',
      handle:'.shopping-drag-handle',
      animation:reducedMotion()?0:150,
      easing:'cubic-bezier(.2,.72,.25,1)',
      ghostClass:'shopping-sortable-ghost',
      chosenClass:'shopping-sortable-chosen',
      dragClass:'shopping-sortable-drag',
      forceFallback:false,
      fallbackOnBody:true,
      fallbackTolerance:4,
      swapThreshold:.6,
      scroll:true,
      scrollSensitivity:64,
      scrollSpeed:12,
      onStart:dragStart,
      onAdd:()=>dragEnd(list),
      onRemove:()=>dragEnd(list),
      onEnd:()=>dragEnd(list)
    });
    itemSortables.push(instance);
  });
}
function sync(){
  queued=false;
  if(isDragging()||isEditing())return;
  if(!isShoppingPage()){destroySortables();return}
  const list=document.querySelector('.shopping-list');
  if(!list){destroySortables();return}
  applySequence(list);
  bindCategoryHandles(list);
  initSortables(list);
}
function queueSync(){
  if(isDragging()||isEditing()||queued)return;
  queued=true;requestAnimationFrame(sync);
}

new MutationObserver(queueSync).observe(document.body,{childList:true,subtree:true,characterData:true});
window.addEventListener('popstate',queueSync);
queueSync();

window.GerdShoppingOrderDebug={
  readState,
  flatten:()=>{const list=document.querySelector('.shopping-list');return list?flattenDom(list):[]},
  categories:()=>{const list=document.querySelector('.shopping-list');return list?categoryBlocks(list).map(block=>block.dataset.category):[]}
};
})();