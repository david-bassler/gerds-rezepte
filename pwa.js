(()=>{
'use strict';

if(!('serviceWorker' in navigator))return;

let installPrompt=null;
let refreshing=false;
const stack=()=>document.getElementById('pwaToastStack')||(()=>{
  const el=document.createElement('div');
  el.id='pwaToastStack';
  el.className='pwa-toast-stack';
  el.setAttribute('aria-live','polite');
  document.body.appendChild(el);
  return el;
})();

function toast(id,text,{actionLabel='',onAction=null,persistent=false}={}){
  document.getElementById(id)?.remove();
  const el=document.createElement('div');
  el.className='pwa-toast';
  el.id=id;
  el.innerHTML=`<span>${text}</span><div class="pwa-toast-actions">${actionLabel?'<button type="button" data-pwa-action></button>':''}<button type="button" class="pwa-toast-close" aria-label="Schließen">×</button></div>`;
  if(actionLabel){
    const action=el.querySelector('[data-pwa-action]');
    action.textContent=actionLabel;
    action.addEventListener('click',()=>onAction?.(el));
  }
  el.querySelector('.pwa-toast-close').addEventListener('click',()=>el.remove());
  stack().appendChild(el);
  if(!persistent)setTimeout(()=>el.remove(),5500);
  return el;
}

function syncOnlineState(){
  const existing=document.getElementById('pwaOffline');
  if(navigator.onLine){existing?.remove();return}
  if(existing)return;
  toast('pwaOffline','Offline · Rezepte, Favoriten, Notizen und Einkaufsliste bleiben verfügbar.',{persistent:true});
}

function showInstall(){
  if(!installPrompt||matchMedia('(display-mode: standalone)').matches||sessionStorage.getItem('gerds-pwa-install-dismissed'))return;
  toast('pwaInstall','Gerds Rezepte als App installieren.',{
    actionLabel:'Installieren',
    persistent:true,
    onAction:async el=>{
      const prompt=installPrompt;
      installPrompt=null;
      el.remove();
      try{await prompt.prompt();await prompt.userChoice}catch{}
    }
  });
  document.querySelector('#pwaInstall .pwa-toast-close')?.addEventListener('click',()=>sessionStorage.setItem('gerds-pwa-install-dismissed','1'),{once:true});
}

function showUpdate(worker){
  if(!worker)return;
  toast('pwaUpdate','Eine neue Version von Gerds Rezepte ist verfügbar.',{
    actionLabel:'Aktualisieren',
    persistent:true,
    onAction:()=>worker.postMessage({type:'SKIP_WAITING'})
  });
}

window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  installPrompt=event;
  showInstall();
});
window.addEventListener('appinstalled',()=>{
  installPrompt=null;
  document.getElementById('pwaInstall')?.remove();
});
window.addEventListener('online',syncOnlineState);
window.addEventListener('offline',syncOnlineState);
syncOnlineState();

navigator.serviceWorker.addEventListener('controllerchange',()=>{
  if(refreshing)return;
  refreshing=true;
  location.reload();
});

navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(registration=>{
  if(registration.waiting)showUpdate(registration.waiting);
  registration.addEventListener('updatefound',()=>{
    const worker=registration.installing;
    if(!worker)return;
    worker.addEventListener('statechange',()=>{
      if(worker.state==='installed'&&navigator.serviceWorker.controller)showUpdate(worker);
    });
  });
  window.addEventListener('focus',()=>registration.update().catch(()=>{}));
}).catch(error=>console.warn('PWA-Service-Worker konnte nicht registriert werden.',error));
})();
