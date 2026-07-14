(function(){
  'use strict';
  const D=window.PIG_DATA,E=window.PigEngine;
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  const SAVE_KEY='pigFarmStory_saves_v3',PREF_KEY='pigFarmStory_prefs_v1';
  let state=null,currentPanel=null,currentTab=null,selectedFeed='basic',interactionPig=null,marketAfterEvent=false;
  let toastTimer=null,confirmCallback=null,dialogTimer=null,dialogFull='',dialogCallback=null;
  const prefs=Object.assign({music:true,sfx:true,volume:.32},readJSON(PREF_KEY,{}));

  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function money(n){return Math.round(n).toLocaleString('zh-CN');}
  function readJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key))||fallback}catch(_){return fallback}}
  function getSaves(){const v=readJSON(SAVE_KEY,[]);return Array.isArray(v)?v:[];}
  function setSaves(v){try{localStorage.setItem(SAVE_KEY,JSON.stringify(v));return true}catch(_){toast('存档空间不足，请删除旧存档。','error');return false}}
  function saveCurrent(loud=false){
    if(!state)return false;state.updatedAt=Date.now();const check=E.validate(state);if(!check.ok){toast('存档校验失败：'+check.errors[0],'error');return false;}
    const saves=getSaves(),i=saves.findIndex(x=>x.id===state.id),copy=E.clone(state);if(i>=0)saves[i]=copy;else saves.unshift(copy);
    saves.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));const ok=setSaves(saves.slice(0,8));if(ok&&loud){audio.sfx('save');toast('账本已保存','success');}return ok;
  }
  function deleteSave(id){const saves=getSaves().filter(s=>s.id!==id);setSaves(saves);renderSaveList();}

  class FarmAudio{
    constructor(){this.ctx=null;this.timer=null;this.step=0}
    ensure(){
      if(!this.ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;this.ctx=new C();}
      if(this.ctx.state==='suspended')this.ctx.resume();if((state?state.settings.music:prefs.music)&&!this.timer)this.startMusic();
    }
    tone(freq,dur=.12,type='square',vol=.035,when=0){if(!this.ctx)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(vol*(state?state.settings.volume:prefs.volume),this.ctx.currentTime+when);g.gain.exponentialRampToValueAtTime(.0001,this.ctx.currentTime+when+dur);o.connect(g).connect(this.ctx.destination);o.start(this.ctx.currentTime+when);o.stop(this.ctx.currentTime+when+dur+.03)}
    startMusic(){if(!this.ctx||this.timer)return;const notes=[261.6,329.6,392,440,392,329.6,293.7,349.2,440,523.2,440,349.2];this.timer=setInterval(()=>{const on=state?state.settings.music:prefs.music;if(!on)return;const n=notes[this.step++%notes.length];this.tone(n,.25,'square',.022);if(this.step%4===1)this.tone(n/2,.38,'triangle',.018,.03)},460)}
    stopMusic(){clearInterval(this.timer);this.timer=null}
    sfx(kind='click'){const on=state?state.settings.sfx:prefs.sfx;if(!on)return;this.ensure();if(kind==='good'){this.tone(523,.08);this.tone(659,.12,'square',.04,.09)}else if(kind==='bad'){this.tone(160,.18,'sawtooth',.045)}else if(kind==='save'){this.tone(392,.08);this.tone(523,.08,'square',.04,.07);this.tone(659,.15,'square',.035,.14)}else if(kind==='pig'){this.tone(210,.06,'square',.05);this.tone(170,.1,'square',.04,.07)}else this.tone(330,.05,'square',.022)}
    toggle(){const target=state?state.settings:prefs;target.music=!target.music;prefs.music=target.music;localStorage.setItem(PREF_KEY,JSON.stringify(prefs));if(target.music){this.ensure();this.startMusic()}else this.stopMusic();renderAudioButtons();if(state)saveCurrent();}
  }
  const audio=new FarmAudio();

  function toast(text,type=''){clearTimeout(toastTimer);const t=$('#toast');t.textContent=text;t.className='toast'+(type?' '+type:'');toastTimer=setTimeout(()=>t.classList.add('hidden'),2600)}
  function confirmBox(title,text,callback,danger=true){$('#confirm-title').textContent=title;$('#confirm-text').textContent=text;$('#confirm-ok').className='pixel-btn '+(danger?'danger':'primary');confirmCallback=callback;$('#confirm-overlay').classList.remove('hidden')}
  function closeConfirm(){confirmCallback=null;$('#confirm-overlay').classList.add('hidden')}

  function renderSaveList(){
    const saves=getSaves(),box=$('#save-list');$('#continue-btn').disabled=!saves.length;
    if(!saves.length){box.innerHTML='<div class="empty-save">还没有农场账本。新建后会在每次行动后自动保存。</div>';return;}
    box.innerHTML=saves.map(s=>{const sum=E.summary(E.migrate(s));return `<article class="save-card" data-load="${esc(s.id)}"><div><b>${esc(s.farmName)} · ${esc(s.playerName)}</b><small>${esc(sum.time)} · ${sum.live}只猪 · ¥${money(s.money)}</small></div><span class="${s.ended?'ending-tag':''}">${s.ended?(s.ending?.win?'冠军结局':'赛程结束'):`${sum.totalDay}/180日`}</span><button class="delete-save" data-delete="${esc(s.id)}" title="删除存档">×</button></article>`}).join('');
  }
  function loadSave(id){
    const raw=getSaves().find(s=>s.id===id);if(!raw)return toast('找不到这个存档。','error');const migrated=E.migrate(E.clone(raw)),check=E.validate(migrated);if(!check.ok)return toast('存档损坏：'+check.errors.join('、'),'error');
    state=migrated;state.settings=Object.assign({},prefs,state.settings||{});enterGame(false);
  }
  function enterGame(isNew){
    $('#title-screen').classList.add('hidden');$('#game').classList.remove('hidden');renderHUD();renderWorldPigs();saveCurrent();audio.ensure();$('#world').focus();
    if(state.pendingEvent)setTimeout(showEvent,350);else if(state.yearEnd)setTimeout(()=>openPanel('market','buy'),350);else if(state.ended&&!state.ending?.viewed)setTimeout(showEnding,350);
    if(isNew)showDialogue('farmer',state.playerName,`这里就是${state.farmName}。红豆、团团和福花在猪圈等着，三年后的比猪大赛……先从喂饱它们开始吧。`);
  }
  function returnTitle(){
    if(state)saveCurrent();clearInterval(dialogTimer);state=null;currentPanel=null;marketAfterEvent=false;player.target=null;
    $('#game').classList.add('hidden');$('#title-screen').classList.remove('hidden');closePanel();
    $('#event-overlay').classList.add('hidden');$('#ending-overlay').classList.add('hidden');$('#dialogue').classList.add('hidden');$('#new-save-overlay').classList.add('hidden');$('#confirm-overlay').classList.add('hidden');renderSaveList();
  }

  function renderAudioButtons(){const on=state?state.settings.music:prefs.music;$('#title-audio').textContent='♫ 音乐：'+(on?'开':'关');$('#audio-btn').textContent=on?'♫':'♪';$('#audio-btn').title='音乐：'+(on?'开':'关')}
  function renderHUD(){
    if(!state)return;const sum=E.summary(state),season=D.SEASONS[sum.season-1];
    $('#farm-name').textContent=state.farmName;$('#year-badge').textContent=`第 ${state.year} 年`;$('#day-badge').textContent=`${season} · ${sum.day} 日`;$('#phase-badge').textContent=state.ended?'赛程结束':sum.phase;
    $('#year-progress').style.width=(state.quarter>=D.YEAR_DAYS*4?100:Math.min(100,(sum.day-1+(state.quarter%4)/4)/60*100))+'%';$('#total-progress').textContent=`总进度 ${Math.min(180,sum.totalDay)} / 180 日`;
    $('#money').textContent=money(state.money);$('#reputation').textContent=state.reputation;$('#weather').textContent=state.weather;$('#weather-icon').textContent=state.weather==='小雨'?'☂':state.weather==='大风'?'≋':state.weather==='多云'?'☁':'☀';
    $('#live-count').textContent=`${sum.live} / ${sum.capacity}`;$('#action-count').textContent=state.actionCount;$('#medicine-count').textContent=state.inventory.medicine;$('#ready-count').textContent=state.fields.filter(f=>f.ready).length;
    $('#event-countdown').textContent=state.ended?'日程已锁定':state.yearEnd?'年市进行中':`约 ${state.nextEventIn} 次行动后`;
    const wl=$('#warning-list');wl.innerHTML=sum.warnings.length?sum.warnings.slice(0,7).map(w=>`<div class="warning-item ${w.level}">${esc(w.text)}</div>`).join(''):'<div class="all-good"><b>✓</b>猪圈与田地一切平稳</div>';
    $('#rail-tip').textContent=state.ended?'赛程已经结束。你仍可打开猪群，为它们梳毛、抚摸或陪伴。':state.yearEnd?'年底年市已经开张，完成买卖后迎接新年。':'走近发光地点按 E，或直接点击地点。';
    const world=$('#world');world.classList.toggle('night',sum.phase==='夜晚');const weather=$('#weather-layer');weather.className='weather-layer '+(state.weather==='小雨'?'rain':state.weather==='大风'?'wind':'');
    $('#location-label').textContent=state.ended?`${state.farmName} · 赛后时光`:state.farmName;renderAudioButtons();
  }

  const RED_PIG_MODELS=new Set(['duroc','tamworth','kunekune']);
  const DARK_PIG_MODELS=new Set(['hampshire','tibetan','minzhu','potbelly','meishan','taihu','erhualian','largeblack','wuzhishan','polandchina']);
  function hash(s){let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))>>>0;return h}
  function pigSpriteRow(b){if(b.spots||b.band||b.feet)return 3;if(RED_PIG_MODELS.has(b.id))return 1;if(DARK_PIG_MODELS.has(b.id))return 2;return 0}
  function pigRowY(b){return -64*pigSpriteRow(b)}
  const PIG_PENS=[
    {id:'北圈',minX:58.2,maxX:71.1,minY:28.2,maxY:35.8},
    {id:'中圈',minX:62.1,maxX:80.3,minY:45.7,maxY:52.8},
    {id:'南圈',minX:80.4,maxX:90.1,minY:54.8,maxY:64.3}
  ];
  function pigPenIndex(p,fallback=0){const pen=Number(p.worldPen);return Number.isInteger(pen)&&pen>=0&&pen<PIG_PENS.length?pen:fallback%PIG_PENS.length}
  function pigPenPosition(p,salt=0){
    const pen=PIG_PENS[pigPenIndex(p)],h=hash(`${p.id}:${salt}`),x=pen.minX+(h%1000)/999*(pen.maxX-pen.minX),y=pen.minY+((h>>>10)%1000)/999*(pen.maxY-pen.minY);
    return {x,y};
  }
  function pigSpriteHTML(p,i){
    const b=E.breed(p.breedId),penIndex=pigPenIndex(p),pen=PIG_PENS[penIndex],position=pigPenPosition(p),scale=E.phaseOf(p)==='piglet'?.58:E.phaseOf(p)==='juvenile'?.76:b.role==='宠物猪'?.84:1;
    return `<div class="pig-sprite ${p.alive?'':'dead'} ${p.illness?'sick':''}" data-world-pig="${esc(p.id)}" data-pen="${penIndex}" title="${esc(p.name)} · ${esc(b.name)} · ${pen.id}" style="left:${position.x}%;top:${position.y}%;--pig-row:${pigRowY(b)}px;--scale:${scale}"></div>`;
  }
  function renderWorldPigs(){
    if(!state)return;const pigs=state.pigs.filter(p=>!p.disposed).slice(0,14),counts=PIG_PENS.map(()=>0);
    pigs.forEach(p=>{const pen=Number(p.worldPen);if(Number.isInteger(pen)&&pen>=0&&pen<PIG_PENS.length)counts[pen]++});
    pigs.forEach(p=>{const pen=Number(p.worldPen);if(!Number.isInteger(pen)||pen<0||pen>=PIG_PENS.length){const least=Math.min(...counts);p.worldPen=counts.indexOf(least);counts[p.worldPen]++}});
    $('#pig-layer').innerHTML=pigs.map(pigSpriteHTML).join('');
  }
  setInterval(()=>{if(!state||$('#game').classList.contains('hidden'))return;$$('.pig-sprite:not(.dead)').forEach((el,i)=>{const pen=PIG_PENS[Number(el.dataset.pen)]||PIG_PENS[0],x=pen.minX+Math.random()*(pen.maxX-pen.minX),y=pen.minY+Math.random()*(pen.maxY-pen.minY),old=parseFloat(el.style.left),duration=1.25+i%3*.2;el.style.transition=`left ${duration}s steps(8),top ${duration}s steps(8)`;el.style.left=x+'%';el.style.top=y+'%';el.classList.toggle('flip',x<old);el.classList.add('walking');setTimeout(()=>el.classList.remove('walking'),duration*1000)})},1800);

  const player={x:31,y:58,target:null,keys:new Set(),last:0};
  const zones={house:{x:18.3,y:40.2,panel:'journal',label:'农舍正门'},field:{x:46.8,y:71.5,panel:'farm',label:'农田入口'},pen:{x:69.1,y:58.4,panel:'pigs',label:'猪圈栏门'},mill:{x:83.2,y:35.6,panel:'workshop',label:'饲料工坊正门'},market:{x:93.1,y:21.2,panel:'marketTrip',label:'青石镇进镇小路'},build:{x:58.7,y:44.1,panel:'build',label:'建造牌'}};
  function nearestZone(){let best=null,dist=999;for(const [id,z] of Object.entries(zones)){const d=Math.hypot(player.x-z.x,player.y-z.y);if(d<dist){dist=d;best={id,...z,dist}}}return best}
  function updatePlayer(){const el=$('#player');el.style.left=player.x+'%';el.style.top=player.y+'%';const n=nearestZone();$$('.hotspot').forEach(h=>h.classList.toggle('near',n&&h.dataset.zone===n.id&&n.dist<7));const prompt=$('#near-prompt');if(n&&n.dist<7){prompt.classList.remove('hidden');prompt.style.left=(player.x+1)+'%';prompt.style.top=(player.y-10)+'%';prompt.querySelector('span').textContent=n.label}else prompt.classList.add('hidden')}
  function worldLoop(t){
    if(state&&!$('#game').classList.contains('hidden')&&!isModalOpen()){
      let dx=0,dy=0;if(player.keys.has('ArrowLeft')||player.keys.has('a'))dx--;if(player.keys.has('ArrowRight')||player.keys.has('d'))dx++;if(player.keys.has('ArrowUp')||player.keys.has('w'))dy--;if(player.keys.has('ArrowDown')||player.keys.has('s'))dy++;
      if(player.target){const tx=player.target.x-player.x,ty=player.target.y-player.y,d=Math.hypot(tx,ty);if(d<1.3){const go=player.target;player.target=null;$('#player').classList.remove('walking');activateZone(go.panel)}else{dx=tx/d;dy=ty/d}}
      const moving=dx||dy;if(moving){const dt=Math.min(32,t-(player.last||t)),sprite=$('#player'),direction=Math.abs(dx)>Math.abs(dy)?(dx<0?'left':'right'):(dy<0?'up':'down');player.x=Math.max(3,Math.min(96,player.x+dx*dt*.018));player.y=Math.max(12,Math.min(91,player.y+dy*dt*.018));sprite.classList.remove('dir-down','dir-left','dir-right','dir-up');sprite.classList.add('walking','dir-'+direction);updatePlayer()}else $('#player').classList.remove('walking');
    }player.last=t;requestAnimationFrame(worldLoop)
  }
  requestAnimationFrame(worldLoop);
  function isModalOpen(){return !$('#panel-overlay').classList.contains('hidden')||!$('#event-overlay').classList.contains('hidden')||!$('#confirm-overlay').classList.contains('hidden')||!$('#dialogue').classList.contains('hidden')||!$('#ending-overlay').classList.contains('hidden')}
  function walkTo(zone){const z=zones[zone];if(!z)return;player.target={...z};$('#world-hint').textContent=`正在前往${z.label}…`;audio.sfx('click')}
  function activateZone(panel){$('#world-hint').textContent='点击地图地点，角色会自动走过去';openPanel(panel)}

  function closePanel(){currentPanel=null;currentTab=null;$('#panel-overlay').classList.add('hidden')}
  function syncPigArt(){
    const pigs=[...state.pigs,...state.memorial];
    $$('.pig-card').forEach(card=>{const name=card.querySelector('h3')?.firstChild?.textContent?.trim(),pig=pigs.find(item=>item.name===name);if(pig)card.style.setProperty('--pig-row',pigRowY(E.breed(pig.breedId))+'px')});
    $$('.pig-offer').forEach((card,index)=>{const offer=state.marketOffers[index];if(offer)card.style.setProperty('--pig-row',pigRowY(E.breed(offer.breedId))+'px')});
    $$('.breed-card').forEach(card=>{const name=card.querySelector('h4')?.textContent,b=D.BREEDS.find(item=>item.name===name);if(b)card.style.setProperty('--pig-row',pigRowY(b)+'px')});
  }
  function panelSetup(title,kicker,tabs=[],tab=null){
    $('#panel-title').textContent=title;$('#panel-kicker').textContent=kicker;const box=$('#panel-tabs');currentTab=tab||tabs[0]?.id||null;box.innerHTML=tabs.map(t=>`<button data-tab="${t.id}" class="${t.id===currentTab?'active':''}">${t.label}</button>`).join('');
  }
  function openPanel(name,tab){
    if(!state)return;
    if(name==='marketTrip'){
      if(state.yearEnd)return openPanel('market',tab||'buy');
      if(state.ended)return toast('赛程结束后集市已经休市。','error');
      return confirmBox('前往青石镇集市','往返集市会占用整整 1 个游戏日。到达后，场内买卖不再额外耗时。',()=>{const r=E.visitMarket(state);marketAfterEvent=!!state.pendingEvent;if(marketAfterEvent)state.pendingDestination='market';handleAction(r,'来到了青石镇集市',false);if(r.ok&&!state.pendingEvent&&!state.yearEnd)openPanel('market','buy');},false);
    }
    currentPanel=name;$('#panel-overlay').classList.remove('hidden');renderPanel(name,tab);
  }
  function renderPanel(name,tab){
    if(!state)return;currentPanel=name;
    if(name==='pigs')renderPigs(tab||currentTab||'herd');
    else if(name==='farm')renderFarm();
    else if(name==='workshop')renderWorkshop();
    else if(name==='market')renderMarket(tab||currentTab||'buy');
    else if(name==='build')renderBuild();
    else if(name==='catalog')renderCatalog(tab||currentTab||'all');
    else if(name==='journal')renderJournal(tab||currentTab||'ledger');
    syncPigArt();
  }

  function pigCard(p){
    const b=E.breed(p.breedId),stage=E.phaseName(p),dead=!p.alive,ill=p.illness?E.disease(p.illness):null;
    return `<article class="pig-card ${dead?'dead-card':''}" style="--pig-color:${b.color}"><div class="pig-card-head"><div class="pig-avatar"></div><div class="pig-title"><h3>${esc(p.name)} <small>${E.sexName(p)}</small></h3><p>${esc(b.name)} · ${stage}</p><div class="pig-tags"><span class="pill ${b.role==='肉猪'?'meat':b.role==='宠物猪'?'pet':'breed'}">${b.role}</span>${ill?`<span class="pill danger">${ill.name}</span>`:''}${p.pregnant?`<span class="pill breed">妊娠 ${p.pregnant}日</span>`:''}</div></div></div>
      <div class="pig-meters"><label>健康 <b>${Math.round(p.health)}</b><div class="meter ${p.health<35?'low':''}"><span style="width:${p.health}%"></span></div></label><label>心情 <b>${Math.round(p.mood)}</b><div class="meter mood ${p.mood<35?'low':''}"><span style="width:${p.mood}%"></span></div></label><label>饱食 <b>${Math.round(p.hunger)}</b><div class="meter hunger ${p.hunger<35?'low':''}"><span style="width:${p.hunger}%"></span></div></label></div>
      <div class="pig-facts"><div><small>年龄</small><b>${p.ageDays} 日</b></div><div><small>体重</small><b>${p.weight} kg</b></div><div><small>亲密</small><b>${p.bond}</b></div></div>
      ${ill?`<div class="illness-line">⚠ ${ill.desc}</div>`:''}${p.pregnant?`<div class="pregnant-line">✦ 预计 ${p.pregnant} 日后产仔；哺育料可提高成活。</div>`:''}
      <div class="pig-actions">${dead?`<button class="action-btn red" data-action="dispose" data-pig="${p.id}">处理并消毒 <span class="time-cost">· 半日</span></button>`:`<button class="action-btn" data-action="interact-open" data-pig="${p.id}">互动</button>${ill?`<button class="action-btn red" data-action="treat" data-pig="${p.id}">治疗 <span class="time-cost">· 半日</span></button>`:''}`}</div></article>`;
  }
  function renderPigs(tab='herd'){
    currentTab=tab;panelSetup('猪群与照料','猪圈管理',[{id:'herd',label:`猪群 ${E.livePigs(state).length}/${E.capacity(state)}`},{id:'feed',label:'统一喂养'},{id:'breed',label:'配种繁育'},{id:'memorial',label:`离场记录 ${state.memorial.length}`}],tab);
    const body=$('#panel-body');
    if(tab==='herd'){
      const list=state.pigs.filter(p=>!p.disposed);body.innerHTML=`<div class="section-head"><div><h3>猪圈状态</h3><p>低心情会厌食并减慢成长；疾病恶化会死亡。</p></div><span class="pill">环境加成 +${Math.round((state.facilities.pen-1)*3.5)}%</span></div>${interactionPig?interactionChooser(interactionPig):''}<div class="pig-grid">${list.length?list.map(pigCard).join(''):'<div class="empty-state"><b>空</b>猪圈里没有猪</div>'}</div>`;
    }else if(tab==='feed'){
      body.innerHTML=`<div class="section-head"><div><h3>选择一类饲料，喂养全部活猪</h3><p>一次统一喂养占用半日，每只猪消耗 1 份。</p></div><button class="action-btn green" data-action="feed" ${state.ended?'disabled':''}>喂养 ${E.livePigs(state).length} 只猪 · 半日</button></div><div class="feed-strip">${Object.entries(D.FEEDS).map(([id,f])=>`<div class="feed-choice ${selectedFeed===id?'selected':''}" data-select-feed="${id}"><b>${f.icon} ${f.name}</b><small>${f.desc}</small><em>库存 ${state.inventory.feeds[id]||0}</em></div>`).join('')}</div><div class="section-head" style="margin-top:18px"><div><h3>个体差异提示</h3><p>肉猪偏好育肥/蛋白料；宠物猪偏好果蔬/高纤维；妊娠猪适合哺育料。</p></div></div><div class="pig-grid">${E.livePigs(state).map(pigCard).join('')}</div>`;
    }else if(tab==='breed'){
      const females=E.livePigs(state).filter(p=>p.sex==='female'&&E.phaseOf(p)==='adult'),males=E.livePigs(state).filter(p=>p.sex==='male'&&E.phaseOf(p)==='adult');
      body.innerHTML=`<div class="section-head"><div><h3>配种繁育</h3><p>妊娠期压缩为 12 个游戏日。品种繁殖率、产仔范围和哺育料会影响结果。</p></div></div><div class="breeding-form"><label>母猪<select id="mother-select">${females.map(p=>`<option value="${p.id}">${esc(p.name)} · ${esc(E.breed(p.breedId).name)}${p.pregnant?'（已妊娠）':''}</option>`).join('')}</select></label><span>×</span><label>公猪<select id="father-select">${males.map(p=>`<option value="${p.id}">${esc(p.name)} · ${esc(E.breed(p.breedId).name)}</option>`).join('')}</select></label><button class="action-btn green" data-action="breed" ${!females.length||!males.length||state.ended?'disabled':''}>安排配种 · 半日</button></div><div class="catalog-grid" style="margin-top:15px">${D.BREEDS.filter(b=>b.role==='繁育猪').map(breedCard).join('')}</div>`;
    }else{
      body.innerHTML=`<div class="section-head"><div><h3>离场与纪念记录</h3><p>售出、死亡并妥善处理的猪只都会留在账本中。</p></div></div><div class="pig-grid">${state.memorial.length?state.memorial.map(p=>`<article class="pig-card dead-card" style="--pig-color:${E.breed(p.breedId).color}"><div class="pig-card-head"><div class="pig-avatar"></div><div class="pig-title"><h3>${esc(p.name)}</h3><p>${esc(E.breed(p.breedId).name)}</p></div></div><p>${p.sold?`在集市售出 · ¥${money(p.salePrice)}`:`因${esc(p.cause||'疾病')}离开 · 已完成消毒处理`}</p></article>`).join(''):'<div class="empty-state"><b>♡</b>暂无离场记录</div>'}</div>`;
    }
    syncPigArt();
  }
  function interactionChooser(id){const p=state.pigs.find(x=>x.id===id);if(!p||!p.alive)return'';const stage=E.phaseOf(p);return `<div class="market-note" style="margin-bottom:12px">选择适合${E.phaseName(p)}“${esc(p.name)}”的互动： ${D.INTERACTIONS[stage].map(it=>`<button class="action-btn small" data-action="interact" data-pig="${p.id}" data-interaction="${it.id}">${it.name} · ${state.ended?'不推进日程':it.time===1?'1/4日':'半日'}</button>`).join(' ')}</div>`}

  function renderFarm(){
    panelSetup('农田与作物','农场管理');const season=E.season(state);
    $('#panel-body').innerHTML=`<div class="section-head"><div><h3>${D.SEASONS[season-1]}季田地 · ${state.fields.length} 块</h3><p>播种占 1/4 日；浇水占 1/4 日；统一收获占半日。雨天自动浇水。</p></div><div class="right-actions"><button class="action-btn" data-action="water" ${state.ended?'disabled':''}>💧 全部浇水 · 1/4日</button><button class="action-btn green" data-action="harvest" ${state.ended?'disabled':''}>收获成熟作物 · 半日</button></div></div><div class="farm-layout"><div class="field-grid">${state.fields.map((f,i)=>plotHTML(f,i,season)).join('')}</div><div><h3 style="margin-top:0">粮仓库存</h3><div class="crop-inventory">${Object.entries(D.CROPS).map(([id,c])=>`<div class="crop-row"><i>${c.icon}</i><div><b>${c.name}</b><small>作物 ${state.inventory.crops[id]||0} · 种子 ${state.inventory.seeds[id]||0}</small></div><span>¥${E.marketPrice(state,'crop',id,'sell')}</span></div>`).join('')}</div></div></div>`;
  }
  function plotHTML(f,i,season){if(!f.crop){const options=Object.entries(D.CROPS).map(([id,c])=>`<option value="${id}" ${!c.seasons.includes(season)?'disabled':''}>${c.name}（种${state.inventory.seeds[id]||0} · ${c.grow}日）</option>`).join('');return `<div class="plot empty"><div><b>第 ${i+1} 块田 · 空地</b><select class="plot-crop">${options}</select><button class="action-btn small" data-action="plant" data-plot="${i}" ${state.ended?'disabled':''}>播种 · 1/4日</button></div></div>`}const c=D.CROPS[f.crop],pct=Math.min(100,f.progress/c.grow*100);return `<div class="plot ${f.ready?'ready':''}"><span class="crop-icon">${c.icon}</span><b>${c.name}${f.ready?' · 可收获':''}</b><small>${f.watered?'💧 已浇水':`生长 ${Math.floor(pct)}%`}</small><div class="meter" style="margin-top:7px"><span style="width:${pct}%"></span></div></div>`}

  function renderWorkshop(){
    panelSetup('饲料工坊','加工与配方');$('#panel-body').innerHTML=`<div class="section-head"><div><h3>把作物加工成专用饲料</h3><p>工坊 Lv.${state.facilities.mill} · 每份配方额外产出 ${Math.floor(state.facilities.mill/2)} 袋 · 当前耗时 ${state.facilities.mill>=3?'1/4日':'半日'}</p></div></div><div class="recipe-list">${Object.entries(D.RECIPES).map(([id,r])=>{const f=D.FEEDS[id],ok=Object.entries(r.ingredients).every(([c,n])=>(state.inventory.crops[c]||0)>=n);return `<article class="recipe-card"><div class="recipe-icon">${f.icon}</div><div><h4>${f.name} × ${r.makes+Math.floor(state.facilities.mill/2)}</h4><p>${f.desc} · 库存 ${state.inventory.feeds[id]||0}</p><div class="ingredients">${Object.entries(r.ingredients).map(([c,n])=>`<span class="ingredient ${(state.inventory.crops[c]||0)<n?'missing':''}">${D.CROPS[c].name} ${state.inventory.crops[c]||0}/${n}</span>`).join('')}</div></div><button class="action-btn ${ok?'green':''}" data-action="craft" data-feed="${id}" ${!ok||state.ended?'disabled':''}>制作 · ${state.facilities.mill>=3?'1/4日':'半日'}</button></article>`}).join('')}</div>`;
  }

  function renderMarket(tab='buy'){
    currentTab=tab;panelSetup(state.yearEnd?'年底年市':'青石镇集市',state.yearEnd?`第${state.year}年固定交易环节`:'当日往返已计时',[{id:'buy',label:'购买物资'},{id:'sell',label:'出售库存'},{id:'pigbuy',label:'猪只交易'},{id:'pigsell',label:'出售自养猪'}],tab);const body=$('#panel-body');
    const annual=state.yearEnd?`<div class="market-note">🧧 年底年市期间可自由买卖，不额外消耗时间。交易完成后才能进入下一年。 ${state.year<3?'<button class="action-btn green" data-action="finish-year">结束年市，迎接新年</button>':''}</div>`:'';
    if(tab==='buy'||tab==='sell'){
      const mode=tab==='buy'?'buy':'sell';body.innerHTML=annual+`<div class="section-head" style="margin-top:12px"><div><h3>${mode==='buy'?'采购种子、作物、饲料与兽药':'出售农场库存'}</h3><p>价格会随行情波动，粮仓等级可提高作物售价。</p></div></div><div class="market-list">${marketItems(mode)}</div>`;
    }else if(tab==='pigbuy'){
      body.innerHTML=annual+`<div class="section-head" style="margin-top:12px"><div><h3>猪仔与成熟猪</h3><p>每次赶集会刷新货源；成年猪更贵但能立即配种或参赛。</p></div><span class="pill">猪圈 ${E.livePigs(state).length}/${E.capacity(state)}</span></div><div class="market-list">${state.marketOffers.map(o=>{const b=E.breed(o.breedId);return `<article class="market-row pig-offer" style="--offer:${b.color}"><div class="market-icon"></div><div><h4>${esc(b.name)} · ${o.adult?'成年':'猪仔'}${o.sex==='female'?'母':'公'}</h4><p><span class="pill ${b.role==='肉猪'?'meat':b.role==='宠物猪'?'pet':'breed'}">${b.role}</span> ${esc(b.trait)}</p></div><button class="action-btn green" data-action="buy-pig" data-offer="${o.id}">¥${money(o.price)}</button></article>`}).join('')}</div>`;
    }else{
      const pigs=E.livePigs(state);body.innerHTML=annual+`<div class="section-head" style="margin-top:12px"><div><h3>出售自养猪</h3><p>成交价由品种、成熟度、健康、心情与宠物猪亲密度共同决定。售出后不可撤回。</p></div></div><div class="pig-grid">${pigs.map(p=>{const b=E.breed(p.breedId);return `<article class="pig-card" style="--pig-color:${b.color}"><div class="pig-card-head"><div class="pig-avatar"></div><div class="pig-title"><h3>${esc(p.name)}</h3><p>${esc(b.name)} · ${p.weight}kg · 健康${Math.round(p.health)}</p></div></div><button class="action-btn red" data-action="sell-pig" data-pig="${p.id}" style="margin-top:10px">卖出 · ¥${money(E.pigValue(state,p))}</button></article>`}).join('')}</div>`;
    }
    syncPigArt();
  }
  function marketItems(mode){
    const rows=[];Object.entries(D.CROPS).forEach(([id,c])=>rows.push(`<article class="market-row"><div class="market-icon">${c.icon}</div><div><h4>${c.name}${mode==='buy'?' / 种子':''}</h4><p>库存 作物${state.inventory.crops[id]||0} · 种子${state.inventory.seeds[id]||0} · ${c.grow}日成熟</p></div><div class="market-actions">${mode==='buy'?`<button class="action-btn small" data-action="trade" data-type="seed" data-id="${id}" data-mode="buy">种子 ¥${E.marketPrice(state,'seed',id,'buy')}</button><button class="action-btn small" data-action="trade" data-type="crop" data-id="${id}" data-mode="buy">作物 ¥${E.marketPrice(state,'crop',id,'buy')}</button>`:`<button class="action-btn small" data-action="trade" data-type="crop" data-id="${id}" data-mode="sell">卖1 ¥${E.marketPrice(state,'crop',id,'sell')}</button><button class="action-btn small" data-action="trade" data-type="crop" data-id="${id}" data-mode="sell" data-qty="5">卖5</button>`}</div></article>`));
    Object.entries(D.FEEDS).forEach(([id,f])=>rows.push(`<article class="market-row"><div class="market-icon">${f.icon}</div><div><h4>${f.name}</h4><p>${f.desc} · 库存${state.inventory.feeds[id]||0}</p></div><div class="market-actions"><button class="action-btn small" data-action="trade" data-type="feed" data-id="${id}" data-mode="${mode}">${mode==='buy'?'买1':'卖1'} ¥${E.marketPrice(state,'feed',id,mode)}</button>${mode==='buy'?`<button class="action-btn small" data-action="trade" data-type="feed" data-id="${id}" data-mode="buy" data-qty="5">买5</button>`:''}</div></article>`));
    rows.push(`<article class="market-row"><div class="market-icon">💊</div><div><h4>常备兽药</h4><p>治疗疾病时消耗 · 库存${state.inventory.medicine}</p></div><button class="action-btn small" data-action="trade" data-type="medicine" data-id="medicine" data-mode="${mode}">${mode==='buy'?'买1':'卖1'} ¥${E.marketPrice(state,'medicine','medicine',mode)}</button></article>`);return rows.join('');
  }

  function renderBuild(){
    panelSetup('农场建造','设施升级');$('#panel-body').innerHTML=`<div class="section-head"><div><h3>改善环境，建立长期增益</h3><p>建造会消耗 1—2 个游戏日；跨到年底时会直接进入年市或最终大赛。</p></div><span class="pill">可用资金 ¥${money(state.money)}</span></div><div class="build-grid">${Object.entries(D.FACILITIES).map(([id,f])=>{const lv=state.facilities[id]||0,cost=Math.round(f.base*Math.pow(1.65,lv));return `<article class="build-card"><div class="build-icon">${f.icon}</div><div><h4>${f.name} · Lv.${lv}/${f.max}</h4><p>${f.desc}</p><div class="level-pips">${Array.from({length:f.max},(_,i)=>`<i class="${i<lv?'on':''}"></i>`).join('')}</div></div><button class="action-btn ${state.money>=cost?'green':''}" data-action="upgrade" data-facility="${id}" ${lv>=f.max||state.ended?'disabled':''}>${lv>=f.max?'已满级':`¥${money(cost)} · ${f.days}日`}</button></article>`}).join('')}</div>`;
  }
  function breedCard(b){return `<article class="breed-card"><div class="breed-card-head"><div class="breed-swatch" style="--pig:${b.color}"></div><div><h4>${esc(b.name)}</h4><small>${esc(b.origin)} · ${b.role}</small></div></div><p>${esc(b.trait)}</p><div class="breed-stats"><span>成熟 ${b.adult}日</span><span>耗料 ${b.feed}</span><span>成长 ×${b.growth}</span><span>耐病 ×${b.hardy}</span><span>心情 ×${b.mood}</span><span>产仔 ${b.litter[0]}–${b.litter[1]}</span></div></article>`}
  function renderCatalog(filter='all'){
    currentTab=filter;panelSetup('猪种图鉴','28 种常见与特色品种');const list=filter==='all'?D.BREEDS:D.BREEDS.filter(b=>b.role===filter);
    $('#panel-body').innerHTML=`<div class="catalog-filter"><button data-filter="all" class="${filter==='all'?'active':''}">全部 ${D.BREEDS.length}</button><button data-filter="肉猪" class="${filter==='肉猪'?'active':''}">肉猪</button><button data-filter="宠物猪" class="${filter==='宠物猪'?'active':''}">宠物猪</button><button data-filter="繁育猪" class="${filter==='繁育猪'?'active':''}">繁育猪</button></div><div class="catalog-grid">${list.map(breedCard).join('')}</div>`;
    syncPigArt();
  }
  function renderJournal(tab='ledger'){
    currentTab=tab;panelSetup('农场账本','存档与记录',[{id:'ledger',label:'三年统计'},{id:'log',label:'行动日志'},{id:'saves',label:'存档管理'}],tab);const b=$('#panel-body');
    if(tab==='ledger')b.innerHTML=`<div class="journal-layout"><div class="ledger"><h3>${esc(state.farmName)} · 第${state.year}年</h3>${[['总游戏日',`${Math.min(180,E.totalDay(state))} / 180`],['行动次数',state.actionCount],['当前资金',`¥${money(state.money)}`],['累计收入',`¥${money(state.stats.earned)}`],['累计支出',`¥${money(state.stats.spent)}`],['收获作物',`${state.stats.cropsHarvested}份`],['出生仔猪',`${state.stats.pigsBorn}只`],['售出猪只',`${state.stats.pigsSold}只`],['治愈疾病',`${state.stats.illnessCured}次`],['处理事件',`${state.stats.eventsResolved}件`]].map(([a,c])=>`<div class="ledger-row"><span>${a}</span><b>${c}</b></div>`).join('')}</div><div class="ledger"><h3>设施与猪群</h3>${Object.entries(D.FACILITIES).map(([id,f])=>`<div class="ledger-row"><span>${f.icon} ${f.name}</span><b>Lv.${state.facilities[id]||0}</b></div>`).join('')}<div class="ledger-row"><span>活猪 / 容量</span><b>${E.livePigs(state).length} / ${E.capacity(state)}</b></div><div class="ledger-row"><span>口碑</span><b>${state.reputation}</b></div></div></div>`;
    else if(tab==='log')b.innerHTML=`<div class="log-list">${state.journal.map(l=>`<div class="log-row ${l.type}"><span>${esc(l.at)}</span><b>${esc(l.text)}</b></div>`).join('')}</div>`;
    else b.innerHTML=`<div class="section-head"><div><h3>本地账本</h3><p>每次行动和交易都会自动保存。导出文件可用于手工备份。</p></div></div><div class="build-grid"><article class="build-card"><div class="build-icon">▣</div><div><h4>立即保存</h4><p>覆盖当前账本中的这一份存档。</p></div><button class="action-btn green" data-action="save">保存</button></article><article class="build-card"><div class="build-icon">⇩</div><div><h4>导出备份</h4><p>下载当前农场的 JSON 账本文件。</p></div><button class="action-btn" data-action="export">导出</button></article><article class="build-card"><div class="build-icon">↩</div><div><h4>返回标题</h4><p>从标题页载入其他存档或新建农场。</p></div><button class="action-btn" data-action="home">返回</button></article></div>`;
  }

  function handleAction(r,success='行动完成',rerender=true){
    closeConfirm();if(!r||!r.ok){audio.sfx('bad');toast(r?.error||'行动失败','error');return false}audio.sfx('good');toast(success,'success');saveCurrent();renderHUD();renderWorldPigs();
    if(state.ended&&!r.noTime){closePanel();showEnding();return true}if(state.pendingEvent){closePanel();setTimeout(showEvent,180);return true}if(state.yearEnd){closePanel();setTimeout(()=>openPanel('market','buy'),180);return true}if(rerender&&currentPanel)renderPanel(currentPanel,currentTab);return true;
  }
  function showEvent(){if(!state?.pendingEvent)return;const e=state.pendingEvent;$('#event-title').textContent=e.title;$('#event-text').textContent=e.text;$('#event-choices').innerHTML=e.choices.map(c=>`<button class="pixel-btn" data-event-choice="${c.id}">${esc(c.label)}</button>`).join('');$('#event-overlay').classList.remove('hidden');audio.sfx('bad')}
  function showDialogue(kind,name,text,callback){
    clearInterval(dialogTimer);dialogFull=text;dialogCallback=callback||null;$('#portrait').className='portrait '+kind;$('#speaker').textContent=name;$('#dialogue-text').textContent='';$('#dialogue').classList.remove('hidden');let i=0;dialogTimer=setInterval(()=>{i+=2;$('#dialogue-text').textContent=text.slice(0,i);if(i>=text.length)clearInterval(dialogTimer)},24)
  }
  function closeDialogue(){clearInterval(dialogTimer);$('#dialogue').classList.add('hidden');const cb=dialogCallback;dialogCallback=null;if(cb)cb()}
  function showEnding(){
    if(!state?.ending)return;const e=state.ending;$('#ending-cup').textContent=e.win?'🏆':'🎗️';$('#ending-title').textContent=e.title;$('#ending-text').textContent=e.text;$('#ranking-list').innerHTML=e.rankings.map((r,i)=>`<div class="rank-row ${r.player?'player':''}"><b>#${i+1}</b><div><b>${esc(r.name)} · ${esc(r.breed)}</b><small>${esc(r.farm)}</small></div><strong>${r.score}分</strong></div>`).join('');$('#ending-overlay').classList.remove('hidden');audio.sfx(e.win?'save':'click')
  }
  function exportSave(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${state.farmName}-第${state.year}年-存档.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);toast('备份文件已导出','success')}

  $('#panel-body').addEventListener('click',e=>{
    const feed=e.target.closest('[data-select-feed]');if(feed){selectedFeed=feed.dataset.selectFeed;renderPigs('feed');return}
    const filter=e.target.closest('[data-filter]');if(filter){renderCatalog(filter.dataset.filter);return}
    const btn=e.target.closest('[data-action]');if(!btn)return;audio.ensure();const a=btn.dataset.action;
    if(a==='interact-open'){interactionPig=btn.dataset.pig;renderPigs('herd')}
    else if(a==='interact'){const p=state.pigs.find(x=>x.id===btn.dataset.pig),it=D.INTERACTIONS[E.phaseOf(p)].find(x=>x.id===btn.dataset.interaction);const r=E.interact(state,p.id,it.id);audio.sfx('pig');handleAction(r,`${p.name}${it.name}，心情变好了`)}
    else if(a==='feed')handleAction(E.feedAll(state,selectedFeed),`已用${D.FEEDS[selectedFeed].name}喂养全部猪只`)
    else if(a==='treat'){const p=state.pigs.find(x=>x.id===btn.dataset.pig);confirmBox('治疗疾病',`为${p.name}治疗会消耗兽药并占用半日。治疗可能需要不止一次。`,()=>handleAction(E.treat(state,p.id),`已为${p.name}治疗`),false)}
    else if(a==='dispose'){const p=state.pigs.find(x=>x.id===btn.dataset.pig);confirmBox('处理死猪并消毒',`必须及时处理${p.name}，否则每次继续行动都可能把疫病传播给其他猪。处理占用半日。`,()=>handleAction(E.dispose(state,p.id),'遗体已妥善处理，猪圈完成消毒'))}
    else if(a==='breed'){handleAction(E.breedPigs(state,$('#mother-select').value,$('#father-select').value),'配种安排完成')}
    else if(a==='plant'){const sel=btn.closest('.plot').querySelector('.plot-crop');handleAction(E.plant(state,+btn.dataset.plot,sel.value),`已播种${D.CROPS[sel.value].name}`)}
    else if(a==='water')handleAction(E.waterAll(state),'田地浇水完成')
    else if(a==='harvest')handleAction(E.harvestAll(state),'成熟作物已入库')
    else if(a==='craft')handleAction(E.craft(state,btn.dataset.feed),`制成${D.FEEDS[btn.dataset.feed].name}`)
    else if(a==='trade'){const r=E.tradeItem(state,btn.dataset.type,btn.dataset.id,btn.dataset.mode,+(btn.dataset.qty||1));if(r.ok){audio.sfx('click');toast(`${btn.dataset.mode==='buy'?'买入':'卖出'}成交 · ¥${money(r.total)}`,'success');saveCurrent();renderHUD();renderMarket(currentTab)}else toast(r.error,'error')}
    else if(a==='buy-pig'){const offer=state.marketOffers.find(o=>o.id===btn.dataset.offer),b=E.breed(offer.breedId);confirmBox('买下这只猪',`${b.name}，${offer.adult?'成年':'猪仔'}${offer.sex==='female'?'母':'公'}猪，价格 ¥${money(offer.price)}。`,()=>{const r=E.buyPig(state,offer.id);if(r.ok)showDialogue('merchant','何伯',`好眼光！${r.pig.name}往后就是你农场的一员了。不同品种脾气不一样，记得按它的路线照料。`);handleAction(r,'新猪已经送到猪圈')},false)}
    else if(a==='sell-pig'){const p=state.pigs.find(x=>x.id===btn.dataset.pig);confirmBox('确认出售',`${p.name}将以 ¥${money(E.pigValue(state,p))} 成交，之后只能在离场记录中查看。`,()=>handleAction(E.sellPig(state,p.id),`${p.name}已经成交`))}
    else if(a==='upgrade'){const id=btn.dataset.facility,f=D.FACILITIES[id],lv=state.facilities[id]||0,cost=Math.round(f.base*Math.pow(1.65,lv));confirmBox(`升级${f.name}`,`花费 ¥${money(cost)}，并占用 ${f.days} 个游戏日。`,()=>handleAction(E.upgrade(state,id),`${f.name}升级完成`),false)}
    else if(a==='finish-year'){confirmBox('结束年市',`确认结束第${state.year}年？离开后要等到下一年年底才能再次进入免计时年市。`,()=>{const old=state.year,r=E.finishYear(state);if(handleAction(r,`第${old+1}年开始了`,false)){closePanel();showDialogue('vet','林医生',`新年好。离大赛又近了一年，别只盯体重：健康、心情、血统和你们之间的信任都会计入评审。`) }},false)}
    else if(a==='save')saveCurrent(true);else if(a==='export')exportSave();else if(a==='home')returnTitle();
  });

  $('#panel-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)renderPanel(currentPanel,b.dataset.tab)});
  $('#event-choices').addEventListener('click',e=>{const b=e.target.closest('[data-event-choice]');if(!b)return;const r=E.resolveEvent(state,b.dataset.eventChoice),resumeMarket=marketAfterEvent||state.pendingDestination==='market';marketAfterEvent=false;state.pendingDestination=null;$('#event-overlay').classList.add('hidden');audio.sfx('good');toast(r.result||'事件处理完成','success');saveCurrent();renderHUD();renderWorldPigs();if(resumeMarket)setTimeout(()=>openPanel('market','buy'),260)});
  $('#dialogue').addEventListener('click',()=>{if($('#dialogue-text').textContent!==dialogFull){clearInterval(dialogTimer);$('#dialogue-text').textContent=dialogFull}else closeDialogue()});
  $('#confirm-cancel').onclick=closeConfirm;$('#confirm-ok').onclick=()=>{const cb=confirmCallback;confirmCallback=null;$('#confirm-overlay').classList.add('hidden');if(cb)cb()};
  $$('[data-close="panel"]').forEach(b=>b.onclick=closePanel);$$('[data-close="new-save"]').forEach(b=>b.onclick=()=>$('#new-save-overlay').classList.add('hidden'));
  $$('.dock [data-open]').forEach(b=>b.onclick=()=>openPanel(b.dataset.open));
  $$('.hotspot').forEach(b=>b.onclick=()=>walkTo(b.dataset.zone));
  $('#save-btn').onclick=()=>saveCurrent(true);$('#home-btn').onclick=()=>confirmBox('返回标题','当前进度会先自动保存。',returnTitle,false);$('#audio-btn').onclick=()=>audio.toggle();$('#title-audio').onclick=()=>audio.toggle();
  $('#new-game-btn').onclick=()=>{if(getSaves().length>=8)return toast('已有 8 份存档，请先删除一份旧账本。','error');$('#new-save-overlay').classList.remove('hidden')};
  $('#continue-btn').onclick=()=>{const s=getSaves().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))[0];if(s)loadSave(s.id)};
  $('#new-save-form').addEventListener('submit',e=>{e.preventDefault();const player=$('#player-name-input').value.trim()||'小禾',farm=$('#farm-name-input').value.trim()||'青禾猪场';state=E.createState(player,farm);state.settings={...prefs};setSaves([E.clone(state),...getSaves()].slice(0,8));$('#new-save-overlay').classList.add('hidden');enterGame(true)});
  $('#save-list').addEventListener('click',e=>{const del=e.target.closest('[data-delete]');if(del){e.stopPropagation();const s=getSaves().find(x=>x.id===del.dataset.delete);return confirmBox('删除农场账本',`“${s?.farmName||'这份存档'}”将被永久删除，此操作不能撤回。`,()=>{deleteSave(del.dataset.delete);closeConfirm()})}const card=e.target.closest('[data-load]');if(card)loadSave(card.dataset.load)});
  $('#ending-return').onclick=()=>{state.ending.viewed=true;saveCurrent();$('#ending-overlay').classList.add('hidden');renderHUD()};$('#ending-new').onclick=()=>{state.ending.viewed=true;saveCurrent();$('#ending-overlay').classList.add('hidden');returnTitle();$('#new-game-btn').click()};
  window.addEventListener('beforeunload',()=>saveCurrent());
  window.addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(k)){player.keys.add(e.key.startsWith('Arrow')?e.key:k);e.preventDefault()}
    if(!state||isModalOpen())return;if(k==='e'){const n=nearestZone();if(n&&n.dist<8)activateZone(n.panel)}
    const map={'1':'pigs','2':'farm','3':'workshop','4':'marketTrip','5':'build','6':'catalog','7':'journal'};if(map[k])openPanel(map[k]);
    if(k==='escape')closePanel();
  });
  window.addEventListener('keyup',e=>{player.keys.delete(e.key);player.keys.delete(e.key.toLowerCase())});
  document.addEventListener('pointerdown',()=>audio.ensure(),{once:true});

  renderSaveList();renderAudioButtons();updatePlayer();
})();
