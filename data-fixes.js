(()=>{
'use strict';
const DATA=window.GERDS_REZEPTE;
if(!DATA||!Array.isArray(DATA.recipes))return;
const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();
function canonicalEggArticle(value){
  const raw=String(value??'').trim();
  const a=norm(raw);
  const m=a.match(/^(?:eier|ei(?: er)?) (?:grosse|groesse|klasse|gr|kl) (s|m|l|xl)$/);
  return m?`Eier Größe ${m[1].toUpperCase()}`:raw;
}
function hasRealEggArticle(value){
  const a=` ${norm(value)} `;
  return / (?:ei|eier|eigelb|eidotter|eiweiss|eiklar|vollei|huhnerei|huhnereier|huehnerei|huehnereier|eimasse|eiermasse|eipulver|eierstich) /.test(a);
}
function uniqueTags(tags){
  const seen=new Set(),out=[];
  for(const tag of tags){const key=norm(tag);if(!key||seen.has(key))continue;seen.add(key);out.push(tag)}
  return out;
}

// Nur reine Küchenzustände abtrennen. Einkaufsrelevante Merkmale wie
// „trocken“, „frisch“, Fettgehalt, Sorte oder Qualität bleiben beim Produkt.
const SIMPLE_PREPARATION_STATES=new Set([
  'zerlassen','geschmolzen','gekocht','gegart','blanchiert','geschalt','entkernt','entsteint',
  'abgetropft','aufgetaut','puriert','zerdruckt','passiert','gehobelt','netto'
]);
function isPreparationState(value){
  const state=norm(value);
  if(!state)return false;
  if(SIMPLE_PREPARATION_STATES.has(state))return true;
  if(/^(?:(?:sehr|extra) )?(?:(?:fein|grob) )?(?:gewurfelt|gehackt|gerieben|geschnitten|geschrotet)$/.test(state))return true;
  if(/^(?:frisch )?(?:(?:fein|grob) )?gerieben$/.test(state))return true;
  return /^in .+ (?:wurfel|scheiben|ringe|streifen|stucke)$/.test(state);
}
function splitIngredientArticle(value){
  const label=String(value??'').trim();
  const parts=label.split(',').map(part=>part.trim()).filter(Boolean);
  const states=[];
  while(parts.length>1&&isPreparationState(parts[parts.length-1]))states.unshift(parts.pop());
  return {label,product:(parts.join(', ')||label),state:states.join(', ')};
}
function enrichIngredient(ingredient){
  if(!ingredient||typeof ingredient.article!=='string')return;
  const canonical=canonicalEggArticle(ingredient.article);
  const split=splitIngredientArticle(canonical);
  ingredient.label=String(ingredient.label??split.label).trim()||split.label;
  ingredient.product=String(ingredient.product??split.product).trim()||split.product;
  ingredient.state=String(ingredient.state??split.state).trim();
  // article bleibt als Kompatibilitätsfeld bestehen, bezeichnet nun aber das kaufbare Produkt.
  // Die Rezeptansicht rekonstruiert product + state über ingredient-ui.js.
  ingredient.article=ingredient.product;
}
for(const recipe of DATA.recipes){
  const tables=[recipe,...(Array.isArray(recipe.subrecipes)?recipe.subrecipes:[])];
  for(const table of tables){
    if(!Array.isArray(table.ingredients))continue;
    table.ingredients.forEach(enrichIngredient);
  }
  const hasEgg=tables.some(table=>Array.isArray(table.ingredients)&&table.ingredients.some(ingredient=>hasRealEggArticle(ingredient?.product||ingredient?.article)));
  const tags=(Array.isArray(recipe.tags)?recipe.tags:[]).map(canonicalEggArticle).filter(tag=>norm(tag)!=='ei'||hasEgg);
  recipe.tags=uniqueTags(tags);
}
const counts=new Map();
for(const recipe of DATA.recipes){
  for(const tag of recipe.tags||[]){const key=norm(tag);if(!key)continue;const current=counts.get(key);if(current)current.count+=1;else counts.set(key,{name:tag,count:1})}
}
DATA.ingredientIndex=[...counts.values()].sort((a,b)=>a.name.localeCompare(b.name,'de'));
})();
