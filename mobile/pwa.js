(function(){
 'use strict';
 let registration=null,applyUpdate=false,offlineReady=false;
 const $=s=>document.querySelector(s);
 const help=document.createElement('section');help.id='install-help';help.className='pwa-overlay hidden';help.setAttribute('role','dialog');help.setAttribute('aria-modal','true');help.setAttribute('aria-labelledby','install-help-title');
 help.innerHTML='<div class="pwa-help-card"><button class="pwa-help-close" aria-label="关闭安装说明">×</button><img src="icons/apple-touch-icon.png" alt="" width="64" height="64"><small>把猪场放进口袋</small><h2 id="install-help-title">添加到 iPhone 主屏幕</h2><ol><li>用 <b>Safari</b> 打开这个游戏网址。</li><li>点分享按钮，选择<b>“添加到主屏幕”</b>。</li><li>如果有<b>“作为网页 App 打开”</b>，保持开启，再点“添加”。</li><li>以后点主屏幕上的<b>“豚物语”</b>图标进入游戏。</li></ol><p>首次打开时保持联网，等“离线内容已准备好”后，就可以离线游玩。</p><p class="pwa-help-note">存档保存在本机。在“账本 → 存档管理”可以导出备份，也能导入电脑桌面版的存档。不同设备之间不会自动同步。</p><button class="pixel-btn primary pwa-help-done">知道了</button></div>';
 document.body.append(help);
 let previousFocus=null;
 function showHelp(){previousFocus=document.activeElement;window.GamePlatform?.cancelMovement();help.classList.remove('hidden');window.dispatchEvent(new Event('mobile-modal-change'));help.querySelector('.pwa-help-close').focus();navigator.storage?.persist?.().catch(()=>{})}
 function closeHelp(){help.classList.add('hidden');window.dispatchEvent(new Event('mobile-modal-change'));previousFocus?.focus?.()}
 help.querySelector('.pwa-help-close').onclick=closeHelp;help.querySelector('.pwa-help-done').onclick=closeHelp;
 help.onclick=e=>{if(e.target===help)closeHelp()};help.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();closeHelp()}if(e.key==='Tab'){const list=[...help.querySelectorAll('button')],i=list.indexOf(document.activeElement);if(e.shiftKey&&i===0){e.preventDefault();list.at(-1).focus()}else if(!e.shiftKey&&i===list.length-1){e.preventDefault();list[0].focus()}}};
 const footer=document.createElement('div');footer.className='pwa-title-footer';footer.innerHTML='<button id="install-app-btn" class="text-btn">＋ 添加到主屏幕</button><span id="pwa-status" role="status">正在准备离线内容…</span><button id="pwa-retry" class="text-btn hidden">重新下载</button>';
 $('.title-card').append(footer);$('#install-app-btn').onclick=showHelp;window.addEventListener('open-install-help',showHelp);
 const update=document.createElement('aside');update.id='pwa-update';update.className='pwa-update hidden';update.setAttribute('role','status');update.innerHTML='<span>游戏有新版本</span><button id="pwa-update-now">保存并更新</button><button id="pwa-update-later" aria-label="稍后更新">稍后</button>';$('.title-card').append(update);
 function textStatus(text,ready=false){$('#pwa-status').textContent=text;offlineReady=ready;$('#pwa-status').dataset.ready=ready?'true':'false'}
 function pending(){if(registration?.waiting)update.classList.remove('hidden')}
 $('#pwa-update-later').onclick=()=>update.classList.add('hidden');
 $('#pwa-update-now').onclick=()=>{
  if(!registration?.waiting)return;
  if(window.GamePlatform?.getStatus().active&&!window.GamePlatform.save()){textStatus('进度未能保存，请先在账本导出备份');return}
  window.GamePlatform?.cancelMovement();applyUpdate=true;$('#pwa-update-now').disabled=true;$('#pwa-update-now').textContent='正在更新…';registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});
 };
 function getCacheStatus(){registration?.active?.postMessage({type:'CACHE_STATUS'})}
 window.addEventListener('offline',()=>textStatus(offlineReady?'离线游玩 · 存档保存在本机':'当前离线 · 联网后完成下载',offlineReady));
 window.addEventListener('online',()=>{getCacheStatus();registration?.update().catch(()=>{})});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){getCacheStatus();if(navigator.onLine)registration?.update().catch(()=>{});pending()}});
 $('#pwa-retry').onclick=()=>{textStatus('正在重新准备离线内容…');$('#pwa-retry').classList.add('hidden');navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>{registration=r;return r.update()}).catch(()=>{textStatus('暂时无法下载，联网后重试');$('#pwa-retry').classList.remove('hidden')})};
 if(!('serviceWorker' in navigator)||!window.isSecureContext){textStatus(location.protocol==='file:'?'离线文件版 · 请通过游戏网址安装':'当前浏览器无法保存离线内容');return}
 navigator.serviceWorker.addEventListener('message',e=>{
  const data=e.data||{};
  if(data.type==='CACHE_PROGRESS'){const percent=Math.floor((data.completed||0)/(data.total||1)*100);textStatus('正在准备离线内容 '+percent+'%')}
  if(data.type==='CACHE_READY'){textStatus(navigator.onLine?'离线内容已准备好':'离线游玩 · 存档保存在本机',true);$('#pwa-retry').classList.add('hidden');pending()}
  if(data.type==='CACHE_FAILED'){textStatus('离线内容下载未完成，请保持联网重试');$('#pwa-retry').classList.remove('hidden')}
 });
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(applyUpdate)location.reload();else getCacheStatus()});
 navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>{
  registration=r;pending();getCacheStatus();
  r.addEventListener('updatefound',()=>{const worker=r.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'){getCacheStatus();pending()}})});
  return navigator.serviceWorker.ready;
 }).then(r=>{registration=r;getCacheStatus();pending()}).catch(()=>{textStatus('离线内容尚未准备好，联网后重试');$('#pwa-retry').classList.remove('hidden')});
 window.PocketPWA={showHelp,getStatus:()=>({offlineReady,hasUpdate:!!registration?.waiting,controlled:!!navigator.serviceWorker.controller})};
})();
