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
function cleanKnownSpelling(value){
  return String(value??'')
    .replace(/\bAbtropfgeweicht\b/gi,'Abtropfgewicht')
    .replace(/\bHokaido/g,'Hokkaido')
    .replace(/\bTzaziki\b/gi,'Tzatziki')
    .replace(/\bCreme\s+fraiche\b/gi,'Crème fraîche')
    .replace(/\bBroccoli/gi,'Brokkoli')
    .replace(/\bCousCous\b/g,'Couscous')
    .replace(/\bDipp\b/gi,'Dip')
    .replace(/\bDijon\s*-\s*Senf\b|\bDijonsenf\b/gi,'Dijon-Senf')
    .replace(/\bMu\s*-?\s*Err\s*-?\s*Pilze\b/gi,'Mu-Err-Pilze')
    .replace(/\bDs\.?\s*-\s*Tomaten\b/gi,'Dosentomaten')
    .replace(/\bDs\.?\s*-\s*Kichererbsen\b/gi,'Dosenkichererbsen')
    .replace(/\bDs\.?\s*-\s*Thunfisch\b/gi,'Dosenthunfisch');
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
function cleanIngredientText(value){
  let text=cleanCompoundSpacing(cleanKnownSpelling(value)).trim();
  if(!text)return text;

  // Dezimalkomma zuerst schützen, damit „3,5 %“ nie als redaktionelles Komma behandelt wird.
  text=text.replace(/(\d)\s*,\s*(\d)/g,(_,left,right)=>`${left}${DECIMAL_MARK}${right}`);
  text=text.replace(/\s*,\s*/g,', ');
  text=text.replaceAll(DECIMAL_MARK,',');

  // Eindeutige Typografie in Zutatenangaben.
  text=text.replace(/,\s*-\s+oder\b/gi,'- oder');
  text=text.replace(/(\d(?:,\d+)?)\s*%/g,'$1 %');
  text=text.replace(/\b(\d+(?:,\d+)?)\s*(kg|g|ml|cl|mm|cm)\b/gi,'$1 $2');
  text=text.replace(/\b(\d+)\s*(Blatt|Scheibe|Stk\.?|EL|TL)\b/gi,'$1 $2');
  text=text.replace(/\(\s+/g,'(').replace(/\s+\)/g,')');
  text=text.replace(/\b(EL|TL|Scheibe|Ei|Blatt|Stk\.?)\s*=\s*(?=\d)/gi,'$1 = ');
  text=text.replace(/\bNetto\s*=\s*(?=\d)/gi,'Netto = ');
  text=text.replace(/[ \t]{2,}/g,' ');
  text=addDescriptorComma(text);
  return text.trim();
}
function cleanTitleText(value){
  return cleanCompoundSpacing(cleanKnownSpelling(value))
    .replace(/\bArt\s+Art\b/g,'Art')
    .replace(/[ \t]{2,}/g,' ')
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
      if(Array.isArray(table?.[field]))table[field]=table[field].map(text=>cleanCompoundSpacing(cleanKnownSpelling(text)).replace(/[ \t]{2,}/g,' ').trim());
    }
  }
}
rebuildIngredientIndex();
})();
