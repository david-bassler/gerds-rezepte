'use strict';

const CACHE_PREFIX='gerds-rezepte-';
const PRECACHE=`${CACHE_PREFIX}precache-v4`;
const RUNTIME=`${CACHE_PREFIX}runtime-v4`;

const PRECACHE_URLS=[
  './','./index.html','./404.html','./site.webmanifest',
  './styles.css','./lists.css','./nav-icons.css','./shopping-ui.css','./shopping-reorder.css','./shopping-focus.css','./pwa.css','./personal-data.css','./cook-mode.css','./timers.css',
  './recipes-data.js','./data-fixes.js','./editorial-fixes.js','./shopping-eligibility.js','./recipe-card.js','./app.js','./glossary-boundary-fixes.js','./ingredient-ui.js','./lists.js','./shopping-ui.js','./vendor/sortable.min.js','./shopping-reorder.js','./shopping-focus.js','./timer-parser.js','./timers.js','./cook-mode.js','./personal-data.js','./pwa.js',
  './assets/images/logo-kitchen.svg','./assets/images/icon-192.png','./assets/images/icon-512.png','./assets/images/icon-maskable-512.png','./assets/images/apple-touch-icon.png','./assets/images/hero-kitchen.webp','./assets/images/category-sprite.webp','./assets/images/cuisine-sprite.webp','./assets/images/neue-kartoffeln-garnelen-gruner-spargel-sahne-1.webp','./assets/images/neue-kartoffeln-garnelen-gruner-spargel-sahne-2.webp','./assets/images/schweineschnitzel-kartoffelkruste-schmand-1.webp','./assets/images/schweineschnitzel-kartoffelkruste-schmand-2.webp','./assets/images/spaghetti-alle-vongole-1.webp','./assets/images/spaghetti-alle-vongole-2.webp','./assets/images/spareribs-barbecue-1.webp','./assets/images/spareribs-barbecue-2.webp','./assets/images/spargel-grun-riesengarnelen-sahne-neue-kartoffeln-1.webp','./assets/images/spargel-grun-riesengarnelen-sahne-neue-kartoffeln-2.webp'
];

self.addEventListener('install',event=>{event.waitUntil(caches.open(PRECACHE).then(cache=>cache.addAll(PRECACHE_URLS)))});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith(CACHE_PREFIX)&&name!==PRECACHE&&name!==RUNTIME).map(name=>caches.delete(name)));
    if(self.registration.navigationPreload)await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});

async function navigationResponse(event){
  try{
    const preload=await event.preloadResponse,response=preload||await fetch(event.request);
    if(response&&response.ok){const cache=await caches.open(RUNTIME);await cache.put(event.request,response.clone())}
    return response;
  }catch{return (await caches.match(event.request))||(await caches.match('./index.html'))||(await caches.match('./'))}
}
async function staleWhileRevalidate(request){
  const cached=await caches.match(request);
  const fetchPromise=fetch(request).then(async response=>{if(response&&response.ok){const cache=await caches.open(RUNTIME);await cache.put(request,response.clone())}return response}).catch(()=>null);
  if(cached){void fetchPromise;return cached}
  return (await fetchPromise)||new Response('Offline',{status:503,statusText:'Offline'});
}
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;
  const url=new URL(request.url);if(url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){event.respondWith(navigationResponse(event));return}
  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const data=event.notification.data||{};
  const recipeId=String(data.recipeId||'');
  const stepIndex=Number(data.stepIndex)||0;
  const target=new URL('./',self.registration.scope);
  if(recipeId)target.hash=`rezept=${encodeURIComponent(recipeId)}`;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if(new URL(client.url).origin===target.origin){
        await client.focus();
        client.postMessage({type:'OPEN_COOK_STEP',recipeId,stepIndex});
        return;
      }
    }
    const opened=await self.clients.openWindow(target.href);
    if(opened)opened.postMessage({type:'OPEN_COOK_STEP',recipeId,stepIndex});
  })());
});