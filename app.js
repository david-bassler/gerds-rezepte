(()=>{
'use strict';
const DATA=window.GERDS_REZEPTE;
const app=document.getElementById('app');
const PAGE_SIZE=36;
const state={query:'',category:'',cuisine:'',duration:'',ingredients:[],sort:'title',visible:PAGE_SIZE,route:'recipes'};
let recipeObserver=null;
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();
const formatNumber=n=>new Intl.NumberFormat('de-DE',{maximumFractionDigits:2}).format(n);
const fmtInt=n=>new Intl.NumberFormat('de-DE').format(n);
const isOne=n=>Math.abs(Number(n)-1)<1e-9;
const portionLabel=n=>`${formatNumber(n)} ${isOne(n)?'Portion':'Portionen'}`;
const recipeCountLabel=n=>`${fmtInt(n)} ${Number(n)===1?'Rezept':'Rezepte'}`;
const ingredientLineCountLabel=n=>`${fmtInt(n)} ${Number(n)===1?'Zutatenzeile':'Zutatenzeilen'}`;
function fmtDuration(min){if(!Number.isFinite(min)||min<=0)return '—';if(min<60)return `${min} Min.`;const h=Math.floor(min/60),m=min%60;return m?`${h} Std. ${m} Min.`:`${h} Std.`}
function initials(title){return title.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()}
const CUISINE_ICON_ORDER=['Deutsch','Österreichisch','Schweizerisch','Italienisch','Französisch','Spanisch','Griechisch','Ungarisch','Balkan','Britisch / Irisch','Nordisch','US-amerikanisch','Tex-Mex','Karibisch','Kreolisch','Indisch','Chinesisch','Thailändisch','Indonesisch','Nordafrikanisch / Maghreb','Mediterran','Asiatisch','Klassisch-europäisch','International / Fusion'];
const SPRITE_X=[0,20,40,60,80,100];
const SPRITE_Y=[0,33.3333,66.6667,100];
// Die Kartenillustrationen werden innerhalb jeder Sprite-Zelle vertikal enger beschnitten.
// Bei 500 % Sprite-Höhe liegen die Zellmittelpunkte bei diesen Y-Positionen.
const CARD_SPRITE_Y=[3.125,34.375,65.625,96.875];
function cuisineIndex(cuisine){return CUISINE_ICON_ORDER.indexOf(cuisine)}
function cuisineSpriteStyle(cuisine,forCard=false){const idx=cuisineIndex(cuisine);if(idx<0)return '';const col=idx%6,row=Math.floor(idx/6);const y=forCard?CARD_SPRITE_Y[row]:SPRITE_Y[row];return `background-position:${SPRITE_X[col]}% ${y}%;`}
function cuisineIconSpan(cuisine,cls='card-cuisine-icon'){const style=cuisineSpriteStyle(cuisine,cls.includes('card-cuisine-icon'));return style?`<span class="${cls}" aria-hidden="true" style="${style}"></span>`:''}
function cuisineIconVisual(cuisine,title){const icon=cuisineIconSpan(cuisine,'card-cuisine-icon');if(!icon)return `<span class="card-initials">${esc(initials(title))}</span>`;return `${icon}<span class="sr-only">${esc(cuisine)}</span>`}
function cuisinePickerHtml(){const selected=state.cuisine?`<span class="icon-select-trigger-label">${cuisineIconSpan(state.cuisine,'menu-cuisine-icon is-trigger')}<span class="menu-text">${esc(state.cuisine)}</span></span>`:`<span class="icon-select-trigger-label"><span class="menu-cuisine-icon is-empty is-trigger" aria-hidden="true"></span><span class="menu-placeholder">Alle Küchen</span></span>`;return `<details class="icon-select" id="cuisinePicker"><summary class="control icon-select-trigger">${selected}<span class="icon-select-caret" aria-hidden="true">▾</span></summary><div class="icon-select-menu" role="listbox" aria-label="Hauptküche"><button class="icon-option ${!state.cuisine?'selected':''}" type="button" data-cuisine-option=""><span class="menu-cuisine-icon is-empty" aria-hidden="true"></span><span class="menu-text">Alle Küchen</span><small>${fmtInt(DATA.meta.recipeCount)}</small></button>${DATA.cuisineIndex.map(c=>`<button class="icon-option ${state.cuisine===c.name?'selected':''}" type="button" data-cuisine-option="${esc(c.name)}">${cuisineIconSpan(c.name,'menu-cuisine-icon')}<span class="menu-text">${esc(c.name)}</span><small>${fmtInt(c.count)}</small></button>`).join('')}</div></details>`}
function bindCuisinePicker(){const picker=document.getElementById('cuisinePicker');if(!picker)return;picker.querySelectorAll('[data-cuisine-option]').forEach(btn=>btn.addEventListener('click',()=>{state.cuisine=btn.dataset.cuisineOption||'';state.visible=PAGE_SIZE;renderRecipes()}));}
const CATEGORY_ICON_ORDER=['Beilagen','Brot','Dips, Dressings & Marinaden','Fischgerichte','Fleischlose Gerichte','Geflügelgerichte','Kalbfleischgerichte','Kalte Gerichte','Lamm- & Wildgerichte','Nudelgerichte','Rindfleischgerichte','Schweinefleischgerichte','Sonstige Gerichte','Suppen & Eintöpfe','Warme Soßen','Wurstrezepturen'];
function categoryIndex(name){return CATEGORY_ICON_ORDER.indexOf(name)}
function categorySpriteStyle(name){const idx=categoryIndex(name);if(idx<0)return '';const col=idx%4,row=Math.floor(idx/4);const x=[0,33.3333,66.6667,100][col],y=[0,33.3333,66.6667,100][row];return `background-position:${x}% ${y}%;`}
function categoryIconSpan(name,cls='menu-category-icon'){const style=categorySpriteStyle(name);return style?`<span class="${cls}" aria-hidden="true" style="${style}"></span>`:''}
function categoryPickerHtml(){const selected=state.category?`<span class="icon-select-trigger-label">${categoryIconSpan(state.category,'menu-category-icon is-trigger')}<span class="menu-text">${esc(state.category)}</span></span>`:`<span class="icon-select-trigger-label"><span class="menu-category-icon is-empty is-trigger" aria-hidden="true"></span><span class="menu-placeholder">Alle Kategorien</span></span>`;return `<details class="icon-select" id="categoryPicker"><summary class="control icon-select-trigger">${selected}<span class="icon-select-caret" aria-hidden="true">▾</span></summary><div class="icon-select-menu" role="listbox" aria-label="Kategorie"><button class="icon-option ${!state.category?'selected':''}" type="button" data-category-option=""><span class="menu-category-icon is-empty" aria-hidden="true"></span><span class="menu-text">Alle Kategorien</span><small>${fmtInt(DATA.meta.recipeCount)}</small></button>${DATA.categories.map(c=>`<button class="icon-option ${state.category===c.name?'selected':''}" type="button" data-category-option="${esc(c.name)}">${categoryIconSpan(c.name,'menu-category-icon')}<span class="menu-text">${esc(c.name)}</span><small>${fmtInt(c.count)}</small></button>`).join('')}</div></details>`}
function bindCategoryPicker(){const picker=document.getElementById('categoryPicker');if(!picker)return;picker.querySelectorAll('[data-category-option]').forEach(btn=>btn.addEventListener('click',()=>{state.category=btn.dataset.categoryOption||'';state.visible=PAGE_SIZE;renderRecipes()}));}
const DURATION_OPTIONS=[['','Beliebig'],['30','bis 30 Min.'],['45','bis 45 Min.'],['60','bis 1 Std.'],['90','bis 1 Std. 30 Min.'],['120','bis 2 Std.'],['180','bis 3 Std.'],['360','bis 6 Std.'],['720','bis 12 Std.'],['1440','bis 24 Std.']];
const SORT_OPTIONS=[['title','A–Z'],['duration','Kürzeste zuerst'],['category','Nach Kategorie'],['cuisine','Nach Küche']];
function utilityIconSpan(symbol,trigger=false){return `<span class="menu-utility-icon${trigger?' is-trigger':''}" aria-hidden="true">${symbol}</span>`}
function durationPickerHtml(){const current=DURATION_OPTIONS.find(([v])=>v===String(state.duration))||DURATION_OPTIONS[0];return `<details class="icon-select utility-select" id="durationPicker"><summary class="control icon-select-trigger"><span class="icon-select-trigger-label">${utilityIconSpan('◷',true)}<span class="menu-text">${esc(current[1])}</span></span><span class="icon-select-caret" aria-hidden="true">▾</span></summary><div class="icon-select-menu utility-select-menu" role="listbox" aria-label="Maximale Gesamtdauer">${DURATION_OPTIONS.map(([value,label])=>`<button class="icon-option ${String(state.duration)===value?'selected':''}" type="button" data-duration-option="${value}">${utilityIconSpan('◷')}<span class="menu-text">${esc(label)}</span></button>`).join('')}</div></details>`}
function bindDurationPicker(){const picker=document.getElementById('durationPicker');if(!picker)return;picker.querySelectorAll('[data-duration-option]').forEach(btn=>btn.addEventListener('click',()=>{state.duration=btn.dataset.durationOption||'';state.visible=PAGE_SIZE;renderRecipes()}));}
function sortPickerHtml(){const current=SORT_OPTIONS.find(([v])=>v===state.sort)||SORT_OPTIONS[0];return `<details class="icon-select utility-select sort-picker" id="sortPicker"><summary class="control icon-select-trigger"><span class="icon-select-trigger-label">${utilityIconSpan('↕',true)}<span class="menu-text">${esc(current[1])}</span></span><span class="icon-select-caret" aria-hidden="true">▾</span></summary><div class="icon-select-menu utility-select-menu" role="listbox" aria-label="Sortierung">${SORT_OPTIONS.map(([value,label])=>`<button class="icon-option ${state.sort===value?'selected':''}" type="button" data-sort-option="${value}">${utilityIconSpan('↕')}<span class="menu-text">${esc(label)}</span></button>`).join('')}</div></details>`}
function bindSortPicker(){const picker=document.getElementById('sortPicker');if(!picker)return;picker.querySelectorAll('[data-sort-option]').forEach(btn=>btn.addEventListener('click',()=>{state.sort=btn.dataset.sortOption||'title';renderRecipes()}));}
function baseLabel(r){if(r.scaleType==='batch')return `${formatNumber(r.baseScale)} kg Ansatz`;if(r.scaleType==='factor')return '1 × Rezept';return portionLabel(r.baseScale)}
function scaledAmount(q,factor){if(!q)return '';if(q.kind==='number')return formatNumber(q.value*factor);if(q.kind==='range')return `${formatNumber(q.min*factor)}–${formatNumber(q.max*factor)}`;return esc(q.text||'')}
const GLOSSARY=[
  {variants:['Parüren','Parüre'],label:'Parüren',definition:'Beim Parieren anfallende Abschnitte wie Sehnen, Häute und Fett; sie werden häufig für Fonds und Soßen weiterverwendet.'},
  {variants:['parieren','pariert'],label:'Parieren',definition:'Fleisch vor der Zubereitung von Sehnen, Häuten und überflüssigem Fett befreien.'},
  {variants:['abpassieren','abpassiert'],label:'Abpassieren',definition:'Flüssigkeiten wie Fonds oder Soßen durch Sieb oder Tuch gießen, um feste Bestandteile abzutrennen.'},
  {variants:['blanchieren','blanchiert','Blanchieren'],label:'Blanchieren',definition:'Lebensmittel kurz in siedendem Wasser oder heißem Dampf behandeln; Gemüse wird danach oft in kaltem Wasser abgeschreckt.'},
  {variants:['nappieren','nappiert'],label:'Nappieren',definition:'Eine Speise unmittelbar vor dem Servieren gleichmäßig mit Sauce oder Gelee überziehen.'},
  {variants:['plattieren','plattiert'],label:'Plattieren',definition:'Fleisch oder Fisch gleichmäßig flachklopfen, meist für Schnitzel, Rouladen oder andere dünne Stücke.'},
  {variants:['sautieren','sautiert','Sautieren'],label:'Sautieren',definition:'Klein geschnittenes Gargut bei hoher Hitze kurz braten und dabei in der Pfanne schwenken.'},
  {variants:['poelieren','poeliert','Poelieren'],label:'Poelieren',definition:'Zartes Fleisch oder Geflügel zugedeckt mit Fett und Gemüse im Ofen garen und zum Schluss leicht bräunen.'},
  {variants:['montieren','montiert'],label:'Montieren',definition:'Sauce, Suppe oder Püree kurz vor dem Servieren mit kalter Butter oder Sahne aufschlagen und cremig binden.'},
  {variants:['tranchieren','tranchiert'],label:'Tranchieren',definition:'Fleisch, Fisch oder Geflügel fachgerecht in portionsgerechte Stücke zerlegen.'},
  {variants:['spicken','gespickt'],label:'Spicken',definition:'Mageres Fleisch mit dünnen Speckstreifen durchziehen, um Aroma und Saftigkeit beim Garen zu unterstützen.'},
  {variants:['pochieren','pochiert'],label:'Pochieren',definition:'Lebensmittel sanft in heißer, nicht kochender Flüssigkeit garziehen.'},
  {variants:['Farce','Farcen'],label:'Farce',definition:'Fein zerkleinerte und gewürzte Masse aus Fleisch, Fisch oder Gemüse, meist gebunden und als Füllung verwendet.'},
  {variants:['Braisieren','braisieren','braisiert'],label:'Braisieren',definition:'Schmoren: Gargut zuerst anbraten und anschließend mit wenig Flüssigkeit langsam fertig garen.'},
  {variants:['mehlieren','mehliert'],label:'Mehlieren',definition:'Lebensmittel vor dem Braten oder Panieren dünn in Mehl wenden und überschüssiges Mehl abschütteln.'},
  {variants:['wolfen','gewolft'],label:'Wolfen',definition:'Lebensmittel, besonders Fleisch, mit einem Fleischwolf zerkleinern und dabei teilweise vermengen.'},
  {variants:['reduzieren','reduziert','Reduktion'],label:'Reduzieren',definition:'Flüssigkeit kräftig einkochen, damit Wasser verdampft und Geschmack sowie Konsistenz konzentrierter werden.'},
  {variants:['Fond','Fonds'],label:'Fond',definition:'Aromatische Grundflüssigkeit aus ausgekochten Zutaten, die als Basis für Suppen und Soßen dient.'},
  {variants:['Jus'],label:'Jus',definition:'Konzentrierter Bratensaft beziehungsweise eine kräftige, meist reduzierte Fleischsoße.'}
];
const GLOSSARY_MAP=new Map();GLOSSARY.forEach(e=>e.variants.forEach(v=>GLOSSARY_MAP.set(norm(v),e)));
const GLOSSARY_TERMS=[...GLOSSARY_MAP.keys()].sort((a,b)=>b.length-a.length);
const GLOSSARY_RAW=GLOSSARY.flatMap(e=>e.variants).sort((a,b)=>b.length-a.length).map(v=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
const GLOSSARY_RE=new RegExp(`(^|[^\p{L}])(${GLOSSARY_RAW.join('|')})(?![\p{L}])`,'giu');
function glossaryHtml(text){const safe=esc(text);return safe.replace(GLOSSARY_RE,(all,lead,term)=>{const entry=GLOSSARY_MAP.get(norm(term));if(!entry)return all;const def=esc(entry.definition),aria=esc(`${entry.label}: ${entry.definition}`);return `${lead}<span class="glossary-term" tabindex="0" data-tooltip="${def}" aria-label="${aria}">${term}</span>`})}
function displayUnit(unit){return ({'Stk.':'Stück','Zwg':'Zweig','Msp.':'Messerspitze','Dösch.':'Döschen','Scheib.':'Scheibe','Spritz':'Spritzer'}[unit]||unit)}
const SEASON_RULES={
  salt:{label:'Salz',min:.008,max:.01,percent:'0,8–1 %'},
  pepper:{label:'Pfeffer',min:.002,max:.004,percent:'0,2–0,4 %'},
  nutmeg:{label:'Muskat',min:.002,max:.002,percent:'0,2 %'},
  paprika:{label:'Paprika',min:.004,max:.006,percent:'0,4–0,6 %'}
};
function seasoningKeys(i){
  const a=norm(i.article);
  const keys=[];
  const toks=new Set(a.split(' '));if((toks.has('salz')||a.includes('meersalz')||a.includes('kochsalz')||a.includes('speisesalz'))&&!a.includes('pokelsalz')&&!a.includes('nitrit')&&!a.includes('selleriesalz')&&!a.includes('knoblauchsalz'))keys.push('salt');
  if(a.includes('pfeffer')&&!a.includes('pfefferkorn')&&!a.includes('pfeffer korner')&&!a.includes('cayenne')&&!a.includes('szechuan'))keys.push('pepper');
  if(a.includes('muskat'))keys.push('nutmeg');
  const paprikaSpice=a.includes('paprika')&&(a.includes('pulver')||a.includes('gemahlen')||a.includes('rosenscharf')||a.includes('edelsuss')||a.includes('rosenpaprika'));
  if(paprikaSpice&&!a.includes('paprikaschote')&&!a.includes('paprikawurfel')&&!a.includes('frisch'))keys.push('paprika');
  return [...new Set(keys)];
}
function qtyValue(q){if(!q)return null;if(q.kind==='number')return q.value;if(q.kind==='range')return (q.min+q.max)/2;return null}
function embeddedPieceWeight(article){
  const a=String(article||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ß/g,'ss').replace(/[´`']/g,'');
  let m=a.match(/(\d+(?:[.,]\d+)?)\s*st\.?\s*(?:=|entspricht)\s*(?:ca\.?\s*)?(\d+(?:[.,]\d+)?)\s*g/);
  if(m)return Number(m[2].replace(',','.'))/Number(m[1].replace(',','.'));
  m=a.match(/(?:a|je|1\s*st\.?)\s*(?:ca\.?\s*)?(\d+(?:[.,]\d+)?)\s*g/);
  if(m)return Number(m[1].replace(',','.'));
  m=a.match(/(?:>|ca\.?\s*)?(\d{2,4}(?:[.,]\d+)?)\s*g/);
  if(m&&/(hahnchen|keule|brust|brotchen|filet|ei)/.test(a))return Number(m[1].replace(',','.'));
  return null;
}
function pieceWeight(article){
  const explicit=embeddedPieceWeight(article);if(explicit)return explicit;
  const a=norm(article);
  if(a.includes('knoblauchzeh'))return 4;if(a.includes('wacholder'))return .2;if(a.includes('pfefferkorn'))return .05;if(a.includes('gewurznelk')||a==='nelken')return .15;
  if(a.includes('eigelb'))return 18;if(/(^| )(ei|eier|vollei)( |$)/.test(a))return 50;if(a.includes('lorbeerblatt')||a.includes('lorbeerblatter'))return .2;
  if(a.includes('zitrone'))return 120;if(a.includes('limette'))return 80;if(a.includes('orange'))return 180;if(a.includes('apfel'))return 150;if(a.includes('banane'))return 120;
  if(a.includes('peperoni')||a.includes('chilischote'))return 15;if(a.includes('sardellenfilet'))return 5;if(a.includes('zimtstange'))return 5;if(a.includes('pimentkorn'))return .1;
  if(a.includes('vanilleschote'))return 5;if(a.includes('matjesfilet'))return 100;if(a.includes('wrap'))return 65;if(a.includes('zwiebel'))return 100;if(a.includes('fruhlingszwiebel'))return 20;
  if(a.includes('olive'))return 4;if(a.includes('kaper'))return 1;return null;
}
function ingredientGrams(i,factor){
  const q=qtyValue(i.quantity);if(!Number.isFinite(q))return null;const unit=String(i.unit||'').trim();let grams=null;
  if(unit==='g')grams=q;else if(unit==='kg')grams=q*1000;else if(unit==='ml')grams=q;else if(unit==='L'||unit==='l')grams=q*1000;else if(unit==='cl')grams=q*10;
  else if(unit==='EL')grams=q*15;else if(unit==='TL')grams=q*5;else if(unit==='Msp.')grams=q*.5;else if(unit==='Prise')grams=q*.3;else if(unit==='Spritzer'||unit==='Spritz')grams=q;
  else if(unit==='Stk.') {const w=pieceWeight(i.article);if(w)grams=q*w;}else if(unit==='Blatt')grams=q*.5;else if(unit==='Zweig'||unit==='Zwg')grams=q*2;else if(unit==='Bund')grams=q*30;
  return Number.isFinite(grams)?grams*factor:null;
}
function seasoningAdviceHtml(table,target,main){
  const factor=tableFactor(table,target,main);
  const explicitMass=Number(table.seasoningMassBaseGrams);
  const present=Array.isArray(table.seasoningKeys)&&table.seasoningKeys.length?[...table.seasoningKeys]:[...new Set(table.ingredients.flatMap(seasoningKeys))];
  if(!present.length)return '';
  let mass=0,known=0,eligible=0,source='';
  if(Number.isFinite(explicitMass)&&explicitMass>0){mass=explicitMass*factor;source=table.seasoningMassLabel||'Original-Zwischensumme';}
  else table.ingredients.forEach(i=>{if(seasoningKeys(i).length)return;eligible++;const g=ingredientGrams(i,factor);if(Number.isFinite(g)&&g>=0){mass+=g;known++;}});
  if(mass<100)return '';
  const kg=mass/1000;
  const rows=present.map(key=>{const r=SEASON_RULES[key],lo=mass*r.min,hi=mass*r.max;const amount=Math.abs(hi-lo)<.01?`${formatNumber(lo)} g`:`${formatNumber(lo)}–${formatNumber(hi)} g`;return `<div class="season-row"><span><strong>${r.label}</strong><small>${r.percent} der Masse</small></span><b>${amount}</b></div>`}).join('');
  const coverage=eligible?Math.round(known/eligible*100):100;
  const basis=source?`Berechnungsbasis: ${formatNumber(kg)} kg · ${esc(source)}.`:`Berechnungsbasis: ca. ${formatNumber(kg)} kg Zutatenmasse vor Salz, Pfeffer, Muskat und Gewürzpaprika. Gewichts- und Volumenangaben werden direkt gerechnet; Stück- und Kräuterangaben soweit möglich mit Küchenrichtwerten geschätzt${coverage<75?`. Die Masse ist deshalb nur eine Näherung (${coverage} % der übrigen Zutatenpositionen direkt/geschätzt erfasst)`:''}.`;
  return `<aside class="season-advice"><div class="season-head"><div><span class="season-kicker">Würzempfehlung</span><h3>Richtwert nach Gesamtmasse</h3></div><span class="mass-badge">${source?'':'ca. '}${formatNumber(kg)} kg</span></div>${rows}<p>${basis} Originalmengen des Rezepts bleiben unverändert.</p></aside>`;
}
DATA.recipes.forEach(r=>{const tables=[r,...r.subrecipes];r._tagSet=new Set(r.tags.map(norm));r._search=norm([r.title,r.category,r.cuisine,r.region,r.style,...r.styleTags,...r.tags,...tables.flatMap(t=>[...t.ingredients.map(i=>i.article),...t.notes,...t.preparation,...t.cooking])].join(' '))});
document.getElementById('footerStats').textContent=`${recipeCountLabel(DATA.meta.recipeCount)} · ${ingredientLineCountLabel(DATA.meta.ingredientLineCount)}`;
function setNav(route){document.querySelectorAll('[data-route]').forEach(b=>b.classList.toggle('active',b.dataset.route===route));document.body.dataset.route=route;if(route!=='recipes')document.body.classList.remove('archive-filters-open');updateTopbarState()}
function filterSnapshot(){return {query:state.query,category:state.category,cuisine:state.cuisine,duration:state.duration,ingredients:[...state.ingredients],sort:state.sort,visible:state.visible}}
function restoreFilters(saved){if(!saved)return;state.query=saved.query||'';state.category=saved.category||'';state.cuisine=saved.cuisine||'';state.duration=saved.duration||'';state.ingredients=Array.isArray(saved.ingredients)?[...saved.ingredients]:[];state.sort=saved.sort||'title';state.visible=Number(saved.visible)||PAGE_SIZE}
function historyUrl(route,id=''){if(route==='detail')return `#rezept=${encodeURIComponent(id)}`;if(route==='knowledge')return '#kuechenwissen';return '#'}
function writeHistory(route,{id='',replace=false,fromArchive=false}={}){const payload={route,id,filters:filterSnapshot(),fromArchive,scrollY:route==='recipes'?window.scrollY:0};history[replace?'replaceState':'pushState'](payload,'',historyUrl(route,id))}
function showRecipes({replace=false,write=true,restoreScroll=null}={}){state.route='recipes';setNav('recipes');renderRecipes();if(write)writeHistory('recipes',{replace});if(Number.isFinite(restoreScroll))requestAnimationFrame(()=>scrollTo({top:restoreScroll,behavior:'auto'}));else scrollTo({top:0,behavior:'smooth'})}
function showKnowledge({replace=false,write=true}={}){state.route='knowledge';setNav('knowledge');renderKnowledge();if(write)writeHistory('knowledge',{replace});scrollTo({top:0,behavior:'smooth'})}
function openRecipe(id,{replace=false,write=true,fromArchive=true}={}){if(write){if(state.route==='recipes'&&history.state?.route==='recipes')writeHistory('recipes',{replace:true});writeHistory('detail',{id,replace,fromArchive})}renderDetail(id);}
function goRecipes(){showRecipes()}
const topbar=document.querySelector('.topbar');
const navToggle=document.getElementById('navToggle');
function closeNavMenu(){topbar?.classList.remove('nav-open');navToggle?.setAttribute('aria-expanded','false')}
function syncNavToggle(){
  if(!navToggle)return;
  const mobile=window.matchMedia('(max-width:680px)').matches;
  navToggle.hidden=!mobile;
  navToggle.classList.toggle('nav-ready',mobile);
  if(!mobile)closeNavMenu();
}
function toggleNavMenu(){if(!topbar||!navToggle||navToggle.hidden)return;const open=!topbar.classList.contains('nav-open');topbar.classList.toggle('nav-open',open);navToggle.setAttribute('aria-expanded',String(open))}
document.querySelectorAll('[data-route]').forEach(b=>b.addEventListener('click',()=>{closeNavMenu();if(b.dataset.route==='knowledge')showKnowledge();else showRecipes()}));
navToggle?.addEventListener('click',event=>{event.stopPropagation();toggleNavMenu()});
document.addEventListener('click',event=>{if(topbar?.classList.contains('nav-open')&&!event.target.closest('.topbar-inner'))closeNavMenu()});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeNavMenu()});
window.addEventListener('resize',syncNavToggle);
syncNavToggle();
let topbarRaf=0;function updateTopbarState(){topbarRaf=0;if(!topbar)return;const hasHero=(document.body.dataset.route||state.route)==='recipes';const showBrand=!hasHero||window.scrollY>4;topbar.classList.toggle('is-stuck',showBrand);topbar.classList.toggle('show-brand',showBrand);document.body.classList.toggle('has-hero',hasHero)}updateTopbarState();window.addEventListener('scroll',()=>{if(!topbarRaf)topbarRaf=requestAnimationFrame(updateTopbarState)},{passive:true});
if('scrollRestoration' in history)history.scrollRestoration='manual';
window.addEventListener('popstate',e=>{const h=e.state;if(h?.filters)restoreFilters(h.filters);if(h?.route==='detail'&&h.id){renderDetail(h.id);return}if(h?.route==='knowledge'){showKnowledge({write:false});return}showRecipes({write:false,restoreScroll:Number(h?.scrollY)||0})});
function activeFilterEntries(){
  const entries=[];
  if(state.query.trim())entries.push({kind:'query',label:`Suche: ${state.query.trim()}`});
  if(state.category)entries.push({kind:'category',label:state.category});
  if(state.cuisine)entries.push({kind:'cuisine',label:state.cuisine});
  if(state.duration){
    const option=DURATION_OPTIONS.find(([value])=>value===String(state.duration));
    entries.push({kind:'duration',label:option?.[1]||`bis ${state.duration} Min.`});
  }
  state.ingredients.forEach((name,index)=>entries.push({kind:'ingredient',index,label:name}));
  return entries;
}
function activeFilterCount(){return activeFilterEntries().length}
function activeFiltersHtml(){
  const entries=activeFilterEntries();
  if(!entries.length)return '<span class="archive-filter-empty">Alle Rezepte</span>';
  return entries.map(entry=>`<button type="button" class="active-filter-chip" data-clear-filter="${entry.kind}" ${entry.index===undefined?'':`data-filter-index="${entry.index}"`}><span>${esc(entry.label)}</span><b aria-hidden="true">×</b></button>`).join('');
}
function clearActiveFilter(kind,index){
  if(kind==='query')state.query='';
  else if(kind==='category')state.category='';
  else if(kind==='cuisine')state.cuisine='';
  else if(kind==='duration')state.duration='';
  else if(kind==='ingredient'&&Number.isInteger(index))state.ingredients.splice(index,1);
  state.visible=PAGE_SIZE;
  renderRecipes();
}
function bindActiveFilterChips(){
  document.querySelectorAll('[data-clear-filter]').forEach(button=>button.addEventListener('click',()=>clearActiveFilter(button.dataset.clearFilter,Number(button.dataset.filterIndex))));
}
function renderActiveFilters(){
  const root=document.getElementById('activeFilters');if(!root)return;
  root.innerHTML=activeFiltersHtml();
  bindActiveFilterChips();
  const badge=document.getElementById('filterCountBadge'),count=activeFilterCount();
  if(badge){badge.textContent=String(count);badge.hidden=!count}
}
function resetRecipeFilters(){
  state.query='';state.category='';state.cuisine='';state.duration='';state.ingredients=[];state.sort='title';state.visible=PAGE_SIZE;
  renderRecipes();
}
function openRecipeFilters(){
  document.body.classList.add('archive-filters-open');
  document.getElementById('openFilters')?.setAttribute('aria-expanded','true');
  requestAnimationFrame(()=>document.getElementById('searchInput')?.focus({preventScroll:true}));
}
function closeRecipeFilters({restoreFocus=true}={}){
  document.body.classList.remove('archive-filters-open');
  document.getElementById('openFilters')?.setAttribute('aria-expanded','false');
  if(restoreFocus)document.getElementById('openFilters')?.focus({preventScroll:true});
}
function renderRecipes(){setNav('recipes');app.innerHTML=`
<section class="hero"><div class="shell"><div class="hero-panel"><div class="hero-copy"><h1>Gerds Rezepte</h1><p class="hero-tagline">Ein kuratiertes Rezeptarchiv aus über 50 Jahren Küche</p><div class="hero-meta"><span><strong>${fmtInt(DATA.meta.recipeCount)}</strong> ${Number(DATA.meta.recipeCount)===1?'Rezept':'Rezepte'}</span><span aria-hidden="true">·</span><span>Küchenwissen</span><span aria-hidden="true">·</span><span>Portionsrechner</span></div></div><div class="hero-art" aria-hidden="true"></div></div></div></section>
<div class="shell workspace">
  <button class="filter-backdrop" id="filterBackdrop" type="button" aria-label="Filter schließen"></button>
  <aside class="filters" id="recipeFilters" aria-label="Rezeptfilter">
    <div class="filter-title"><div><span>Rezeptauswahl</span><strong>Filter</strong></div><div class="filter-title-actions"><button class="link-btn" id="resetFilters" type="button">Zurücksetzen</button><button class="filter-close" id="closeFilters" type="button" aria-label="Filter schließen">×</button></div></div>
    <div class="field"><label for="searchInput">Suche</label><input class="control" id="searchInput" type="search" placeholder="Gericht oder Zutat …" value="${esc(state.query)}"></div>
    <div class="filter-grid-mobile">
      <div class="field"><label for="categoryPicker">Kategorie</label>${categoryPickerHtml()}</div>
      <div class="field"><label for="cuisinePicker">Hauptküche</label>${cuisinePickerHtml()}</div>
      <div class="field"><label for="durationPicker">Max. Gesamtdauer</label>${durationPickerHtml()}<div class="filter-note">Zeit ca.; aus Rezeptangaben und Arbeitsschritten abgeleitet.</div></div>
    </div>
    <div class="field"><label for="ingredientInput">Zutaten</label><div class="ingredient-wrap"><input class="control" id="ingredientInput" autocomplete="off" placeholder="z. B. Spargel, Lachs …"><div class="suggestions" id="ingredientSuggestions"></div></div><div class="filter-note">Mehrere Zutaten werden mit UND verknüpft.</div><div class="chips" id="ingredientChips"></div></div>
    <div class="filter-drawer-footer"><button type="button" id="filterApply">Rezepte anzeigen</button></div>
  </aside>
  <section class="catalog">
    <div class="catalog-head"><div><span class="category">Archiv</span><h2>Rezeptarchiv</h2><p id="resultCount"></p></div><div class="archive-toolbar"><button class="filter-open-button" id="openFilters" type="button" aria-controls="recipeFilters" aria-expanded="false">Filter <span id="filterCountBadge" hidden></span></button><div class="sort-field"><span>Sortieren</span>${sortPickerHtml()}</div></div></div>
    <div class="active-filter-bar" id="activeFilters" aria-label="Aktive Filter">${activeFiltersHtml()}</div>
    <div id="recipeResults"></div>
  </section>
</div>`;
const search=document.getElementById('searchInput');
search.addEventListener('input',e=>{state.query=e.target.value;state.visible=PAGE_SIZE;updateResults()});
document.getElementById('resetFilters').addEventListener('click',resetRecipeFilters);
document.getElementById('openFilters').addEventListener('click',openRecipeFilters);
document.getElementById('closeFilters').addEventListener('click',()=>closeRecipeFilters());
document.getElementById('filterBackdrop').addEventListener('click',()=>closeRecipeFilters());
document.getElementById('filterApply').addEventListener('click',()=>closeRecipeFilters());
document.getElementById('recipeFilters').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeRecipeFilters()}});
bindCategoryPicker();bindCuisinePicker();bindDurationPicker();bindSortPicker();setupIngredientInput();renderIngredientChips();renderActiveFilters();updateResults();}
function setupIngredientInput(){const inp=document.getElementById('ingredientInput'),box=document.getElementById('ingredientSuggestions');inp.addEventListener('input',()=>{const q=norm(inp.value),chosen=new Set(state.ingredients.map(norm));const hits=q?DATA.ingredientIndex.filter(x=>!chosen.has(norm(x.name))&&norm(x.name).includes(q)).slice(0,12):DATA.ingredientIndex.filter(x=>!chosen.has(norm(x.name))).slice(0,12);box.innerHTML=hits.map(x=>`<button type="button" data-ing="${esc(x.name)}"><span>${esc(x.name)}</span><small>${x.count}</small></button>`).join('');box.classList.toggle('open',!!hits.length);box.querySelectorAll('[data-ing]').forEach(b=>b.addEventListener('click',()=>addIngredient(b.dataset.ing)))});inp.addEventListener('focus',()=>inp.dispatchEvent(new Event('input')));document.addEventListener('click',e=>{if(!e.target.closest('.ingredient-wrap'))box.classList.remove('open')},{once:false});}
function addIngredient(name){if(!state.ingredients.some(x=>norm(x)===norm(name)))state.ingredients.push(name);document.getElementById('ingredientInput').value='';document.getElementById('ingredientSuggestions').classList.remove('open');state.visible=PAGE_SIZE;renderIngredientChips();updateResults()}
function renderIngredientChips(){const c=document.getElementById('ingredientChips');if(!c)return;c.innerHTML=state.ingredients.map((x,i)=>`<span class="chip">${esc(x)}<button type="button" data-remove="${i}" aria-label="${esc(x)} entfernen">×</button></span>`).join('');c.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{state.ingredients.splice(Number(b.dataset.remove),1);renderIngredientChips();updateResults()}))}
function filteredRecipes(){const q=norm(state.query),max=state.duration?Number(state.duration):null,ings=state.ingredients.map(norm);let list=DATA.recipes.filter(r=>(!q||r._search.includes(q))&&(!state.category||r.category===state.category)&&(!state.cuisine||r.cuisine===state.cuisine)&&(!max||r.durationMinutes<=max)&&ings.every(i=>r._tagSet.has(i)));list=[...list].sort((a,b)=>state.sort==='duration'?a.durationMinutes-b.durationMinutes||a.title.localeCompare(b.title,'de'):state.sort==='category'?a.category.localeCompare(b.category,'de')||a.title.localeCompare(b.title,'de'):state.sort==='cuisine'?a.cuisine.localeCompare(b.cuisine,'de')||(a.region||'').localeCompare(b.region||'','de')||a.title.localeCompare(b.title,'de'):a.title.localeCompare(b.title,'de'));return list}
function cardHtml(r){return window.GerdRecipeCard.render(r)}
function disconnectRecipeObserver(){if(recipeObserver){recipeObserver.disconnect();recipeObserver=null}}
function bindRecipeGridClicks(out){if(out.dataset.clickBound)return;out.dataset.clickBound='1';out.addEventListener('click',e=>{const card=e.target.closest('[data-recipe]');if(card)openRecipe(card.dataset.recipe)})}
function observeRecipeSentinel(list,out){disconnectRecipeObserver();const sentinel=out.querySelector('#recipeSentinel');if(!sentinel)return;if(!('IntersectionObserver' in window)){sentinel.innerHTML='<button class="secondary-btn" type="button">Weitere Rezepte laden</button>';sentinel.querySelector('button').addEventListener('click',()=>appendRecipeBatch(list,out));return}recipeObserver=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))appendRecipeBatch(list,out)},{root:null,rootMargin:'700px 0px',threshold:0});recipeObserver.observe(sentinel)}
function appendRecipeBatch(list,out){const grid=out.querySelector('.recipe-grid');const sentinel=out.querySelector('#recipeSentinel');if(!grid||!sentinel)return;const start=grid.children.length;if(start>=list.length){sentinel.remove();disconnectRecipeObserver();return}const end=Math.min(start+PAGE_SIZE,list.length);grid.insertAdjacentHTML('beforeend',list.slice(start,end).map(cardHtml).join(''));state.visible=end;if(end>=list.length){sentinel.remove();disconnectRecipeObserver()}}
function updateResults(){
  const list=filteredRecipes(),count=document.getElementById('resultCount'),out=document.getElementById('recipeResults');
  if(!count||!out)return;
  disconnectRecipeObserver();
  count.textContent=`${fmtInt(list.length)} von ${fmtInt(DATA.meta.recipeCount)} ${Number(DATA.meta.recipeCount)===1?'Rezept':'Rezepten'}`;
  const apply=document.getElementById('filterApply');if(apply)apply.textContent=`${fmtInt(list.length)} ${list.length===1?'Rezept':'Rezepte'} anzeigen`;
  renderActiveFilters();
  if(!list.length){
    out.innerHTML='<div class="empty archive-empty"><strong>Keine passenden Rezepte</strong><span>Entferne einen Filter oder ändere deine Suche.</span><button type="button" class="secondary-btn" id="emptyResetFilters">Filter zurücksetzen</button></div>';
    document.getElementById('emptyResetFilters')?.addEventListener('click',resetRecipeFilters);
    return;
  }
  state.visible=Math.min(Math.max(PAGE_SIZE,state.visible),list.length);
  const shown=list.slice(0,state.visible);
  out.innerHTML=`<div class="recipe-grid">${shown.map(cardHtml).join('')}</div>${shown.length<list.length?'<div class="infinite-sentinel" id="recipeSentinel" role="status" aria-label="Weitere Rezepte werden automatisch geladen"><span></span></div>':''}`;
  bindRecipeGridClicks(out);observeRecipeSentinel(list,out)
}
function stepsHtml(lines){return `<ol class="steps">${lines.map(x=>`<li><span>${glossaryHtml(x)}</span></li>`).join('')}</ol>`}
function tableFactor(table,target,main){if(main.scaleType==='factor')return target;if(main.scaleType==='portions'&&table.scaleType==='portions')return target/table.baseScale;return target/main.baseScale}
function ingredientsHtml(table,target,main){const factor=tableFactor(table,target,main);let lastGroup='',out='<ul class="ingredients">';table.ingredients.forEach(i=>{if(i.group&&i.group!==lastGroup){out+=`<li class="ing-group">${esc(i.group)}</li>`;lastGroup=i.group}const a=scaledAmount(i.quantity,factor);out+=`<li class="ingredient"><span class="amount">${a}${i.unit?`<span class="unit">${esc(displayUnit(i.unit))}</span>`:''}</span><span class="ingredient-name">${glossaryHtml(i.article)}</span></li>`});return out+'</ul>'}
function renderDetail(id){
  const r=DATA.recipes.find(x=>x.id===id);if(!r)return;
  state.route='detail';setNav('recipes');
  let target=r.scaleType==='factor'?1:r.baseScale;
  const control=r.scaleType==='batch'
    ?`<div class="portion-control"><button type="button" data-step="-0.5" aria-label="Menge verringern">−</button><input id="portionInput" type="number" min="0.1" max="100" step="0.5" value="${r.baseScale}"><span class="portion-unit">kg</span><button type="button" data-step="0.5" aria-label="Menge erhöhen">+</button></div>`
    :r.scaleType==='factor'
      ?`<div class="portion-control"><button type="button" data-step="-0.25" aria-label="Faktor verringern">−</button><input id="portionInput" type="number" min="0.25" max="20" step="0.25" value="1"><span class="portion-unit">×</span><button type="button" data-step="0.25" aria-label="Faktor erhöhen">+</button></div>`
      :`<div class="portion-control"><button type="button" data-step="-1" aria-label="Portionen verringern">−</button><input id="portionInput" type="number" min="1" max="100" step="1" value="${r.baseScale}"><span class="portion-unit">Port.</span><button type="button" data-step="1" aria-label="Portionen erhöhen">+</button></div>`;
  const taxonomy=[r.cuisine,r.region,r.style].filter(Boolean);
  app.innerHTML=`<div class="detail"><div class="shell">
    <button class="detail-back" id="detailBack" type="button">← Zurück zum Archiv</button>
    <div class="detail-hero">
      <div class="detail-main">
        <div class="detail-heading-meta"><span class="category">${esc(r.category)}</span><div class="detail-taxonomy">${taxonomy.map(value=>`<span>${esc(value)}</span>`).join('')}</div></div>
        <h1 class="detail-title">${esc(r.title)}</h1>
        <p class="detail-lead">${r.portionDescription?`Originale Portionsangabe: ${esc(r.portionDescription)}.`:'Die Mengen entsprechen der Basisrezeptur und werden proportional skaliert.'}</p>
        <div class="detail-meta">
          <span class="detail-meta-item"><small>Gesamt</small><strong>${fmtDuration(r.durationMinutes)}</strong></span>
          <span class="detail-meta-item"><small>Aktiv</small><strong>${fmtDuration(r.activeMinutes)}</strong></span>
          <span class="detail-meta-item"><small>Basis</small><strong>${esc(baseLabel(r))}</strong></span>
          ${r.subrecipes.length?`<span class="detail-meta-item"><small>Unterrezepte</small><strong>${r.subrecipes.length}</strong></span>`:''}
        </div>
        <p class="print-scale-summary" id="printScaleSummary">${r.scaleType==='batch'?`Mengen für ${formatNumber(r.baseScale)} kg Ansatz`:r.scaleType==='factor'?'Mengen für 1 × Rezept':`Mengen für ${portionLabel(r.baseScale)}`}</p>
        <div class="detail-command-bar">
          <div class="detail-command-primary"></div>
          <div class="detail-command-secondary"></div>
          <details class="detail-overflow">
            <summary aria-label="Weitere Rezeptaktionen" title="Weitere Aktionen">•••</summary>
            <div class="detail-overflow-panel"><button id="printRecipe" type="button">Rezept drucken</button></div>
          </details>
        </div>
        ${r.images.length?`<div class="gallery">${r.images.map((src,i)=>`<img src="${esc(src)}" alt="${esc(r.title)} – Originalbild ${i+1}">`).join('')}</div>`:''}
      </div>
      <aside class="portion-box">
        <div class="portion-box-head"><div><span>Mengen anpassen</span><label for="portionInput">${r.scaleType==='batch'?'Produktionsmenge':r.scaleType==='factor'?'Rezeptfaktor':'Gewünschte Portionen'}</label></div><button id="resetScale" class="portion-reset" type="button">Basis</button></div>
        ${control}
        <small id="scaleHint">Basisrezept: ${esc(baseLabel(r))}</small>
      </aside>
    </div>
    <div class="recipe-content"><div><section class="section-card"><h2 class="section-title">Zutaten</h2><div id="mainIngredients"></div><div id="mainSeasoningAdvice"></div>${r.notes.length?`<div class="notes"><strong>Hinweise</strong>${r.notes.map(x=>`<p>${glossaryHtml(x)}</p>`).join('')}</div>`:''}</section></div><div>${r.preparation.length?`<section class="process-section"><h2 class="section-title">Vorbereitung</h2>${stepsHtml(r.preparation)}</section>`:''}${r.cooking.length?`<section class="process-section"><h2 class="section-title">Zubereitung</h2>${stepsHtml(r.cooking)}</section>`:''}<p class="fineprint">Quelle: Originalarchiv · ${esc(r.category)}. Zeitangaben sind teilweise aus ausdrücklich genannten Ruhe-/Garzeiten und Arbeitsschritten abgeleitet.</p></div></div>
    ${r.subrecipes.length?`<section class="subrecipes subrecipes-full"><div class="subrecipes-heading"><span class="category">Bestandteile</span><h2 class="section-title">Unterrezepte</h2><p>Einzeln aufklappen oder direkt im eigenen Kochmodus zubereiten.</p></div><div id="subrecipes"></div></section>`:''}
  </div></div>`;
  const input=document.getElementById('portionInput');
  function clamp(v){const min=r.scaleType==='batch'?0.1:r.scaleType==='factor'?0.25:1,max=r.scaleType==='factor'?20:100;v=Number(v);if(!Number.isFinite(v))v=r.scaleType==='factor'?1:r.baseScale;return Math.min(max,Math.max(min,v))}
  function updateScale(v){target=clamp(v);input.value=r.scaleType==='portions'?String(Math.round(target)):String(Math.round(target*100)/100);renderIngredients(r,target);const f=r.scaleType==='factor'?target:target/r.baseScale;document.getElementById('scaleHint').textContent=`Faktor ${formatNumber(f)} × zur Basis (${baseLabel(r)})`;const ps=document.getElementById('printScaleSummary');if(ps)ps.textContent=r.scaleType==='batch'?`Mengen für ${formatNumber(target)} kg Ansatz`:r.scaleType==='factor'?`Mengen für ${formatNumber(target)} × Rezept`:`Mengen für ${portionLabel(target)}`}
  input.addEventListener('input',()=>updateScale(input.value));
  document.querySelectorAll('[data-step]').forEach(b=>b.addEventListener('click',()=>updateScale(target+Number(b.dataset.step))));
  document.getElementById('resetScale').addEventListener('click',()=>updateScale(r.scaleType==='factor'?1:r.baseScale));
  document.getElementById('printRecipe').addEventListener('click',()=>window.print());
  document.getElementById('detailBack').addEventListener('click',()=>{const h=history.state;if(h?.route==='detail'&&h.fromArchive)history.back();else showRecipes({replace:true})});
  renderIngredients(r,target);scrollTo({top:0,behavior:'smooth'})
}
function renderIngredients(r,target){document.getElementById('mainIngredients').innerHTML=ingredientsHtml(r,target,r);const advice=document.getElementById('mainSeasoningAdvice');if(advice)advice.innerHTML=seasoningAdviceHtml(r,target,r);const sub=document.getElementById('subrecipes');if(!sub)return;sub.innerHTML=r.subrecipes.map((s,i)=>{const stepCount=(s.preparation?.length||0)+(s.cooking?.length||0);return `<details class="subrecipe" ${i===0&&r.subrecipes.length===1?'open':''}><summary><span>${esc(s.title||s.sheet)}</span><small>${stepCount} Schritt${stepCount===1?'':'e'}</small></summary><div class="sub-inner"><div><h3>Zutaten</h3>${ingredientsHtml(s,target,r)}${seasoningAdviceHtml(s,target,r)}${s.notes.length?`<div class="notes"><strong>Hinweise</strong>${s.notes.map(x=>`<p>${glossaryHtml(x)}</p>`).join('')}</div>`:''}</div><div>${s.preparation.length?`<h3>Vorbereitung</h3>${stepsHtml(s.preparation)}`:''}${s.cooking.length?`<h3 class="subrecipe-cooking-title">Zubereitung</h3>${stepsHtml(s.cooking)}`:''}</div></div></details>`}).join('')}
function renderKnowledge(){setNav('knowledge');const f=DATA.knowledge.foreword,m=DATA.knowledge.measures,g=DATA.knowledge.methods;const groups=[...new Set(m.map(x=>x.section))];app.innerHTML=`<div class="knowledge"><div class="shell"><div class="knowledge-head"><span class="category">Aus dem Originalarchiv</span><h1>Küchenwissen</h1><p>Vorwort, Maße und Gewichte sowie Garmethoden aus den ergänzenden Blättern des Rezeptarchivs.</p></div><div class="knowledge-layout"><nav class="knowledge-nav"><a href="#vorwort">Vorwort</a><a href="#masse">Maße & Gewichte</a><a href="#garmethoden">Garmethoden</a></nav><div><section id="vorwort" class="knowledge-section"><h2>Vorwort</h2>${f.map(s=>`<article class="prose-card"><h3>${esc(s.title)}</h3>${s.paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}</article>`).join('')}</section><section id="masse" class="knowledge-section"><h2>Maße & Gewichte</h2><div class="measure-scroll"><table class="measure-table"><thead><tr><th>Angabe</th><th>Entspricht</th><th>Hinweis</th></tr></thead><tbody>${groups.map(gr=>`<tr class="measure-group"><td colspan="3">${esc(gr)}</td></tr>${m.filter(x=>x.section===gr).map(x=>`<tr><td>${esc(x.left)}</td><td>${esc(x.middle)}</td><td>${esc(x.right)}</td></tr>`).join('')}`).join('')}</tbody></table></div></section><section id="garmethoden" class="knowledge-section"><h2>Garmethoden</h2><div class="method-grid">${g.map(x=>`<article class="method"><h3>${glossaryHtml(x.term)}</h3>${x.description.map(p=>`<p>${glossaryHtml(p)}</p>`).join('')}</article>`).join('')}</div></section></div></div></div></div>`}
document.addEventListener('click',e=>{if(!e.target.closest('.glossary-term'))document.querySelectorAll('.glossary-term:focus').forEach(el=>el.blur())});
function initialRoute(){const h=location.hash||'';const m=h.match(/^#rezept=(.+)$/);if(m){const id=decodeURIComponent(m[1]);if(DATA.recipes.some(r=>r.id===id)){writeHistory('detail',{id,replace:true,fromArchive:false});renderDetail(id);return}}if(h==='#kuechenwissen'){showKnowledge({replace:true});return}showRecipes({replace:true})}
initialRoute();
})();
