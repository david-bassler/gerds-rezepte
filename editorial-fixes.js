(()=>{
'use strict';
const DATA=window.GERDS_REZEPTE;
if(!DATA||!Array.isArray(DATA.recipes))return;

const DECIMAL_MARK='\uE000';
const UNIT_CANONICAL={
  'st':'Stk.','st.':'Stk.','stk':'Stk.','stk.':'Stk.','stück':'Stk.',
  'gr':'g','g':'g','kg':'kg','ml':'ml','cl':'cl','l':'L',
  'bd':'Bund','bund':'Bund','zwg':'Zweig','zweig':'Zweig',
  'tl':'TL','el':'EL','msp':'Msp.','msp.':'Msp.',
  'spritz':'Spritzer','spritzer':'Spritzer','scheib.':'Scheibe','scheibe':'Scheibe'
};
function canonicalUnit(value){
  const raw=String(value??'').trim();
  return UNIT_CANONICAL[raw.toLocaleLowerCase('de-DE')]||raw;
}
function lowerFirst(value){
  const text=String(value??'');
  return text?text[0].toLocaleLowerCase('de-DE')+text.slice(1):text;
}
function cleanKnownSpelling(value){
  return String(value??'')
    .replace(/\bAbtropfgeweicht\b/gi,'Abtropfgewicht')
    .replace(/\bHokaido/g,'Hokkaido')
    .replace(/\bTzaziki\b/gi,'Tzatziki')
    .replace(/\bGarneln\b/gi,'Garnelen')
    .replace(/\bAsiat\.\s+Nudelgericht\b/gi,'Asiatisches Nudelgericht')
    .replace(/\bCreme\s+fraiche\b/gi,'Crème fraîche')
    .replace(/\bBroccoli/gi,'Brokkoli')
    .replace(/\bCousCous\b/g,'Couscous')
    .replace(/\bDipp\b/gi,'Dip')
    .replace(/\bDijon\s*-\s*Senf\b|\bDijonsenf\b/gi,'Dijon-Senf')
    .replace(/\bMu\s*-?\s*Err\s*-?\s*Pilze\b/gi,'Mu-Err-Pilze')
    .replace(/\bDs\.?\s*-\s*Tomaten\b/gi,'Dosentomaten')
    .replace(/\bDs\.?\s*-\s*Kichererbsen\b/gi,'Dosenkichererbsen')
    .replace(/\bDs\.?\s*-\s*Thunfisch\b/gi,'Dosenthunfisch')
    .replace(/\bSauce\s+Bearnaise\b/g,'Sauce Béarnaise');
}
function expandArchiveAbbreviations(value){
  let text=String(value??'');

  // Fleisch- und Produktabkürzungen aus dem Archiv ausschreiben.
  text=text.replace(/\bS\.\s*(Füße|Rückenspeck|Schmalz|Bauch|Bug|Kamm|Schwarte|Speck|Hals|Kopf|Leber|Nacken|Nuss|Zunge)\b/g,
    (all,part)=>`Schweine${lowerFirst(part)}`);
  text=text.replace(/\bRi\.\s*-\s*Rumpsteak\b/gi,'Rinderrumpsteak');
  text=text.replace(/\bRi\.\s*Fleisch\b/gi,'Rindfleisch');
  text=text.replace(/\bPu\.\s*Brust\b/gi,'Putenbrust');
  text=text.replace(/\bPu\.\s*Unterkeulen\b/gi,'Putenunterkeulen');
  text=text.replace(/\bKn\.(?=\s|,|\)|$)/gi,'Knochen');
  text=text.replace(/\bHt\.?(?=\s|,|\)|$)/gi,'Haut');

  // Zustands- und Gewürzabkürzungen.
  text=text.replace(/\bfr\.\s*gem\.(?=\s|,|$)/gi,'frisch gemahlen');
  text=text.replace(/\bfr\.\s*gemahlen\b/gi,'frisch gemahlen');
  text=text.replace(/\bfr\.\s*Ananas\b/gi,'frische Ananas');
  text=text.replace(/\bfr\.\s*Lorbeerblatt\b/gi,'frisches Lorbeerblatt');
  text=text.replace(/\bschw\.\s*Pfeffer\b/gi,'schwarzer Pfeffer');
  text=text.replace(/\bgem\.(?=\s|,|$)/gi,'gemahlen');
  text=text.replace(/\bgetr\.(?=\s|,|$)/gi,'getrocknet');
  text=text.replace(/\bSchw\.(?=\s|,|\)|$)/g,'Schwarte');

  // „m.“ kommt in diesen Archivzeilen ausschließlich vor Haut/Knochen vor.
  text=text.replace(/\bm\.\s*(?=(?:Haut|Knochen)\b)/gi,'mit ');

  // „o.“ bedeutet vor entfernten Bestandteilen „ohne“, sonst „oder“.
  // Das einzelne „O.-saft“ ist hingegen Orangensaft.
  text=text.replace(/\bO\.\s*-\s*saft\b/g,'Orangensaft');
  text=text.replace(/\bo\.\s*-\s*Stein\b/gi,'ohne Stein');
  text=text.replace(/\bo\.\s*(?=(?:Knochen|Haut|Schwarte|Schale|Kopf|Gräten)\b)/gi,'ohne ');
  text=text.replace(/\bo\.\s*-\s*/gi,'oder ');
  text=text.replace(/\bo\.\s*/gi,'oder ');
  text=text.replace(/\bohne (Knochen|Haut|Schwarte|Schale|Kopf|Gräten)\s+ohne /gi,'ohne $1 und ohne ');

  // Weitere eindeutige Archivnotationen.
  text=text.replace(/\ba[´']\s*(?=\d)/gi,'à ');
  return text;
}
function normalizeDairyText(value){
  let text=String(value??'');
  text=text.replace(/(\d+(?:,\d+)?)\s*%\s*Fettgehalt\b/gi,'$1 % Fett');
  text=text.replace(/\b(Joghurt(?:,\s*natur|\s+natur)?|Griechischer Joghurt|Quark|Schmand|Crème fraîche|Sahne|Sauerrahm)\s*,?\s*(\d+(?:,\d+)?)\s*%(?!\s*Fett\b)/gi,
    (all,product,percent)=>`${product}, ${percent} % Fett`);
  text=text.replace(/\bJoghurt,\s*natur\b/gi,'Naturjoghurt');
  text=text.replace(/\bJoghurt\s+natur\b/gi,'Naturjoghurt');
  return text;
}
function normalizeSauceWord(value){
  return String(value??'').replace(/\bSauce\b(?!\s+(?:Béarnaise|Aurore|Dijon)\b)/g,'Soße');
}
function cleanCompoundSpacing(value){
  return String(value??'')
    // Fehlerhafte Punkte vor einem ausgelassenen Kompositum: „Raps.- oder“ -> „Raps- oder“.
    .replace(/([A-Za-zÄÖÜäöüß])\.\s*-\s*(?=(?:oder|und)\b)/gi,'$1- ')
    // Echte Zusammensetzungen schließen: „Curry- Joghurtsoße“ -> „Curry-Joghurtsoße“.
    // Auslassungsformen wie „Rot- oder Weißwein“ bleiben unverändert.
    .replace(/([A-Za-zÄÖÜäöüß])-\s+(?!(?:oder|und|bzw\.)\b)/gi,'$1-');
}
function addDescriptorComma(value){
  return String(value??'').replace(/^(.+?)\s+(frisch|trocken|unbehandelt|mittelalt|nativ|Fertigprodukt)$/i,(all,base,descriptor)=>{
    if(/(?:oder|und|alternativ)\s*$/i.test(base)||/,\s*$/.test(base))return all;
    return `${base}, ${descriptor}`;
  });
}
function cleanEditorialText(value,{ingredient=false}={}){
  let text=cleanCompoundSpacing(expandArchiveAbbreviations(cleanKnownSpelling(value))).trim();
  if(!text)return text;

  // Dezimalkomma zuerst schützen, damit „3,5 %“ nie als redaktionelles Komma behandelt wird.
  text=text.replace(/(\d)\s*,\s*(\d)/g,(_,left,right)=>`${left}${DECIMAL_MARK}${right}`);
  if(ingredient)text=text.replace(/\s*,\s*/g,', ');
  text=text.replaceAll(DECIMAL_MARK,',');

  text=text.replace(/(\d(?:,\d+)?)\s*%/g,'$1 %');
  text=text.replace(/\b(\d+(?:,\d+)?)\s*gr\.?\b/gi,'$1 g');
  text=text.replace(/\b(\d+(?:,\d+)?)\s*(kg|g|ml|cl|mm|cm)\b/gi,'$1 $2');
  text=text.replace(/\b(\d+)\s*(Blatt|Scheibe|Stk\.?|EL|TL)\b/gi,'$1 $2');
  text=text.replace(/\(\s+/g,'(').replace(/\s+\)/g,')');
  text=text.replace(/\b(EL|TL|Scheibe|Ei|Blatt|Stk\.?)\s*=\s*(?=\d)/gi,'$1 = ');
  text=text.replace(/\bNetto\s*=\s*(?=\d)/gi,'Netto = ');
  text=text.replace(/[ \t]{2,}/g,' ');
  text=normalizeDairyText(text);
  text=normalizeSauceWord(text);
  if(ingredient){
    text=text.replace(/,\s*-\s+oder\b/gi,'- oder');
    text=addDescriptorComma(text);
  }
  return text.trim();
}
function cleanIngredientText(value){return cleanEditorialText(value,{ingredient:true})}
function cleanTitleText(value){
  return cleanEditorialText(value)
    .replace(/\bArt\s+Art\b/g,'Art')
    .trim();
}
function cleanIngredient(ingredient){
  if(!ingredient)return;
  for(const field of ['article','product','label','state']){
    if(typeof ingredient[field]==='string')ingredient[field]=cleanIngredientText(ingredient[field]);
  }
  if(typeof ingredient.unit==='string')ingredient.unit=canonicalUnit(ingredient.unit);
  if(typeof ingredient.purchaseUnit==='string')ingredient.purchaseUnit=canonicalUnit(ingredient.purchaseUnit);
  if(typeof ingredient.quantityBasis?.displaySuffix==='string'){
    ingredient.quantityBasis.displaySuffix=cleanIngredientText(ingredient.quantityBasis.displaySuffix);
  }
}
function rebuildIngredientIndex(){
  const counts=new Map();
  const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();
  for(const recipe of DATA.recipes){
    for(const tag of recipe.tags||[]){
      const key=norm(tag);if(!key)continue;
      const current=counts.get(key);
      if(current)current.count+=1;else counts.set(key,{name:tag,count:1});
    }
  }
  DATA.ingredientIndex=[...counts.values()].sort((a,b)=>a.name.localeCompare(b.name,'de'));
}

for(const recipe of DATA.recipes){
  if(typeof recipe.title==='string')recipe.title=cleanTitleText(recipe.title);
  if(typeof recipe.portionDescription==='string')recipe.portionDescription=cleanIngredientText(recipe.portionDescription);
  if(Array.isArray(recipe.tags))recipe.tags=recipe.tags.map(tag=>cleanIngredientText(tag));
  const tables=[recipe,...(Array.isArray(recipe.subrecipes)?recipe.subrecipes:[])];
  for(const table of tables){
    if(table!==recipe&&typeof table?.title==='string')table.title=cleanTitleText(table.title);
    if(Array.isArray(table?.ingredients))table.ingredients.forEach(cleanIngredient);
    for(const field of ['notes','preparation','cooking']){
      if(Array.isArray(table?.[field]))table[field]=table[field].map(text=>cleanEditorialText(text));
    }
  }
}
rebuildIngredientIndex();
})();
