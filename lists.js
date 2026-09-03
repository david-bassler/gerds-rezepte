(()=>{
'use strict';
const DATA=window.GERDS_REZEPTE;
const RecipeCard=window.GerdRecipeCard;
if(!DATA||!RecipeCard)return;

const DB_NAME='gerds-rezepte';
const DB_VERSION=1;
const FAVORITES='favorites';
const SHOPPING='shopping';
let dbPromise=null;
let favorites=new Set();
let shopping=[];

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
  const range=qtyRange(ingredient.quantity,factor);
  const unit=canonicalUnit(ingredient.unit);
  if(!range)return {dimension:'text',unit:'',min:null,max:null,text:ingredient.quantity?.text||'nach Bedarf'};
  const m=UNIT_MAP[unit];
  if(!m)return {dimension:`unit:${unit}`,unit:unit||'',min:range.min,max:range.max,text:''};
  return {dimension:m.dimension,unit:m.unit,min:range.min*m.factor,max:range.max*m.factor,text:''};
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

function mergeRanges(list){
  let min=0,max=0,has=false;
  for(const x of list){if(Number.isFinite(x.min)&&Number.isFinite(x.max)){min+=x.min;max+=x.max;has=true}}
  return has?{min,max}:null;
}
function genericAggregate(contributions){
  const groups=new Map(),texts=[];
  for(const c of contributions){
    const a=c.amount||{};
    if(Number.isFinite(a.min)&&Number.isFinite(a.max)){
      const id=`${a.dimension}::${a.unit}`;
      const g=groups.get(id)||{dimension:a.dimension,unit:a.unit,min:0,max:0};
      g.min+=a.min;g.max+=a.max;groups.set(id,g);
    }else if(a.text&&!texts.includes(a.text))texts.push(a.text);
  }
  const amounts=[...groups.values()];
  if(texts.length)amounts.push({dimension:'text',unit:'',min:null,max:null,text:texts.join('; ')});
  return {amounts,note:''};
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
function rebuildPurchaseItem(purchase,contributions,previous={}){
  const aggregate=purchase.kind==='eggs'?eggAggregate(contributions):genericAggregate(contributions);
  return {
    key:purchaseKey(purchase),purchaseId:purchase.id,article:purchase.article,kind:purchase.kind,
    contributions,amounts:aggregate.amounts,note:aggregate.note,done:previous.done||false,
    createdAt:previous.createdAt||Date.now(),updatedAt:Date.now()
  };
}
function contributionFromLegacy(item,index){
  const purchase=resolvePurchase(item.article);
  let amount={dimension:item.dimension||'text',unit:item.unit||'',min:item.min,max:item.max,text:item.text||''};
  // Frühere Versionen hatten Eier fälschlich mit 50 g/Stück gespeichert.
  if(purchase.kind==='eggs'&&amount.dimension==='mass'&&amount.unit==='g'&&Number.isFinite(amount.min)&&Number.isFinite(amount.max)&&/(?:^| )(ei|eier)(?: |$)/.test(norm(item.article))){
    amount={dimension:'count',unit:'Stück',min:amount.min/50,max:amount.max/50,text:''};
  }
  return {id:`legacy:${item.key||index}`,recipeId:(item.sources||[])[0]||'',sourceIds:item.sources||[],legacyDone:!!item.done,article:item.article,component:purchase.component||'whole',amount:normalizeContributionAmount(purchase,item.article,amount)};
}
async function migrateShopping(items){
  const all=[];
  let needsWrite=false;
  items.forEach((item,index)=>{
    if(Array.isArray(item.contributions)&&item.purchaseId){item.contributions.forEach(c=>all.push(c));}
    else{all.push(contributionFromLegacy(item,index));needsWrite=true;}
  });
  const grouped=new Map();
  for(const contribution of all){
    const purchase=resolvePurchase(contribution.article);
    contribution.component=contribution.component||purchase.component||'whole';
    contribution.amount=normalizeContributionAmount(purchase,contribution.article,contribution.amount||{});
    const key=purchaseKey(purchase),bucket=grouped.get(key)||{purchase,contributions:[],previous:items.find(x=>x.key===key)||{}};
    bucket.contributions.push(contribution);grouped.set(key,bucket);
  }
  const out=[...grouped.values()].map(x=>rebuildPurchaseItem(x.purchase,x.contributions,{...x.previous,done:x.previous.done||x.contributions.some(c=>c.legacyDone)}));
  if(needsWrite||items.some(x=>!x.purchaseId)||items.length!==out.length)await replaceAll(SHOPPING,out);
  return out;
}
function formatAmountPart(item){
  if(Number.isFinite(item.min)){
    let min=item.min,max=item.max,unit=item.unit;
    if(item.dimension==='mass'&&min>=1000&&max>=1000){min/=1000;max/=1000;unit='kg'}
    else if(item.dimension==='volume'&&min>=1000&&max>=1000){min/=1000;max/=1000;unit='L'}
    const q=Math.abs(max-min)<.0001?fmt(min):`${fmt(min)}–${fmt(max)}`;
    return `${q}${unit?` ${unit}`:''}`;
  }
  return item.text||'nach Bedarf';
}
function displayAmount(item){return (item.amounts||[]).map(formatAmountPart).join(' + ')||'nach Bedarf'}

function recipeById(id){return DATA.recipes.find(r=>r.id===id)}
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

function currentRecipe(){const m=(location.hash||'').match(/^#rezept=(.+)$/);return m?recipeById(decodeURIComponent(m[1])):null}
function currentTarget(r){const input=document.getElementById('portionInput');const v=Number(input?.value);return Number.isFinite(v)?v:(r.scaleType==='factor'?1:r.baseScale)}
function tableFactor(table,target,main){if(main.scaleType==='factor')return target;if(main.scaleType==='portions'&&table.scaleType==='portions')return target/table.baseScale;return target/main.baseScale}
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
  const before=shopping.map(item=>({...item,contributions:(item.contributions||[]).map(c=>({...c,amount:{...(c.amount||{})}})),amounts:(item.amounts||[]).map(a=>({...a}))}));
  const existingItem=shopping.find(item=>(item.contributions||[]).some(c=>c.id===id));
  let changedKey='';
  if(existingItem){
    const remaining=existingItem.contributions.filter(c=>c.id!==id);
    changedKey=existingItem.key;
    if(remaining.length){
      const purchase=resolvePurchase(remaining[0].article);
      const rebuilt=rebuildPurchaseItem(purchase,remaining,existingItem);
      shopping=shopping.map(x=>x.key===existingItem.key?rebuilt:x);
    }else shopping=shopping.filter(x=>x.key!==existingItem.key);
  }else{
    const factor=tableFactor(table,target,recipe);
    const purchase=resolvePurchase(ingredient.article);
    const amount=normalizeContributionAmount(purchase,ingredient.article,normalizedAmount(ingredient,factor));
    const contribution={id,recipeId:recipe.id,article:ingredient.article,component:purchase.component||'whole',amount};
    const key=purchaseKey(purchase),existing=shopping.find(x=>x.key===key);
    const rebuilt=rebuildPurchaseItem(purchase,[...(existing?.contributions||[]),contribution],existing||{});
    changedKey=key;
    shopping=existing?shopping.map(x=>x.key===key?rebuilt:x):[...shopping,rebuilt];
  }
  updateCounts();syncShoppingControls();if(currentListRoute()==='shopping')renderShopping();
  try{
    const item=shopping.find(x=>x.key===changedKey);
    if(item)await put(SHOPPING,item);else await del(SHOPPING,changedKey);
  }catch(error){
    shopping=before;updateCounts();syncShoppingControls();if(currentListRoute()==='shopping')renderShopping();
    console.warn('Einkaufsliste konnte nicht gespeichert werden.',error);
  }
}
async function removeShopping(key){shopping=shopping.filter(x=>x.key!==key);await del(SHOPPING,key);updateCounts();syncShoppingControls();if(currentListRoute()==='shopping')renderShopping()}
async function toggleDone(key){const item=shopping.find(x=>x.key===key);if(!item)return;item.done=!item.done;await put(SHOPPING,item);renderShopping()}

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
  app.innerHTML=`<div class="list-page"><div class="shell"><div class="list-head"><div><span class="category">Gespeichert auf diesem Gerät</span><h1>Einkaufsliste</h1><p>${rows.length?`${rows.length} Einkaufsartikel`:'Noch keine Zutaten hinzugefügt.'}</p></div>${rows.length?'<div class="list-actions"><button type="button" id="clearShopping">Liste leeren</button></div>':''}</div><p class="shopping-note">Rezeptbezeichnungen werden auf echte Einkaufsartikel normalisiert. Direkt vergleichbare Einheiten werden addiert; unterschiedliche Einheiten bleiben innerhalb desselben Artikels sichtbar. Eigelb und Eiweiß werden als benötigte Eier zusammengeführt.</p>${rows.length?`<div class="shopping-list">${rows.map(x=>`<div class="shopping-row ${x.done?'is-done':''}"><input class="shopping-check" type="checkbox" ${x.done?'checked':''} data-shop-done="${esc(x.key)}" aria-label="Erledigt"><div class="shopping-name"><strong>${esc(x.article)}</strong><small>${sourceCount(x)} Rezept${sourceCount(x)===1?'':'e'}${x.note?` · ${esc(x.note)}`:''}</small></div><div class="shopping-amount">${esc(displayAmount(x))}</div><button class="shopping-remove" type="button" data-shop-remove="${esc(x.key)}" aria-label="Entfernen">×</button></div>`).join('')}</div>`:'<div class="shopping-empty">In einer Rezeptansicht einfach eine Zutat anklicken. Ein zweiter Klick entfernt genau diese Rezeptzutat wieder.</div>'}</div></div>`;
  app.querySelectorAll('[data-shop-done]').forEach(x=>x.addEventListener('change',()=>toggleDone(x.dataset.shopDone)));
  app.querySelectorAll('[data-shop-remove]').forEach(x=>x.addEventListener('click',()=>removeShopping(x.dataset.shopRemove)));
  document.getElementById('clearShopping')?.addEventListener('click',async()=>{shopping=[];await clear(SHOPPING);updateCounts();syncShoppingControls();renderShopping()});
}

function decorateCards(){document.querySelectorAll('.recipe-card').forEach(card=>{const open=card.querySelector('[data-recipe],[data-open-favorite]');if(!open)return;const id=open.dataset.recipe||open.dataset.openFavorite;let button=card.querySelector('.bookmark-btn');if(!button){card.insertAdjacentHTML('beforeend',`<button type="button" class="bookmark-btn" data-favorite="${esc(id)}"></button>`);button=card.querySelector('.bookmark-btn')}syncCardFavoriteButton(button,id);if(button.dataset.favoriteBound)return;button.dataset.favoriteBound='1';button.addEventListener('click',e=>{e.stopPropagation();toggleFavorite(id)})})}
function decorateDetail(){
  const r=currentRecipe();if(!r)return;
  const hero=document.querySelector('.detail-hero > div');
  if(hero){let button=hero.querySelector('.detail-favorite');if(!button){hero.querySelector('.detail-meta')?.insertAdjacentHTML('afterend',`<button type="button" class="detail-favorite" data-detail-favorite="${esc(r.id)}"></button>`);button=hero.querySelector('.detail-favorite')}if(button){syncDetailFavoriteButton(button,r.id);if(!button.dataset.favoriteBound){button.dataset.favoriteBound='1';button.addEventListener('click',()=>toggleFavorite(r.id))}}}
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
  try{favorites=new Set((await getAll(FAVORITES)).map(x=>x.recipeId));shopping=await migrateShopping(await getAll(SHOPPING))}
  catch(e){console.warn('Listen konnten nicht aus IndexedDB geladen werden.',e)}
  ensureNav();updateCounts();const route=currentListRoute();if(route)showList(route,{write:false});else decorate();
})();
})();
