(()=>{
'use strict';
fetch('lists.js',{cache:'no-store'})
  .then(response=>{
    if(!response.ok)throw new Error(`lists.js konnte nicht geladen werden (${response.status})`);
    return response.text();
  })
  .then(source=>{
    const fixed=source.replace("Dösch.:{dimension:'pack'","'Dösch.':{dimension:'pack'");
    if(fixed===source)throw new Error('Erwartete Syntaxstelle in lists.js wurde nicht gefunden.');
    new Function(fixed)();
  })
  .catch(error=>console.error('Listenfunktionen konnten nicht gestartet werden.',error));
})();