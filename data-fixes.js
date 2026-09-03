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
  const raw=String(value??'').trim();
  const parts=raw.split(',').map(part=>part.trim()).filter(Boolean);
  const states=[];
  while(parts.length>1&&isPreparationState(parts[parts.length-1]))states.unshift(parts.pop());
  return {product:(parts.join(', ')||raw),state:states.join(', ')};
}
function isSingularQuantity(quantity){
  if(quantity?.kind==='number')return Math.abs(Number(quantity.value)-1)<1e-9;
  if(quantity?.kind==='range')return Math.abs(Number(quantity.min)-1)<1e-9&&Math.abs(Number(quantity.max)-1)<1e-9;
  return null;
}
function enrichIngredient(ingredient){
  if(!ingredient||typeof ingredient.article!=='string')return;
  ingredient.article=canonicalEggArticle(ingredient.article);
  const split=splitIngredientArticle(ingredient.article);
  if(!String(ingredient.product??'').trim())ingredient.product=split.product;
  if(!String(ingredient.state??'').trim()&&split.state)ingredient.state=split.state;
  const unit=norm(ingredient.unit);
  const singular=isSingularQuantity(ingredient.quantity);
  if((unit==='scheib'||unit==='scheibe'||unit==='scheiben')&&singular!==null)ingredient.unit=singular?'Scheibe':'Scheiben';
}
for(const recipe of DATA.recipes){
  const tables=[recipe,...(Array.isArray(recipe.subrecipes)?recipe.subrecipes:[])];
  for(const table of tables){
    if(!Array.isArray(table.ingredients))continue;
    table.ingredients.forEach(enrichIngredient);
  }
  const hasEgg=tables.some(table=>Array.isArray(table.ingredients)&&table.ingredients.some(ingredient=>hasRealEggArticle(ingredient?.article)));
  const tags=(Array.isArray(recipe.tags)?recipe.tags:[]).map(canonicalEggArticle).filter(tag=>norm(tag)!=='ei'||hasEgg);
  recipe.tags=uniqueTags(tags);
}
const counts=new Map();
for(const recipe of DATA.recipes){
  for(const tag of recipe.tags||[]){const key=norm(tag);if(!key)continue;const current=counts.get(key);if(current)current.count+=1;else counts.set(key,{name:tag,count:1})}
}
DATA.ingredientIndex=[...counts.values()].sort((a,b)=>a.name.localeCompare(b.name,'de'));
})();
