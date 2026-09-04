(()=>{
'use strict';

const NUMBER='(?:\\d+(?:[.,]\\d+)?|\\d+\\s*\\/\\s*\\d+|[¼½¾])';
const RANGE=`(${NUMBER})(?:\\s*[–—-]\\s*(${NUMBER}))?`;
const UNIT='(Sekunden?|Sek\\.?|Minuten?|Min\\.?|Stunden?|Std\\.?)';
const DURATION_RE=new RegExp(`${RANGE}\\s*${UNIT}(?:\\s+(?:und\\s+)?(${NUMBER})\\s*(Minuten?|Min\\.?|Sekunden?|Sek\\.?))?`,'gi');
const WORD_HOUR_RE=/\b(?:(eine[rn]?\s+halbe[nr]?)|(eine[rn]?))\s+Stunde(?:n)?\b/gi;
const MAX_SECONDS=7*24*60*60;

const ACTIONS=[
  [/fertigbacken|backen|überbacken|gratinieren/i,'Backen'],
  [/schmoren/i,'Schmoren'],
  [/köcheln|einkochen|reduzieren/i,'Köcheln'],
  [/beizen/i,'Beizen'],
  [/ziehen\s+lassen/i,'Ziehen lassen'],
  [/ruhen\s+lassen|stehen\s+lassen/i,'Ruhen lassen'],
  [/gehen\s+lassen|anspringen\s+lassen/i,'Gehen lassen'],
  [/reifen\s+lassen|reifen/i,'Reifen lassen'],
  [/marinieren/i,'Marinieren'],
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
  if(value==='¼')return .25;if(value==='½')return .5;if(value==='¾')return .75;
  const fraction=value.match(/^(\d+)\s*\/\s*(\d+)$/);
  if(fraction)return Number(fraction[1])/Number(fraction[2]);
  const n=Number(value);return Number.isFinite(n)?n:null;
}
function unitSeconds(unit){
  const u=String(unit||'').toLowerCase();
  if(u.startsWith('sek'))return 1;
  if(u.startsWith('min'))return 60;
  if(u.startsWith('std')||u.startsWith('stund'))return 3600;
  return 0;
}
function actionLabel(text,start,end){
  const before=text.slice(Math.max(0,start-80),start),after=text.slice(end,Math.min(text.length,end+100));
  if(/\bnach\s+(?:ca\.?\s*)?$/i.test(before))return 'Zwischenschritt';
  let best=null;
  for(const [re,label] of ACTIONS){const index=after.search(re);if(index>=0&&(!best||index<best.index))best={index,label}}
  if(best)return best.label;
  let prior=null;
  for(const [re,label] of ACTIONS){const scan=new RegExp(re.source,re.flags.includes('g')?re.flags:re.flags+'g');let match;while((match=scan.exec(before))){if(!prior||match.index>prior.index)prior={index:match.index,label};if(match[0]==='')scan.lastIndex++}}
  return prior?.label||'Timer';
}
function format(seconds){
  seconds=Math.max(0,Math.round(Number(seconds)||0));
  if(seconds%3600===0)return `${seconds/3600} Std.`;
  if(seconds>=3600){const h=Math.floor(seconds/3600),m=Math.round((seconds%3600)/60);return m?`${h} Std. ${m} Min.`:`${h} Std.`}
  if(seconds%60===0)return `${seconds/60} Min.`;
  if(seconds>=60){const m=Math.floor(seconds/60),s=seconds%60;return `${m} Min. ${s} Sek.`}
  return `${seconds} Sek.`;
}
function pushCandidate(out,source,start,end,min,max,raw){
  if(min>max)[min,max]=[max,min];
  if(min<5||min>MAX_SECONDS)return;
  const prefix=source.slice(Math.max(0,start-16),start);
  if(/\bpro\s+\d+[\s\S]{0,24}$/i.test(prefix))return;
  const label=actionLabel(source,start,end);
  out.push({key:`${start}:${min}:${max}`,minSeconds:min,maxSeconds:max,durationSeconds:min,type:max>min?'range':'exact',label,display:format(min),rangeExtraSeconds:Math.max(0,max-min),raw,offset:start});
}
function parse(text){
  const source=String(text||''),out=[];
  DURATION_RE.lastIndex=0;let match;
  while((match=DURATION_RE.exec(source))){
    const first=numberValue(match[1]),second=numberValue(match[2]),base=unitSeconds(match[3]),compound=numberValue(match[4]),compoundUnit=unitSeconds(match[5]);
    if(first===null||!base)continue;
    const min=Math.round(first*base+(compound||0)*compoundUnit),max=Math.round((second??first)*base+(compound||0)*compoundUnit);
    pushCandidate(out,source,match.index,match.index+match[0].length,min,max,match[0]);
  }
  WORD_HOUR_RE.lastIndex=0;
  while((match=WORD_HOUR_RE.exec(source))){
    const seconds=match[1]?1800:3600;
    pushCandidate(out,source,match.index,match.index+match[0].length,seconds,seconds,match[0]);
  }
  return out.sort((a,b)=>a.offset-b.offset);
}

window.GerdTimerParser={parse,format};
})();