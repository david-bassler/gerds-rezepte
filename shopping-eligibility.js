(()=>{
'use strict';
const DATA=window.GERDS_REZEPTE;
if(!DATA||!Array.isArray(DATA.recipes))return;

const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();
function canonicalReferenceText(value){
  return String(value??'').trim()
    .replace(/\bUnterezept\b/gi,'Unterrezept')
    .replace(/\bsie\s+(?=Unterrezept\b)/gi,'siehe ');
}
function referenceInfo(value){
  const match=norm(value).match(/(?:^| )(?:siehe|aus(?: dem)?) (unterrezept|hauptrezept)(?: ([ivx]+))?(?: |$)/);
  if(!match)return null;
  const isMain=match[1]==='hauptrezept';
  return {kind:isMain?'main':'subrecipe',index:isMain?null:(match[2]||'').toUpperCase()||null};
}
function isRecipeReference(value){return !!referenceInfo(value)}
function normalizeReferenceIngredient(ingredient){
  if(!ingredient)return;
  for(const field of ['article','product','label']){
    if(typeof ingredient[field]==='string')ingredient[field]=canonicalReferenceText(ingredient[field]);
  }
  const reference=referenceInfo(ingredient.label||ingredient.article||ingredient.product);
  if(reference){ingredient.recipeReference=reference;ingredient.shoppingEligible=false}
}
function patchKnownMissingReference(recipe){
  if(norm(recipe?.title)!=='kaiserschmarren kompott'||!Array.isArray(recipe.ingredients))return;
  const ingredient=recipe.ingredients.find(item=>norm(item?.product||item?.article)==='apfel oder kirschkompott');
  if(!ingredient||referenceInfo(ingredient.label||ingredient.article||ingredient.product))return;
  const base=String(ingredient.product||ingredient.article||ingredient.label||'Apfel.- oder Kirschkompott').trim();
  const label=`${base}, siehe Unterrezept I`;
  ingredient.article=label;
  ingredient.product=label;
  ingredient.label=label;
  ingredient.recipeReference={kind:'subrecipe',index:'I'};
  ingredient.shoppingEligible=false;
}
for(const recipe of DATA.recipes){
  patchKnownMissingReference(recipe);
  const tables=[recipe,...(Array.isArray(recipe.subrecipes)?recipe.subrecipes:[])];
  for(const table of tables){
    if(Array.isArray(table.ingredients))table.ingredients.forEach(normalizeReferenceIngredient);
  }
}

function recipeById(id){return DATA.recipes.find(recipe=>recipe.id===id)||null}
function currentRecipe(){
  const match=(location.hash||'').match(/^#rezept=(.+)$/);
  return match?recipeById(decodeURIComponent(match[1])):null;
}
function ingredientForRow(row){
  const recipe=currentRecipe();
  if(!recipe||!row)return null;
  const sub=row.closest('#subrecipes .subrecipe');
  if(sub){
    const details=[...document.querySelectorAll('#subrecipes .subrecipe')];
    const subIndex=details.indexOf(sub);
    const ingredientIndex=[...sub.querySelectorAll('li.ingredient')].indexOf(row);
    return recipe.subrecipes?.[subIndex]?.ingredients?.[ingredientIndex]||null;
  }
  const main=document.getElementById('mainIngredients');
  if(!main?.contains(row))return null;
  const ingredientIndex=[...main.querySelectorAll('li.ingredient')].indexOf(row);
  return recipe.ingredients?.[ingredientIndex]||null;
}
function isBlockedRow(row){return ingredientForRow(row)?.shoppingEligible===false}
function neutralizeReferenceRows(){
  document.querySelectorAll('li.ingredient').forEach(row=>{
    if(!isBlockedRow(row))return;
    row.classList.remove('is-shopping-enabled','is-in-shopping');
    row.removeAttribute('data-shopping-contribution');
    row.removeAttribute('aria-pressed');
    row.removeAttribute('role');
    row.removeAttribute('tabindex');
    row.removeAttribute('title');
    row.dataset.recipeReference='1';
  });
}
function cleanupStoredReferenceRows(){
  document.querySelectorAll('.shopping-row').forEach(row=>{
    const article=row.querySelector('.shopping-name strong')?.textContent||'';
    if(!isRecipeReference(article))return;
    row.hidden=true;
    const remove=row.querySelector('[data-shop-remove]');
    if(remove&&!remove.dataset.referenceCleanup){remove.dataset.referenceCleanup='1';remove.click()}
  });
}
function apply(){neutralizeReferenceRows();cleanupStoredReferenceRows()}
function blockReferenceInteraction(event){
  const row=event.target?.closest?.('li.ingredient');
  if(!row||!isBlockedRow(row))return;
  event.preventDefault();
  event.stopImmediatePropagation();
}
document.addEventListener('click',blockReferenceInteraction,true);
document.addEventListener('keydown',event=>{
  if(event.key==='Enter'||event.key===' ')blockReferenceInteraction(event);
},true);
let queued=false;
function queueApply(){
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{queued=false;apply()});
}
new MutationObserver(queueApply).observe(document.body,{childList:true,subtree:true});
window.addEventListener('hashchange',queueApply);
window.addEventListener('popstate',queueApply);
queueApply();
})();
