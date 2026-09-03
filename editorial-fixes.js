(()=>{
'use strict';
const DATA=window.GERDS_REZEPTE;
if(!DATA||!Array.isArray(DATA.recipes))return;

const DECIMAL_MARK='\uE000';
function cleanKnownSpelling(value){
  return String(value??'')
    .replace(/\bAbtropfgeweicht\b/gi,'Abtropfgewicht')
    .replace(/\bHokaido/g,'Hokkaido')
    .replace(/\bTzaziki\b/g,'Tzatziki');
}
function cleanIngredientText(value){
  let text=cleanKnownSpelling(value).trim();
  if(!text)return text;

  // Dezimalkomma zuerst schützen, damit das redaktionelle Komma-Spacing
  // aus „3,5 %“ niemals wieder „3, 5 %“ machen kann.
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
  return text.trim();
}
function cleanTitleText(value){
  return cleanKnownSpelling(value)
    .replace(/\bArt\s+Art\b/g,'Art')
    .replace(/[ \t]{2,}/g,' ')
    .trim();
}
function cleanIngredient(ingredient){
  if(!ingredient)return;
  for(const field of ['article','product','label','state']){
    if(typeof ingredient[field]==='string')ingredient[field]=cleanIngredientText(ingredient[field]);
  }
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
      if(Array.isArray(table?.[field]))table[field]=table[field].map(text=>cleanKnownSpelling(text).replace(/[ \t]{2,}/g,' ').trim());
    }
  }
}
rebuildIngredientIndex();
})();
