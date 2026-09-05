'use strict';

const CACHE_PREFIX='gerds-rezepte-';
const APP_VERSION='17';
const PRECACHE=`${CACHE_PREFIX}precache-v${APP_VERSION}`;
const RUNTIME=`${CACHE_PREFIX}runtime-v${APP_VERSION}`;

const CODE_ASSETS=[
  'styles.css','lists.css','nav-icons.css','shopping-ui.css','shopping-reorder.css','shopping-focus.css','pwa.css','personal-data.css','cook-mode.css','timers.css',
  'recipes-data.js','data-fixes.js','editorial-fixes.js','shopping-eligibility.js','recipe-card.js','app.js','glossary-boundary-fixes.js','ingredient-ui.js','lists.js','shopping-ui.js','shopping-reorder.js','shopping-focus.js','timer-parser.js','timers.js','cook-mode.js','personal-data.js','pwa.js'
];
const PRECACHE_URLS=[
  './','./index.html','./404.html','./site.webmanifest',
  ...CODE_ASSETS.map(path=>`./${path}?v=${APP_VERSION}`),
  './assets/images/logo-kitchen.svg','./assets/images/icon-192.png','./assets/images/icon-512.png','./assets/images/icon-maskable-512.png','./assets/images/apple-touch-icon.png','./assets/images/hero-kitchen.webp','./assets/images/category-sprite.webp','./assets/images/cuisine-sprite.webp',
  './assets/images/neue-kartoffeln-garnelen-gruner-spargel-sahne-1.webp','./assets/images/neue-kartoffeln-garnelen-gruner-spargel-sahne-2.webp','./assets/images/schweineschnitzel-kartoffelkruste-schmand-1.webp','./assets/images/schweineschnitzel-kartoffelkruste-schmand-2.webp','./assets/images/spaghetti-alle-vongole-1.webp','./assets/images/spaghetti-alle-vongole-2.webp','./assets/images/spareribs-barbecue-1.webp','./assets/images/spareribs-barbecue-2.webp','./assets/images/spargel-grun-riesengarnelen-sahne-neue-kartoffeln-1.webp','./assets/images/spargel-grun-riesengarnelen-sahne-neue-kartoffeln-2.webp'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(PRECACHE).then(cache=>cache.addAll(PRECACHE_URLS)));
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith(CACHE_PREFIX)&&name!==PRECACHE&&name!==RUNTIME).map(name=>caches.delete(name)));
    if(self.registration.navigationPreload)await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});

async function putRuntime(request,response){
  if(response&&response.ok){
    const cache=await caches.open(RUNTIME);
    await cache.put(request,response.clone());
  }
  return response;
}
async function networkFirst(request,{navigation=false}={}){
  try{
    const response=navigation
      ?((await eventPreload(request))||await fetch(request,{cache:'no-cache'}))
      :await fetch(request,{cache:'no-cache'});
    return await putRuntime(request,response);
  }catch{
    return (await caches.match(request))
      ||(await caches.match(request,{ignoreSearch:true}))
      ||(navigation?(await caches.match('./index.html'))||(await caches.match('./')):null)
      ||new Response('Offline',{status:503,statusText:'Offline'});
  }
}
async function eventPreload(request){
  // Navigation preload belongs to the fetch event, so regular network-first requests skip it.
  return null;
}
async function navigationResponse(event){
  try{
    const preload=await event.preloadResponse;
    const response=preload||await fetch(event.request,{cache:'no-cache'});
    return await putRuntime(event.request,response);
  }catch{
    return (await caches.match(event.request))
      ||(await caches.match('./index.html'))
      ||(await caches.match('./'));
  }
}
async function staleWhileRevalidate(request){
  const cached=await caches.match(request);
  const fetchPromise=fetch(request).then(response=>putRuntime(request,response)).catch(()=>null);
  if(cached){void fetchPromise;return cached}
  return (await fetchPromise)||new Response('Offline',{status:503,statusText:'Offline'});
}
function isVersionCritical(request,url){
  return request.destination==='script'
    ||request.destination==='style'
    ||url.pathname.endsWith('.html')
    ||url.pathname.endsWith('.css')
    ||url.pathname.endsWith('.js');
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){event.respondWith(navigationResponse(event));return}
  if(isVersionCritical(request,url)){event.respondWith(networkFirst(request));return}
  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const data=event.notification.data||{},target=data.url?new URL(data.url):new URL('./',self.registration.scope);
  if(!data.url&&data.recipeId)target.hash=`rezept=${encodeURIComponent(data.recipeId)}`;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const client=windows.find(item=>new URL(item.url).origin===target.origin);
    if(client){try{await client.navigate(target.href)}catch{}await client.focus();return}
    await self.clients.openWindow(target.href);
  })());
});