(()=>{
'use strict';
const LETTER_END=/[\p{L}\p{M}]$/u;
const LETTER_START=/^[\p{L}\p{M}]/u;
function embeddedInWord(node){
  const previous=node.previousSibling?.textContent||'';
  const next=node.nextSibling?.textContent||'';
  return LETTER_END.test(previous)||LETTER_START.test(next);
}
function fixGlossaryBoundaries(){
  document.querySelectorAll('.glossary-term').forEach(node=>{
    if(!embeddedInWord(node))return;
    node.replaceWith(document.createTextNode(node.textContent||''));
  });
}
let queued=false;
function queueFix(){
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{queued=false;fixGlossaryBoundaries()});
}
new MutationObserver(queueFix).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
fixGlossaryBoundaries();
})();
