(()=>{
'use strict';
const DATA=window.GERDS_REZEPTE;
if(!DATA||!Array.isArray(DATA.recipes))return;

const norm=value=>String(value??'')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/ß/g,'ss')
  .replace(/[^a-z0-9]+/g,' ').trim();

const STOPWORDS=new Set([
  'und','oder','mit','ohne','von','vom','der','die','das','den','dem','des','ein','eine','einer','einem','einen',
  'frisch','frische','frischen','klein','kleine','kleinen','gross','grosse','grossen','fein','feine','feinen',
  'grob','grobe','groben','nach','geschmack','ca','etwas','etwa','gut','sehr','zum','zur','im','in','auf','bei'
]);
const SHORT_TERMS=new Set(['ei','ol','jus','rum','gin','tee']);
const GROUP_TERMS={
  gemuese:['zwiebel','lauch','mohre','karotte','sellerie','paprika','tomate','gurke','zucchini','aubergine','pilz','champignon','spargel','spinat','kohl','bohne','erbse'],
  kraeuter:['petersilie','schnittlauch','kerbel','dill','basilikum','thymian','rosmarin','salbei','estragon','majoran','koriander','minze'],
  gewuerze:['salz','pfeffer','paprika','muskat','curry','kuemmel','kummel','wacholder','nelke','lorbeer','zimt','chili','cayenne'],
  fleisch:['rind','kalb','schwein','lamm','wild','huhn','haehnchen','ente','gans','hackfleisch','speck','schinken'],
  fisch:['fisch','lachs','kabeljau','seelachs','forelle','zander','hecht','garnele','scampi','muschel','hering','matjes']
};
const OPTIONAL_RE=/(?:^|\b)(optional|wahlweise|nach belieben|variante|alternativ|ersatzweise|fuer bearnaise|fur bearnaise|fuer sauce bearnaise|fur sauce bearnaise|fuer aurore|fur aurore|fuer dijon|fur dijon)(?:\b|$)/;
const SETUP_RE=/(?:^|\b)(ofen|backofen|wasserbad|grill|pfanne|topf|schuessel|schussel|form)\b.*(?:vorheizen|bereitstellen|erhitzen|aufsetzen|vorbereiten)|(?:wasserbad|ofen|backofen)\b.*(?:vorbereiten|erhitzen)/;
const INDEPENDENT_RE=/(?:^|\b)(separat|inzwischen|waehrenddessen|parallel|beiseite|zweiten? pfanne|zweiten? topf|anderen? pfanne|anderen? topf)(?:\b|$)/;
const RESUME_RE=/(?:^|\b)(wieder|zurueck|zuruck|zurueckgeben|zuruckgeben|wiederzugeben|wieder zufuegen|wieder zufugen)(?:\b|$)/;
const CONTINUE_RE=/(?:^|\b)(anschliessend|danach|dann|nun|jetzt|weiter|alles|dazu|hierzu|darunter|unterheben|unterruehren|unterruhren|zugeben|zufuegen|zufugen|abloschen|abloeschen|auffuellen|vermengen|verruehren|verruhren|mischen|abschmecken|binden)(?:\b|$)/;
const ALL_INGREDIENTS_RE=/(alle|saemtliche|samtliche|restliche[nr]?|uebrige[nr]?|ubrige[nr]?)\s+zutaten/;
const NOTE_RE=/(?:^|\b)(nicht kochen|darf nicht kochen|temperatur|warm halten|heiss halten|heiß halten|vorsicht|achtung|nur kurz|nicht mehr erhitzen|sofort servieren)(?:\b|$)/;
const FINISH_RE=/(?:anricht|servier|garnier|dekorier|bestreu|beträuf|betrauf)/;

const ACTION_RULES=[
  [/vorheiz/,'vorheizen'],[/bereitstell|vorbereit/,'vorbereiten'],[/wasch/,'waschen'],
  [/schael|schal/,'schälen'],[/entkern|entstein/,'entkernen'],[/wuerfel|wurfel/,'würfeln'],
  [/schneid/,'schneiden'],[/hack/,'hacken'],[/reib/,'reiben'],[/hobel/,'hobeln'],
  [/schmelz|zerlass|klaer.*butter|klar.*butter/,'schmelzen'],[/anbrat|sautier/,'anbraten'],[/roest|rost/,'rösten'],
  [/duenst|dunst|anschwitz/,'dünsten'],[/ablosch|abloesch/,'ablöschen'],[/reduzier|einkoch/,'reduzieren'],
  [/pochier/,'pochieren'],[/schmor|braisier/,'schmoren'],[/grill/,'grillen'],[/back/,'backen'],
  [/koechel|kochel/,'köcheln'],[/\bkoch/,'kochen'],[/puerier|purier/,'pürieren'],[/passier/,'passieren'],
  [/aufschlag|schlag.*schaum|schaumig/,'aufschlagen'],[/unterheb/,'unterheben'],
  [/verruehr|verruhr|vermeng|misch|verquirl/,'mischen'],[/montier/,'montieren'],
  [/bind|andick/,'binden'],[/wuerz|wurz|abschmeck/,'abschmecken'],[/zieh.*lass/,'ziehen lassen'],
  [/ruh.*lass/,'ruhen lassen'],[/kuehl|kuhl/,'kühlen'],[/anricht|servier/,'servieren'],
  [/garnier|dekorier|bestreu|betrauf/,'garnieren'],[/zugib|zugeben|zufueg|zufug|hinzufueg|hinzufug/,'zugeben']
];

function stem(token){
  let t=token;
  if(t.length>7&&/(chen|lein)$/.test(t))t=t.slice(0,-4);
  if(t.length>6&&/(ern|erer|erer)$/.test(t))t=t.replace(/(ern|erer|erer)$/,'');
  if(t.length>5&&/(en|er)$/.test(t))t=t.replace(/(en|er)$/,'');
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
function ingredientGroupMatches(ingredient,text){
  const product=norm(ingredient.product||ingredient.label||'');
  for(const [group,needles] of Object.entries(GROUP_TERMS)){
    if(!text.includes(group))continue;
    if(needles.some(needle=>product.includes(needle)))return true;
  }
  return false;
}
function actionLabel(text){
  const n=norm(text);
  for(const [re,label] of ACTION_RULES)if(re.test(n))return label;
  const words=String(text||'').trim().replace(/[.;:]+$/,'').split(/\s+/).filter(Boolean);
  return words.slice(0,Math.min(3,words.length)).join(' ')||'weiterverarbeiten';
}
function outputLabel(label,index){
  const nouns={
    'schmelzen':'geschmolzene Mischung','anbraten':'Bratansatz','dünsten':'gedünsteter Ansatz','reduzieren':'Reduktion',
    'pürieren':'Püree','passieren':'passierter Ansatz','aufschlagen':'aufgeschlagene Masse','mischen':'Mischung',
    'schmoren':'Schmoransatz','kochen':'gekochter Ansatz','köcheln':'gekochter Ansatz','backen':'gebackener Ansatz',
    'abschmecken':'abgeschmeckter Ansatz','binden':'gebundener Ansatz','montieren':'montierte Sauce','garnieren':'fertiges Gericht'
  };
  return nouns[label]||`Zwischenstand ${index+1}`;
}
function uniqueInputs(inputs){
  const seen=new Set();
  return inputs.filter(input=>{const key=`${input.type}:${input.ref}`;if(seen.has(key))return false;seen.add(key);return true});
}
function stepIngredientIndexes(step,ingredients){
  return step.inputs.filter(input=>input.type==='ingredient').map(input=>ingredients.find(x=>x.id===input.ref)?.sourceIndex).filter(Number.isInteger);
}
function ingredientRef(ingredients,index,inferred=false){
  const ingredient=ingredients[index];
  return ingredient?{type:'ingredient',ref:ingredient.id,...(inferred?{inferred:true}:{})}:null;
}
function findNamedPrevious(steps,textNorm){
  const aliases=[
    ['reduktion',['reduktion','fond','sud']],['butter',['butter']],['sauce',['sauce','sosse','sosse']],
    ['farce',['farce']],['teig',['teig']],['masse',['masse']],['ansatz',['ansatz']],['bratensatz',['bratensatz']]
  ];
  for(let i=steps.length-1;i>=0;i--){
    const step=steps[i];
    const hay=norm(`${step.output?.label||''} ${step.label||''} ${step.action||''}`);
    for(const [,needles] of aliases){
      if(needles.some(needle=>textNorm.includes(needle))&&needles.some(needle=>hay.includes(needle)))return step;
    }
  }
  return null;
}
function buildGraph(table,tableKey){
  const ingredients=(Array.isArray(table.ingredients)?table.ingredients:[]).map((ingredient,index)=>({
    id:`ingredient-${index+1}`,sourceIndex:index,
    product:ingredient.product||ingredient.article||'',state:ingredient.state||'',
    label:ingredient.label||ingredient.product||ingredient.article||'',terms:ingredientTerms(ingredient)
  }));
  const lines=[
    ...(Array.isArray(table.preparation)?table.preparation:[]).map(action=>({phase:'preparation',action})),
    ...(Array.isArray(table.cooking)?table.cooking:[]).map(action=>({phase:'cooking',action}))
  ].filter(item=>String(item.action||'').trim());

  const steps=[];
  let activeStep=null;
  for(const item of lines){
    const action=String(item.action).trim(),textNorm=norm(action),optional=OPTIONAL_RE.test(textNorm);
    let direct=ingredients.filter(ingredient=>mentionsIngredient(ingredient.terms,textNorm)||ingredientGroupMatches(ingredient,textNorm)).map(ingredient=>ingredient.sourceIndex);
    if(ALL_INGREDIENTS_RE.test(textNorm)){
      const already=new Set(steps.flatMap(step=>stepIngredientIndexes(step,ingredients)));
      const unused=ingredients.map(x=>x.sourceIndex).filter(index=>!already.has(index));
      direct=[...new Set([...direct,...unused])];
    }
    const label=actionLabel(action),setup=SETUP_RE.test(textNorm)&&direct.length===0;
    const inputs=direct.map(index=>ingredientRef(ingredients,index)).filter(Boolean);
    const independent=INDEPENDENT_RE.test(textNorm),explicitContinue=CONTINUE_RE.test(textNorm),resume=RESUME_RE.test(textNorm);
    const namedPrevious=findNamedPrevious(steps,textNorm);

    if(!setup){
      if(namedPrevious&&(!activeStep||namedPrevious.id!==activeStep.id))inputs.push({type:'step',ref:namedPrevious.id});
      if(activeStep){
        const shouldCarry=resume||explicitContinue||(!independent&&item.phase==='cooking'&&!optional);
        if(shouldCarry)inputs.push({type:'step',ref:activeStep.id});
      }
    }

    const stepIndex=steps.length;
    const step={
      id:`step-${stepIndex+1}`,phase:item.phase,action,label,inputs:uniqueInputs(inputs),
      output:{id:`output-${stepIndex+1}`,label:outputLabel(label,stepIndex)},
      setup,optional,note:NOTE_RE.test(textNorm),finish:FINISH_RE.test(textNorm),
      inference:setup?'setup':direct.length?'ingredient-match':namedPrevious?'named-intermediate':activeStep?'continuation':'unresolved'
    };
    steps.push(step);
    if(!setup&&!optional&&!step.note)activeStep=step;
  }

  const used=new Set(steps.flatMap(step=>stepIngredientIndexes(step,ingredients)));
  const unused=ingredients.filter(ingredient=>!used.has(ingredient.sourceIndex));
  const finishStep=[...steps].reverse().find(step=>!step.setup&&!step.optional&&!step.note) || steps.find(step=>!step.setup);
  if(finishStep&&unused.length){
    const likelyFinish=finishStep.finish||['abschmecken','garnieren','servieren','mischen'].includes(finishStep.label);
    const target=likelyFinish?finishStep:(steps.find(step=>!step.setup&&!step.optional&&step.phase==='cooking')||finishStep);
    target.inputs=uniqueInputs([
      ...unused.map(ingredient=>ingredientRef(ingredients,ingredient.sourceIndex,true)).filter(Boolean),
      ...target.inputs
    ]);
    target.inference=`${target.inference}+fallback`;
  }

  const diagnostics={
    ingredientCount:ingredients.length,stepCount:steps.length,
    setupSteps:steps.filter(step=>step.setup).length,optionalSteps:steps.filter(step=>step.optional).length,
    noteSteps:steps.filter(step=>step.note).length,
    unresolvedSteps:steps.filter(step=>!step.setup&&!step.inputs.length).map(step=>step.id),
    fallbackIngredients:steps.flatMap(step=>step.inputs.filter(input=>input.type==='ingredient'&&input.inferred).map(input=>input.ref))
  };
  return {version:2,tableKey,ingredients:ingredients.map(({terms,...ingredient})=>ingredient),steps,diagnostics};
}

let tableCount=0,stepCount=0,unresolvedCount=0,fallbackCount=0;
for(const recipe of DATA.recipes){
  recipe.processGraph=buildGraph(recipe,`${recipe.id}:main`);tableCount++;stepCount+=recipe.processGraph.steps.length;
  unresolvedCount+=recipe.processGraph.diagnostics.unresolvedSteps.length;fallbackCount+=recipe.processGraph.diagnostics.fallbackIngredients.length;
  for(let index=0;index<(recipe.subrecipes||[]).length;index++){
    const sub=recipe.subrecipes[index];
    sub.processGraph=buildGraph(sub,`${recipe.id}:sub:${index+1}`);tableCount++;stepCount+=sub.processGraph.steps.length;
    unresolvedCount+=sub.processGraph.diagnostics.unresolvedSteps.length;fallbackCount+=sub.processGraph.diagnostics.fallbackIngredients.length;
  }
}
window.GERDS_PROCESS_DATA={version:2,recipeCount:DATA.recipes.length,tableCount,stepCount,unresolvedCount,fallbackCount};
})();
