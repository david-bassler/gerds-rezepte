(()=>{
'use strict';

const STORAGE_KEY='gerds-shopping-order-v1';
const VERSION=2;
const CATEGORY_PREFIX='category:';
const ITEM_PREFIX='item:';
const DEFAULT_CATEGORY_ORDER=[
  'produce','bakery','meat','fish','dairy','chilled','pantry','canned','baking','spices','sauces','drinks','frozen','other'
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
  other:{label:'Sonstiges'}
};

let queued=false;
let sortable=null;
let activeList=null;
let dragInfo=null;

function isShoppingPage(){return location.hash==='#einkaufsliste'||document.body.dataset.route==='shopping'}
function isDragging(){return document.body.classList.contains('shopping-drag-active')}
function isEditing(){return !!document.querySelector('.shopping-row.is-editing')}
function reducedMotion(){return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches}
function norm(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim()}
function rowsOf(list){return [...list.querySelectorAll(':scope > .shopping-row')]}
function headersOf(list){return [...list.querySelectorAll(':scope > .shopping-category-header')]}
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
  if(has('rind','kalb','schwein','lamm','hammel','huhn','huhner','hahn','pute','truthahn','ente','gans','wild','reh','hirsch','kaninchen','hackfleisch','mett','speck','bacon','schinken','salami','wurst','leber','kasseler','filetsteak','schnitzel','kotelett','roulade'))return 'meat';
  if(has('fisch','lachs','forelle','kabeljau','dorsch','seelachs','heilbutt','zander','barsch','hering','makrele','sardine','thunfisch','seezunge','aal','garnele','shrimp','scampi','krebs','krabbe','hummer','languste','muschel','vongole','tintenfisch','calamari','oktopus'))return 'fish';
  if(has('apfel','birne','banane','zitrone','limette','orange','mandarine','clementine','grapefruit','beere','erdbeer','himbeer','brombeer','johannisbeer','heidelbeer','kirsche','pfirsich','aprikose','pflaume','zwetschge','traube','melone','ananas','mango','kiwi','avocado','feige','granatapfel','kartoffel','zwiebel','knoblauch','schalotte','lauch','porree','mohre','karotte','sellerie','paprika','tomate','gurke','zucchini','aubergine','kohl','blumenkohl','brokkoli','spargel','bohne','erbse','spinat','mangold','salat','rucola','radicchio','fenchel','kurbis','rettich','radies','rote bete','chicoree','artischocke','chili','peperoni','champignon','pilz','steinpilz','pfifferling','petersilie','schnittlauch','basilikum','dill','koriander','minze','thymian','rosmarin','salbei','estragon','kerbel','majoran','kresse'))return 'produce';
  if(has('brot','toast','brotchen','baguette','ciabatta','croissant','brezel','fladenbrot','pumpernickel'))return 'bakery';
  if(has('milch','butter','sahne','schmand','saure sahne','creme fraiche','creme double','quark','joghurt','yoghurt','kefir','buttermilch','eigelb','eiweiss','eiklar','parmesan','pecorino','mozzarella','feta','gouda','emmentaler','gruyere','cheddar','camembert','brie','ricotta','mascarpone','frischkase','gorgonzola','roquefort')||word('ei')||word('eier')||word('kase'))return 'dairy';
  if(has('tofu','frische pasta','frischer blatterteig','frischer pizzateig','fertigteig','hefeteig','murbeteig')||word('gnocchi'))return 'chilled';
  if(has('olivenol','olivenoel','sonnenblumenol','sonnenblumenoel','rapsol','rapsoel','erdnussol','erdnussoel','sesamol','sesamoel','walnussol','walnussoel','truffelol','truffeloel','essig','senf','ketchup','mayonnaise','mayo','sojasauce','sojasosse','worcester','tabasco','sambal','chilisauce','fischsauce','austernsauce','pesto','dressing')||word('ol')||word('oel'))return 'sauces';
  if(has('dosentomate','tomatenmark','kapern','cornichon','gewurzgurke','eingelegt','konserve','artischockenherz')||word('dose')||word('glas')||word('olive')||word('oliven')||word('sardelle')||word('sardellen'))return 'canned';
  if(has('mehl','zucker','puderzucker','vanillezucker','backpulver','natron','starke','speisestarke','kakao','schokolade','kuverture','gelatine','hefe','mandel','haselnuss','walnuss','pekannuss','pistazie','kokos','rosine','korinthe','marzipan','nougat','honig','sirup'))return 'baking';
  if(has('paprikapulver','curry','kurkuma','muskat','zimt','nelke','kardamom','kreuzkummel','koriandersaat','senfkorn','lorbeer','wacholder','safran','gewurz','chilipulver','cayenne','vanille','bruhwurfel','bruhe','fond')||word('salz')||word('pfeffer')||word('kummel'))return 'spices';
  if(has('champagner','prosecco','sherry','portwein','cognac','brandy','wodka','whisky','likor','mineralwasser','limonade')||word('wein')||word('bier')||word('sekt')||word('rum')||word('saft')||word('wasser')||word('cola'))return 'drinks';
  if(has('nudel','pasta','spaghetti','tagliatelle','penne','makaroni','lasagne','risotto','couscous','bulgur','polenta','linsen','kichererbse','quinoa','haferflocke','gries','griess','paniermehl','semmelbrosel')||word('reis'))return 'pantry';
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
function saveState(list){
  const previous=readState();
  const sequence=[...list.children].map(el=>{
    if(el.classList.contains('shopping-category-header'))return tokenForCategory(el.dataset.category);
    if(el.classList.contains('shopping-row'))return tokenForRow(el);
    return '';
  }).filter(Boolean);
  const visibleOrder=sequence.map(categoryFromToken).filter(Boolean);
  const categoryOrder=[...visibleOrder,...normalizedCategoryOrder(previous.categoryOrder).filter(id=>!visibleOrder.includes(id))];
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:VERSION,categoryOrder,sequence}))}
  catch(error){console.warn('Reihenfolge der Einkaufsliste konnte nicht gespeichert werden.',error)}
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
  return `<div class="shopping-category-header" data-category="${id}"><button type="button" class="shopping-category-drag" aria-label="${label} verschieben" title="Kategorie verschieben">${dragIcon()}</button><div><strong>${label}</strong><small>${count} Artikel</small></div></div>`;
}
function applySequence(list){
  const rows=rowsOf(list);
  if(!rows.length)return;
  rows.forEach(row=>{row.dataset.shopKey=rowKey(row);rowCategory(row)});
  list.querySelectorAll(':scope > .shopping-category-header').forEach(header=>header.remove());
  const state=readState(),normalized=normalizeSequence(rows,state);
  const counts=new Map();
  rows.forEach(row=>counts.set(rowCategory(row),(counts.get(rowCategory(row))||0)+1));
  const nodes=new Map(rows.map(row=>[tokenForRow(row),row]));
  for(const category of normalized.categoryOrder){
    if(counts.get(category))nodes.set(tokenForCategory(category),document.createRange().createContextualFragment(headerHtml(category,counts.get(category))).firstElementChild);
  }
  normalized.sequence.forEach(token=>{const node=nodes.get(token);if(node)list.appendChild(node)});
  decorateRows(list);
  const currentState=readState();
  if(currentState.version!==VERSION||currentState.legacyOrder?.length||JSON.stringify(currentState.sequence)!==JSON.stringify(normalized.sequence))saveState(list);
}
function decorateRows(list){
  let activeCategory=null;
  for(const child of [...list.children]){
    if(child.classList.contains('shopping-category-header')){activeCategory=child.dataset.category;continue}
    if(!child.classList.contains('shopping-row'))continue;
    ensureRowHandle(child);
    const category=rowCategory(child);
    const attached=activeCategory===category;
    child.classList.toggle('shopping-is-loose',!attached);
    let badge=child.querySelector('.shopping-category-badge');
    if(!attached){
      if(!badge){
        badge=document.createElement('span');
        badge.className='shopping-category-badge';
        const name=child.querySelector('.shopping-name');
        name?.appendChild(badge);
      }
      if(badge)badge.textContent=CATEGORIES[category]?.label||CATEGORIES.other.label;
      activeCategory=null;
    }else badge?.remove();
  }
}
function attachedRows(header){
  const id=header?.dataset.category,rows=[];
  let node=header?.nextElementSibling;
  while(node?.classList.contains('shopping-row')&&rowCategory(node)===id){rows.push(node);node=node.nextElementSibling}
  return rows;
}
function categoryBlock(header){return [header,...attachedRows(header)]}
function previousCategoryHeader(node){
  let current=node?.previousElementSibling;
  while(current){if(current.classList.contains('shopping-category-header'))return current;current=current.previousElementSibling}
  return null;
}
function nextCategoryHeader(node){
  let current=node?.nextElementSibling;
  while(current){if(current.classList.contains('shopping-category-header'))return current;current=current.nextElementSibling}
  return null;
}
function normalizeDroppedRow(row){
  if(!row)return;
  const previous=previousCategoryHeader(row);
  if(!previous||previous.dataset.category===rowCategory(row))return;
  let next=row.nextElementSibling,last=null;
  while(next&&!next.classList.contains('shopping-category-header')){
    if(next.classList.contains('shopping-row')&&rowCategory(next)===previous.dataset.category){last=next;next=next.nextElementSibling;continue}
    break;
  }
  if(last)last.after(row);
}
function normalizeDroppedHeader(header){
  if(!header)return;
  const previous=previousCategoryHeader(header);
  if(!previous)return;
  const prevCategory=previous.dataset.category;
  let after=header.nextElementSibling;
  if(!(after?.classList.contains('shopping-row')&&rowCategory(after)===prevCategory))return;
  let last=after;
  while(last.nextElementSibling?.classList.contains('shopping-row')&&rowCategory(last.nextElementSibling)===prevCategory)last=last.nextElementSibling;
  last.after(header);
}
function persistDomOrder(list){decorateRows(list);saveState(list)}
function moveCategoryKeyboard(header,direction){
  const list=header?.parentElement;if(!list)return;
  const block=categoryBlock(header);
  if(direction<0){
    const previous=previousCategoryHeader(header);if(!previous)return;
    previous.before(...block);
  }else{
    const next=nextCategoryHeader(block[block.length-1]);if(!next)return;
    const nextBlock=categoryBlock(next),last=nextBlock[nextBlock.length-1];
    last.after(...block);
  }
  persistDomOrder(list);
}
function keyboardMove(event){
  if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
  const handle=event.currentTarget;
  const header=handle.closest('.shopping-category-header');
  if(header){
    event.preventDefault();
    if(event.key==='ArrowUp')moveCategoryKeyboard(header,-1);
    else if(event.key==='ArrowDown')moveCategoryKeyboard(header,1);
    else if(event.key==='Home'){const block=categoryBlock(header);header.parentElement.prepend(...block);persistDomOrder(header.parentElement)}
    else if(event.key==='End'){const block=categoryBlock(header);header.parentElement.append(...block);persistDomOrder(header.parentElement)}
    handle.focus();return;
  }
  const row=handle.closest('.shopping-row'),list=row?.parentElement;
  if(!row||!list)return;
  event.preventDefault();
  if(event.key==='ArrowUp'){const previous=row.previousElementSibling;if(previous)list.insertBefore(row,previous)}
  else if(event.key==='ArrowDown'){const next=row.nextElementSibling;if(next)list.insertBefore(row,next.nextElementSibling)}
  else if(event.key==='Home')list.prepend(row);
  else if(event.key==='End')list.append(row);
  normalizeDroppedRow(row);
  persistDomOrder(list);
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
function destroySortable(){
  if(sortable){try{sortable.destroy()}catch{}sortable=null}
  activeList=null;dragInfo=null;
  document.body.classList.remove('shopping-drag-active');
}
function initSortable(list){
  if(activeList===list&&sortable)return;
  destroySortable();activeList=list;bindCategoryHandles(list);
  if(!window.Sortable){console.warn('Drag & Drop ist nicht verfügbar; die Einkaufsliste bleibt per Tastatur sortierbar.');return}
  sortable=window.Sortable.create(list,{
    draggable:'.shopping-category-header,.shopping-row',
    handle:'.shopping-category-drag,.shopping-drag-handle',
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
    onStart(event){
      document.body.classList.add('shopping-drag-active');
      const item=event.item;
      dragInfo=item.classList.contains('shopping-category-header')
        ?{type:'category',category:item.dataset.category,attachedKeys:attachedRows(item).map(rowKey)}
        :{type:'item',key:rowKey(item)};
    },
    onEnd(event){
      const item=event.item;
      if(dragInfo?.type==='category'){
        normalizeDroppedHeader(item);
        let anchor=item;
        for(const key of dragInfo.attachedKeys||[]){
          const row=rowsOf(list).find(candidate=>rowKey(candidate)===key);
          if(row){anchor.after(row);anchor=row}
        }
      }else normalizeDroppedRow(item);
      persistDomOrder(list);
      dragInfo=null;
      document.body.classList.remove('shopping-drag-active');
      queueSync();
    }
  });
}
function sync(){
  queued=false;
  if(isDragging()||isEditing())return;
  if(!isShoppingPage()){destroySortable();return}
  const list=document.querySelector('.shopping-list');
  if(!list){destroySortable();return}
  applySequence(list);
  bindCategoryHandles(list);
  initSortable(list);
}
function queueSync(){
  if(isDragging()||isEditing()||queued)return;
  queued=true;requestAnimationFrame(sync);
}
new MutationObserver(queueSync).observe(document.body,{childList:true,subtree:true,characterData:true});
window.addEventListener('popstate',queueSync);
queueSync();
})();