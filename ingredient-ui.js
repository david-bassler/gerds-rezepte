(()=>{
'use strict';
const DATA=window.GERDS_REZEPTE;
if(!DATA||!Array.isArray(DATA.recipes))return;

const UNIT_FORMS={
  'Stk.':['Stück','Stück'],
  'Stück':['Stück','Stück'],
  'Zwg':['Zweig','Zweige'],
  'Zweig':['Zweig','Zweige'],
  'Blatt':['Blatt','Blätter'],
  'Bund':['Bund','Bünde'],
  'Scheib.':['Scheibe','Scheiben'],
  'Scheibe':['Scheibe','Scheiben'],
  'Scheiben':['Scheibe','Scheiben'],
  'Prise':['Prise','Prisen'],
  'Spritz':['Spritzer','Spritzer'],
  'Spritzer':['Spritzer','Spritzer'],
  'Dösch.':['Döschen','Döschen'],
  'Ds':['Dose','Dosen'],
  'Dose':['Dose','Dosen'],
  'Beet':['Beet','Beete']
};
const SHOPPING_FORMS={
  Scheibe:['Scheibe','Scheiben'],Blatt:['Blatt','Blätter'],Zweig:['Zweig','Zweige'],
  Bund:['Bund','Bünde'],Dose:['Dose','Dosen'],Beet:['Beet','Beete'],Prise:['Prise','Prisen']
};

function currentRecipe(){
  const match=(location.hash||'').match(/^#rezept=(.+)$/);
  if(!match)return null;
  const id=decodeURIComponent(match[1]);
  return DATA.recipes.find(recipe=>recipe.id===id)||null;
}
function currentTarget(recipe){
  const value=Number(document.getElementById('portionInput')?.value);
  if(Number.isFinite(value))return value;
  return recipe.scaleType==='factor'?1:recipe.baseScale;
}
function tableFactor(table,target,main){
  if(main.scaleType==='factor')return target;
  if(main.scaleType==='portions'&&table.scaleType==='portions')return target/table.baseScale;
  return target/main.baseScale;
}
function quantityIsSingular(quantity,factor){
  if(quantity?.kind==='number')return Math.abs(Number(quantity.value)*factor-1)<1e-9;
  if(quantity?.kind==='range')return Math.abs(Number(quantity.min)*factor-1)<1e-9&&Math.abs(Number(quantity.max)*factor-1)<1e-9;
  return null;
}
function decorateTable(root,table,factor){
  if(!root||!Array.isArray(table?.ingredients))return;
  [...root.querySelectorAll('li.ingredient')].forEach((row,index)=>{
    const ingredient=table.ingredients[index];if(!ingredient)return;
    const name=row.querySelector('.ingredient-name');
    if(name&&ingredient.state){
      let suffix=name.querySelector('.ingredient-state-suffix');
      if(!suffix){suffix=document.createElement('span');suffix.className='ingredient-state-suffix';name.append(suffix)}
      const text=`, ${ingredient.state}`;
      if(suffix.textContent!==text)suffix.textContent=text;
    }
    const unit=row.querySelector('.amount .unit');
    const forms=UNIT_FORMS[String(ingredient.unit||'').trim()];
    const singular=quantityIsSingular(ingredient.quantity,factor);
    if(unit&&forms&&singular!==null){
      const text=singular?forms[0]:forms[1];
      if(unit.textContent!==text)unit.textContent=text;
    }
  });
}
function decorateRecipe(){
  const recipe=currentRecipe();if(!recipe)return;
  const target=currentTarget(recipe);
  decorateTable(document.getElementById('mainIngredients'),recipe,tableFactor(recipe,target,recipe));
  const subRoot=document.getElementById('subrecipes');
  if(!subRoot)return;
  [...subRoot.querySelectorAll('.subrecipe')].forEach((details,index)=>{
    const table=recipe.subrecipes[index];
    if(table)decorateTable(details,table,tableFactor(table,target,recipe));
  });
}
function germanNumber(value){return Number(String(value).replace(/\./g,'').replace(',','.'))}
function tokenIsSingular(token){
  const values=String(token).split('–').map(germanNumber);
  return values.length>0&&values.every(value=>Number.isFinite(value)&&Math.abs(value-1)<1e-9);
}
function inflectShoppingText(text){
  return String(text||'').replace(/([0-9][0-9.,]*(?:–[0-9][0-9.,]*)?)\s+(Scheibe|Blatt|Zweig|Bund|Dose|Beet|Prise)\b/g,(all,quantity,unit)=>{
    const forms=SHOPPING_FORMS[unit];
    return `${quantity} ${tokenIsSingular(quantity)?forms[0]:forms[1]}`;
  });
}
function decorateShoppingAmounts(){
  document.querySelectorAll('.shopping-amount').forEach(node=>{
    const text=node.textContent;
    const fixed=inflectShoppingText(text);
    if(fixed!==text)node.textContent=fixed;
  });
}
function decorate(){decorateRecipe();decorateShoppingAmounts()}
let queued=false;
function queueDecorate(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorate()})}
new MutationObserver(queueDecorate).observe(document.getElementById('app')||document.body,{childList:true,subtree:true,characterData:true});
document.addEventListener('input',event=>{if(event.target?.id==='portionInput')queueDecorate()});
document.addEventListener('change',event=>{if(event.target?.id==='portionInput')queueDecorate()});
window.addEventListener('popstate',queueDecorate);
window.addEventListener('hashchange',queueDecorate);
decorate();
})();
