(()=>{
'use strict';
const DATA=window.GERDS_REZEPTE;
const RecipeCard=window.GerdRecipeCard;
if(!DATA||!RecipeCard)return;

const DB_NAME='gerds-rezepte';
const DB_VERSION=4;
const FAVORITES='favorites';
const SHOPPING='shopping';
const PLANS='recipePlans';
const NOTES='recipeNotes';
const TIMERS='timers';
let dbPromise=null;
let favorites=new Set();
let shopping=[];
let plans=new Map();
let recipeNotes=new Map();
let plansReady=false;
let notesReady=false;
let persistTimer=null;
let persistChain=Promise.resolve();
const noteSaveTimers=new Map();
let notePersistChain=Promise.resolve();

const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();
const fmt=n=>new Intl.NumberFormat('de-DE',{maximumFractionDigits:2}).format(n);

function openDb(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(FAVORITES))db.createObjectStore(FAVORITES,{keyPath:'recipeId'});
      if(!db.objectStoreNames.contains(SHOPPING))db.createObjectStore(SHOPPING,{keyPath:'key'});
      if(!db.objectStoreNames.contains(PLANS))db.createObjectStore(PLANS,{keyPath:'recipeId'});
      if(!db.objectStoreNames.contains(NOTES))db.createObjectStore(NOTES,{keyPath:'recipeId'});
      if(!db.objectStoreNames.contains(TIMERS))db.createObjectStore(TIMERS,{keyPath:'id'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return dbPromise;
}
async function getAll(store){const db=await openDb();return new Promise((resolve,reject)=>{const req=db.transaction(store,'readonly').objectStore(store).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error)})}
async function put(store,value){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
async function del(store,key){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
async function clear(store){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).clear();tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
async function replaceAll(store,values){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite'),os=tx.objectStore(store);os.clear();values.forEach(value=>os.put(value));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}

const UNIT_ALIASES={
  'st':'Stk.','st.':'Stk.','stk':'Stk.','stück':'Stk.','stueck':'Stk.',
  'g':'g','gr':'g','gramm':'g','kg':'kg',
  'ml':'ml','cl':'cl','l':'L','liter':'L',
  'el':'EL','tl':'TL','msp':'Msp.','msp.':'Msp.',
  'zwg':'Zweig','bd':'Bund','bund':'Bund','spritz':'Spritzer','scheib.':'Scheibe'
};
function canonicalUnit(unit){const raw=String(unit||'').trim();return UNIT_ALIASES[raw.toLowerCase()]||raw}
const UNIT_MAP={
  g:{dimension:'mass',factor:1,unit:'g'},kg:{dimension:'mass',factor:1000,unit:'g'},
  ml:{dimension:'volume',factor:1,unit:'ml'},cl:{dimension:'volume',factor:10,unit:'ml'},L:{dimension:'volume',factor:1000,unit:'ml'},
  EL:{dimension:'tablespoon',factor:1,unit:'EL'},TL:{dimension:'teaspoon',factor:1,unit:'TL'},'Msp.':{dimension:'knifeTip',factor:1,unit:'Msp.'},Prise:{dimension:'pinch',factor:1,unit:'Prise'},Spritzer:{dimension:'splash',factor:1,unit:'Spritzer'},
  'Stk.':{dimension:'count',factor:1,unit:'Stück'},Blatt:{dimension:'leaf',factor:1,unit:'Blatt'},Zweig:{dimension:'sprig',factor:1,unit:'Zweig'},Bund:{dimension:'bunch',factor:1,unit:'Bund'},Scheibe:{dimension:'slice',factor:1,unit:'Scheibe'},'Dösch.':{dimension:'pack',factor:1,unit:'Döschen'},Ds:{dimension:'can',factor:1,unit:'Dose'},Beet:{dimension:'bed',factor:1,unit:'Beet'}
};

function canonicalArticle(article){
  const raw=String(article||'').trim(),a=norm(raw);
  const m=a.match(/^(?:eier|ei(?: er)?) (?:grosse|groesse|klasse|gr|kl) (s|m|l|xl)$/);
  if(m)return `Eier Größe ${m[1].toUpperCase()}`;
  return raw;
}
function qtyRange(q,factor){if(!q)return null;if(q.kind==='number')return {min:q.value*factor,max:q.value*factor};if(q.kind==='range')return {min:q.min*factor,max:q.max*factor};return null}
function normalizedAmount(ingredient,factor){
  const basis=ingredient.quantityBasis||{};
  const range=qtyRange(ingredient.purchaseQuantity||ingredient.quantity,factor);
  const unit=canonicalUnit(ingredient.purchaseUnit||ingredient.unit);
  const meta={basis:basis.purchase||'',purchaseKnown:basis.purchaseKnown!==false,approximate:!!basis.approximate};
  if(!range)return {dimension:'text',unit:'',min:null,max:null,text:ingredient.quantity?.text||'nach Bedarf',...meta};
  const m=UNIT_MAP[unit];
  if(!m)return {dimension:`unit:${unit}`,unit:unit||'',min:range.min,max:range.max,text:'',...meta};
  return {dimension:m.dimension,unit:m.unit,min:range.min*m.factor,max:range.max*m.factor,text:'',...meta};
}

// Rezeptbezeichnung und Einkaufsartikel sind absichtlich getrennt.
// Nur sichere, im Archiv tatsächlich vorkommende Alias-Gruppen werden zusammengeführt.
function resolvePurchase(article){
  const raw=canonicalArticle(article),a=norm(raw);
  if(/(?:^| )(eigelb|eigelbe|eiweiss|eiklar|vollei|ei|eier)(?: |$)/.test(a)){
    let component='whole';
    if(/(?:^| )(eigelb|eigelbe)(?: |$)/.test(a))component='yolk';
    else if(/(?:^| )(eiweiss|eiklar)(?: |$)/.test(a))component='white';
    return {id:'eier',article:'Eier',kind:'eggs',component};
  }
  if(a.includes('knoblauch')&&!a.includes('crouton'))return {id:'knoblauch',article:'Knoblauch',kind:'generic'};
  const genericOnion=/^(?:zwiebel|zwiebeln|zwiebelwurfel|zwiebelscheiben)(?: |$)/.test(a)&&!/(fruhlings|rote |perl|rost|spick|metzger|knoblauch|schalott|suppengemuse)/.test(a);
  if(genericOnion)return {id:'zwiebeln',article:'Zwiebeln',kind:'generic'};
  if(/^parmesan(?: |$)/.test(a))return {id:'parmesan',article:'Parmesan',kind:'generic'};
  if(/^(?:frische )?sahne(?: |$)/.test(a)&&!a.includes(' oder ')&&!a.includes('sosse')&&!a.includes('bechamel'))return {id:'sahne',article:'Sahne',kind:'generic'};
  return {id:`artikel:${norm(raw)}`,article:raw,kind:'generic'};
}
function purchaseKey(purchase){return `purchase:${purchase.id}`}
function normalizeContributionAmount(purchase,article,amount){
  const a=norm(article),out={...amount};
  if(purchase.id==='knoblauch'&&amount.dimension==='count'){
    if(a.includes('zehe'))return {...out,dimension:'garlicClove',unit:'Zehen'};
    return {...out,dimension:'garlicBulb',unit:'Knollen'};
  }
  return out;
}
function contributionId(recipeId,tableKey,index){return `${recipeId}::${tableKey}::${index}`}
function sourceCount(item){return new Set((item.contributions||[]).flatMap(c=>c.sourceIds?.length?c.sourceIds:[c.recipeId]).filter(Boolean)).size}
function isManualShoppingItem(item){return !!(item&&(item.manual===true||item.kind==='manual'||String(item.key||'').startsWith('manual:')))}
function manualShoppingKey(){
  const uuid=globalThis.crypto?.randomUUID?.();
  return `manual:${uuid||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}
function normalizeManualShoppingItem(item){
  return {
    ...item,key:item.key||manualShoppingKey(),manual:true,kind:'manual',purchaseId:null,
    article:String(item.article||'').trim(),manualAmount:String(item.manualAmount||'').trim(),
    contributions:[],amounts:[],note:'',done:!!item.done,
    createdAt:item.createdAt||Date.now(),updatedAt:item.updatedAt||Date.now()
  };
}

function recipeById(id){return DATA.recipes.find(r=>r.id===id)}
function defaultTarget(recipe){return recipe.scaleType==='factor'?1:recipe.baseScale}
function clampTarget(recipe,value){
  const min=recipe.scaleType==='batch'?0.1:recipe.scaleType==='factor'?0.25:1;
  const max=recipe.scaleType==='factor'?20:100;
  value=Number(value);
  if(!Number.isFinite(value))value=defaultTarget(recipe);
  return Math.min(max,Math.max(min,value));
}
function plannedTarget(recipe){const plan=plans.get(recipe.id);return plan&&Number.isFinite(plan.target)?clampTarget(recipe,plan.target):defaultTarget(recipe)}
function planRecord(recipe,target){return {recipeId:recipe.id,target:clampTarget(recipe,target),scaleType:recipe.scaleType,updatedAt:Date.now()}}
function tableFactor(table,target,main){if(main.scaleType==='factor')return target;if(main.scaleType==='portions'&&table.scaleType==='portions')return target/table.baseScale;return target/main.baseScale}
function targetFromFactor(table,factor,main){if(main.scaleType==='factor')return factor;if(main.scaleType==='portions'&&table.scaleType==='portions')return factor*table.baseScale;return factor*main.baseScale}

function sourceRefFromContribution(contribution){
  const src=contribution?.sourceRef;
  if(src?.recipeId&&src?.tableKey&&Number.isInteger(Number(src.ingredientIndex)))return {recipeId:src.recipeId,tableKey:src.tableKey,ingredientIndex:Number(src.ingredientIndex)};
  const m=String(contribution?.id||'').match(/^(.*?)::(main|sub:\d+)::(\d+)$/);
  return m?{recipeId:m[1],tableKey:m[2],ingredientIndex:Number(m[3])}:null;
}
function sourceFromRef(ref){
  if(!ref)return null;
  const recipe=recipeById(ref.recipeId);if(!recipe)return null;
  const table=ref.tableKey==='main'?recipe:recipe.subrecipes[Number(String(ref.tableKey).split(':')[1])];
  const ingredient=table?.ingredients?.[ref.ingredientIndex];
  return table&&ingredient?{ref,recipe,table,ingredient}:null;
}
function materializeContribution(contribution){
  const source=sourceFromRef(sourceRefFromContribution(contribution));
  if(source){
    const purchase=resolvePurchase(source.ingredient.article);
    const factor=tableFactor(source.table,plannedTarget(source.recipe),source.recipe);
    const amount=normalizeContributionAmount(purchase,source.ingredient.article,normalizedAmount(source.ingredient,factor));
    const stored={
      id:contribution.id||contributionId(source.recipe.id,source.ref.tableKey,source.ref.ingredientIndex),
      recipeId:source.recipe.id,
      sourceRef:source.ref,
      article:source.ingredient.article,
      component:purchase.component||'whole'
    };
    if(Array.isArray(contribution.sourceIds)&&contribution.sourceIds.length)stored.sourceIds=[...contribution.sourceIds];
    return {purchase,stored,resolved:{...stored,amount}};
  }
  if(!contribution?.article)return null;
  const purchase=resolvePurchase(contribution.article);
  const amount=normalizeContributionAmount(purchase,contribution.article,contribution.amount||{dimension:'text',unit:'',min:null,max:null,text:'nach Bedarf'});
  return {purchase,stored:{...contribution,component:contribution.component||purchase.component||'whole'},resolved:{...contribution,component:contribution.component||purchase.component||'whole',amount}};
}
function inferTargetFromSnapshot(contribution){
  if(!contribution?.amount)return null;
  const source=sourceFromRef(sourceRefFromContribution(contribution));if(!source)return null;
  const purchase=resolvePurchase(source.ingredient.article);
  const base=normalizeContributionAmount(purchase,source.ingredient.article,normalizedAmount(source.ingredient,1));
  const old=normalizeContributionAmount(purchase,source.ingredient.article,contribution.amount);
  if(base.dimension!==old.dimension||base.unit!==old.unit)return null;
  let factor=null;
  if(Number.isFinite(base.min)&&Math.abs(base.min)>.000001&&Number.isFinite(old.min))factor=old.min/base.min;
  else if(Number.isFinite(base.max)&&Math.abs(base.max)>.000001&&Number.isFinite(old.max))factor=old.max/base.max;
  if(!Number.isFinite(factor)||factor<=0)return null;
  return clampTarget(source.recipe,targetFromFactor(source.table,factor,source.recipe));
}

function mergeRanges(list){
  let min=0,max=0,has=false;
  for(const x of list){if(Number.isFinite(x.min)&&Number.isFinite(x.max)){min+=x.min;max+=x.max;has=true}}
  return has?{min,max}:null;
}
function genericAggregate(contributions){
  const groups=new Map(),texts=[];
  let hasUnknownNet=false,hasUnknownDrained=false;
  for(const c of contributions){
    const a=c.amount||{};
    if(a.purchaseKnown===false&&a.basis==='net')hasUnknownNet=true;
    if(a.purchaseKnown===false&&a.basis==='drained')hasUnknownDrained=true;
    if(Number.isFinite(a.min)&&Number.isFinite(a.max)){
      // Netto-/Abtropfgewichte dürfen nicht mit normalen Kaufmengen verrechnet werden.
      const safeBasis=a.basis==='net'||a.basis==='drained'?a.basis:'purchase';
      const id=`${a.dimension}::${a.unit}::${safeBasis}`;
      const g=groups.get(id)||{dimension:a.dimension,unit:a.unit,min:0,max:0,basis:a.basis||'',purchaseKnown:a.purchaseKnown!==false,approximate:false,hasPlainBasis:false};
      g.min+=a.min;g.max+=a.max;g.purchaseKnown=g.purchaseKnown&&a.purchaseKnown!==false;g.approximate=g.approximate||!!a.approximate;
      if(!a.basis)g.hasPlainBasis=true;
      if(g.hasPlainBasis&&g.basis==='gross')g.basis='';
      else if(!g.basis&&a.basis==='gross'&&!g.hasPlainBasis)g.basis='gross';
      groups.set(id,g);
    }else if(a.text&&!texts.includes(a.text))texts.push(a.text);
  }
  const amounts=[...groups.values()];
  if(texts.length)amounts.push({dimension:'text',unit:'',min:null,max:null,text:texts.join('; ')});
  const notes=[];
  if(hasUnknownNet)notes.push('Nettoangabe – Einkaufsmenge ggf. höher');
  if(hasUnknownDrained)notes.push('Abtropfgewicht – Packungsgewicht ggf. höher');
  return {amounts,note:notes.join(' · ')};
}
function eggEquivalent(contribution){
  const a=contribution.amount||{},component=contribution.component||'whole';
  if(Number.isFinite(a.min)&&Number.isFinite(a.max)){
    if(a.dimension==='count')return {min:a.min,max:a.max};
    if(a.dimension==='mass'){
      const gramsPerEgg=component==='yolk'?20:component==='white'?30:50;
      return {min:a.min/gramsPerEgg,max:a.max/gramsPerEgg};
    }
  }
  return null;
}
function eggAggregate(contributions){
  const buckets={whole:[],yolk:[],white:[]};
  for(const c of contributions){const eq=eggEquivalent(c);if(eq)buckets[c.component||'whole'].push(eq)}
  const whole=mergeRanges(buckets.whole)||{min:0,max:0};
  const yolk=mergeRanges(buckets.yolk)||{min:0,max:0};
  const white=mergeRanges(buckets.white)||{min:0,max:0};
  const min=Math.ceil(whole.min+Math.max(yolk.min,white.min)-1e-9);
  const max=Math.ceil(whole.max+Math.max(yolk.max,white.max)-1e-9);
  const parts=[];
  if(whole.max)parts.push(`${whole.min===whole.max?fmt(whole.min):`${fmt(whole.min)}–${fmt(whole.max)}`} ganze`);
  if(yolk.max)parts.push(`${yolk.min===yolk.max?fmt(yolk.min):`${fmt(yolk.min)}–${fmt(yolk.max)}`} Eigelb`);
  if(white.max)parts.push(`${white.min===white.max?fmt(white.min):`${fmt(white.min)}–${fmt(white.max)}`} Eiweiß`);
  const unresolved=contributions.some(c=>!eggEquivalent(c));
  return {amounts:[{dimension:'count',unit:'Stück',min,max,text:''}],note:parts.length?`${parts.join(' + ')}${unresolved?' · weitere Angabe nach Bedarf':''}`:(unresolved?'nach Bedarf':'')};
}
function buildPurchaseItem(purchase,entries,previous={}){
  const resolved=entries.map(entry=>entry.resolved);
  const aggregate=purchase.kind==='eggs'?eggAggregate(resolved):genericAggregate(resolved);
  return {
    key:purchaseKey(purchase),purchaseId:purchase.id,article:purchase.article,kind:purchase.kind,
    contributions:entries.map(entry=>entry.stored),amounts:aggregate.amounts,note:aggregate.note,done:previous.done||false,
    createdAt:previous.createdAt||Date.now(),updatedAt:Date.now()
  };
}
function rebuildShoppingFromContributions(contributions,previousItems=[]){
  const previous=new Map(previousItems.map(item=>[item.key,item]));
  const grouped=new Map();
  for(const contribution of contributions){
    const entry=materializeContribution(contribution);if(!entry)continue;
    const key=purchaseKey(entry.purchase),bucket=grouped.get(key)||{purchase:entry.purchase,entries:[]};
    bucket.entries.push(entry);grouped.set(key,bucket);
  }
  return [...grouped.entries()].map(([key,bucket])=>buildPurchaseItem(bucket.purchase,bucket.entries,previous.get(key)||{}));
}
function rebuildShoppingWithManual(contributions,previousItems=shopping){
  const recipeItems=previousItems.filter(item=>!isManualShoppingItem(item));
  const manualItems=previousItems.filter(isManualShoppingItem).map(normalizeManualShoppingItem);
  return [...rebuildShoppingFromContributions(contributions,recipeItems),...manualItems];
}
function rebuildShoppingFromSources(items=shopping){
  return rebuildShoppingWithManual(items.filter(item=>!isManualShoppingItem(item)).flatMap(item=>item.contributions||[]),items);
}

function contributionFromLegacy(item,index){
  const purchase=resolvePurchase(item.article);
  let amount={dimension:item.dimension||'text',unit:item.unit||'',min:item.min,max:item.max,text:item.text||''};
  if(purchase.kind==='eggs'&&amount.dimension==='mass'&&amount.unit==='g'&&Number.isFinite(amount.min)&&Number.isFinite(amount.max)&&/(?:^| )(ei|eier)(?: |$)/.test(norm(item.article))){
    amount={dimension:'count',unit:'Stück',min:amount.min/50,max:amount.max/50,text:''};
  }
  return {id:`legacy:${item.key||index}`,recipeId:(item.sources||[])[0]||'',sourceIds:item.sources||[],legacyDone:!!item.done,article:item.article,component:purchase.component||'whole',amount:normalizeContributionAmount(purchase,item.article,amount)};
}
async function migrateShopping(items){
  const contributions=[],manualItems=[];
  let needsWrite=false;
  items.forEach((item,index)=>{
    if(isManualShoppingItem(item)){manualItems.push(normalizeManualShoppingItem(item));return}
    if(Array.isArray(item.contributions)&&item.purchaseId)item.contributions.forEach(c=>contributions.push(c));
    else{contributions.push(contributionFromLegacy(item,index));needsWrite=true}
  });

  const seededPlans=[];
  for(const contribution of contributions){
    const ref=sourceRefFromContribution(contribution);
    if(!ref||plans.has(ref.recipeId))continue;
    const recipe=recipeById(ref.recipeId),target=inferTargetFromSnapshot(contribution);
    if(recipe&&Number.isFinite(target)){
      const record=planRecord(recipe,target);
      plans.set(recipe.id,record);seededPlans.push(record);
    }
  }
  if(seededPlans.length)await Promise.all(seededPlans.map(record=>put(PLANS,record)));

  const recipeItems=items.filter(item=>!isManualShoppingItem(item));
  const out=[...rebuildShoppingFromContributions(contributions,recipeItems),...manualItems];
  const upgradedRefs=contributions.some(c=>sourceRefFromContribution(c)&&(!c.sourceRef||c.amount));
  if(needsWrite||upgradedRefs||recipeItems.some(x=>!x.purchaseId)||items.length!==out.length)await replaceAll(SHOPPING,out);
  return out;
}
function formatAmountPart(item){
  if(Number.isFinite(item.min)){
    let min=item.min,max=item.max,unit=item.unit;
    if(item.dimension==='mass'&&min>=1000&&max>=1000){min/=1000;max/=1000;unit='kg'}
    else if(item.dimension==='volume'&&min>=1000&&max>=1000){min/=1000;max/=1000;unit='L'}
    const q=Math.abs(max-min)<.0001?fmt(min):`${fmt(min)}–${fmt(max)}`;
    const prefix=item.approximate?'ca. ':'';
    const suffix=item.basis==='net'?' netto':item.basis==='drained'?' Abtropfgewicht':item.basis==='gross'?' brutto':'';
    return `${prefix}${q}${unit?` ${unit}`:''}${suffix}`;
  }
  return item.text||'nach Bedarf';
}
function displayAmount(item){
  if(isManualShoppingItem(item))return item.manualAmount||'';
  return (item.amounts||[]).map(formatAmountPart).join(' + ')||'nach Bedarf';
}

function persistStateSnapshot(){
  const shoppingSnapshot=shopping.map(item=>({...item,contributions:(item.contributions||[]).map(c=>({...c,sourceRef:c.sourceRef?{...c.sourceRef}:undefined,amount:c.amount?{...c.amount}:undefined})),amounts:(item.amounts||[]).map(a=>({...a}))}));
  const planSnapshot=[...plans.values()].map(p=>({...p}));
  const task=persistChain.then(async()=>{
    await Promise.all(planSnapshot.map(record=>put(PLANS,record)));
    await replaceAll(SHOPPING,shoppingSnapshot);
  });
  persistChain=task.catch(()=>{});
  return task;
}
function queueStatePersist(recipe,{immediate=false}={}){
  if(recipe)plans.set(recipe.id,planRecord(recipe,plannedTarget(recipe)));
  if(persistTimer){clearTimeout(persistTimer);persistTimer=null}
  const write=()=>persistStateSnapshot().catch(error=>console.warn('Kochplan oder Einkaufsliste konnte nicht gespeichert werden.',error));
  if(immediate)write();else persistTimer=setTimeout(write,140);
}
function updatePlanFromDetail(recipe,value,{immediate=false}={}){
  const target=clampTarget(recipe,value),previous=plans.get(recipe.id)?.target;
  if(Number.isFinite(previous)&&Math.abs(previous-target)<.000001){if(immediate)queueStatePersist(recipe,{immediate:true});return}
  plans.set(recipe.id,planRecord(recipe,target));
  shopping=rebuildShoppingFromSources(shopping);
  syncShoppingControls();
  if(currentListRoute()==='shopping')renderShopping();
  queueStatePersist(recipe,{immediate});
}

function syncCardFavoriteButton(button,id){const saved=favorites.has(id),label=saved?'Aus Favoriten entfernen':'Zu Favoriten hinzufügen';button.classList.toggle('is-saved',saved);button.textContent=saved?'★':'☆';button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(saved));button.title=label}
function syncDetailFavoriteButton(button,id){const saved=favorites.has(id),label=saved?'Aus Favoriten entfernen':'Als Favorit speichern';button.classList.toggle('is-saved',saved);button.textContent=saved?'★ Gespeichert':'☆ Als Favorit speichern';button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(saved));button.title=label}
function syncFavoriteControls(id){document.querySelectorAll('[data-favorite]').forEach(button=>{if(button.dataset.favorite===id)syncCardFavoriteButton(button,id)});document.querySelectorAll('[data-detail-favorite]').forEach(button=>{if(button.dataset.detailFavorite===id)syncDetailFavoriteButton(button,id)})}
async function toggleFavorite(id){
  const wasSaved=favorites.has(id);
  if(wasSaved)favorites.delete(id);else favorites.add(id);
  updateCounts();syncFavoriteControls(id);
  try{if(wasSaved)await del(FAVORITES,id);else await put(FAVORITES,{recipeId:id,createdAt:Date.now()})}
  catch(error){if(wasSaved)favorites.add(id);else favorites.delete(id);updateCounts();syncFavoriteControls(id);console.warn('Favorit konnte nicht gespeichert werden.',error);return}
  if(currentListRoute()==='favorites')renderFavorites();
}

function noteText(recipeId){return String(recipeNotes.get(recipeId)?.text||'')}
function setLocalRecipeNote(recipeId,text){
  const value=String(text??'').replace(/\r\n?/g,'\n');
  if(value.trim())recipeNotes.set(recipeId,{recipeId,text:value,updatedAt:Date.now()});
  else recipeNotes.delete(recipeId);
  return value;
}
function persistRecipeNote(recipeId,text){
  const value=setLocalRecipeNote(recipeId,text);
  const task=notePersistChain.then(()=>value.trim()
    ?put(NOTES,{recipeId,text:value,updatedAt:Date.now()})
    :del(NOTES,recipeId));
  notePersistChain=task.catch(()=>{});
  return task;
}
function queueRecipeNoteSave(recipeId,text,status,{immediate=false}={}){
  const value=setLocalRecipeNote(recipeId,text);
  const pending=noteSaveTimers.get(recipeId);
  if(pending)clearTimeout(pending);
  noteSaveTimers.delete(recipeId);
  if(status)status.textContent=value.trim()?'Speichert …':'Entfernt …';
  const save=()=>{
    noteSaveTimers.delete(recipeId);
    return persistRecipeNote(recipeId,value).then(()=>{
      if(status?.isConnected&&document.querySelector('[data-recipe-note-text]')?.value===value)status.textContent=value.trim()?'Gespeichert':'Keine Notiz gespeichert';
    }).catch(error=>{
      if(status?.isConnected)status.textContent='Speichern fehlgeschlagen';
      console.warn('Persönliche Notiz konnte nicht gespeichert werden.',error);
    });
  };
  if(immediate)save();else noteSaveTimers.set(recipeId,setTimeout(save,450));
}
function decorateRecipeNote(recipe){
  if(!notesReady)return;
  const hero=document.querySelector('.detail-hero');
  if(!hero||document.querySelector('[data-recipe-note]'))return;
  const value=noteText(recipe.id),hasNote=!!value.trim();
  hero.insertAdjacentHTML('afterend',`<details class="personal-note${hasNote?' has-note':''}" data-recipe-note="${esc(recipe.id)}" ${hasNote?'open':''}><summary><span>Persönliche Notiz</span><small>${hasNote?'Notiz vorhanden':'Nur auf diesem Gerät'}</small></summary><div class="personal-note-body"><textarea data-recipe-note-text rows="4" maxlength="5000" placeholder="Zum Beispiel: nächstes Mal weniger Salz, länger im Ofen …">${esc(value)}</textarea><div class="personal-note-footer"><span data-recipe-note-status>${hasNote?'Gespeichert':'Wird nur auf diesem Gerät gespeichert'}</span><button type="button" data-recipe-note-clear ${hasNote?'':'hidden'}>Notiz löschen</button></div><div class="personal-note-print" aria-hidden="true"></div></div></details>`);
  const card=document.querySelector('[data-recipe-note]'),textarea=card?.querySelector('[data-recipe-note-text]'),status=card?.querySelector('[data-recipe-note-status]'),clearButton=card?.querySelector('[data-recipe-note-clear]'),print=card?.querySelector('.personal-note-print');
  if(!card||!textarea)return;
  const syncVisuals=()=>{
    const text=textarea.value,filled=!!text.trim();
    card.classList.toggle('has-note',filled);
    if(clearButton)clearButton.hidden=!filled;
    const summaryState=card.querySelector('summary small');
    if(summaryState)summaryState.textContent=filled?'Notiz vorhanden':'Nur auf diesem Gerät';
    if(print)print.textContent=text;
  };
  syncVisuals();
  textarea.addEventListener('input',()=>{
    syncVisuals();
    queueRecipeNoteSave(recipe.id,textarea.value,status);
  });
  textarea.addEventListener('blur',()=>queueRecipeNoteSave(recipe.id,textarea.value,status,{immediate:true}));
  clearButton?.addEventListener('click',()=>{
    if(!window.confirm('Persönliche Notiz zu diesem Rezept löschen?'))return;
    textarea.value='';
    syncVisuals();
    queueRecipeNoteSave(recipe.id,'',status,{immediate:true});
    textarea.focus();
  });
}
function currentRecipe(){const m=(location.hash||'').match(/^#rezept=(.+)$/);return m?recipeById(decodeURIComponent(m[1])):null}
function currentTarget(r){const input=document.getElementById('portionInput');const v=Number(input?.value);return Number.isFinite(v)?v:plannedTarget(r)}
function hasShoppingContribution(id){return shopping.some(item=>(item.contributions||[]).some(c=>c.id===id))}
function syncShoppingControls(){
  document.querySelectorAll('[data-shopping-contribution]').forEach(el=>{
    const added=hasShoppingContribution(el.dataset.shoppingContribution);
    el.classList.toggle('is-in-shopping',added);
    el.setAttribute('aria-pressed',String(added));
    el.title=added?'Aus Einkaufsliste entfernen':'Zur Einkaufsliste hinzufügen';
  });
}
async function toggleShoppingIngredient(recipe,table,ingredient,target,id){
  const before=shopping;
  const previousPlan=plans.get(recipe.id);
  const ref=sourceRefFromContribution({id});
  plans.set(recipe.id,planRecord(recipe,target));
  const existing=shopping.flatMap(item=>item.contributions||[]).some(c=>c.id===id);
  let contributions=shopping.flatMap(item=>item.contributions||[]).filter(c=>c.id!==id);
  if(!existing){
    const purchase=resolvePurchase(ingredient.article);
    contributions.push(ref?{id,recipeId:recipe.id,sourceRef:ref,article:ingredient.article,component:purchase.component||'whole'}:{
      id,recipeId:recipe.id,article:ingredient.article,component:purchase.component||'whole',
      amount:normalizeContributionAmount(purchase,ingredient.article,normalizedAmount(ingredient,tableFactor(table,target,recipe)))
    });
  }
  shopping=rebuildShoppingWithManual(contributions,shopping);
  updateCounts();syncShoppingControls();if(currentListRoute()==='shopping')renderShopping();
  try{
    await persistStateSnapshot();
  }catch(error){
    shopping=before;
    if(previousPlan)plans.set(recipe.id,previousPlan);else plans.delete(recipe.id);
    updateCounts();syncShoppingControls();if(currentListRoute()==='shopping')renderShopping();
    console.warn('Einkaufsliste konnte nicht gespeichert werden.',error);
  }
}
async function addManualShopping(article,amount){
  const name=String(article||'').trim(),manualAmount=String(amount||'').trim();
  if(!name)return;
  const before=shopping;
  shopping=[...shopping,normalizeManualShoppingItem({
    key:manualShoppingKey(),article:name,manualAmount,done:false,createdAt:Date.now(),updatedAt:Date.now()
  })];
  updateCounts();if(currentListRoute()==='shopping')renderShopping();
  try{await persistStateSnapshot()}
  catch(error){shopping=before;updateCounts();if(currentListRoute()==='shopping')renderShopping();console.warn('Manueller Einkaufsartikel konnte nicht gespeichert werden.',error)}
}
async function editManualShopping(key,article,amount){
  const name=String(article||'').trim(),manualAmount=String(amount||'').trim();
  if(!name)return false;
  const item=shopping.find(x=>x.key===key);
  if(!isManualShoppingItem(item))return false;
  const before=shopping;
  shopping=shopping.map(x=>x.key===key?normalizeManualShoppingItem({...x,article:name,manualAmount,updatedAt:Date.now()}):x);
  if(currentListRoute()==='shopping')renderShopping();
  try{await persistStateSnapshot();return true}
  catch(error){
    shopping=before;
    if(currentListRoute()==='shopping')renderShopping();
    console.warn('Manueller Einkaufsartikel konnte nicht geändert werden.',error);
    return false;
  }
}
function startManualShoppingEdit(key){
  const item=shopping.find(x=>x.key===key);
  if(!isManualShoppingItem(item))return;
  const row=[...document.querySelectorAll('.shopping-row')].find(x=>x.dataset.shoppingKey===key);
  if(!row||row.classList.contains('is-editing'))return;
  row.classList.add('is-editing');
  row.innerHTML=`<input class="shopping-check" type="checkbox" ${item.done?'checked':''} disabled aria-label="Erledigt"><form class="shopping-inline-edit"><input type="text" class="shopping-inline-article" maxlength="120" autocomplete="off" aria-label="Artikel" value="${esc(item.article)}" required><input type="text" class="shopping-inline-amount" maxlength="80" autocomplete="off" aria-label="Menge, optional" value="${esc(item.manualAmount||'')}" placeholder="Menge (optional)"><div class="shopping-inline-actions"><button type="submit">Speichern</button><button type="button" data-shop-edit-cancel>Abbrechen</button></div></form>`;
  const form=row.querySelector('.shopping-inline-edit');
  const articleInput=row.querySelector('.shopping-inline-article');
  const amountInput=row.querySelector('.shopping-inline-amount');
  articleInput?.focus();
  articleInput?.select();
  form?.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!articleInput?.value.trim()){articleInput?.focus();return}
    [...form.elements].forEach(el=>{if('disabled' in el)el.disabled=true});
    const ok=await editManualShopping(key,articleInput.value,amountInput?.value);
    if(!ok&&articleInput?.isConnected)[...form.elements].forEach(el=>{if('disabled' in el)el.disabled=false});
  });
  row.querySelector('[data-shop-edit-cancel]')?.addEventListener('click',()=>renderShopping());
  form?.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();renderShopping()}
  });
}
async function removeShopping(key){
  const before=shopping;shopping=shopping.filter(x=>x.key!==key);
  updateCounts();syncShoppingControls();if(currentListRoute()==='shopping')renderShopping();
  try{await persistStateSnapshot()}catch(error){shopping=before;updateCounts();syncShoppingControls();if(currentListRoute()==='shopping')renderShopping();console.warn('Einkaufsartikel konnte nicht entfernt werden.',error)}
}
async function toggleDone(key){
  const item=shopping.find(x=>x.key===key);if(!item)return;
  item.done=!item.done;renderShopping();
  try{await persistStateSnapshot()}catch(error){item.done=!item.done;renderShopping();console.warn('Einkaufsstatus konnte nicht gespeichert werden.',error)}
}

function ensureNav(){
  const nav=document.querySelector('.topbar .nav');if(!nav)return;
  if(!nav.querySelector('[data-list-route="favorites"]'))nav.insertAdjacentHTML('beforeend','<button type="button" class="nav-list-button" data-list-route="favorites">Favoriten <span class="nav-count" data-fav-count></span></button><button type="button" class="nav-list-button" data-list-route="shopping">Einkaufsliste <span class="nav-count" data-shop-count></span></button>');
  nav.querySelectorAll('[data-list-route]').forEach(btn=>{if(btn.dataset.bound)return;btn.dataset.bound='1';btn.addEventListener('click',()=>showList(btn.dataset.listRoute))});
  updateCounts();
}
function updateCounts(){document.querySelectorAll('[data-fav-count]').forEach(x=>{x.textContent=favorites.size;x.hidden=!favorites.size});document.querySelectorAll('[data-shop-count]').forEach(x=>{x.textContent=shopping.length;x.hidden=!shopping.length})}
function currentListRoute(){return history.state?.route==='favorites'||location.hash==='#favoriten'?'favorites':history.state?.route==='shopping'||location.hash==='#einkaufsliste'?'shopping':''}
function showList(route,{write=true}={}){if(write)history.pushState({route},'',route==='favorites'?'#favoriten':'#einkaufsliste');document.body.dataset.route=route;document.body.classList.remove('has-hero');document.querySelector('.topbar')?.classList.add('is-stuck','show-brand');document.querySelectorAll('[data-route]').forEach(x=>x.classList.remove('active'));document.querySelectorAll('[data-list-route]').forEach(x=>x.classList.toggle('active',x.dataset.listRoute===route));route==='favorites'?renderFavorites():renderShopping();scrollTo({top:0,behavior:'smooth'})}

function favoriteCard(r){return RecipeCard.render(r)}
function renderFavorites(){
  const app=document.getElementById('app'),rows=DATA.recipes.filter(r=>favorites.has(r.id)).sort((a,b)=>a.title.localeCompare(b.title,'de'));
  app.innerHTML=`<div class="list-page"><div class="shell"><div class="list-head"><div><span class="category">Gespeichert auf diesem Gerät</span><h1>Favoriten</h1><p>${rows.length?`${rows.length} gespeicherte${rows.length===1?'s Rezept':' Rezepte'}`:'Noch keine Rezepte gespeichert.'}</p></div>${rows.length?'<div class="list-actions"><button type="button" id="clearFavorites">Alle entfernen</button></div>':''}</div>${rows.length?`<div class="favorite-grid">${rows.map(favoriteCard).join('')}</div>`:'<div class="favorite-empty">Mit dem Lesezeichen-Symbol auf einer Rezeptkarte oder in der Detailansicht kannst du Rezepte hier ablegen.</div>'}</div></div>`;
  app.querySelectorAll('[data-recipe]').forEach(b=>b.addEventListener('click',()=>{history.pushState({route:'detail',id:b.dataset.recipe,fromArchive:false},'',`#rezept=${encodeURIComponent(b.dataset.recipe)}`);location.reload()}));
  app.querySelectorAll('[data-favorite]').forEach(b=>{syncCardFavoriteButton(b,b.dataset.favorite);b.addEventListener('click',e=>{e.stopPropagation();toggleFavorite(b.dataset.favorite)})});
  document.getElementById('clearFavorites')?.addEventListener('click',async()=>{favorites.clear();await clear(FAVORITES);updateCounts();renderFavorites()});
}
function renderShopping(){
  const app=document.getElementById('app'),rows=[...shopping].sort((a,b)=>Number(a.done)-Number(b.done)||a.article.localeCompare(b.article,'de'));
  const manualForm='<form class="shopping-manual-form" id="manualShoppingForm"><input type="text" id="manualShoppingArticle" maxlength="120" autocomplete="off" aria-label="Artikel" placeholder="Artikel hinzufügen" required><input type="text" id="manualShoppingAmount" maxlength="80" autocomplete="off" aria-label="Menge, optional" placeholder="Menge (optional)"><button type="submit">Hinzufügen</button></form>';
  const rowHtml=x=>{
    const manual=isManualShoppingItem(x);
    const editAttrs=manual?` data-shop-edit="${esc(x.key)}" title="Bearbeiten"`:'';
    const meta=manual?'Manuell hinzugefügt · bearbeiten':`${sourceCount(x)} Rezept${sourceCount(x)===1?'':'e'}${x.note?` · ${esc(x.note)}`:''}`;
    return `<div class="shopping-row ${x.done?'is-done':''} ${manual?'is-manual':''}" data-shopping-key="${esc(x.key)}"><input class="shopping-check" type="checkbox" ${x.done?'checked':''} data-shop-done="${esc(x.key)}" aria-label="Erledigt"><div class="shopping-name${manual?' shopping-editable':''}"${editAttrs}><strong>${esc(x.article)}</strong><small>${meta}</small></div><div class="shopping-amount${manual?' shopping-editable':''}"${editAttrs}>${esc(displayAmount(x))}</div>${manual?`<button class="shopping-edit" type="button" data-shop-edit="${esc(x.key)}" aria-label="Bearbeiten" title="Bearbeiten">✎</button>`:''}<button class="shopping-remove" type="button" data-shop-remove="${esc(x.key)}" aria-label="Entfernen">×</button></div>`;
  };
  app.innerHTML=`<div class="list-page"><div class="shell"><div class="list-head"><div><span class="category">Gespeichert auf diesem Gerät</span><h1>Einkaufsliste</h1><p>${rows.length?`${rows.length} Einkaufsartikel`:'Noch keine Artikel hinzugefügt.'}</p></div>${rows.length?'<div class="list-actions"><button type="button" id="clearShopping">Liste leeren</button></div>':''}</div>${manualForm}${rows.length?`<div class="shopping-list">${rows.map(rowHtml).join('')}</div>`:'<div class="shopping-empty">Zutaten lassen sich direkt aus einem Rezept übernehmen. Andere Dinge kannst du oben manuell hinzufügen.</div>'}</div></div>`;
  app.querySelectorAll('[data-shop-done]').forEach(x=>x.addEventListener('change',()=>toggleDone(x.dataset.shopDone)));
  app.querySelectorAll('[data-shop-remove]').forEach(x=>x.addEventListener('click',()=>removeShopping(x.dataset.shopRemove)));
  app.querySelectorAll('[data-shop-edit]').forEach(x=>x.addEventListener('click',event=>{
    event.stopPropagation();
    startManualShoppingEdit(x.dataset.shopEdit);
  }));
  document.getElementById('manualShoppingForm')?.addEventListener('submit',event=>{
    event.preventDefault();
    addManualShopping(document.getElementById('manualShoppingArticle')?.value,document.getElementById('manualShoppingAmount')?.value);
  });
  document.getElementById('clearShopping')?.addEventListener('click',async()=>{shopping=[];updateCounts();syncShoppingControls();renderShopping();try{await persistStateSnapshot()}catch(error){console.warn('Einkaufsliste konnte nicht geleert werden.',error)}});
}

function decorateCards(){document.querySelectorAll('.recipe-card').forEach(card=>{const open=card.querySelector('[data-recipe],[data-open-favorite]');if(!open)return;const id=open.dataset.recipe||open.dataset.openFavorite;let button=card.querySelector('.bookmark-btn');if(!button){card.insertAdjacentHTML('beforeend',`<button type="button" class="bookmark-btn" data-favorite="${esc(id)}"></button>`);button=card.querySelector('.bookmark-btn')}syncCardFavoriteButton(button,id);if(button.dataset.favoriteBound)return;button.dataset.favoriteBound='1';button.addEventListener('click',e=>{e.stopPropagation();toggleFavorite(id)})})}
function bindRecipePlanControls(r){
  if(!plansReady)return;
  const input=document.getElementById('portionInput'),box=document.querySelector('.portion-box');
  if(!input||!box)return;
  if(!box.dataset.shoppingPlanBound){
    box.dataset.shoppingPlanBound='1';
    box.addEventListener('input',event=>{if(event.target===input)updatePlanFromDetail(r,input.value)});
    box.addEventListener('change',event=>{if(event.target===input)updatePlanFromDetail(r,input.value,{immediate:true})});
    box.addEventListener('click',event=>{if(event.target.closest('[data-step],#resetScale'))requestAnimationFrame(()=>updatePlanFromDetail(r,input.value,{immediate:true}))});
  }
  if(!input.dataset.shoppingPlanApplied){
    input.dataset.shoppingPlanApplied='1';
    const target=plannedTarget(r);
    if(Math.abs(Number(input.value)-target)>.000001){
      input.value=String(target);
      input.dispatchEvent(new Event('input',{bubbles:true}));
    }
  }
}
function decorateDetail(){
  const r=currentRecipe();if(!r)return;
  const hero=document.querySelector('.detail-hero > div');
  if(hero){let button=hero.querySelector('.detail-favorite');if(!button){hero.querySelector('.detail-meta')?.insertAdjacentHTML('afterend',`<button type="button" class="detail-favorite" data-detail-favorite="${esc(r.id)}"></button>`);button=hero.querySelector('.detail-favorite')}if(button){syncDetailFavoriteButton(button,r.id);if(!button.dataset.favoriteBound){button.dataset.favoriteBound='1';button.addEventListener('click',()=>toggleFavorite(r.id))}}}
  bindRecipePlanControls(r);
  decorateRecipeNote(r);
  decorateIngredients(r);
}
function decorateIngredients(r){
  const attach=(root,table,tableKey)=>{
    if(!root)return;
    [...root.querySelectorAll('li.ingredient')].forEach((el,i)=>{
      const ing=table.ingredients[i];if(!ing)return;
      const id=contributionId(r.id,tableKey,i);
      el.dataset.shoppingContribution=id;
      el.classList.add('is-shopping-enabled');
      const added=hasShoppingContribution(id);
      el.classList.toggle('is-in-shopping',added);el.setAttribute('aria-pressed',String(added));el.title=added?'Aus Einkaufsliste entfernen':'Zur Einkaufsliste hinzufügen';
      if(el.dataset.shoppingBound)return;
      el.dataset.shoppingBound='1';el.setAttribute('role','button');el.tabIndex=0;
      const toggle=()=>toggleShoppingIngredient(r,table,ing,currentTarget(r),id);
      el.addEventListener('click',e=>{if(e.target.closest('.glossary-term'))return;toggle()});
      el.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('.glossary-term')){e.preventDefault();toggle()}});
    });
  };
  attach(document.getElementById('mainIngredients'),r,'main');
  const subRoot=document.getElementById('subrecipes');
  if(subRoot)[...subRoot.querySelectorAll('.subrecipe')].forEach((details,i)=>attach(details,r.subrecipes[i],`sub:${i}`));
}
function decorate(){ensureNav();decorateCards();decorateDetail();syncShoppingControls();const route=currentListRoute();document.querySelectorAll('[data-list-route]').forEach(x=>x.classList.toggle('active',x.dataset.listRoute===route))}
const observer=new MutationObserver(()=>requestAnimationFrame(decorate));observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('popstate',()=>setTimeout(()=>{const route=currentListRoute();if(route)showList(route,{write:false});else decorate()},0));

(async()=>{
  try{
    const [favoriteRows,planRows,shoppingRows,noteRows]=await Promise.all([getAll(FAVORITES),getAll(PLANS),getAll(SHOPPING),getAll(NOTES)]);
    favorites=new Set(favoriteRows.map(x=>x.recipeId));
    plans=new Map(planRows.filter(x=>x?.recipeId&&Number.isFinite(Number(x.target))).map(x=>[x.recipeId,{...x,target:Number(x.target)}]));
    recipeNotes=new Map(noteRows.filter(x=>x?.recipeId&&typeof x.text==='string'&&x.text.trim()).map(x=>[x.recipeId,x]));
    shopping=await migrateShopping(shoppingRows);
  }catch(e){console.warn('Listen konnten nicht aus IndexedDB geladen werden.',e)}
  plansReady=true;
  notesReady=true;
  ensureNav();updateCounts();const route=currentListRoute();if(route)showList(route,{write:false});else decorate();
})();
})();
