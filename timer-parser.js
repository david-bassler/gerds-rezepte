(()=>{
'use strict';

const NUMBER='(?:\\d+(?:[.,]\\d+)?|\\d+\\s*\\/\\s*\\d+|[¼½¾])';
const RANGE=`(${NUMBER})(?:\\s*[–—-]\\s*(${NUMBER}))?`;
const UNIT='(Sekunden?|Sek\\.?|Minuten?|Min\\.?|Stunden?|Std\\.?)';
const DURATION_RE=new RegExp(`${RANGE}\\s*${UNIT}(?:\\s+(?:und\\s+)?(${NUMBER})\\s*(Minuten?|Min\\.?|Sekunden?|Sek\\.?))?`,'gi');
const MAX_SECONDS=24*60*60;

const ACTIONS=[
  [/fertigbacken|backen|überbacken|gratinieren/i,'Backen'],
  [/schmoren/i,'Schmoren'],
  [/köcheln|einkochen|reduzieren/i,'Köcheln'],
  [/ziehen\s+lassen/i,'Ziehen lassen'],
  [/ruhen\s+lassen|stehen\s+lassen/i,'Ruhen lassen'],
  [/gehen\s+lassen|anspringen\s+lassen/i,'Gehen lassen'],
  [/reifen\s+lassen|reifen/i,'Reifen lassen'],
  [/marinieren|ziehen\s+lassen/i,'Marinieren'],
  [/einweichen|wässern/i,'Einweichen'],
  [/quellen\s+lassen|ausquellen\s+lassen/i,'Quellen lassen'],
  [/garen|fertiggaren/i,'Garen'],
  [/kochen/i,'Kochen'],
  [/braten/i,'Braten'],
  [/grillen/i,'Grillen'],
  [/kneten/i,'Kneten'],
  [/räuchern/i,'Räuchern'],
  [/trocknen/i,'Trocknen'],
  [/kalt\s+stellen/i,'Kalt stellen']
];

function numberValue(raw){
  if(raw===undefined||raw===null||String(raw).trim()==='')return null;
  const value=String(raw).trim().replace(',','.');
  if(value==='¼')return .25;
  if(value==='½')return .5;
  if(value==='¾')return .75;
  const fraction=value.match(/^(\d+)\s*\/\s*(\d+)$/);
  if(fraction)return Number(fraction[1])/Number(fraction[2]);
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function unitSeconds(unit){
  const u=String(unit||'').toLowerCase();
  if(u.startsWith('sek'))return 1;
  if(u.startsWith('min'))return 60;
  if(u.startsWith('std')||u.startsWith('stund'))return 3600;
  return 0;
}
function actionLabel(text,start,end){
  const after=text.slice(end,Math.min(text.length,end+90));
  const before=text.slice(Math.max(0,start-70),start);
  for(const [re,label] of ACTIONS)if(re.test(after))return label;
  for(const [re,label] of ACTIONS)if(re.test(before))return label;
  if(/^\s*(?:nach|für|weitere?|nochmals?|noch)\b/i.test(text.slice(Math.max(0,start-10),end+10)))return 'Zeit im Schritt';
  return 'Timer';
}
function format(seconds){
  seconds=Math.max(0,Math.round(Number(seconds)||0));
  if(seconds%3600===0)return `${seconds/3600} Std.`;
  if(seconds>=3600){
    const h=Math.floor(seconds/3600),m=Math.round((seconds%3600)/60);
    return m?`${h} Std. ${m} Min.`:`${h} Std.`;
  }
  if(seconds%60===0)return `${seconds/60} Min.`;
  if(seconds>=60){
    const m=Math.floor(seconds/60),s=seconds%60;
    return `${m} Min. ${s} Sek.`;
  }
  return `${seconds} Sek.`;
}
function parse(text){
  const source=String(text||'');
  const out=[];
  DURATION_RE.lastIndex=0;
  let match;
  while((match=DURATION_RE.exec(source))){
    const first=numberValue(match[1]),second=numberValue(match[2]);
    const base=unitSeconds(match[3]);
    const compound=numberValue(match[4]),compoundUnit=unitSeconds(match[5]);
    if(first===null||!base)continue;
    let min=Math.round(first*base+(compound||0)*compoundUnit);
    let max=Math.round((second??first)*base+(compound||0)*compoundUnit);
    if(min>max)[min,max]=[max,min];
    if(min<5||min>MAX_SECONDS)continue;
    const raw=match[0];
    const prefix=source.slice(Math.max(0,match.index-16),match.index);
    // "pro 1 cm ... 10 Minuten" and similar calculated rules are not immediate timers.
    if(/\bpro\s+\d+[\s\S]{0,24}$/i.test(prefix))continue;
    const label=actionLabel(source,match.index,match.index+raw.length);
    out.push({
      key:`${match.index}:${min}:${max}`,
      minSeconds:min,
      maxSeconds:max,
      durationSeconds:min,
      type:max>min?'range':'exact',
      label,
      display:format(min),
      rangeExtraSeconds:Math.max(0,max-min),
      raw,
      offset:match.index
    });
  }
  return out;
}

window.GerdTimerParser={parse,format};
})();