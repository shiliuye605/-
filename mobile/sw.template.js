/* Install a whole matching release before offering an update. Never cache login redirects. */
const BUILD='__BUILD__',PREFIX='tun-story-release-',CACHE=PREFIX+BUILD,FILES=__FILES__;
const ABS=FILES.map(p=>new URL(p,self.registration.scope).href),INDEX=new URL('./index.html',self.registration.scope).href;
let completed=0;
async function broadcast(message){const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of clients)client.postMessage(message)}
async function installRelease(){
 const cache=await caches.open(CACHE);let index=0;
 try{await Promise.all(Array.from({length:4},async()=>{while(index<ABS.length){const url=ABS[index++],response=await fetch(new Request(url,{cache:'reload',credentials:'same-origin'}));if(!response.ok||response.redirected||response.type==='opaque')throw Error('Incomplete offline release');await cache.put(url,response);completed++;await broadcast({type:'CACHE_PROGRESS',build:BUILD,completed,total:ABS.length})}}));
  await broadcast({type:'CACHE_READY',build:BUILD,total:ABS.length});if(!self.registration.active)await self.skipWaiting();
 }catch(error){await caches.delete(CACHE);await broadcast({type:'CACHE_FAILED',build:BUILD});throw error}
}
self.addEventListener('install',event=>event.waitUntil(installRelease()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);await self.clients.claim();await broadcast({type:'CACHE_READY',build:BUILD,total:ABS.length})})()));
self.addEventListener('message',event=>{
 if(event.data?.type==='ACTIVATE_UPDATE')event.waitUntil(self.skipWaiting());
 if(event.data?.type==='CACHE_STATUS')event.waitUntil((async()=>{const cache=await caches.open(CACHE),keys=await cache.keys();event.source?.postMessage({type:keys.length===ABS.length?'CACHE_READY':'CACHE_PROGRESS',build:BUILD,completed:keys.length,total:ABS.length})})());
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;
 // Authentication routes belong to the hosting service, never to this offline shell.
 if(/\/(?:signin-with-chatgpt|signout-with-chatgpt|callback)(?:\/|$)/.test(url.pathname))return;
 if(request.mode==='navigate'){
  const rootPath=new URL(self.registration.scope).pathname;
  if(url.pathname!==rootPath&&url.pathname!==rootPath+'index.html')return;
  event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(INDEX))||fetch(request)));return;
 }
 const key=new URL(url.pathname,self.location.origin).href;
 if(!ABS.includes(key))return;
 event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(key))||fetch(request)));
});
