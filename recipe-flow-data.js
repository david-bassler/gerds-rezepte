(()=>{
'use strict';
const DATA=window.GERDS_REZEPTE;
if(!DATA||!Array.isArray(DATA.recipes))return;

const norm=value=>String(value??'')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/ß/g,'ss')
  .replace(/[^a-z0-9]+/g,' ').trim();

const STOPWORDS=new Set([
  'und','oder','mit','ohne','von','vom','der','die','das','den','dem','des','ein','eine','einer',
  'einem','einen','frisch','frische','frischen','klein','kleine','kleinen','gross','grosse','grossen',
  'fein','feine','feinen','grob','grobe','groben','nach','geschmack','ca','etwas'
]);
const SHORT_TERMS=new Set(['ei','ol','jus','rum','gin','tee']);
const INDEPENDENT_RE=/(?:^|\b)(separat|inzwischen|waehrenddessen|parallel|beiseite|zweiten? pfanne|zweiten? topf|anderen? pfanne|anderen? topf)(?:\b|$)/;
const CONTINUE_RE=/(?:^|\b)(anschliessend|danach|dann|nun|jetzt|weiter|alles|dazu|hierzu|darunter|unterheben|unterruehren|zugeben|zufuegen|abloschen|abloeschen|auffuellen|vermengen|verruehren|mischen)(?:\b|$)/;
const ALL_INGREDIENTS_RE=/(alle|saemtliche|restliche[nr]?|uebrige[nr]?)\s+zutaten/;

const ACTION_RULES=[
  [/vorheiz/,'vorheizen'],[/bereitstell|vorbereit/,'vorbereiten'],[/wasch/,'waschen'],
  [/schael|schal/,'schälen'],[/entkern|entstein/,'entkernen'],[/wuerfel|wurfel/,'würfeln'],
  [/schneid/,'schneiden'],[/hack/,'hacken'],[/reib/,'reiben'],[/hobel/,'hobeln'],
  [/schmelz|zerlass/,'schmelzen'],[/anbrat|sautier/,'anbraten'],[/roest|rost/,'rösten'],
  [/duenst|dunst|anschwitz/,'dünsten'],[/ablosch|abloesch/,'ablöschen'],[/reduzier|einkoch/,'reduzieren'],
  [/pochier/,'pochieren'],[/schmor|braisier/,'schmoren'],[/grill/,'grillen'],[/back/,'backen'],
  [/koechel|kochel/,'köcheln'],[/\bkoch/,'kochen'],[/puerier|purier/,'pürieren'],[/passier/,'passieren'],
  [/aufschlag|schlag.*schaum|schaumig/,'aufschlagen'],[/unterheb/,'unterheben'],
  [/verruehr|verruhr|vermeng|misch|verquirl/,'mischen'],[/montier/,'montieren'],
  [/bind|andick/,'binden'],[/wuerz|wurz|abschmeck/,'abschmecken'],[/zieh.*lass/,'ziehen lassen'],
  [/ruh.*lass/,'ruhen lassen'],[/kuehl|kuhl/,'kühlen'],[/anricht|servier/,'servieren'],
  [/zugib|zugeben|zufueg|hinzufueg|hinzufug/,'zugeben']
];

function stem(token){
  let t=token;
  if(t.length>6&&/(chen|lein)$/.test(t))t=t.slice(0,-4);
  if(t.length>5&&/(ern|en|er)$/.test(t))t=t.replace(/(ern|en|er)$/,'');
  else if(t.length>4&&/[ens]$/.test(t))t=t.slice(0,-1);
  return t;
}
function ingredientTerms(ingredient){
  const product=ingredient?.product||ingredient?.article||ingredient?.label||'';
  const normalized=norm(product);
  const words=normalized.split(' ').filter(Boolean);
  const terms=[];
  if(normalized.length>=4)terms.push(normalized);
  for(const word of words){
    if(STOPWORDS.has(word))continue;
    if(word.length>=4)terms.push(stem(word));
    else if(SHORT_TERMS.has(word))terms.push(word);
  }
  return [...new Set(terms.filter(Boolean))];
}
function mentionsIngredient(terms,text){
  if(!text)return false;
  const padded=` ${text} `;
  return terms.some(term=>term.length<=3?padded.includes(` ${term} `):text.includes(term));
}
function actionLabel(text){
  const n=norm(text);
  for(const [re,label] of ACTION_RULES)if(re.test(n))return label;
  const words=String(text||'').trim().replace(/[.;:]+$/,'').split(/\s+/).filter(Boolean);
  return words.slice(0,Math.min(3,words.length)).join(' ')||'weiterverarbeiten';
}
function outputLabel(label,index){
  const nouns={
    'schmelzen':'geschmolzene Mischung','anbraten':'Bratansatz','dünsten':'gedünsteter Ansatz',
    'reduzieren':'Reduktion','pürieren':'Püree','passieren':'passierter Ansatz','aufschlagen':'aufgeschlagene Masse',
    'mischen':'Mischung','schmoren':'Schmoransatz','kochen':'gekochter Ansatz','köcheln':'gekochter Ansatz',
    'backen':'gebackener Ansatz','abschmecken':'abgeschmeckter Ansatz','binden':'gebundener Ansatz'
  };
  return nouns[label]||`Zwischenstand ${index+1}`;
}
function uniqueInputs(inputs){
  const seen=new Set();
  return inputs.filter(input=>{const key=`${input.type}:${input.ref}`;if(seen.has(key))return false;seen.add(key);return true});
}
function buildGraph(table,tableKey){
  const ingredients=(Array.isArray(table.ingredients)?table.ingredients:[]).map((ingredient,index)=>({
    id:`ingredient-${index+1}`,
    sourceIndex:index,
    product:ingredient.product||ingredient.article||'',
    state:ingredient.state||'',
    label:ingredient.label||ingredient.product||ingredient.article||'',
    terms:ingredientTerms(ingredient)
  }));
  const lines=[
    ...(Array.isArray(table.preparation)?table.preparation:[]).map(action=>({phase:'preparation',action})),
    ...(Array.isArray(table.cooking)?table.cooking:[]).map(action=>({phase:'cooking',action}))
  ].filter(item=>String(item.action||'').trim());

  const steps=[];
  let previousProcessStep=null;
  for(const item of lines){
    const textNorm=norm(item.action);
    let direct=ingredients.filter(ingredient=>mentionsIngredient(ingredient.terms,textNorm)).map(ingredient=>ingredient.sourceIndex);
    if(ALL_INGREDIENTS_RE.test(textNorm)){
      const already=new Set(steps.flatMap(step=>step.inputs.filter(input=>input.type==='ingredient').map(input=>ingredients.find(x=>x.id===input.ref)?.sourceIndex)).filter(Number.isInteger));
      const unused=ingredients.map(x=>x.sourceIndex).filter(index=>!already.has(index));
      direct=[...new Set([...direct,...unused])];
    }
    const inputs=direct.map(index=>({type:'ingredient',ref:ingredients[index].id}));
    const independent=INDEPENDENT_RE.test(textNorm);
    const explicitContinue=CONTINUE_RE.test(textNorm);
    if(previousProcessStep){
      const shouldCarry=item.phase==='cooking'
        ?(!independent||direct.length===0||explicitContinue)
        :(direct.length===0&&explicitContinue);
      if(shouldCarry)inputs.push({type:'step',ref:previousProcessStep.id});
    }
    const stepIndex=steps.length;
    const label=actionLabel(item.action);
    const step={
      id:`step-${stepIndex+1}`,
      phase:item.phase,
      action:String(item.action).trim(),
      label,
      inputs:uniqueInputs(inputs),
      output:{id:`output-${stepIndex+1}`,label:outputLabel(label,stepIndex)},
      setup:inputs.length===0,
      inference:direct.length?'ingredient-match':(previousProcessStep?'continuation':'setup')
    };
    steps.push(step);
    if(!step.setup)previousProcessStep=step;
  }

  const used=new Set(steps.flatMap(step=>step.inputs.filter(input=>input.type==='ingredient').map(input=>input.ref)));
  const unused=ingredients.filter(ingredient=>!used.has(ingredient.id));
  const fallback=steps.find(step=>!step.setup&&step.phase==='cooking')||steps.find(step=>!step.setup);
  if(fallback&&unused.length){
    fallback.inputs=uniqueInputs([
      ...unused.map(ingredient=>({type:'ingredient',ref:ingredient.id,inferred:true})),
      ...fallback.inputs
    ]);
    fallback.inference='ingredient-match+fallback';
  }

  return {
    version:1,
    tableKey,
    ingredients:ingredients.map(({terms,...ingredient})=>ingredient),
    steps
  };
}

for(const recipe of DATA.recipes){
  recipe.processGraph=buildGraph(recipe,`${recipe.id}:main`);
  for(let index=0;index<(recipe.subrecipes||[]).length;index++){
    const sub=recipe.subrecipes[index];
    sub.processGraph=buildGraph(sub,`${recipe.id}:sub:${index+1}`);
  }
}
window.GERDS_PROCESS_DATA={version:1,recipeCount:DATA.recipes.length};
})();
