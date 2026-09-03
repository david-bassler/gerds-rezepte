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
  return / (?:ei|eier|eigelb|eiweiss|eiklar|vollei|huehnerei|huehnereier|eimasse|eiermasse) /.test(a);
}
function uniqueTags(tags){
  const seen=new Set(),out=[];
  for(const tag of tags){const key=norm(tag);if(!key||seen.has(key))continue;seen.add(key);out.push(tag)}
  return out;
}
for(const recipe of DATA.recipes){
  const tables=[recipe,...(Array.isArray(recipe.subrecipes)?recipe.subrecipes:[])];
  for(const table of tables){
    if(!Array.isArray(table.ingredients))continue;
    for(const ingredient of table.ingredients){if(ingredient&&typeof ingredient.article==='string')ingredient.article=canonicalEggArticle(ingredient.article)}
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
