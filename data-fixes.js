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
function numberValue(value){
  const n=Number(String(value??'').trim().replace(/\./g,'').replace(',','.'));
  return Number.isFinite(n)?n:null;
}
function quantityFrom(value){return Number.isFinite(value)?{kind:'number',value}:null}
function recipeReference(value){
  const a=norm(value);
  const match=a.match(/(?:^| )(?:siehe|sie|aus(?: dem)?) (unterrezept|unterezept|hauptrezept)(?: ([ivx]+))?(?: |$)/);
  if(!match)return null;
  const isMain=match[1]==='hauptrezept';
  return {kind:isMain?'main':'subrecipe',index:isMain?null:(match[2]||'').toUpperCase()||null};
}

// Nur reine Küchenzustände abtrennen. Einkaufsrelevante Merkmale wie
// „trocken“, „frisch“, Fettgehalt, Sorte oder Qualität bleiben beim Produkt.
// Netto/Brutto/Abtropfgewicht sind keine Zustände, sondern eine Mengenbasis.
const SIMPLE_PREPARATION_STATES=new Set([
  'zerlassen','geschmolzen','gekocht','gegart','blanchiert','geschalt','entkernt','entsteint',
  'abgetropft','aufgetaut','puriert','zerdruckt','passiert','gehobelt','lauwarm'
]);
function isPreparationState(value){
  const state=norm(value);
  if(!state)return false;
  if(SIMPLE_PREPARATION_STATES.has(state))return true;
  if(/^(?:(?:sehr|extra) )?(?:(?:fein|grob) )?(?:gewurfelt|gehackt|gerieben|geschnitten|geschrotet)$/.test(state))return true;
  if(/^(?:frisch )?(?:(?:fein|grob) )?gerieben$/.test(state))return true;
  return /^(?:in )?(?:(?:fein(?:e|en)?|grob(?:e|en)?|diagonal(?:e|en)?|halb(?:e|en)?|[0-9]+(?: [a-z]+)?) )?(?:wurfel|wurfeln|scheiben|ringe|streifen|stucke|spanen|halbmonde)$/.test(state);
}
// Manche Wörter beschreiben formal einen Zustand, sind hier aber Teil des
// tatsächlich zu kaufenden Produkts und müssen deshalb am Produkt bleiben.
function isPurchaseRelevantPreparation(product,value){
  const p=` ${norm(product)} `,state=norm(value);
  if(state==='gekocht'&&/(?: schinken | hinterschinken | schinkenstreifen )/.test(p))return true;
  if((state==='gekocht'||state==='geschalt')&&p.includes(' maronen '))return true;
  if(state==='geschalt'&&/(?: mandel|haselnuss|kurbiskern|sesam)/.test(p))return true;
  if(state==='gehobelt'&&/(?: mandel|haselnuss)/.test(p))return true;
  if(state==='entsteint'&&p.includes(' olive'))return true;
  return false;
}
function splitPreparationPart(value,productContext){
  const raw=String(value??'').trim();
  if(!raw||/^alternativ\b/i.test(raw))return {product:raw,state:''};
  if(isPreparationState(raw)&&!isPurchaseRelevantPreparation(productContext,raw))return {product:'',state:raw};
  const words=raw.split(/\s+/);
  for(let index=1;index<words.length;index++){
    const product=words.slice(0,index).join(' ');
    const state=words.slice(index).join(' ');
    if(isPreparationState(state)&&!isPurchaseRelevantPreparation(productContext||product,state))return {product,state};
  }
  return {product:raw,state:''};
}

function extractQuantityBasis(value,ingredient){
  let text=String(value??'').trim();
  let match;
  const basis={recipe:'',purchase:'',purchaseKnown:true,approximate:false,displaySuffix:'',relation:null};

  // Beispiel: „Grünkohl netto (= ca. 1000g brutto)“ bei 600 g Rezeptmenge.
  match=text.match(/((?:,?\s*)netto\s*\(=\s*(ca\.?\s*)?([0-9.,]+)\s*(kg|g)\s*brutto\s*\))\s*$/i);
  if(match){
    const gross=numberValue(match[3]);
    text=text.slice(0,match.index).trim().replace(/,\s*$/,'');
    basis.recipe='net';basis.purchase='gross';basis.purchaseKnown=Number.isFinite(gross);
    basis.approximate=!!match[2];basis.displaySuffix=match[1].startsWith(',')?match[1]:` ${match[1].trimStart()}`;
    if(Number.isFinite(gross)){
      ingredient.purchaseQuantity=quantityFrom(gross);
      ingredient.purchaseUnit=match[4];
      basis.relation={gross:{value:gross,unit:match[4]}};
    }
    return {text,basis};
  }

  // Beispiel: „Spargel, grün, brutto (= ca. 700g netto)“; die Rezeptmenge ist bereits die Kaufmenge.
  match=text.match(/((?:,?\s*)brutto\s*\(=\s*(ca\.?\s*)?([0-9.,]+)\s*(kg|g)\s*netto\s*\))\s*$/i);
  if(match){
    const net=numberValue(match[3]);
    text=text.slice(0,match.index).trim().replace(/,\s*$/,'');
    basis.recipe='gross';basis.purchase='gross';basis.purchaseKnown=true;basis.approximate=false;
    basis.displaySuffix=match[1].startsWith(',')?match[1]:` ${match[1].trimStart()}`;
    if(Number.isFinite(net))basis.relation={net:{value:net,unit:match[4],approximate:!!match[2]}};
    return {text,basis};
  }

  // Beispiel: „Spargel weiß/grün (Netto= 700g)“ bei 1000 g Rezeptmenge.
  match=text.match(/(\s*\(\s*netto\s*=\s*([0-9.,]+)\s*(kg|g)\s*\))\s*$/i);
  if(match){
    const net=numberValue(match[2]);
    text=text.slice(0,match.index).trim();
    basis.recipe='gross';basis.purchase='gross';basis.purchaseKnown=true;basis.displaySuffix=match[1];
    if(Number.isFinite(net))basis.relation={net:{value:net,unit:match[3]}};
    return {text,basis};
  }

  // „netto ohne Fond“ entspricht praktisch einem Abtropfgewicht. Ohne explizite
  // Packungsrelation darf daraus keine Bruttomenge erfunden werden.
  match=text.match(/((?:,?\s*)netto\s+ohne\s+fond)\s*$/i);
  if(match){
    text=text.slice(0,match.index).trim().replace(/,\s*$/,'');
    basis.recipe='drained';basis.purchase='drained';basis.purchaseKnown=false;
    basis.displaySuffix=match[1].startsWith(',')?match[1]:` ${match[1].trimStart()}`;
    return {text,basis};
  }

  // Reine Abtropfgewichte und Angaben „ohne Fond“ sind ebenfalls Mengenbasen,
  // keine Produktmerkmale. Explizite Packungsrelationen bleiben separat erhalten,
  // weil die Rezeptmenge dort auch das Bruttogewicht bezeichnen kann.
  match=text.match(/((?:,?\s*)Abtropfgewicht)\s*$/i);
  if(match){
    text=text.slice(0,match.index).trim().replace(/,\s*$/,'');
    basis.recipe='drained';basis.purchase='drained';basis.purchaseKnown=false;
    basis.displaySuffix=match[1].startsWith(',')?match[1]:` ${match[1].trimStart()}`;
    return {text,basis};
  }
  match=text.match(/((?:,?\s*)ohne\s+Fond)\s*$/i);
  if(match){
    text=text.slice(0,match.index).trim().replace(/,\s*$/,'');
    basis.recipe='drained';basis.purchase='drained';basis.purchaseKnown=false;
    basis.displaySuffix=match[1].startsWith(',')?match[1]:` ${match[1].trimStart()}`;
    return {text,basis};
  }

  // Reine Nettoangaben bleiben ausdrücklich Nettoangaben. Die Einkaufsliste darf
  // dieselbe Zahl zeigen, markiert sie aber als Netto und als ggf. zu niedrig.
  match=text.match(/((?:,?\s*)netto)\s*$/i);
  if(match){
    text=text.slice(0,match.index).trim().replace(/,\s*$/,'');
    basis.recipe='net';basis.purchase='net';basis.purchaseKnown=false;
    basis.displaySuffix=match[1].startsWith(',')?match[1]:` ${match[1].trimStart()}`;
    return {text,basis};
  }

  return {text,basis:null};
}
function splitIngredientArticle(value,ingredient){
  const label=String(value??'').trim();
  const extracted=extractQuantityBasis(label,ingredient);
  const rawParts=extracted.text.split(',').map(part=>part.trim()).filter(Boolean);
  const productParts=[],states=[],productContext=rawParts[0]||extracted.text||label;
  for(const part of rawParts){
    const split=splitPreparationPart(part,productContext);
    if(split.product)productParts.push(split.product);
    if(split.state)states.push(split.state);
  }
  return {label,product:(productParts.join(', ')||extracted.text||label),state:states.join(', '),quantityBasis:extracted.basis};
}
function enrichIngredient(ingredient){
  if(!ingredient||typeof ingredient.article!=='string')return;
  const canonical=canonicalEggArticle(ingredient.article);
  const reference=recipeReference(canonical);
  const split=splitIngredientArticle(canonical,ingredient);
  ingredient.label=String(ingredient.label??split.label).trim()||split.label;
  ingredient.product=String(ingredient.product??split.product).trim()||split.product;
  ingredient.state=String(ingredient.state??split.state).trim();
  if(split.quantityBasis)ingredient.quantityBasis=split.quantityBasis;
  if(reference){ingredient.recipeReference=reference;ingredient.shoppingEligible=false}
  else if(ingredient.shoppingEligible==null)ingredient.shoppingEligible=true;
  // article bleibt als Kompatibilitätsfeld bestehen, bezeichnet nun aber das kaufbare Produkt.
  // Die Rezeptansicht rekonstruiert product + state + Mengenbasis über ingredient-ui.js.
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
