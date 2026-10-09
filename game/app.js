(function(){
  'use strict';
  const D=window.PIG_DATA,E=window.PigEngine;
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  const SAVE_KEY='pigFarmStory_saves_v3',PREF_KEY='pigFarmStory_prefs_v1';
  let state=null,currentPanel=null,currentTab=null,interactionPig=null,marketAfterEvent=false,rivalAfterEvent=false,marketActive=false,rivalActive=false,extraActive=null,activeMarketStall=null,displayedTotalDay=null,dayTransitionRunning=false,sceneTransitionRunning=false;
  const dayTransitionQueue=[];
  let toastTimer=null,confirmCallback=null,dialogTimer=null,dialogFull='',dialogCallback=null,dialogueChoicesActive=false;
  let festivalGame=null,festivalClock=null,festivalFrame=null,festivalTimeouts=[];
  let lifecycleSuspended=false,animationPausedAt=0,performancePausedAt=0;
  const prefs=Object.assign({music:true,sfx:true,volume:.32},readJSON(PREF_KEY,{}));
  const scene=window.FarmScene.mount($('#world'));
  scene.setPigProvider(()=>$$('#pig-layer .pig-sprite:not(.dead)').map(el=>({x:parseFloat(el.style.left),y:parseFloat(el.style.top)})));

  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function money(n){return Math.round(n).toLocaleString('zh-CN');}
  function timeCost(q){return q===0?'不耗时':q===1?'1/4日':q===2?'半日':q===3?'3/4日':q===4?'1日':`${q/4}日`;}
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
      if(lifecycleSuspended||document.hidden)return;
      if(!this.ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;this.ctx=new C();}
      if(this.ctx.state==='suspended'||this.ctx.state==='interrupted')this.ctx.resume().catch(()=>{});if((state?state.settings.music:prefs.music)&&!this.timer)this.startMusic();
    }
    tone(freq,dur=.12,type='square',vol=.035,when=0){if(!this.ctx||lifecycleSuspended||document.hidden)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(vol*(state?state.settings.volume:prefs.volume),this.ctx.currentTime+when);g.gain.exponentialRampToValueAtTime(.0001,this.ctx.currentTime+when+dur);o.connect(g).connect(this.ctx.destination);o.start(this.ctx.currentTime+when);o.stop(this.ctx.currentTime+when+dur+.03)}
    startMusic(){if(!this.ctx||this.timer||lifecycleSuspended||document.hidden)return;const notes=[261.6,329.6,392,440,392,329.6,293.7,349.2,440,523.2,440,349.2];this.timer=setInterval(()=>{const on=state?state.settings.music:prefs.music;if(!on||lifecycleSuspended||document.hidden)return;const n=notes[this.step++%notes.length];this.tone(n,.25,'square',.022);if(this.step%4===1)this.tone(n/2,.38,'triangle',.018,.03)},460)}
    stopMusic(){clearInterval(this.timer);this.timer=null}
    sfx(kind='click'){const on=state?state.settings.sfx:prefs.sfx;if(!on)return;this.ensure();if(kind==='good'){this.tone(523,.08);this.tone(659,.12,'square',.04,.09)}else if(kind==='bad'){this.tone(160,.18,'sawtooth',.045)}else if(kind==='save'){this.tone(392,.08);this.tone(523,.08,'square',.04,.07);this.tone(659,.15,'square',.035,.14)}else if(kind==='pig'){this.tone(210,.06,'square',.05);this.tone(170,.1,'square',.04,.07)}else this.tone(330,.05,'square',.022)}
    toggle(){const target=state?state.settings:prefs;target.music=!target.music;prefs.music=target.music;localStorage.setItem(PREF_KEY,JSON.stringify(prefs));if(target.music){this.ensure();this.startMusic()}else this.stopMusic();renderAudioButtons();if(state)saveCurrent();}
  }
  const audio=new FarmAudio();

  function toast(text,type=''){clearTimeout(toastTimer);const t=$('#toast');t.textContent=text;t.className='toast'+(type?' '+type:'');toastTimer=setTimeout(()=>t.classList.add('hidden'),2600)}
  function confirmBox(title,text,callback,danger=true){cancelMovement();$('#confirm-title').textContent=title;$('#confirm-text').textContent=text;$('#confirm-ok').className='pixel-btn '+(danger?'danger':'primary');confirmCallback=callback;$('#confirm-overlay').classList.remove('hidden')}
  function closeConfirm(){confirmCallback=null;$('#confirm-overlay').classList.add('hidden')}

  function renderSaveList(){
    const saves=getSaves(),box=$('#save-list');$('#continue-btn').disabled=!saves.length;
    if(!saves.length){box.innerHTML='<div class="empty-save">还没有农场账本。新建后会在每次行动后自动保存。</div>';return;}
    box.innerHTML=saves.map(s=>{const sum=E.summary(E.migrate(s));return `<article class="save-card" data-load="${esc(s.id)}"><div><b>${esc(s.farmName)} · ${esc(s.playerName)}</b><small>${esc(sum.time)} · ${sum.live}只猪 · ¥${money(s.money)}</small></div><span class="${s.ended?'ending-tag':''}">${s.ended?(s.ending?.win?'冠军结局':'赛程结束'):`${sum.totalDay}/180日`}</span><button class="delete-save" data-delete="${esc(s.id)}" title="删除存档">×</button></article>`}).join('');
  }
  function loadSave(id){
    const raw=getSaves().find(s=>s.id===id);if(!raw)return toast('找不到这个存档。','error');
    try{const migrated=E.migrate(E.clone(raw)),check=E.validate(migrated);if(!check.ok)return toast('存档损坏：'+check.errors.join('、'),'error');state=migrated;state.settings=Object.assign({},prefs,state.settings||{});enterGame(false)}catch(_){toast('存档损坏：无法读取核心数据。','error')}
  }
  function enterGame(isNew){
    $('#title-screen').classList.add('hidden');$('#game').classList.remove('hidden');revealFarm(false);if(state.location==='market')enterMarketScene(true);else if(state.location==='rival')enterRivalScene(true);else if(['forest','village','contest'].includes(state.location))enterExtraScene(state.location,true);renderHUD();renderWorldPigs();saveCurrent();audio.ensure();(marketActive?$('#market-world'):rivalActive?$('#rival-world'):extraActive?$('#extra-world'):$('#world')).focus();
    displayedTotalDay=E.totalDay(state);
    E.storyUpdate(state);if(state.pendingEvent)setTimeout(showEvent,350);else if(state.yearEnd?.type==='annual')setTimeout(enterMarketScene,350);else if(state.ended&&state.ending?.ceremonyPending)setTimeout(continueFinalSequence,350);else if(state.ended&&!state.ending?.viewed)setTimeout(showEnding,350);else setTimeout(showPendingStory,420);
  }
  function returnTitle(){
    if(state)saveCurrent();cancelMovement();closeFestivalGame(true);clearInterval(dialogTimer);state=null;currentPanel=null;marketAfterEvent=false;rivalAfterEvent=false;extraActive=null;displayedTotalDay=null;dayTransitionQueue.length=0;dayTransitionRunning=false;sceneTransitionRunning=false;$('#day-transition').className='day-transition hidden';$('#scene-transition').className='scene-transition hidden';leaveMarketScene(false,true);
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
    $('#event-countdown').textContent=state.ended?'日程已锁定':state.yearEnd?'年市进行中':`约 ${Math.max(1,Math.ceil(state.nextEventIn/4))} 个游戏日后`;
    const story=E.storyProgress(state),storyDef=story.definition;$('#story-rail-title').textContent=storyDef?.title||'三年育成记录';$('#story-rail-progress').textContent=story.outcome==='complete'?'本章完成':story.outcome==='missed'?'已进入下一章':`${story.done} / ${story.required} 项`;
    const wl=$('#warning-list');wl.innerHTML=sum.warnings.length?sum.warnings.slice(0,7).map(w=>`<div class="warning-item ${w.level}">${esc(w.text)}</div>`).join(''):'<div class="all-good"><b>✓</b>猪圈与田地一切平稳</div>';
    $('#rail-tip').textContent=marketActive?(state.yearEnd?'年底年市期间场内交易不耗时；在交易面板结束年市。':'已到青石镇：走近商铺或自己的摊位按 E。'):rivalActive?'已到石桥牧场：可与陆野交谈、查看荣誉墙或参加训练赛。':extraActive==='forest'?'已到后山林场：采集不单独计时，返程统一结算半日。':extraActive==='village'?'已到青石村：交谈、交货和铁匠服务不单独计时。':extraActive==='contest'?(state.ending?.ceremonyPending?'最终成绩已经确定，请走到展示环完成颁奖。':'已到青石赛场：登记后每季可参加一次评比。'):state.ended?'赛程已经结束。你仍可查看猪群，也可以拜访石桥牧场。':state.yearEnd?'年底年市已经开张，完成买卖后迎接新年。':'走近发光地点按 E，或直接点击地点。';
    const world=$('#world');world.classList.toggle('night',sum.phase==='夜晚');const weather=$('#weather-layer');weather.className='weather-layer '+(state.weather==='小雨'?'rain':state.weather==='大风'?'wind':'');scene.setWeather(state.weather);if(rivalActive)updateRivalFacilityArt();
    $('#location-label').textContent=state.ended?`${state.farmName} · 赛后时光`:state.farmName;renderAudioButtons();
  }

  const RED_PIG_MODELS=new Set(['duroc','tamworth','kunekune']);
  const DARK_PIG_MODELS=new Set(['hampshire','tibetan','minzhu','potbelly','meishan','taihu','erhualian','largeblack','wuzhishan','polandchina']);
  function hash(s){let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))>>>0;return h}
  function pointInsidePolygon(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j],cross=(a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0];if(cross)inside=!inside}return inside}
  function pigSpriteRow(b){if(b.spots||b.band||b.feet)return 3;if(RED_PIG_MODELS.has(b.id))return 1;if(DARK_PIG_MODELS.has(b.id))return 2;return 0}
  function pigRowY(b){return -64*pigSpriteRow(b)}
  const PIG_PENS=[{
    id:'综合大猪圈',points:[[47.8,34.5],[62.5,27.2],[73.5,31.5],[94.8,40.5],[95.8,55],[79.2,68.8],[68,65.3],[55.5,56.2],[48,48.8]],bounds:[47.8,95.8,27.2,68.8],
    blockers:[[[74,21],[96,22],[97,43],[77,45]],[[80.5,41],[90.5,40.5],[91,51],[81,52]],[[52,34],[58.5,34],[59,41],[52.5,41.5]],[[81.5,54],[88,53],[88.5,61],[82,62]]]
  }];
  const PIG_WATER_POINTS=[{x:60.5,y:36.7},{x:61.2,y:42.8},{x:78.9,y:53.1},{x:78.8,y:60.7}];
  const PIG_SPACING={x:6.6,y:6.2};
  const PIG_BEHAVIOR_LABELS={idle:'安静站立',walking:'缓慢走动',movingDrink:'走向水槽',drinking:'低头饮水',rolling:'在泥地打滚',rooting:'拱地觅食',resting:'趴下休息'};
  const pigBehaviors=new Map(),rivalPigBehaviors=new Map();
  function pigPenIndex(){return 0}
  function pointAllowedInPen(pen,x,y){return pointInsidePolygon(x,y,pen.points)&&!(pen.blockers||[]).some(points=>pointInsidePolygon(x,y,points))}
  function pointInPen(pen,seedText){const [minX,maxX,minY,maxY]=pen.bounds;for(let attempt=0;attempt<72;attempt++){const x=minX+(hash(`${seedText}:x:${attempt}`)%10000)/9999*(maxX-minX),y=minY+(hash(`${seedText}:y:${attempt}`)%10000)/9999*(maxY-minY);if(pointAllowedInPen(pen,x,y))return{x,y}}return{x:66,y:52}}
  function pigPenPosition(p,salt=0){
    return pointInPen(PIG_PENS[pigPenIndex(p)],`${p.id}:${salt}`);
  }
  function pigSpacingScore(point,occupied){if(!occupied.length)return Infinity;return Math.min(...occupied.map(other=>Math.hypot((point.x-other.x)/PIG_SPACING.x,(point.y-other.y)/PIG_SPACING.y)))}
  function pigPointClear(point,occupied,factor=1){return pigSpacingScore(point,occupied)>=factor}
  function pigPathClear(from,to,occupied){for(let step=2;step<=10;step++){const t=step/10,point={x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t};if(!pointAllowedInPen(PIG_PENS[0],point.x,point.y)||!pigPointClear(point,occupied,.82))return false}return true}
  function separatedPigPenPosition(pen,preferred,occupied,seedText){
    if(pointAllowedInPen(pen,preferred.x,preferred.y)&&pigPointClear(preferred,occupied))return preferred;
    const [minX,maxX,minY,maxY]=pen.bounds;let best=null,bestScore=-1;
    for(let y=minY+.8;y<=maxY-.8;y+=1.65)for(let x=minX+.8;x<=maxX-.8;x+=1.65){const candidate={x,y};if(!pointAllowedInPen(pen,x,y))continue;const spacing=pigSpacingScore(candidate,occupied),tie=(hash(`${seedText}:${x.toFixed(2)}:${y.toFixed(2)}`)%1000)/1e7,score=spacing+tie;if(score>bestScore){best=candidate;bestScore=score}}
    return best||preferred;
  }
  function nearbyPigPenPosition(pen,current,occupied,radius=8){for(let attempt=0;attempt<64;attempt++){const angle=Math.random()*Math.PI*2,distance=2.5+Math.random()*radius,x=current.x+Math.cos(angle)*distance,y=current.y+Math.sin(angle)*distance*.58,candidate={x,y};if(pointAllowedInPen(pen,x,y)&&pigPointClear(candidate,occupied)&&pigPathClear(current,candidate,occupied))return candidate}return null}
  function otherPigPositions(id){return[...pigBehaviors.entries()].filter(([otherId,record])=>otherId!==id&&record.position).flatMap(([,record])=>record.motion?[record.position,record.motion.to]:[record.position])}
  function startPigMotion(el,record,current,target,duration,now){
    record.motion={from:{...current},to:{...target},started:now,duration:duration*1000};
    record.position={...current};record.nextAt=now+duration*1000;el.style.transition='none';
    el.classList.toggle('flip',target.x<current.x);setPigBehavior(el,record.mode);
  }
  function updatePigMotions(now){
    for(const [records,selector] of [[pigBehaviors,'#pig-layer .pig-sprite'],[rivalPigBehaviors,'.rival-pig']]){
      $$(selector).forEach((el,i)=>{const key=records===pigBehaviors?el.dataset.worldPig:'rival-'+el.dataset.rivalPen+'-'+i,record=records.get(key);if(!record?.motion)return;const m=record.motion,t=Math.max(0,Math.min(1,(now-m.started)/m.duration)),u=t*t*(3-2*t);record.position={x:m.from.x+(m.to.x-m.from.x)*u,y:m.from.y+(m.to.y-m.from.y)*u};el.style.left=record.position.x+'%';el.style.top=record.position.y+'%';if(t===1)record.motion=null;});
    }
  }
  function behaviorDelay(min,max){return min+Math.random()*(max-min)}
  function setPigBehavior(el,mode){
    el.dataset.behaviorReady='1';
    el.classList.remove('walking','drinking','rolling','rooting','resting');
    el.dataset.behavior=mode;
    if(mode==='walking'||mode==='movingDrink')el.classList.add('walking');else if(mode!=='idle')el.classList.add(mode);
    const label=PIG_BEHAVIOR_LABELS[mode]||PIG_BEHAVIOR_LABELS.idle,base=el.dataset.titleBase||el.title.split(' · ')[0];
    el.dataset.titleBase=base;el.title=`${base} · ${label}`;el.setAttribute('aria-label',`${base}，${label}`);
  }
  function choosePigBehavior(record){
    if(record.planned){const planned=record.planned;record.planned=null;return planned}
    const roll=Math.random();
    if(roll<.24)return'walking';
    if(roll<.36)return'drinking';
    if(roll<.44)return'rolling';
    if(roll<.58)return'rooting';
    if(roll<.76)return'resting';
    return'idle';
  }
  function pigSpriteHTML(p,i,position){
    const b=E.breed(p.breedId),penIndex=pigPenIndex(p),pen=PIG_PENS[penIndex],scale=E.phaseOf(p)==='piglet'?.58:E.phaseOf(p)==='juvenile'?.76:b.role==='宠物猪'?.84:1,title=`${p.name} · ${b.name} · ${pen.id}`;
    return `<div class="pig-sprite ${p.alive?'':'dead'} ${p.illness?'sick':''}" data-breed="${esc(b.id)}" data-world-pig="${esc(p.id)}" data-pig-index="${i}" data-pen="${penIndex}" data-title-base="${esc(title)}" data-behavior="idle" title="${esc(title)} · 安静站立" style="left:${position.x}%;top:${position.y}%;--pig-row:${pigRowY(b)}px;--scale:${scale}"></div>`;
  }
  function renderWorldPigs(){
    if(!state)return;const pigs=state.pigs.filter(p=>!p.disposed);pigs.forEach(p=>p.worldPen=0);
    const liveIds=new Set(pigs.map(p=>p.id));for(const id of pigBehaviors.keys())if(!liveIds.has(id))pigBehaviors.delete(id);
    const now=Date.now(),occupied=[];pigs.forEach((pig,i)=>{const pen=PIG_PENS[pigPenIndex(pig)],existing=pigBehaviors.get(pig.id),preferred=existing?.position||pigPenPosition(pig),position=existing?.position||separatedPigPenPosition(pen,preferred,occupied,pig.id);let record=existing;if(!record)record={mode:'idle',position,nextAt:now+1800+i*780+(hash(pig.id)%900),planned:['resting','rooting','drinking','rolling','walking'][i%5]};if(!record.motion)record.position=position;if(!pig.alive){record.mode='idle';record.motion=null;}pigBehaviors.set(pig.id,record);occupied.push(position)});
    const layer=$('#pig-layer');
    for(const el of [...layer.children])if(!liveIds.has(el.dataset.worldPig))el.remove();
    pigs.forEach((pig,i)=>{let el=[...layer.children].find(node=>node.dataset.worldPig===pig.id);if(!el){layer.insertAdjacentHTML('beforeend',pigSpriteHTML(pig,i,pigBehaviors.get(pig.id).position));el=layer.lastElementChild}const b=E.breed(pig.breedId);el.dataset.breed=b.id;el.classList.toggle('dead',!pig.alive);el.classList.toggle('sick',!!pig.illness);el.style.setProperty('--scale',E.phaseOf(pig)==='piglet'?.58:E.phaseOf(pig)==='juvenile'?.76:b.role==='宠物猪'?.84:1);el.dataset.titleBase=pig.name+' · '+b.name+' · 综合大猪圈';});
    $$('#pig-layer .pig-sprite').forEach(el=>{const record=pigBehaviors.get(el.dataset.worldPig);setPigBehavior(el,el.classList.contains('dead')?'idle':record?.mode||'idle')});
  }
  function advanceFarmPig(el,now){
    const id=el.dataset.worldPig,record=pigBehaviors.get(id);if(!record||now<record.nextAt)return;
    const pen=PIG_PENS[Number(el.dataset.pen)]||PIG_PENS[0];
    if(record.mode==='walking'||record.mode==='drinking'||record.mode==='rolling'||record.mode==='rooting'||record.mode==='resting'){record.mode='idle';record.nextAt=now+behaviorDelay(5600,10800);setPigBehavior(el,'idle');return}
    if(record.mode==='movingDrink'){record.mode='drinking';record.nextAt=now+behaviorDelay(2800,4400);el.style.transition='none';setPigBehavior(el,'drinking');return}
    let mode=choosePigBehavior(record);const otherMover=[...pigBehaviors.entries()].some(([otherId,other])=>otherId!==id&&(other.mode==='walking'||other.mode==='movingDrink'));if(otherMover&&(mode==='walking'||mode==='drinking'))mode='idle';
    if(mode==='idle'){record.nextAt=now+behaviorDelay(4200,7600);setPigBehavior(el,'idle');return}
    if(mode==='walking'){
      const current=record.position||{x:parseFloat(el.style.left),y:parseFloat(el.style.top)},target=nearbyPigPenPosition(pen,current,otherPigPositions(id),7.5);if(!target){record.mode='idle';record.nextAt=now+behaviorDelay(2600,5200);setPigBehavior(el,'idle');return}const distance=Math.hypot(target.x-current.x,target.y-current.y),duration=Math.min(3.6,1.75+distance*.19);
      record.mode='walking';startPigMotion(el,record,current,target,duration,now);return;
    }
    if(mode==='drinking'){
      const current=record.position||{x:parseFloat(el.style.left),y:parseFloat(el.style.top)},occupied=otherPigPositions(id),target=PIG_WATER_POINTS.filter(point=>pointAllowedInPen(pen,point.x,point.y)&&pigPointClear(point,occupied)&&pigPathClear(current,point,occupied)).sort((a,b)=>Math.hypot(a.x-current.x,a.y-current.y)-Math.hypot(b.x-current.x,b.y-current.y))[0];if(!target){record.mode='idle';record.nextAt=now+behaviorDelay(2400,4800);setPigBehavior(el,'idle');return}const distance=Math.hypot(target.x-current.x,target.y-current.y),duration=Math.min(4.8,2+distance*.16);
      record.mode='movingDrink';startPigMotion(el,record,current,target,duration,now);return;
    }
    record.mode=mode;record.nextAt=now+behaviorDelay(mode==='resting'?4200:2600,mode==='resting'?6800:4300);el.style.transition='none';el.dataset.behaviorDuration=(record.nextAt-now)/1000;setPigBehavior(el,mode);
  }
  setInterval(()=>{if(lifecycleSuspended||document.hidden||!state||marketActive||rivalActive||$('#game').classList.contains('hidden'))return;const now=Date.now();$$('#pig-layer .pig-sprite:not(.dead)').forEach(el=>advanceFarmPig(el,now))},420);

  const player={x:31,y:58,target:null,path:[],keys:new Set(),last:0,blockedFrames:0};
  const zones={
    house:{x:18.3,y:40.2,walkX:19.4,walkY:49.2,panel:'journal',label:'农舍正门'},
    field:{x:46,y:64.7,walkX:46,walkY:62.7,panel:'farm',label:'农田入口'},
    pen:{x:64.5,y:65.8,walkX:61.5,walkY:67.2,panel:'pigs',label:'大猪圈栏门'},
    mill:{x:72,y:75.5,walkX:72,y:75.5,panel:'workshop',label:'饲料工坊装卸口'},
    market:{x:42.5,y:32.7,walkX:43.4,walkY:36.4,panel:'marketTrip',label:'前往青石镇的小路'},
    journey:{x:45.8,y:31.5,walkX:44,walkY:35,panel:'travel',label:'村外岔路牌'},
    rival:{x:4.2,y:62,walkX:6.2,walkY:62,panel:'rivalTrip',label:'前往石桥牧场的左侧小路'},
    build:{x:57.2,y:61.5,walkX:56.4,walkY:63.2,panel:'build',label:'建造牌'}
  };
  function nearestZone(){let best=null,dist=999;for(const [id,z] of Object.entries(zones)){const d=Math.hypot(player.x-(z.walkX??z.x),player.y-(z.walkY??z.y));if(d<dist){dist=d;best={id,...z,dist}}}return best}
  function updatePlayer(){const el=$('#player');el.style.left=player.x+'%';el.style.top=player.y+'%';const n=nearestZone();$$('.hotspot').forEach(h=>h.classList.toggle('near',n&&h.dataset.zone===n.id&&n.dist<7));const prompt=$('#near-prompt');if(n&&n.dist<7){prompt.classList.remove('hidden');prompt.style.left=(player.x+1)+'%';prompt.style.top=(player.y-10)+'%';prompt.querySelector('span').textContent=n.label}else prompt.classList.add('hidden')}
  function resetPlayerForNewDay(){clearRoute(true);player.keys.clear();player.x=zones.house.walkX;player.y=zones.house.walkY;const sprite=$('#player');sprite.classList.remove('walking','dir-up','dir-left','dir-right');sprite.classList.add('dir-down');updatePlayer()}
  function dayInfo(total){const index=Math.max(0,total-1),year=Math.floor(index/D.YEAR_DAYS)+1,day=index%D.YEAR_DAYS+1,seasonIndex=Math.min(D.SEASONS.length-1,Math.floor((day-1)/(D.YEAR_DAYS/D.SEASONS.length)));return{year,day,season:D.SEASONS[seasonIndex]}}
  function runDayTransition(){if(dayTransitionRunning||!dayTransitionQueue.length)return;dayTransitionRunning=true;const info=dayInfo(dayTransitionQueue.shift()),overlay=$('#day-transition');$('#day-transition-year').textContent=`第 ${info.year} 年 · ${info.season}`;$('#day-transition-day').textContent=`第 ${info.day} 日`;overlay.className='day-transition';void overlay.offsetWidth;overlay.classList.add('playing');setTimeout(()=>{overlay.className='day-transition hidden';dayTransitionRunning=false;runDayTransition()},1500)}
  function queueDayTransitions(from,to){if(to<=from)return;resetPlayerForNewDay();for(let day=from+1;day<=to;day++)dayTransitionQueue.push(day);runDayTransition()}
  function clearRoute(resetHint=false){player.target=null;player.path=[];player.blockedFrames=0;scene.setPath([]);if(resetHint)$('#world-hint').textContent='点击地图地点，角色会自动寻找可行道路'}
  function finishRoute(){const go=player.target;clearRoute(true);$('#player').classList.remove('walking');if(go)activateZone(go.panel)}
  function worldLoop(t){
    if(lifecycleSuspended||document.hidden){player.last=t;requestAnimationFrame(worldLoop);return;}
    updatePigMotions(Date.now());
    if(state&&!$('#game').classList.contains('hidden')&&!isModalOpen()){
      let dx=0,dy=0;if(player.keys.has('ArrowLeft')||player.keys.has('a'))dx--;if(player.keys.has('ArrowRight')||player.keys.has('d'))dx++;if(player.keys.has('ArrowUp')||player.keys.has('w'))dy--;if(player.keys.has('ArrowDown')||player.keys.has('s'))dy++;
      const manual=!!(dx||dy);
      if(marketActive)updateMarketMovement(t,dx,dy,manual);
      else if(rivalActive)updateRivalMovement(t,dx,dy,manual);
      else if(extraActive)updateExtraMovement(t,dx,dy,manual);
      else{
        if(manual&&player.target)clearRoute(true);
        if(player.target&&!manual){const waypoint=player.path[0]||player.target,tx=waypoint.x-player.x,ty=waypoint.y-player.y,d=Math.hypot(tx,ty);if(d<.72){if(player.path.length)player.path.shift();if(!player.path.length&&Math.hypot(player.target.x-player.x,player.target.y-player.y)<1.15)finishRoute()}else{dx=tx/d;dy=ty/d}}
        const moving=dx||dy;if(moving){const dt=Math.min(32,t-(player.last||t)),sprite=$('#player'),length=Math.hypot(dx,dy)||1,direction=Math.abs(dx)>Math.abs(dy)?(dx<0?'left':'right'):(dy<0?'up':'down'),step=dt*.018,nx=player.x+dx/length*step,ny=player.y+dy/length*step,moved=scene.resolveMovement(player.x,player.y,nx,ny),changed=Math.hypot(moved.x-player.x,moved.y-player.y)>.001;player.x=moved.x;player.y=moved.y;
          if(moved.blocked&&player.target){player.blockedFrames++;if(player.blockedFrames>14){const path=scene.findPath({x:player.x,y:player.y},player.target);player.path=path;player.blockedFrames=0;scene.setPath([{x:player.x,y:player.y},...path])}}else player.blockedFrames=0;
          if(changed){sprite.classList.remove('dir-down','dir-left','dir-right','dir-up');sprite.classList.add('walking','dir-'+direction);updatePlayer()}else{sprite.classList.remove('walking');if(manual&&moved.blocked)$('#world-hint').textContent='前方有建筑、围栏或地形边界，无法继续前进'}
        }else $('#player').classList.remove('walking');
      }
    }else $$('.player-sprite.walking').forEach(el=>el.classList.remove('walking'));player.last=t;requestAnimationFrame(worldLoop)
  }
  requestAnimationFrame(worldLoop);
  function isModalOpen(){return !$('#panel-overlay').classList.contains('hidden')||!$('#event-overlay').classList.contains('hidden')||!$('#confirm-overlay').classList.contains('hidden')||!$('#dialogue').classList.contains('hidden')||!$('#ending-overlay').classList.contains('hidden')||!$('#festival-game-overlay').classList.contains('hidden')||dayTransitionRunning||sceneTransitionRunning}
  function walkTo(zone){const z=zones[zone];if(!z)return;const target={...z,x:z.walkX??z.x,y:z.walkY??z.y},path=scene.findPath({x:player.x,y:player.y},target);if(!path.length){clearRoute();$('#world-hint').textContent=`没有找到通往${z.label}的安全道路`;return toast('道路被建筑或围栏挡住了。','error')}player.target=target;player.path=path;player.blockedFrames=0;scene.setPath([{x:player.x,y:player.y},...path]);$('#world-hint').textContent=`正在绕开障碍前往${z.label}…`;audio.sfx('click')}
  function activateZone(panel){$('#world-hint').textContent='点击地图地点，角色会自动寻找可行道路';openPanel(panel)}

  function transitionScene(label,apply,done){
    if(sceneTransitionRunning){apply();if(done)done();return}sceneTransitionRunning=true;const overlay=$('#scene-transition');$('#scene-transition-label').textContent=label;overlay.className='scene-transition';void overlay.offsetWidth;requestAnimationFrame(()=>overlay.classList.add('cover'));
    setTimeout(()=>{apply();overlay.classList.remove('cover');overlay.classList.add('reveal')},560);
    setTimeout(()=>{overlay.className='scene-transition hidden';sceneTransitionRunning=false;if(done)done()},1220);
  }
  function revealFarm(notify=true){
    marketActive=false;rivalActive=false;extraActive=null;activeMarketStall=null;clearMarketRoute();clearRivalRoute();clearExtraRoute();$('#market-world').classList.add('hidden');$('#rival-world').classList.add('hidden');$('#extra-world').classList.add('hidden');$('#world').classList.remove('hidden');if(state){renderHUD();$('#world').focus();if(notify)toast('已返回自己的农场','success')}
  }

  /* 青石镇独立地图：商铺与自有摊位之间有可寻路的道路，摊位本体不可穿越。 */
  const MARKET_WALKABLE=[
    [[43,24],[57,24],[60,42],[67,51],[77,59],[73,65],[63,60],[50,54],[37,60],[27,66],[23,60],[34,51],[40,42]],
    [[23,60],[39,58],[41,64],[38,72],[36,84],[38,96],[19,96],[19,77]],
    [[61,58],[77,59],[86,75],[88,96],[72,96],[73,85],[71,72],[66,65]]
  ];
  const MARKET_BLOCKERS=[
    [[39.5,60],[61,60],[65,94],[35.5,94]],
    [[58.5,61],[74,61],[77,90],[63,94]]
  ];
  const marketZones={
    exit:{x:50,y:19,walkX:50,walkY:29,label:'返回农场',action:'exit'},
    produce:{x:14,y:58,walkX:27,walkY:64,label:'蔬果粮店',tab:'buy-crops'},
    supplies:{x:31,y:39,walkX:39.5,walkY:43,label:'饲料铺',tab:'buy-feeds'},
    goods:{x:69,y:41,walkX:60,walkY:44,label:'杂货药铺',tab:'buy-medicine'},
    livestock:{x:83,y:57,walkX:78,walkY:64,label:'何伯牲畜行',tab:'pigbuy'},
    contracts:{x:50,y:31,walkX:50,walkY:36,label:'集市合同板',tab:'contracts'},
    stall:{x:49,y:65,walkX:34,walkY:69,label:'我的摊位',tab:'sell-crops'}
  };
  const marketPlayer={x:27,y:88,target:null,path:[],blockedFrames:0};
  function marketCanStand(x,y){const samples=[[0,0],[-.75,0],[.75,0],[0,-.9],[0,1],[-.55,.72],[.55,.72]];return samples.every(([dx,dy])=>MARKET_WALKABLE.some(p=>pointInsidePolygon(x+dx,y+dy,p))&&!MARKET_BLOCKERS.some(p=>pointInsidePolygon(x+dx,y+dy,p)))}
  function marketResolveMovement(x,y,nx,ny){if(marketCanStand(nx,ny))return{x:nx,y:ny,blocked:false};if(marketCanStand(nx,y))return{x:nx,y,blocked:true};if(marketCanStand(x,ny))return{x,y:ny,blocked:true};return{x,y,blocked:true}}
  function marketLineClear(a,b){const d=Math.hypot((b.x-a.x)*16/9,b.y-a.y),steps=Math.max(1,Math.ceil(d/.65));for(let i=1;i<=steps;i++){const t=i/steps;if(!marketCanStand(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t))return false}return true}
  function nearestMarketGrid(point,step=2){const cx=Math.round(point.x/step),cy=Math.round(point.y/step);for(let r=0;r<8;r++)for(let oy=-r;oy<=r;oy++)for(let ox=-r;ox<=r;ox++){if(Math.max(Math.abs(ox),Math.abs(oy))!==r)continue;const x=(cx+ox)*step,y=(cy+oy)*step;if(marketCanStand(x,y))return{x,y,i:cx+ox,j:cy+oy}}return null}
  function marketFindPath(start,goal){const target=marketCanStand(goal.x,goal.y)?goal:nearestMarketGrid(goal);if(!target)return[];if(marketLineClear(start,target))return[{x:target.x,y:target.y}];const step=2,s=nearestMarketGrid(start,step),g=nearestMarketGrid(target,step);if(!s||!g)return[];const key=(i,j)=>`${i},${j}`,open=[{...s,f:0}],came=new Map(),cost=new Map([[key(s.i,s.j),0]]),closed=new Set(),goalKey=key(g.i,g.j);let found=false,guard=0;while(open.length&&guard++<5000){open.sort((a,b)=>b.f-a.f);const cur=open.pop(),ck=key(cur.i,cur.j);if(closed.has(ck))continue;closed.add(ck);if(ck===goalKey){found=true;break}for(const [di,dj] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]){const ni=cur.i+di,nj=cur.j+dj,nx=ni*step,ny=nj*step,nk=key(ni,nj);if(closed.has(nk)||!marketCanStand(nx,ny)||!marketLineClear(cur,{x:nx,y:ny}))continue;const nc=cost.get(ck)+Math.hypot(di*step*16/9,dj*step);if(nc>=(cost.get(nk)??Infinity))continue;cost.set(nk,nc);came.set(nk,ck);open.push({x:nx,y:ny,i:ni,j:nj,f:nc+Math.hypot((nx-g.x)*16/9,ny-g.y)})}}if(!found)return[];const raw=[];let current=goalKey,startKey=key(s.i,s.j);while(current!==startKey){const [i,j]=current.split(',').map(Number);raw.push({x:i*step,y:j*step});current=came.get(current);if(!current)return[]}raw.reverse();raw.push({x:target.x,y:target.y});const smooth=[];let from={x:start.x,y:start.y},index=0;while(index<raw.length){let far=index;for(let j=raw.length-1;j>=index;j--)if(marketLineClear(from,raw[j])){far=j;break}smooth.push(raw[far]);from=raw[far];index=far+1}return smooth}
  function nearestMarketZone(){let best=null,dist=999;for(const [id,z] of Object.entries(marketZones)){const d=Math.hypot(marketPlayer.x-z.walkX,marketPlayer.y-z.walkY);if(d<dist){dist=d;best={id,...z,dist}}}return best}
  function updateMarketPlayer(){const el=$('#market-player');el.style.left=marketPlayer.x+'%';el.style.top=marketPlayer.y+'%';const n=nearestMarketZone();$$('.market-hotspot').forEach(h=>h.classList.toggle('near',n&&h.dataset.marketZone===n.id&&n.dist<7));const prompt=$('#market-near-prompt');if(n&&n.dist<7){prompt.classList.remove('hidden');prompt.style.left=(marketPlayer.x+1)+'%';prompt.style.top=(marketPlayer.y-10)+'%';prompt.querySelector('span').textContent=n.label}else prompt.classList.add('hidden')}
  function clearMarketRoute(resetHint=false){marketPlayer.target=null;marketPlayer.path=[];marketPlayer.blockedFrames=0;if(resetHint)$('#market-world-hint').textContent='沿街走到商铺或自己的摊位前进行交易'}
  function activateMarketZone(zone){const id=typeof zone==='string'?zone:zone?.id,z=typeof zone==='string'?marketZones[zone]:zone;if(!z)return;clearMarketRoute(true);$('#market-player').classList.remove('walking');if(z.action==='exit')leaveMarketScene();else{activeMarketStall=id||Object.keys(marketZones).find(key=>marketZones[key]===z)||null;openPanel('market',z.tab)}}
  function walkMarketTo(id){const z=marketZones[id];if(!z)return;const target={id,...z,x:z.walkX,y:z.walkY},path=marketFindPath({x:marketPlayer.x,y:marketPlayer.y},target);if(!path.length){clearMarketRoute();$('#market-world-hint').textContent=`没有找到通往${z.label}的道路`;return toast('集市道路暂时无法通行。','error')}marketPlayer.target=target;marketPlayer.path=path;marketPlayer.blockedFrames=0;$('#market-world-hint').textContent=`正在前往${z.label}…`;audio.sfx('click')}
  function enterMarketScene(immediate=false){if(!state)return;const enter=()=>{closePanel();clearRoute();clearRivalRoute();rivalActive=false;marketActive=true;activeMarketStall=null;$('#world').classList.add('hidden');$('#rival-world').classList.add('hidden');$('#market-world').classList.remove('hidden');$('#market-world').classList.toggle('trading',!state.ended);$('#rail-tip').textContent=state.yearEnd?'年底年市期间场内交易不耗时；请到对应摊位或合同板办理。':'已到青石镇：每个商铺只经营标注的商品，走近后按 E。';updateMarketPlayer();$('#market-world').focus()};immediate?enter():transitionScene('青石镇集市',enter)}
  function leaveMarketScene(notify=true,immediate=false){const arrive=()=>revealFarm(false),settle=()=>{if(!state)return;if(state.location==='market'&&!state.ended&&!state.yearEnd){handleAction(E.returnFromMarket(state),'回到农场，返程结算 1 个游戏日',false)}else{if(state.location==='market')state.location='farm';saveCurrent();renderHUD();if(notify)toast(state.yearEnd?'年市尚未结算，可从进镇小路再次进入。':'已返回自己的农场','success')}};immediate?(arrive(),settle()):transitionScene(state?.farmName||'自己的农场',arrive,settle)}
  function updateMarketMovement(t,dx,dy,manual){if(manual&&marketPlayer.target)clearMarketRoute(true);if(marketPlayer.target&&!manual){const waypoint=marketPlayer.path[0]||marketPlayer.target,tx=waypoint.x-marketPlayer.x,ty=waypoint.y-marketPlayer.y,d=Math.hypot(tx,ty);if(d<.72){if(marketPlayer.path.length)marketPlayer.path.shift();if(!marketPlayer.path.length&&Math.hypot(marketPlayer.target.x-marketPlayer.x,marketPlayer.target.y-marketPlayer.y)<1.15){const go=marketPlayer.target;activateMarketZone(go);return}}else{dx=tx/d;dy=ty/d}}const moving=dx||dy,sprite=$('#market-player');if(!moving){sprite.classList.remove('walking');return}const length=Math.hypot(dx,dy)||1,direction=Math.abs(dx)>Math.abs(dy)?(dx<0?'left':'right'):(dy<0?'up':'down'),step=Math.min(32,t-(player.last||t))*.018,nx=marketPlayer.x+dx/length*step,ny=marketPlayer.y+dy/length*step,moved=marketResolveMovement(marketPlayer.x,marketPlayer.y,nx,ny),changed=Math.hypot(moved.x-marketPlayer.x,moved.y-marketPlayer.y)>.001;marketPlayer.x=moved.x;marketPlayer.y=moved.y;if(moved.blocked&&marketPlayer.target){marketPlayer.blockedFrames++;if(marketPlayer.blockedFrames>14){marketPlayer.path=marketFindPath({x:marketPlayer.x,y:marketPlayer.y},marketPlayer.target);marketPlayer.blockedFrames=0}}else marketPlayer.blockedFrames=0;if(changed){sprite.classList.remove('dir-down','dir-left','dir-right','dir-up');sprite.classList.add('walking','dir-'+direction);updateMarketPlayer()}else{sprite.classList.remove('walking');if(manual)$('#market-world-hint').textContent='商铺、摊位或围栏挡住了去路'}}

  /* 石桥牧场独立地图：道路可行走，建筑、荣誉墙、训练设施和三处猪圈不可穿越。 */
  const RIVAL_WALKABLE=[
    [[1,58],[10,56],[22,51],[32,44],[43,38],[55,38],[65,43],[68,51],[61,58],[50,64],[36,68],[24,73],[10,78],[1,73]],
    [[25,37],[29,29],[38,28],[44,36],[43,46],[35,51],[26,47]],
    [[34,58],[47,58],[58,63],[69,71],[84,84],[89,97],[77,97],[65,84],[53,74],[39,69]],
    [[53,53],[65,48],[78,43],[94,44],[97,51],[88,58],[73,63],[63,69],[55,65]]
  ];
  const RIVAL_BLOCKERS=[
    [[13,8],[37,8],[41,17],[40,33],[35,37],[17,37],[12,31]],
    [[4,25],[15,22],[20,29],[19,45],[7,48],[3,41]],
    [[55,12],[96,12],[100,21],[100,39],[88,44],[63,42],[54,34]],
    [[48,40],[58,40],[59,53],[48,54]],
    [[19,47],[35,47],[37,60],[31,64],[19,62]],
    [[40,51],[50,51],[51,59],[41,59]],
    [[78,36],[100,33],[100,60],[83,59],[76,50]],
    [[58,51],[96,47],[99,68],[89,75],[69,77],[57,68]],
    [[68,68],[100,61],[100,96],[82,98],[66,82]]
  ];
  const rivalZones={
    exit:{x:4.5,y:64,walkX:7,walkY:67,label:'返回自己的农场',action:'exit'},
    owner:{x:38,y:44,walkX:36,walkY:42,label:'陆野',action:'talk'},
    board:{x:53,y:48,walkX:45,walkY:48,label:'荣誉墙',panel:'intel'},
    training:{x:44,y:55,walkX:44,walkY:62,label:'称重训练台',panel:'practice'},
    champion:{x:73,y:64,walkX:54,walkY:64,label:'黑将军',action:'champion'}
  };
  const rivalPlayer={x:9,y:68,target:null,path:[],blockedFrames:0};
  function rivalCanStand(x,y){const samples=[[0,0],[-.7,0],[.7,0],[0,-.86],[0,.95],[-.5,.65],[.5,.65]];return samples.every(([dx,dy])=>RIVAL_WALKABLE.some(p=>pointInsidePolygon(x+dx,y+dy,p))&&!RIVAL_BLOCKERS.some(p=>pointInsidePolygon(x+dx,y+dy,p)))}
  function rivalResolveMovement(x,y,nx,ny){if(rivalCanStand(nx,ny))return{x:nx,y:ny,blocked:false};if(rivalCanStand(nx,y))return{x:nx,y,blocked:true};if(rivalCanStand(x,ny))return{x,y:ny,blocked:true};return{x,y,blocked:true}}
  function rivalLineClear(a,b){const d=Math.hypot((b.x-a.x)*16/9,b.y-a.y),steps=Math.max(1,Math.ceil(d/.65));for(let i=1;i<=steps;i++){const t=i/steps;if(!rivalCanStand(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t))return false}return true}
  function nearestRivalGrid(point,step=2){const cx=Math.round(point.x/step),cy=Math.round(point.y/step);for(let r=0;r<9;r++)for(let oy=-r;oy<=r;oy++)for(let ox=-r;ox<=r;ox++){if(Math.max(Math.abs(ox),Math.abs(oy))!==r)continue;const x=(cx+ox)*step,y=(cy+oy)*step;if(rivalCanStand(x,y))return{x,y,i:cx+ox,j:cy+oy}}return null}
  function rivalFindPath(start,goal){const target=rivalCanStand(goal.x,goal.y)?goal:nearestRivalGrid(goal);if(!target)return[];if(rivalLineClear(start,target))return[{x:target.x,y:target.y}];const step=2,s=nearestRivalGrid(start,step),g=nearestRivalGrid(target,step);if(!s||!g)return[];const key=(i,j)=>`${i},${j}`,open=[{...s,f:0}],came=new Map(),cost=new Map([[key(s.i,s.j),0]]),closed=new Set(),goalKey=key(g.i,g.j);let found=false,guard=0;while(open.length&&guard++<6000){open.sort((a,b)=>b.f-a.f);const cur=open.pop(),ck=key(cur.i,cur.j);if(closed.has(ck))continue;closed.add(ck);if(ck===goalKey){found=true;break}for(const [di,dj] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]){const ni=cur.i+di,nj=cur.j+dj,nx=ni*step,ny=nj*step,nk=key(ni,nj);if(closed.has(nk)||!rivalCanStand(nx,ny)||!rivalLineClear(cur,{x:nx,y:ny}))continue;const nc=cost.get(ck)+Math.hypot(di*step*16/9,dj*step);if(nc>=(cost.get(nk)??Infinity))continue;cost.set(nk,nc);came.set(nk,ck);open.push({x:nx,y:ny,i:ni,j:nj,f:nc+Math.hypot((nx-g.x)*16/9,ny-g.y)})}}if(!found)return[];const raw=[];let current=goalKey,startKey=key(s.i,s.j);while(current!==startKey){const [i,j]=current.split(',').map(Number);raw.push({x:i*step,y:j*step});current=came.get(current);if(!current)return[]}raw.reverse();raw.push({x:target.x,y:target.y});const smooth=[];let from={x:start.x,y:start.y},index=0;while(index<raw.length){let far=index;for(let j=raw.length-1;j>=index;j--)if(rivalLineClear(from,raw[j])){far=j;break}smooth.push(raw[far]);from=raw[far];index=far+1}return smooth}
  function nearestRivalZone(){let best=null,dist=999;for(const [id,z] of Object.entries(rivalZones)){const d=Math.hypot(rivalPlayer.x-z.walkX,rivalPlayer.y-z.walkY);if(d<dist){dist=d;best={id,...z,dist}}}return best}
  function updateRivalPlayer(){const el=$('#rival-player');el.style.left=rivalPlayer.x+'%';el.style.top=rivalPlayer.y+'%';const n=nearestRivalZone();$$('.rival-hotspot').forEach(h=>h.classList.toggle('near',n&&h.dataset.rivalZone===n.id&&n.dist<7));const prompt=$('#rival-near-prompt');if(n&&n.dist<7){prompt.classList.remove('hidden');prompt.style.left=(rivalPlayer.x+1)+'%';prompt.style.top=(rivalPlayer.y-10)+'%';prompt.querySelector('span').textContent=n.label}else prompt.classList.add('hidden')}
  function clearRivalRoute(resetHint=false){rivalPlayer.target=null;rivalPlayer.path=[];rivalPlayer.blockedFrames=0;if(resetHint&&$('#rival-world-hint'))$('#rival-world-hint').textContent='沿石路拜访陆野，观察黑将军或参加训练赛'}
  function rivalConversation(){
    const rival=E.rivalState(state),talk=E.talkRival(state),first=rival.visits<=1&&talk.rapport<=1,lines=first?
      [{portrait:'rival',name:'陆野',text:`你就是${state.farmName}的新主人？我是陆野。三年后的赛场上，黑将军不会让任何猪轻松拿走奖杯。`},{portrait:'farmer',name:state.playerName,text:'我不是来打听秘诀的。既然是邻居，也是对手，我会用自己的方式把猪养好。'}]:
      [{portrait:'rival',name:'陆野',text:state.ended?(state.ending?.win?'那场决赛我输得明白。黑将军还在训练，下次可不会让你轻松。':'比赛结束了，但真正的养殖不会停。你随时可以再来看黑将军。'):`第${state.year}年了。黑将军的训练越来越稳，你也别只顾着追体重，临场状态同样会决定排名。`}];
    saveCurrent();renderHUD();showDialogueSequence(lines)
  }
  function activateRivalZone(zone){const z=typeof zone==='string'?rivalZones[zone]:zone;if(!z)return;clearRivalRoute(true);$('#rival-player').classList.remove('walking');if(z.action==='exit')leaveRivalScene();else if(z.action==='talk')rivalConversation();else if(z.action==='champion')showDialogueSequence([{portrait:'rival',name:'陆野',text:'黑将军每天都要完成称重、步态和情绪稳定训练。它是你的最终对手，但我不会阻止你观察。'},{portrait:'farmer',name:state.playerName,text:'体格很强，不过最后比的是完整状态。我的猪也会找到自己的优势。'}]);else openPanel('rival',z.panel||'intel')}
  function walkRivalTo(id){const z=rivalZones[id];if(!z)return;const target={...z,x:z.walkX,y:z.walkY},path=rivalFindPath({x:rivalPlayer.x,y:rivalPlayer.y},target);if(!path.length){clearRivalRoute();$('#rival-world-hint').textContent=`没有找到通往${z.label}的道路`;return toast('石桥牧场的围栏或设施挡住了去路。','error')}rivalPlayer.target=target;rivalPlayer.path=path;rivalPlayer.blockedFrames=0;$('#rival-world-hint').textContent=`正在前往${z.label}…`;audio.sfx('click')}
  function updateRivalFacilityArt(){if(!state)return;const rival=E.simulateRivalDay(state),world=$('#rival-world'),levels=rival.facilities||{},total=Object.values(levels).reduce((n,level)=>n+(Number(level)||0),0),stage=total>=10?'竞赛级':total>=7?'扩建期':total>=4?'成长期':'起步期';world.dataset.businessStage=`经营阶段 · ${stage} · 设施总等级 ${total}`;Object.entries({clinic:'clinic',storehouse:'storehouse',training:'training',pen:'pen'}).forEach(([name,id])=>{const el=world.querySelector(`.prop-${name}`),level=Math.max(0,Math.min(3,Number(levels[id])||0));if(!el)return;el.className=`rival-facility-prop prop-${name} lv-${level}`;el.querySelector('span').textContent=`${{clinic:'兽医室',storehouse:'饲料仓',training:'训练场',pen:'育成猪舍'}[name]} · Lv.${level}`;});}
  function enterRivalScene(immediate=false){if(!state)return;const enter=()=>{closePanel();clearRoute();clearMarketRoute();marketActive=false;rivalActive=true;rivalPlayer.x=9;rivalPlayer.y=68;$('#world').classList.add('hidden');$('#market-world').classList.add('hidden');$('#rival-world').classList.remove('hidden');updateRivalFacilityArt();updateRivalPlayer();renderHUD();$('#rival-world').focus()};immediate?enter():transitionScene('石桥牧场',enter)}
  function leaveRivalScene(notify=true,immediate=false){const arrive=()=>revealFarm(false),settle=()=>{if(!state)return;if(state.location==='rival'&&!state.ended&&!state.yearEnd){handleAction(E.returnFromRival(state),'回到农场，返程结算半个游戏日',false)}else{if(state.location==='rival')state.location='farm';saveCurrent();renderHUD();if(notify)toast('沿左侧小路回到了自己的农场','success')}};immediate?(arrive(),settle()):transitionScene(state?.farmName||'自己的农场',arrive,settle)}
  function updateRivalMovement(t,dx,dy,manual){if(manual&&rivalPlayer.target)clearRivalRoute(true);if(rivalPlayer.target&&!manual){const waypoint=rivalPlayer.path[0]||rivalPlayer.target,tx=waypoint.x-rivalPlayer.x,ty=waypoint.y-rivalPlayer.y,d=Math.hypot(tx,ty);if(d<.72){rivalPlayer.x=waypoint.x;rivalPlayer.y=waypoint.y;updateRivalPlayer();if(rivalPlayer.path.length)rivalPlayer.path.shift();if(!rivalPlayer.path.length&&Math.hypot(rivalPlayer.target.x-rivalPlayer.x,rivalPlayer.target.y-rivalPlayer.y)<1.15){const go=rivalPlayer.target;activateRivalZone(go);return}}else{dx=tx/d;dy=ty/d}}const moving=dx||dy,sprite=$('#rival-player');if(!moving){sprite.classList.remove('walking');return}const length=Math.hypot(dx,dy)||1,direction=Math.abs(dx)>Math.abs(dy)?(dx<0?'left':'right'):(dy<0?'up':'down'),step=Math.min(32,t-(player.last||t))*.018,nx=rivalPlayer.x+dx/length*step,ny=rivalPlayer.y+dy/length*step,moved=rivalResolveMovement(rivalPlayer.x,rivalPlayer.y,nx,ny),changed=Math.hypot(moved.x-rivalPlayer.x,moved.y-rivalPlayer.y)>.001;rivalPlayer.x=moved.x;rivalPlayer.y=moved.y;if(moved.blocked&&rivalPlayer.target){rivalPlayer.blockedFrames++;if(rivalPlayer.blockedFrames>14){rivalPlayer.path=rivalFindPath({x:rivalPlayer.x,y:rivalPlayer.y},rivalPlayer.target);rivalPlayer.blockedFrames=0}}else rivalPlayer.blockedFrames=0;if(changed){sprite.classList.remove('dir-down','dir-left','dir-right','dir-up');sprite.classList.add('walking','dir-'+direction);updateRivalPlayer()}else{sprite.classList.remove('walking');if(manual)$('#rival-world-hint').textContent='建筑、围栏或训练设施挡住了去路'}}
  const RIVAL_PIG_RANGES={north:[84,95,42,54],middle:[65,88,58,70],south:[75,94,74,88]};
  const RIVAL_WATER_POINTS={north:{x:92,y:48},middle:{x:69,y:64},south:{x:90,y:84}};
  function rivalPigPoint(range,current,radius=5.5){for(let attempt=0;attempt<24;attempt++){const angle=Math.random()*Math.PI*2,distance=1.5+Math.random()*radius,x=current.x+Math.cos(angle)*distance,y=current.y+Math.sin(angle)*distance*.6;if(x>=range[0]&&x<=range[1]&&y>=range[2]&&y<=range[3])return{x,y}}return current}
  function advanceRivalPig(el,i,now){
    const key=`rival-${el.dataset.rivalPen}-${i}`,range=RIVAL_PIG_RANGES[el.dataset.rivalPen],current={x:parseFloat(el.style.left),y:parseFloat(el.style.top)};let record=rivalPigBehaviors.get(key);
    if(!record){record={mode:'idle',position:current,nextAt:now+2100+i*1100,planned:['rooting','drinking','resting'][i%3]};rivalPigBehaviors.set(key,record);setPigBehavior(el,'idle');return}if(now<record.nextAt)return;
    if(record.mode==='walking'||record.mode==='drinking'||record.mode==='rolling'||record.mode==='rooting'||record.mode==='resting'){record.mode='idle';record.nextAt=now+behaviorDelay(6200,11800);setPigBehavior(el,'idle');return}
    if(record.mode==='movingDrink'){record.mode='drinking';record.nextAt=now+behaviorDelay(2600,4200);el.style.transition='none';setPigBehavior(el,'drinking');return}
    const mode=choosePigBehavior(record);
    if(mode==='idle'){record.nextAt=now+behaviorDelay(4800,8200);setPigBehavior(el,'idle');return}
    if(mode==='walking'||mode==='drinking'){
      const target=mode==='drinking'?(RIVAL_WATER_POINTS[el.dataset.rivalPen]||current):rivalPigPoint(range,current),distance=Math.hypot(target.x-current.x,target.y-current.y),duration=Math.min(4,1.8+distance*.2);record.mode=mode==='drinking'?'movingDrink':'walking';startPigMotion(el,record,current,target,duration,now);return;
    }
    record.mode=mode;record.nextAt=now+behaviorDelay(mode==='resting'?4200:2600,mode==='resting'?6600:4200);el.style.transition='none';el.dataset.behaviorDuration=(record.nextAt-now)/1000;setPigBehavior(el,mode);
  }
  setInterval(()=>{if(lifecycleSuspended||document.hidden||!rivalActive)return;const now=Date.now();$$('.rival-pig').forEach((el,i)=>advanceRivalPig(el,i,now))},460);

  /* 三张扩展地图共用寻路器；每张地图拥有独立可行走区域、实体碰撞和交互点。 */
  const EXTRA_SCENES={
    forest:{title:'后山林场',hint:'沿实地小路搜索橡果、药草、溪岸菌菇与干木料',note:'山林采集 · 采集并入返程半日',start:{x:50,y:92},walkable:[[[37,100],[36,88],[40,76],[45,69],[46,57],[54,57],[55,68],[62,76],[66,89],[65,100]],[[24,31],[43,28],[51,34],[60,28],[76,27],[82,36],[76,47],[63,52],[55,59],[44,59],[33,53],[20,43]],[[10,33],[19,28],[30,34],[42,43],[49,52],[45,60],[34,53],[24,46],[16,43],[10,47]],[[59,30],[85,27],[88,39],[78,49],[66,48],[58,40]],[[54,59],[69,58],[85,63],[83,75],[67,78],[58,70]],[[52,69],[68,69],[70,76],[60,80],[53,76]]],blockers:[[[0,50],[45.5,51],[45.5,69],[0,70]],[[54.5,50],[100,47],[100,68],[55,69]],[[69,0],[100,0],[100,44],[73,44],[68,36]],[[0,0],[28,0],[30,29],[25,40],[19,32],[13,48],[0,49]],[[69,62],[97,61],[98,80],[72,80]]],zones:{exit:{x:50,y:95,walkX:50,walkY:91,label:'返回农场',action:'exit'},oak:{x:20,y:36,walkX:28,walkY:46,label:'橡树林采集点',action:'forage',spot:'oak'},herbs:{x:42,y:45,walkX:43,walkY:49,label:'山野药草丛',action:'forage',spot:'herbs'},bridge:{x:50,y:61,walkX:50,walkY:66,label:'溪桥菌菇点',action:'forage',spot:'bridge'},deadwood:{x:80,y:70,walkX:66,walkY:73,label:'倒木与干枝',action:'forage',spot:'deadwood'},cabin:{x:82,y:27,walkX:67,walkY:43,label:'废弃猎人小屋',action:'remedy'}}},
    village:{title:'青石村',hint:'沿石板路拜访茶馆、公告栏、铁匠铺和村中诊所',note:'村庄关系 · 委托每5日刷新',start:{x:50,y:92},walkable:[[[35,100],[34,84],[37,69],[42,62],[42,32],[57,32],[59,49],[69,57],[75,72],[68,87],[66,100]],[[19,49],[33,43],[44,36],[61,38],[77,48],[83,62],[72,78],[52,83],[31,75],[17,65]],[[43,12],[56,12],[58,35],[42,35]],[[17,44],[40,42],[42,63],[33,71],[17,66]],[[57,41],[84,41],[86,65],[72,74],[56,63]]],blockers:[[[0,0],[34,0],[34,44],[28,54],[0,57]],[[52,14],[76,14],[76,43],[57,45]],[[66,29],[100,29],[100,73],[73,73],[63,60]],[[39,46],[54,46],[55,64],[39,64]],[[0,73],[32,73],[38,100],[0,100]],[[68,77],[100,74],[100,100],[66,100]]],zones:{exit:{x:50,y:95,walkX:50,walkY:91,label:'返回农场',action:'exit'},tea:{x:20,y:36,walkX:30,walkY:55,label:'何伯 · 茶馆',action:'talk'},board:{x:46.5,y:55,walkX:46.5,walkY:70,label:'村庄公告栏',action:'board'},smith:{x:82,y:49,walkX:61,walkY:62,label:'铁匠铺',action:'sharpen'},homes:{x:61,y:28,walkX:58,walkY:46,label:'林医生的村中诊所',action:'homes'}}},
    contest:{title:'青石赛场',hint:'从登记台报名，绕过看台进入展示环，或接受赛前健康检查',note:'季度评比 · 每季一次',start:{x:51,y:93},walkable:[[[39,100],[39,80],[43,67],[46,57],[54,57],[59,67],[64,81],[65,100]],[[15,30],[85,30],[88,43],[82,57],[71,70],[63,82],[37,82],[26,70],[17,58],[12,43]],[[33,40],[67,40],[69,51],[63,61],[55,66],[45,66],[36,61],[31,51]],[[16,54],[39,54],[41,80],[29,88],[14,80]],[[61,54],[84,51],[89,80],[73,88],[60,79]],[[40,26],[60,26],[64,36],[36,36]]],blockers:[[[33,0],[67,0],[67,30],[33,30]],[[0,14],[34,14],[34,44],[26,53],[0,55]],[[66,14],[100,14],[100,54],[75,54],[66,45]],[[0,48],[31,48],[31,83],[0,91]],[[75,47],[100,47],[100,89],[76,89],[72,73]],[[58,65],[65,65],[66,75],[57,75]],[[32,35],[68,35],[68,40],[32,40]],[[29,38],[35,40],[34,56],[42,62],[39,67],[31,62],[27,50]],[[71,38],[65,40],[66,56],[58,62],[61,67],[69,62],[73,50]],[[34,58],[47,62],[47,67],[38,65]],[[53,62],[66,58],[63,65],[53,67]]],zones:{exit:{x:51,y:96,walkX:51,walkY:92,label:'返回农场',action:'exit'},register:{x:17,y:66,walkX:33,walkY:71,label:'赛事登记处',action:'contest'},vet:{x:86,y:66,walkX:69,walkY:79,label:'赛前健康检查',action:'vet'},weigh:{x:61,y:69,walkX:54,walkY:72,label:'称重台',action:'contest'},arena:{x:50,y:49,walkX:50,walkY:57,label:'中央展示环',action:'arena'},stands:{x:77,y:35,walkX:64,walkY:41,label:'观众与对手席',action:'stands'}}}
  };
  const extraPlayer={x:50,y:91,target:null,path:[],blockedFrames:0};
  function extraConfig(){return EXTRA_SCENES[extraActive]}
  function extraCanStand(x,y){const cfg=extraConfig();if(!cfg)return false;const samples=[[0,0],[-.72,0],[.72,0],[0,-.88],[0,.96],[-.52,.68],[.52,.68]];return samples.every(([dx,dy])=>cfg.walkable.some(p=>pointInsidePolygon(x+dx,y+dy,p))&&!cfg.blockers.some(p=>pointInsidePolygon(x+dx,y+dy,p)))}
  function extraResolveMovement(x,y,nx,ny){if(extraCanStand(nx,ny))return{x:nx,y:ny,blocked:false};if(extraCanStand(nx,y))return{x:nx,y,blocked:true};if(extraCanStand(x,ny))return{x,y:ny,blocked:true};return{x,y,blocked:true}}
  function extraLineClear(a,b){const d=Math.hypot((b.x-a.x)*16/9,b.y-a.y),steps=Math.max(1,Math.ceil(d/.65));for(let i=1;i<=steps;i++){const t=i/steps;if(!extraCanStand(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t))return false}return true}
  function nearestExtraGrid(point,step=2){const cx=Math.round(point.x/step),cy=Math.round(point.y/step);for(let r=0;r<10;r++)for(let oy=-r;oy<=r;oy++)for(let ox=-r;ox<=r;ox++){if(Math.max(Math.abs(ox),Math.abs(oy))!==r)continue;const x=(cx+ox)*step,y=(cy+oy)*step;if(extraCanStand(x,y))return{x,y,i:cx+ox,j:cy+oy}}return null}
  function extraFindPath(start,goal){const target=extraCanStand(goal.x,goal.y)?goal:nearestExtraGrid(goal);if(!target)return[];if(extraLineClear(start,target))return[{x:target.x,y:target.y}];const step=2,s=nearestExtraGrid(start,step),g=nearestExtraGrid(target,step);if(!s||!g)return[];const key=(i,j)=>`${i},${j}`,open=[{...s,f:0}],came=new Map(),cost=new Map([[key(s.i,s.j),0]]),closed=new Set(),goalKey=key(g.i,g.j);let found=false,guard=0;while(open.length&&guard++<6500){open.sort((a,b)=>b.f-a.f);const cur=open.pop(),ck=key(cur.i,cur.j);if(closed.has(ck))continue;closed.add(ck);if(ck===goalKey){found=true;break}for(const [di,dj] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]){const ni=cur.i+di,nj=cur.j+dj,nx=ni*step,ny=nj*step,nk=key(ni,nj);if(closed.has(nk)||!extraCanStand(nx,ny)||!extraLineClear(cur,{x:nx,y:ny}))continue;const nc=cost.get(ck)+Math.hypot(di*step*16/9,dj*step);if(nc>=(cost.get(nk)??Infinity))continue;cost.set(nk,nc);came.set(nk,ck);open.push({x:nx,y:ny,i:ni,j:nj,f:nc+Math.hypot((nx-g.x)*16/9,ny-g.y)})}}if(!found)return[];const raw=[];let current=goalKey,startKey=key(s.i,s.j);while(current!==startKey){const [i,j]=current.split(',').map(Number);raw.push({x:i*step,y:j*step});current=came.get(current);if(!current)return[]}raw.reverse();raw.push({x:target.x,y:target.y});const smooth=[];let from={...start},index=0;while(index<raw.length){let far=index;for(let j=raw.length-1;j>=index;j--)if(extraLineClear(from,raw[j])){far=j;break}smooth.push(raw[far]);from=raw[far];index=far+1}return smooth}
  function nearestExtraZone(){const cfg=extraConfig();let best=null,dist=999;if(!cfg)return null;for(const [id,z] of Object.entries(cfg.zones)){const d=Math.hypot(extraPlayer.x-z.walkX,extraPlayer.y-z.walkY);if(d<dist){dist=d;best={id,...z,dist}}}return best}
  function updateExtraPlayer(){const el=$('#extra-player'),n=nearestExtraZone();el.style.left=extraPlayer.x+'%';el.style.top=extraPlayer.y+'%';$$('.extra-hotspot').forEach(h=>h.classList.toggle('near',n&&h.dataset.extraZone===n.id&&n.dist<7));const prompt=$('#extra-near-prompt');if(n&&n.dist<7){prompt.classList.remove('hidden');prompt.style.left=(extraPlayer.x+1)+'%';prompt.style.top=(extraPlayer.y-10)+'%';prompt.querySelector('span').textContent=n.label}else prompt.classList.add('hidden')}
  function clearExtraRoute(resetHint=false){extraPlayer.target=null;extraPlayer.path=[];extraPlayer.blockedFrames=0;if(resetHint&&extraConfig())$('#extra-world-hint').textContent=extraConfig().hint}
  function renderExtraScene(){const cfg=extraConfig(),world=$('#extra-world');if(!cfg)return;world.className=`extra-world ${extraActive}`;world.dataset.sceneNote=cfg.note;$('#extra-location-label').textContent=cfg.title;$('#extra-world-hint').textContent=cfg.hint;$('#extra-hotspots').innerHTML=Object.entries(cfg.zones).map(([id,z])=>`<button class="extra-hotspot" data-extra-zone="${id}" style="--x:${z.x}%;--y:${z.y}%"><span>${esc(z.label)}</span></button>`).join('');updateExtraPlayer()}
 function forestResult(r){if(!handleAction(r,r.ok?`获得${r.itemName}×${r.amount}`:'采集失败'))return;if(r.ok&&!state.pendingEvent)showDialogue('farmer',state.playerName,`在林下找到了${r.itemName}×${r.amount}。同一个采集点今天不会再有新的收获。`,showPendingStory)}
 function villageConversation(){const r=E.talkVillage(state),crop=r.ok?D.CROPS[r.forecast]:null;if(!r.ok)return toast(r.error,'error');saveCurrent();renderHUD();showDialogueSequence([{portrait:'merchant',name:'何伯',text:r.firstToday?`今天村里最看好${crop.name}的行情。公告栏每五天换一批委托，交货价通常比直接摆摊更稳。`:'今天能打听到的消息都说完了。明天茶馆里也许会有新行情。'},{portrait:'farmer',name:state.playerName,text:'我会比较库存、饲料配方和交货时间，不会只追着一个价格跑。'}],showPendingStory)}
  function contestInfo(){const best=[...E.livePigs(state)].filter(p=>['adult','senior'].includes(E.phaseOf(p))).sort((a,b)=>E.scorePig(state,b)-E.scorePig(state,a))[0];showDialogue('vet','林医生',best?`${best.name}当前综合评估约${E.scorePig(state,best)}分。健康、心情、体格与亲密度都会在不同项目中体现。`:'目前没有成年参赛猪。先让猪成长到成年阶段，再来登记季度评比。')}
  function activateExtraZone(zone){const z=typeof zone==='string'?extraConfig()?.zones[zone]:zone;if(!z)return;clearExtraRoute(true);$('#extra-player').classList.remove('walking');if(z.action==='exit')return leaveExtraScene();if(z.action==='forage')return forestResult(E.forageForest(state,z.spot));if(z.action==='remedy')return confirmBox('整理山野药草','消耗山野药草×3，在猎人小屋制成兽药×1，占用1/4日。',()=>handleAction(E.brewForestRemedy(state),'制成一份兽药'),false);if(z.action==='talk')return villageConversation();if(z.action==='board')return openPanel('village');if(z.action==='sharpen')return confirmBox('保养农具','花费¥180，不单独推进日程；等待时间并入本次返程。下一次统一收获时，每块成熟田额外获得1份作物；每10天限一次。',()=>handleAction(E.sharpenTools(state),'农具已经保养完成'),false);if(z.action==='homes')return showDialogue('vet','林医生','这里是我的村中诊所。正式兽医站还在整修，但比赛前的健康检查和常用防疫建议可以先来问我。');if(z.action==='contest')return openPanel('contest');if(z.action==='vet')return contestInfo();if(z.action==='stands')return showDialogue('rival','陆野',state.ended?'最终名次已经确定。走进中央展示环，镇长会宣布最后结果。':'季度评比只是练兵。黑将军真正准备的是第三年年底的最终展示。');if(z.action==='arena'){if(state.ending?.ceremonyPending){const r=E.completeContestCeremony(state);if(!r.ok)return toast(r.error,'error');saveCurrent();return showDialogueSequence([{portrait:'vet',name:'林医生',text:`三年最终评审已经完成。${state.ending.champion.name}的健康、状态和培育记录全部确认无误。`},{portrait:'rival',name:'陆野',text:state.ending.win?'这次是你赢了。黑将军不会停止训练，我也不会。':'排名已经说明问题，但三年的养殖并不会因为一次比赛失去意义。'}],showEnding)}return openPanel('contest')}}
  function walkExtraTo(id){const z=extraConfig()?.zones[id];if(!z)return;const target={...z,x:z.walkX,y:z.walkY},path=extraFindPath({x:extraPlayer.x,y:extraPlayer.y},target);if(!path.length){clearExtraRoute();$('#extra-world-hint').textContent=`没有找到通往${z.label}的道路`;return toast('建筑、水域或地形挡住了去路。','error')}extraPlayer.target=target;extraPlayer.path=path;extraPlayer.blockedFrames=0;$('#extra-world-hint').textContent=`正在前往${z.label}…`;audio.sfx('click')}
  function enterExtraScene(name,immediate=false){if(!state||!EXTRA_SCENES[name])return;const enter=()=>{closePanel();clearRoute();clearMarketRoute();clearRivalRoute();marketActive=false;rivalActive=false;extraActive=name;const cfg=EXTRA_SCENES[name];extraPlayer.x=cfg.start.x;extraPlayer.y=cfg.start.y;$('#world').classList.add('hidden');$('#market-world').classList.add('hidden');$('#rival-world').classList.add('hidden');$('#extra-world').classList.remove('hidden');renderExtraScene();renderHUD();$('#extra-world').focus()};immediate?enter():transitionScene(EXTRA_SCENES[name].title,enter)}
  function leaveExtraScene(notify=true,immediate=false){const name=extraActive||state?.location,leave={forest:E.returnFromForest,village:E.returnFromVillage,contest:E.returnFromContest}[name],arrive=()=>revealFarm(false),settle=()=>{if(!state||!leave)return;const r=leave(state);if(r.ok)handleAction(r,`回到农场${r.noTime?'':'，返程完成结算'}`,false);else{enterExtraScene(name,true);toast(r.error,'error')}};immediate?(arrive(),state&&settle()):transitionScene(state?.farmName||'自己的农场',arrive,settle)}
  function updateExtraMovement(t,dx,dy,manual){if(manual&&extraPlayer.target)clearExtraRoute(true);if(extraPlayer.target&&!manual){const waypoint=extraPlayer.path[0]||extraPlayer.target,tx=waypoint.x-extraPlayer.x,ty=waypoint.y-extraPlayer.y,d=Math.hypot(tx,ty);if(d<.72){if(extraPlayer.path.length)extraPlayer.path.shift();if(!extraPlayer.path.length&&Math.hypot(extraPlayer.target.x-extraPlayer.x,extraPlayer.target.y-extraPlayer.y)<1.15){const go=extraPlayer.target;activateExtraZone(go);return}}else{dx=tx/d;dy=ty/d}}const moving=dx||dy,sprite=$('#extra-player');if(!moving){sprite.classList.remove('walking');return}const length=Math.hypot(dx,dy)||1,direction=Math.abs(dx)>Math.abs(dy)?(dx<0?'left':'right'):(dy<0?'up':'down'),step=Math.min(32,t-(player.last||t))*.018,nx=extraPlayer.x+dx/length*step,ny=extraPlayer.y+dy/length*step,moved=extraResolveMovement(extraPlayer.x,extraPlayer.y,nx,ny),changed=Math.hypot(moved.x-extraPlayer.x,moved.y-extraPlayer.y)>.001;extraPlayer.x=moved.x;extraPlayer.y=moved.y;if(moved.blocked&&extraPlayer.target){extraPlayer.blockedFrames++;if(extraPlayer.blockedFrames>14){extraPlayer.path=extraFindPath({x:extraPlayer.x,y:extraPlayer.y},extraPlayer.target);extraPlayer.blockedFrames=0}}else extraPlayer.blockedFrames=0;if(changed){sprite.classList.remove('dir-down','dir-left','dir-right','dir-up');sprite.classList.add('walking','dir-'+direction);updateExtraPlayer()}else{sprite.classList.remove('walking');if(manual)$('#extra-world-hint').textContent='前方实体地形挡住了去路'}}

  function closePanel(){currentPanel=null;currentTab=null;$('#panel-overlay').classList.add('hidden')}
  function syncPigArt(){
    $$('.pig-avatar[data-breed],.breed-swatch[data-breed],.pig-offer[data-breed]').forEach(el=>{
      const b=D.BREEDS.find(b=>b.id===el.dataset.breed),art=b&&window.PIG_ART[b.id];if(!art)return;
      const target=el.classList.contains('pig-offer')?el.querySelector('.market-icon'):el;
      target.style.backgroundImage='url("'+art.src+'")';target.classList.add('breed-portrait');
      target.setAttribute('role','img');target.setAttribute('aria-label',b.name+'：'+art.note);
    });
  }
  function panelSetup(title,kicker,tabs=[],tab=null){
    $('#panel-title').textContent=title;$('#panel-kicker').textContent=kicker;const box=$('#panel-tabs');currentTab=tab||tabs[0]?.id||null;box.innerHTML=tabs.map(t=>`<button data-tab="${t.id}" class="${t.id===currentTab?'active':''}">${t.label}</button>`).join('');
  }
  function openPanel(name,tab){
    if(!state)return;cancelMovement();
    if(name==='travel'){
      if(state.yearEnd)return toast('年底固定流程已经开始，不能再安排远行。','error');
      if(state.ended)return toast('三年日程已经结束。','error');
      if(state.location!=='farm')return toast('请先返回自己的农场。','error');
    }
    if(name==='marketTrip'){
      if(marketActive){const z=marketZones[activeMarketStall];if(!z)return toast('请先走到具体商铺、合同板或自己的摊位前。','error');return openPanel('market',tab||z.tab)}
      if(state.yearEnd){enterMarketScene();return}
      if(state.ended)return toast('赛程结束后集市已经休市。','error');
       return confirmBox('前往青石镇集市',`前往集市不消耗日程；从集市返回农场后结算${timeCost(E.returnTripCost(state,4))}。场内买卖不再额外耗时。`,()=>{const r=E.visitMarket(state);if(handleAction(r,'来到了青石镇集市',false))enterMarketScene()},false);
    }
    if(name==='rivalTrip'){
      if(rivalActive)return openPanel('rival',tab||'intel');
      if(state.yearEnd)return toast('年底年市已经开始，先完成本年的交易。','error');
      if(state.ended){enterRivalScene();return}
      return confirmBox('拜访石桥牧场',`前往石桥牧场不消耗日程；返回农场结算${timeCost(E.returnTripCost(state,2))}。场内交谈和查看情报不耗时，训练赛另计半日。`,()=>{const r=E.visitRival(state);if(handleAction(r,'来到了竞争对手的石桥牧场',false))enterRivalScene()},false);
    }
    if(state.location==='market'&&!['market','catalog','journal','story'].includes(name))return toast('请先从青石镇返回农场，再进行这项农场工作。','error');
    if(state.location==='rival'&&!['rival','catalog','journal','story'].includes(name))return toast('请先从石桥牧场返回农场，再进行这项农场工作。','error');
    if(state.location==='forest'&&!['catalog','journal','story'].includes(name))return toast('请先从后山林场返回农场。','error');
    if(state.location==='village'&&!['village','catalog','journal','story'].includes(name))return toast('请先从青石村返回农场。','error');
    if(state.location==='contest'&&!['contest','catalog','journal','story'].includes(name))return toast('请先从青石赛场返回农场。','error');
    currentPanel=name;$('#panel-overlay').classList.remove('hidden');renderPanel(name,tab);
  }
  function renderPanel(name,tab){
    if(!state)return;currentPanel=name;const valid=(value,allowed,fallback)=>allowed.includes(value)?value:fallback;
    if(name==='pigs')renderPigs(valid(tab,['herd','feed','breeding','memorial'],'herd'));
    else if(name==='farm')renderFarm();
    else if(name==='workshop')renderWorkshop();
    else if(name==='market')renderMarket(valid(tab,['buy-crops','buy-feeds','buy-medicine','sell-crops','sell-feeds','sell-medicine','pigbuy','pigsell','contracts'],'buy-crops'));
    else if(name==='rival')renderRival(valid(tab,['intel','business','practice','history'],'intel'));
    else if(name==='travel')renderTravel();
    else if(name==='village')renderVillage();
    else if(name==='contest')renderContest(valid(tab,['official','festival'],'official'));
    else if(name==='build')renderBuild(valid(tab,['facilities','staff'],'facilities'));
    else if(name==='story')renderStory();
    else if(name==='catalog')renderCatalog(valid(tab,['all','肉猪','宠物猪','繁育猪'],'all'));
    else if(name==='journal')renderJournal(valid(tab,['ledger','log','saves'],'ledger'));
    syncPigArt();
  }

  function renderStory(){
    const progress=E.storyProgress(state),story=E.storyState(state),def=progress.definition,pigs=E.livePigs(state),candidate=pigs.find(p=>p.id===story.candidateId),chapterNo=(state.year-1)*3+E.season(state),routeOptions=['育肥路线','伙伴路线','繁育路线','综合路线'];
    panelSetup('三年主线','柔性目标 · 不锁场景与经营方式');$('#panel-body').innerHTML=`<div class="story-hero"><div><small>第 ${chapterNo} / 9 章</small><h3>${esc(def?.title||'三年育成记录')}</h3><p>${esc(def?.subtitle||'按自己的节奏经营农场')}</p></div><span class="story-seal ${progress.outcome||''}">${progress.outcome==='complete'?'完成':progress.outcome==='missed'?'留有遗憾':`${progress.done}/${progress.required}`}</span></div><div class="market-note">主线每章只需完成任意 ${progress.required} 项，不会锁住品种、场景、交易或年份。未完成的章节会留下不同记录，但不会卡死存档。完成奖励 ¥${money(def?.reward||0)}；当前最终记录加成 +${E.storyFarmBonus(state)}。</div><div class="story-goals">${progress.goals.map(g=>`<article class="story-goal ${g.done?'done':''}"><i>${g.done?'✓':'○'}</i><div><b>${esc(g.label)}</b><span>${g.current} / ${g.target}</span></div></article>`).join('')}</div><section class="story-choice-block"><h3>经营方向</h3><p>方向只影响叙事与少量路线匹配加成，可随时调整，不会禁止其他玩法。</p><div class="choice-row">${routeOptions.map(value=>`<button class="action-btn ${story.route===value?'green':''}" data-action="story-choice" data-story-type="route" data-value="${value}">${story.route===value?'✓ ':''}${value}</button>`).join('')}</div></section><section class="story-choice-block"><h3>重点培养猪</h3><p>第三年主线会参考候选猪状态；候选离场后可直接重新选择。</p><div class="candidate-grid">${pigs.map(p=>`<button class="candidate-button ${story.candidateId===p.id?'selected':''}" data-action="story-choice" data-story-type="candidate" data-value="${p.id}"><span class="pig-avatar" data-breed="${esc(p.breedId)}"></span><b>${esc(p.name)}</b><small>${E.phaseName(p)} · 评估${E.scorePig(state,p)}</small></button>`).join('')||'<div class="empty-state">当前没有可选猪只</div>'}</div></section>${state.year>=3?`<section class="story-choice-block"><h3>饲养原则</h3><p>“长期照料”强化完整记录；“短期冲重”立即增加候选猪体重，但会损耗健康与最终诚信加成。选择后仍可在本章内更改。</p><div class="choice-row"><button class="action-btn ${story.decision==='长期照料'?'green':''}" data-action="story-choice" data-story-type="decision" data-value="长期照料">长期照料</button><button class="action-btn ${story.decision==='短期冲重'?'red':''}" data-action="story-choice" data-story-type="decision" data-value="短期冲重">短期冲重</button></div></section>`:''}<section class="story-timeline"><h3>章节记录</h3><div>${Object.entries(D.STORY_CHAPTERS).map(([key,item],i)=>{const outcome=story.outcomes[key],current=key===progress.key;return `<span class="${outcome||''} ${current?'current':''}"><i>${outcome==='complete'?'✓':outcome==='missed'?'·':i+1}</i><b>${esc(item.title)}</b></span>`}).join('')}</div></section>`;syncPigArt();
  }

  function renderRival(tab='intel'){
    const rival=E.simulateRivalDay(state),seasonKey=`${state.year}-${E.season(state)}`,used=rival.practiceSeason===seasonKey,eligible=E.livePigs(state).filter(p=>['adult','senior'].includes(E.phaseOf(p))),best=[...eligible].sort((a,b)=>E.scorePig(state,b)-E.scorePig(state,a))[0],estimate=E.rivalScoreFor(state);
    currentTab=tab;panelSetup('石桥牧场','竞争对手 · 陆野与黑将军',[{id:'intel',label:'对手情报'},{id:'business',label:'经营账本'},{id:'practice',label:'训练赛'},{id:'history',label:`交锋记录 ${rival.practiceWins}胜${rival.practiceLosses}负`}],tab);const body=$('#panel-body');
    if(tab==='intel')body.innerHTML=`<div class="section-head"><div><h3>石桥牧场正在独立经营</h3><p>陆野每天支付运营成本，消耗饲料，并按五日周期销售、补货与投资。资金和设施会直接影响参赛猪状态。</p></div><span class="pill">训练 · ${esc(rival.strategy)}</span></div><div class="rival-overview"><div class="rival-stat"><small>对手当前评估</small><b>${estimate-3}—${estimate+3}</b></div><div class="rival-stat"><small>经营资金</small><b>¥${money(rival.money)}</b></div><div class="rival-stat"><small>育成猪群</small><b>${rival.commercialPigs}只</b></div><div class="rival-stat"><small>饲料库存</small><b>${Math.floor(rival.feedStock)}袋</b></div><div class="rival-stat"><small>经营计划</small><b>${esc(rival.businessPlan)}</b></div><div class="rival-stat"><small>训练战绩</small><b>${rival.practiceWins}胜 ${rival.practiceLosses}负</b></div><div class="rival-stat"><small>己方最佳</small><b>${rival.bestPlayerScore||'—'}</b></div><div class="rival-stat"><small>模拟至</small><b>第${rival.lastSimDay}日</b></div></div><div class="rival-herd">${rival.herd.map(p=>`<article><div class="pig-avatar" data-breed="${esc(p.breedId)}"></div><div><h4>${esc(p.name)} · ${esc(E.breed(p.breedId).name)}</h4><p>${p.focus?'核心参赛猪':'轮换培育猪'} · ${p.weight}kg</p><small>健康 ${Math.round(p.health)} · 心情 ${Math.round(p.mood)} · 训练 ${Math.round(p.training)}</small></div><b>${Math.round((p.health+p.mood+p.training)/3)}</b></article>`).join('')}</div><div class="rival-news"><h3>近期经营动态</h3>${rival.news.length?rival.news.slice(0,6).map(n=>`<p><span>第${n.day}日</span>${esc(n.text)}</p>`).join(''):'<p>石桥牧场正在按均衡计划经营。</p>'}</div><div class="rival-duel"><article><h4>陆野的当前最高分</h4><p>${estimate} 分。饲料短缺、现金紧张或设施升级都会改变后续走势。</p></article><strong>VS</strong><article>${best?`<div class="pig-avatar" data-breed="${esc(best.breedId)}"></div><h4>${esc(best.name)}</h4><p>己方当前评估 ${E.scorePig(state,best)} 分。</p>`:'<h4>尚无成年参赛猪</h4><p>可先培养幼猪，主线不会因此被锁住。</p>'}</article></div>`;
    else if(tab==='business'){const facilities=[['pen','育成猪舍','改善体格与心情'],['training','训练场','提高每日训练效率'],['clinic','兽医室','稳定健康恢复'],['storehouse','饲料仓','增加补货目标并降低采购价']],art=[['clinic','兽医室',22,31],['storehouse','饲料仓',22,67],['training','训练场',45,50],['pen','育成猪舍',78,52]];body.innerHTML=`<div class="section-head"><div><h3>陆野的自主经营账本</h3><p>这是可观察的竞争者系统，玩家不能替陆野操作。每笔销售、补货和升级都来自同一套资金，不会凭空加成。</p></div><span class="pill">计划 · ${esc(rival.businessPlan)}</span></div><div class="resource-strip"><div><small>现有资金</small><b>¥${money(rival.money)}</b></div><div><small>累计收入</small><b>¥${money(rival.lifetimeIncome)}</b></div><div><small>累计支出</small><b>¥${money(rival.lifetimeExpense)}</b></div><div><small>牧场口碑</small><b>${rival.reputation}</b></div></div><div class="rival-facilities-board" role="img" aria-label="石桥牧场设施规划图">${art.map(([id,name,x,y])=>`<span style="--x:${x}%;--y:${y}%" class="lv-${rival.facilities[id]}"><b>${name}</b><i>Lv.${rival.facilities[id]}</i></span>`).join('')}</div><div class="rival-business-grid">${facilities.map(([id,name,desc])=>`<article class="facility-${id} lv-${rival.facilities[id]}"><span>Lv.${rival.facilities[id]}</span><h4>${name}</h4><p>${desc}</p><div class="facility-pips">${Array.from({length:3},(_,i)=>`<i class="${i<rival.facilities[id]?'on':''}"></i>`).join('')}</div></article>`).join('')}</div><div class="rival-stock"><span>标准饲料 <b>${Math.floor(rival.feedStock)}袋</b></span><span>常备兽药 <b>${rival.medicine}份</b></span><span>商业育成猪 <b>${rival.commercialPigs}只</b></span><span>上日供料率 <b>${Math.round(rival.lastFeedQuality*100)}%</b></span></div><h3>最近经营流水</h3><div class="rival-ledger">${rival.ledger.length?rival.ledger.map(item=>`<div class="${item.type}"><span>第${item.day}日 · ${esc(item.text)}</span><b>${item.amount>0?'+':''}¥${money(item.amount)}<small>余额 ¥${money(item.balance)}</small></b></div>`).join(''):'<div class="empty-state"><b>▤</b>首个五日结算后会出现经营流水</div>'}</div>`;}
    else if(tab==='practice')body.innerHTML=`<div class="section-head"><div><h3>每季一次模拟训练赛</h3><p>选择一只成年猪与黑将军进行称重和状态评估，占用半日。胜利提升口碑、心情和亲密度；失败也能积累亲密度。</p></div><span class="pill ${used?'danger':''}">${used?'本季已参加':'本季可参加'}</span></div><div class="pig-grid">${eligible.length?eligible.map(p=>`<article class="pig-card" style="--pig-color:${E.breed(p.breedId).color}"><div class="pig-card-head"><div class="pig-avatar" data-breed="${esc(p.breedId)}"></div><div class="pig-title"><h3>${esc(p.name)}</h3><p>${esc(E.breed(p.breedId).name)} · 当前评估 ${E.scorePig(state,p)} 分</p></div></div><div class="pig-facts"><div><small>健康</small><b>${Math.round(p.health)}</b></div><div><small>心情</small><b>${Math.round(p.mood)}</b></div><div><small>亲密</small><b>${p.bond}</b></div></div><div class="pig-actions"><button class="action-btn green" data-action="rival-practice" data-pig="${p.id}" ${used||state.ended?'disabled':''}>参加训练赛 · 半日</button></div></article>`).join(''):'<div class="empty-state"><b>🐖</b>当前没有成年或老年猪可以参赛</div>'}</div>`;
    else body.innerHTML=`<div class="section-head"><div><h3>与黑将军的交锋</h3><p>最多保留最近 12 场训练记录。第三年年底仍会按双方真实经营状态独立评分。</p></div></div><div class="rival-history">${rival.practiceHistory.length?rival.practiceHistory.map(h=>`<div class="${h.win?'win':'loss'}"><span>第${h.year}年 · ${D.SEASONS[h.season-1]} · ${esc(h.pigName)}</span><b>${h.playerScore} : ${h.rivalScore} · ${h.win?'胜':'负'}</b></div>`).join(''):'<div class="empty-state"><b>⚖</b>还没有参加过训练赛</div>'}</div>`;
    syncPigArt();
  }

  function renderTravel(){
    panelSetup('村外岔路','更多可探索地点');const contest=E.contestState(state),seasonUsed=contest.seasonKey===`${state.year}-${E.season(state)}`;
    const back=timeCost(E.returnTripCost(state,2));$('#panel-body').innerHTML=`<div class="section-head"><div><h3>选择目的地</h3><p>三个地点都使用独立地图、行走区域和实体碰撞。去程不耗时；返回农场统一结算路程，只有制作、训练和比赛等实质行动另计时间。</p></div></div><div class="travel-grid"><article class="travel-card"><div class="scene-symbol">🌲</div><h3>后山林场</h3><p>沿溪桥、橡树林和猎人小屋探索。每天可分别采集橡果、药草、菌菇和木料。</p><small>采集不单独计时 · 返程${back}</small><button class="action-btn green" data-action="travel-extra" data-place="forest" ${state.ended?'disabled':''}>前往后山</button></article><article class="travel-card"><div class="scene-symbol">🍵</div><h3>青石村与茶馆</h3><p>向何伯打听行情，在公告栏交付五日委托，或请铁匠保养下一轮收获使用的农具。</p><small>交谈、交货和服务不计时 · 返程${back}</small><button class="action-btn green" data-action="travel-extra" data-place="village" ${state.ended?'disabled':''}>前往青石村</button></article><article class="travel-card"><div class="scene-symbol">🏆</div><h3>青石赛场</h3><p>成年猪每季可参加一次体格、健康或亲和评比，也可参加季节活动。第三年最终排名会在中央展示环正式颁奖。</p><small>${seasonUsed?'本季已参赛':'本季可参赛'} · 正赛占1日 · 返程${back}</small><button class="action-btn green" data-action="travel-extra" data-place="contest" ${state.ended?'disabled':''}>前往赛场</button></article></div>`;
  }
  function renderVillage(){
    const village=E.villageState(state),q=E.ensureVillageQuest(state),c=D.CROPS[q.cropId],owned=state.inventory.crops[q.cropId]||0;
    panelSetup('青石村公告栏','五日委托与村庄关系');$('#panel-body').innerHTML=`<div class="section-head"><div><h3>本期村民委托</h3><p>委托每5个游戏日刷新一次。交货不额外耗时，但必须亲自来到公告栏。</p></div><span class="pill">村庄关系 ${village.rapport}/30</span></div><article class="quest-card"><h3>${c.icon} 收购${c.name}</h3><p>需要 ${c.name}×${q.qty}；当前库存 ${owned}/${q.qty}。完成后获得 ¥${money(q.reward)} 和口碑+2。</p><button class="action-btn ${owned>=q.qty&&!q.done?'green':''}" data-action="village-quest" ${owned<q.qty||q.done?'disabled':''}>${q.done?'本期已完成':'交付委托'}</button></article><div class="resource-strip"><div><small>已完成委托</small><b>${state.stats.villageQuests||0}</b></div><div><small>农具收获加成</small><b>${village.harvestBoost||0}次</b></div><div><small>拜访次数</small><b>${village.visits}</b></div><div><small>累计口碑</small><b>${state.reputation}</b></div></div><div class="log-list">${village.questHistory.length?village.questHistory.map(item=>`<div class="log-row story"><span>${esc(item.at)}</span><b>${D.CROPS[item.cropId].name}×${item.qty} · ¥${money(item.reward)}</b></div>`).join(''):'<div class="empty-state"><b>▤</b>还没有完成村庄委托</div>'}</div>`;
  }
  function renderContest(tab='official'){
    const contest=E.contestState(state),festival=E.festivalState(state),key=`${state.year}-${E.season(state)}`,used=contest.seasonKey===key,festivalUsed=festival.seasonKey===key,eligible=E.livePigs(state).filter(p=>['adult','senior'].includes(E.phaseOf(p))),festivalPigs=E.livePigs(state).filter(p=>(p.ageDays||0)>=2),medal=r=>r==='gold'?'金奖':r==='silver'?'银奖':'参与奖';
    if(state.ending?.ceremonyPending){panelSetup('三年最终颁奖','季度评比与最终大赛');$('#panel-body').innerHTML=`<div class="section-head"><div><h3>最终评审已经结束</h3><p>请关闭面板并走到中央展示环。林医生、陆野和镇民会在那里完成正式颁奖。</p></div><span class="pill">第${state.ending.rank}名</span></div><article class="contest-entry-card"><h3>${esc(state.ending.champion.name)} · ${esc(state.ending.champion.breed)}</h3><p>最终得分 ${state.ending.champion.score}。颁奖完成后，三年日程将保持锁定，但存档和猪群仍会保留。</p></article>`;return}
    currentTab=tab;panelSetup('青石赛场登记','赛事与季节活动',[{id:'official',label:'季度评比'},{id:'festival',label:`${E.festivalDefinition(state).icon} ${E.festivalDefinition(state).name}`}],tab);const body=$('#panel-body');
    if(tab==='festival'){const def=E.festivalDefinition(state);body.innerHTML=`<div class="festival-banner"><span>${def.icon}</span><div><h3>${def.name}</h3><p>${def.desc}<br>${def.instructions}</p></div><b>${festivalUsed?'本季已参加':'小游戏 · 半日'}</b></div><div class="market-note">操作表现会提供 -9 至 +9 的现场加成；猪只健康、心情、亲密与农场经营仍是评分主体。退出小游戏不会耗时，也不会占用本季名额。</div><div class="resource-strip"><div><small>活动金奖</small><b>${festival.gold}</b></div><div><small>活动银奖</small><b>${festival.silver}</b></div><div><small>最佳操作</small><b>${festival.bestPerformance||0}</b></div><div><small>累计参加</small><b>${festival.entries}</b></div></div><div class="pig-grid">${festivalPigs.map(p=>`<article class="pig-card contest-entry-card"><div class="pig-card-head"><div class="pig-avatar" data-breed="${esc(p.breedId)}"></div><div class="pig-title"><h3>${esc(p.name)}</h3><p>${E.phaseName(p)} · 健康${Math.round(p.health)} · 心情${Math.round(p.mood)}</p></div></div><button class="action-btn green" data-action="festival-enter" data-pig="${p.id}" ${festivalUsed||state.ended?'disabled':''}>进入${def.name}小游戏 · 半日</button></article>`).join('')||'<div class="empty-state"><b>🌱</b>暂无达到2日龄的猪只</div>'}</div><div class="rival-history">${festival.history.length?festival.history.map(h=>`<div class="${h.medal==='gold'?'win':''}"><span>${esc(h.pigName)} · ${medal(h.medal)} · 操作${h.performance??50}</span><b>${h.playerScore} : ${h.rivalScore}</b></div>`).join(''):'<div class="empty-state"><b>🎪</b>还没有季节活动记录</div>'}</div>`;syncPigArt();return;}
    body.innerHTML=`<div class="section-head"><div><h3>每季一次正式评比</h3><p>选择体格、健康或亲和项目，占用1个游戏日。季节活动另设一次报名机会，彼此不冲突。</p></div><span class="pill ${used?'danger':''}">${used?'本季已参赛':'本季可报名'}</span></div><div class="resource-strip"><div><small>金奖</small><b class="medal-gold">${contest.gold}</b></div><div><small>银奖</small><b class="medal-silver">${contest.silver}</b></div><div><small>参与奖</small><b class="medal-bronze">${contest.bronze}</b></div><div><small>总参赛</small><b>${contest.entries}</b></div></div><div class="pig-grid">${eligible.length?eligible.map(p=>`<article class="pig-card contest-entry-card" style="--pig-color:${E.breed(p.breedId).color}"><div class="pig-card-head"><div class="pig-avatar" data-breed="${esc(p.breedId)}"></div><div class="pig-title"><h3>${esc(p.name)}</h3><p>${esc(E.breed(p.breedId).name)} · 综合评估 ${E.scorePig(state,p)}</p></div></div><label>参赛项目<select data-contest-category><option value="overall">综合状态</option><option value="body">体格与生长</option><option value="health">健康与稳定</option><option value="bond">亲和与配合</option></select></label><button class="action-btn green" data-action="contest-enter" data-pig="${p.id}" ${used||state.ended?'disabled':''}>登记参赛 · 1日</button></article>`).join(''):'<div class="empty-state"><b>🐖</b>当前没有成年猪可以报名</div>'}</div><div class="rival-history" style="margin-top:14px">${contest.history.length?contest.history.map(h=>`<div class="${h.medal==='gold'?'win':''}"><span>${esc(h.pigName)} · ${medal(h.medal)}</span><b>${h.playerScore} : ${h.rivalScore} · ¥${money(h.reward)}</b></div>`).join(''):'<div class="empty-state"><b>🏅</b>还没有季度赛事记录</div>'}</div>`;syncPigArt();
  }

  const FESTIVAL_FLOWERS=[{id:'peach',icon:'🌸',name:'桃花'},{id:'sun',icon:'🌻',name:'向日葵'},{id:'tulip',icon:'🌷',name:'郁金香'},{id:'clover',icon:'☘️',name:'三叶草'}],FESTIVAL_DIRECTIONS={up:{icon:'↑',name:'上'},right:{icon:'→',name:'右'},down:{icon:'↓',name:'下'},left:{icon:'←',name:'左'}};
  function festivalRand(){festivalGame.seed=(Math.imul(festivalGame.seed||1,1664525)+1013904223)>>>0;return festivalGame.seed/4294967296}
  function scheduleFestivalTimer(timer){
    timer.due=Date.now()+timer.remaining;
    timer.id=setTimeout(()=>{
      if(lifecycleSuspended||document.hidden){suspendLifecycle();return;}
      festivalTimeouts=festivalTimeouts.filter(item=>item!==timer);timer.id=null;timer.fn();
    },timer.remaining);
  }
  function festivalLater(fn,delay){const timer={fn,remaining:delay,due:Date.now()+delay,id:null};festivalTimeouts.push(timer);if(!lifecycleSuspended&&!document.hidden)scheduleFestivalTimer(timer);return timer}
  function clearFestivalTimers(){clearInterval(festivalClock);festivalClock=null;if(festivalFrame)cancelAnimationFrame(festivalFrame);festivalFrame=null;festivalTimeouts.forEach(timer=>clearTimeout(timer.id));festivalTimeouts=[]}
  function startFestivalClock(){
    if(festivalClock||lifecycleSuspended||document.hidden||festivalGame?.phase!=='play')return;
    festivalClock=setInterval(()=>{if(lifecycleSuspended||document.hidden||festivalGame?.phase!=='play')return;updateFestivalGameHUD();if(Date.now()>=festivalGame.deadline)finishFestivalGame('时间到')},100);
  }
  function festivalModeName(mode){return mode==='flowers'?'花环引导':mode==='mud'?'泥坑节奏': '伙伴口令'}
  function festivalPerformance(){
    const g=festivalGame;if(!g)return 0;
    if(g.mode==='flowers')return Math.round(Math.min(100,g.correct/g.rounds*70+g.responsePoints/(g.rounds*100)*20+g.bestStreak/g.rounds*10));
    if(g.mode==='mud')return Math.round(Math.min(100,g.qualityTotal/g.rounds));
    return Math.round(Math.min(100,g.correctSteps/g.totalExpected*75+g.completedRounds/g.rounds*25));
  }
  function festivalProgress(){const g=festivalGame;if(!g)return 0;if(g.mode==='directions')return g.round/g.rounds*100;return g.round/g.rounds*100}
  function updateFestivalGameHUD(feedback='',tone=''){
    if(!festivalGame)return;const g=festivalGame,seconds=g.phase==='intro'?g.seconds:Math.max(0,Math.ceil((g.deadline-Date.now())/1000));$('#festival-game-timer').textContent=g.phase==='intro'?'准备':g.phase==='result'?'完成':`${seconds} 秒`;$('#festival-game-score').textContent=`操作表现 ${festivalPerformance()}`;$('#festival-game-progress-bar').style.width=Math.min(100,festivalProgress())+'%';if(feedback){const box=$('#festival-game-feedback');box.textContent=feedback;box.className='festival-game-feedback'+(tone?' '+tone:'')}}
  function startFestivalGame(pigId){
    const check=E.festivalEligibility(state,pigId);if(!check.ok)return toast(check.error,'error');const p=check.pig,def=check.definition;closePanel();clearFestivalTimers();festivalGame={pigId:p.id,pigName:p.name,mode:def.mode,rounds:def.rounds,seconds:def.seconds,round:0,phase:'intro',correct:0,responsePoints:0,streak:0,bestStreak:0,qualityTotal:0,correctSteps:0,completedRounds:0,totalExpected:Array.from({length:def.rounds},(_,i)=>i+3).reduce((a,b)=>a+b,0),seed:((state.rng||1)^hash(p.id)^Date.now())>>>0,definition:def};
    const card=$('#festival-game-card');card.dataset.mode=def.mode;$('#festival-game-title').textContent=def.name;$('#festival-game-pig').textContent=`${p.name} · ${E.phaseName(p)}`;$('#festival-game-icon').textContent=def.icon;$('#festival-game-subtitle').textContent=festivalModeName(def.mode);$('#festival-game-instructions').textContent=def.instructions;$('#festival-game-intro').classList.remove('hidden');$('#festival-game-play').classList.add('hidden');const result=$('#festival-game-result');result.className='festival-game-result hidden';$('#festival-game-progress-bar').style.width='0';$('#festival-game-overlay').classList.remove('hidden');updateFestivalGameHUD();audio.sfx('click')
  }
  function beginFestivalGame(){
    const g=festivalGame;if(lifecycleSuspended||document.hidden||!g||g.phase!=='intro')return;g.phase='play';g.deadline=Date.now()+g.seconds*1000;$('#festival-game-intro').classList.add('hidden');$('#festival-game-play').classList.remove('hidden');startFestivalClock();if(g.mode==='flowers')setupFlowerRound();else if(g.mode==='mud')setupMudRound();else setupDirectionRound();updateFestivalGameHUD('开始！','good');audio.sfx('good')
  }
  function festivalPigHTML(){const p=state.pigs.find(x=>x.id===festivalGame?.pigId),row=p?pigRowY(E.breed(p.breedId)):0;return `<div class="festival-pig breed-portrait" style="background-image:url('${window.PIG_ART[p?.breedId||'largewhite'].src}')" aria-label="${esc(p?.name||'参赛猪')}"></div>`}
  function setupFlowerRound(){
    const g=festivalGame;if(!g||g.phase!=='play')return;if(g.round>=g.rounds)return finishFestivalGame('花环引导完成');g.locked=false;let target=FESTIVAL_FLOWERS[Math.floor(festivalRand()*FESTIVAL_FLOWERS.length)];if(g.flowerTarget&&target.id===g.flowerTarget.id)target=FESTIVAL_FLOWERS[(FESTIVAL_FLOWERS.indexOf(target)+1)%FESTIVAL_FLOWERS.length];g.flowerTarget=target;g.targetAt=Date.now();$('#festival-game-stage').innerHTML=`<div class="flower-scene">${festivalPigHTML()}<div class="flower-callout">第 ${g.round+1}/${g.rounds} 次：请找 <b>${target.icon} ${target.name}</b></div><div class="flower-patch">${FESTIVAL_FLOWERS.map(f=>`<button class="flower-choice" data-festival-flower="${f.id}" type="button"><span>${f.icon}</span><small>${f.name}</small></button>`).join('')}</div></div>`;updateFestivalGameHUD('听清口令再选择花朵')
  }
  function chooseFestivalFlower(id,button){
    const g=festivalGame;if(lifecycleSuspended||document.hidden||!g||g.mode!=='flowers'||g.phase!=='play'||g.locked)return;g.locked=true;g.round++;const correct=id===g.flowerTarget.id,elapsed=Date.now()-g.targetAt;if(correct){g.correct++;g.streak++;g.bestStreak=Math.max(g.bestStreak,g.streak);g.responsePoints+=Math.max(20,Math.min(100,110-elapsed/25));button?.classList.add('good');audio.sfx('good');updateFestivalGameHUD(`正确！连续 ${g.streak} 次`, 'good')}else{g.streak=0;button?.classList.add('bad');audio.sfx('bad');updateFestivalGameHUD(`这次口令是 ${g.flowerTarget.icon} ${g.flowerTarget.name}`, 'bad')}festivalLater(()=>g.round>=g.rounds?finishFestivalGame('花环引导完成'):setupFlowerRound(),430)
  }
  function mudLoop(now){
    const g=festivalGame;if(lifecycleSuspended||document.hidden||!g||g.mode!=='mud'||g.phase!=='play'||g.locked)return;let v=((now-g.mudStarted)*g.mudSpeed+g.mudOffset)%2;if(v>1)v=2-v;g.mudPosition=v;const cursor=$('#festival-mud-cursor');if(cursor)cursor.style.left=(v*100)+'%';festivalFrame=requestAnimationFrame(mudLoop)
  }
  function setupMudRound(){
    const g=festivalGame;if(!g||g.phase!=='play')return;if(g.round>=g.rounds)return finishFestivalGame('泥浴节奏完成');g.locked=false;g.mudWidth=Math.max(.14,.23-state.year*.02);g.mudCenter=.23+festivalRand()*.54;g.mudOffset=festivalRand()*1.8;g.mudSpeed=.00052+state.year*.000055+festivalRand()*.00013;g.mudStarted=performance.now();$('#festival-game-stage').innerHTML=`<div class="mud-scene">${festivalPigHTML()}<div class="mud-rounds">第 ${g.round+1}/${g.rounds} 次 · 游标进入绿色区域时行动</div><div class="mud-timing"><span class="mud-zone" style="left:${(g.mudCenter-g.mudWidth/2)*100}%;width:${g.mudWidth*100}%"></span><i id="festival-mud-cursor" class="mud-cursor"></i></div><button class="mud-hit" data-festival-mud type="button">按空格 / 点击泥坑</button></div>`;updateFestivalGameHUD('看准绿色舒适区');festivalFrame=requestAnimationFrame(mudLoop)
  }
  function hitFestivalMud(){
    const g=festivalGame;if(lifecycleSuspended||document.hidden||!g||g.mode!=='mud'||g.phase!=='play'||g.locked)return;g.locked=true;if(festivalFrame)cancelAnimationFrame(festivalFrame);festivalFrame=null;const distance=Math.abs((g.mudPosition??0)-g.mudCenter),half=g.mudWidth/2,quality=Math.round(distance<=half?70+30*(1-distance/half):Math.max(0,70-(distance-half)*240));g.qualityTotal+=quality;g.round++;const scene=$('.mud-scene');if(scene){scene.classList.remove('hit');void scene.offsetWidth;scene.classList.add('hit')}audio.sfx(quality>=70?'good':'bad');updateFestivalGameHUD(quality>=90?'完美打滚！':quality>=70?'节奏正好':quality>=40?'稍微偏了一点':'错过舒适区',quality>=70?'good':'bad');festivalLater(()=>g.round>=g.rounds?finishFestivalGame('泥浴节奏完成'):setupMudRound(),620)
  }
  function flashDirection(id,kind='active'){const button=$(`[data-festival-direction="${id}"]`);if(!button)return;button.classList.add(kind);festivalLater(()=>button.classList.remove(kind),260)}
  function setupDirectionRound(){
    const g=festivalGame;if(!g||g.phase!=='play')return;if(g.round>=g.rounds)return finishFestivalGame('伙伴口令完成');const ids=Object.keys(FESTIVAL_DIRECTIONS),length=3+g.round;g.sequence=Array.from({length},()=>ids[Math.floor(festivalRand()*ids.length)]);g.inputIndex=0;g.accepting=false;$('#festival-game-stage').innerHTML=`<div class="direction-scene"><div id="festival-direction-display" class="direction-display watch">先看口令 · 第 ${g.round+1}/${g.rounds} 轮</div><div class="direction-sequence">${g.sequence.map(()=>'<i>·</i>').join('')}</div><div class="direction-pad">${ids.map(id=>`<button class="direction-button" data-festival-direction="${id}" type="button" aria-label="${FESTIVAL_DIRECTIONS[id].name}">${FESTIVAL_DIRECTIONS[id].icon}</button>`).join('')}</div></div>`;updateFestivalGameHUD('记住亮起的方向');g.sequence.forEach((id,index)=>festivalLater(()=>{flashDirection(id);const display=$('#festival-direction-display');if(display)display.textContent=`${FESTIVAL_DIRECTIONS[id].icon} ${FESTIVAL_DIRECTIONS[id].name}`},450+index*560));festivalLater(()=>{if(!festivalGame||g!==festivalGame||g.phase!=='play')return;g.accepting=true;const display=$('#festival-direction-display');if(display){display.textContent='现在请复现口令';display.classList.remove('watch')}updateFestivalGameHUD('轮到你：方向键、WASD 或点击按钮')},650+length*560)
  }
  function inputFestivalDirection(id){
    const g=festivalGame;if(lifecycleSuspended||document.hidden||!g||g.mode!=='directions'||g.phase!=='play'||!g.accepting)return;const expected=g.sequence[g.inputIndex];if(id===expected){g.correctSteps++;g.inputIndex++;flashDirection(id,'good');const dots=$$('.direction-sequence i');if(dots[g.inputIndex-1]){dots[g.inputIndex-1].textContent='✓';dots[g.inputIndex-1].classList.add('done')}audio.sfx('click');if(g.inputIndex>=g.sequence.length){g.accepting=false;g.completedRounds++;g.round++;updateFestivalGameHUD('整组口令正确！','good');festivalLater(()=>g.round>=g.rounds?finishFestivalGame('伙伴口令完成'):setupDirectionRound(),650)}else updateFestivalGameHUD(`正确 ${g.inputIndex}/${g.sequence.length}`,'good')}else{g.accepting=false;g.round++;flashDirection(id,'bad');flashDirection(expected,'active');audio.sfx('bad');updateFestivalGameHUD(`方向不对，正确答案是 ${FESTIVAL_DIRECTIONS[expected].icon}`,'bad');festivalLater(()=>g.round>=g.rounds?finishFestivalGame('伙伴口令完成'):setupDirectionRound(),750)}
  }
  function finishFestivalGame(reason='活动结束'){
    const g=festivalGame;if(!g||g.phase!=='play')return;const performanceScore=festivalPerformance();clearFestivalTimers();const beforeDay=displayedTotalDay??E.totalDay(state),r=E.completeFestival(state,g.pigId,performanceScore);if(!r.ok){closeFestivalGame(true);return toast(r.error,'error')}const afterDay=E.totalDay(state),wakeHome=afterDay>beforeDay&&!state.ended&&!state.yearEnd&&state.location!=='farm';if(wakeHome){state.location='farm';revealFarm(false)}g.phase='result';g.result=r;g.beforeDay=beforeDay;g.afterDay=afterDay;saveCurrent();renderHUD();renderWorldPigs();audio.sfx(r.medal==='gold'?'save':'good');$('#festival-game-play').classList.add('hidden');const box=$('#festival-game-result'),medal=r.medal==='gold'?'金奖':r.medal==='silver'?'银奖':'参与奖',emoji=r.medal==='gold'?'🏆':r.medal==='silver'?'🥈':'🎗️';box.className=`festival-game-result ${r.medal}`;$('#festival-result-medal').textContent=emoji;$('#festival-result-title').textContent=`${r.pigName}获得${medal}`;$('#festival-result-summary').textContent=`${reason}。操作表现改变现场发挥，但最终名次仍综合猪只状态与对手成绩。`;$('#festival-result-breakdown').innerHTML=`<span><small>操作表现</small><b>${r.performance}</b></span><span><small>猪只基础</small><b>${r.baseScore}</b></span><span><small>操作加成</small><b>${r.skillBonus>=0?'+':''}${r.skillBonus}</b></span><span><small>最终比分</small><b>${r.playerScore}:${r.rivalScore}</b></span><span><small>活动奖励</small><b>¥${money(r.reward)}</b></span><span><small>心情变化</small><b>+${r.medal==='gold'?12:6}</b></span><span><small>亲密变化</small><b>+4</b></span><span><small>耗时</small><b>半日</b></span>`;updateFestivalGameHUD();
  }
  function resumeAfterFestival(){if(!state)return;if(state.ended)return continueFinalSequence();if(state.pendingEvent)return showEvent();if(state.yearEnd?.type==='annual')return enterMarketScene();showPendingStory()}
  function closeFestivalResult(){const g=festivalGame;if(!g||g.phase!=='result')return;clearFestivalTimers();$('#festival-game-overlay').classList.add('hidden');festivalGame=null;displayedTotalDay=g.afterDay;if(g.afterDay>g.beforeDay)queueDayTransitions(g.beforeDay,g.afterDay);setTimeout(resumeAfterFestival,g.afterDay>g.beforeDay?1250:220)}
  function closeFestivalGame(silent=false){if(!festivalGame){$('#festival-game-overlay')?.classList.add('hidden');return}if(festivalGame.phase==='result'&&!silent)return closeFestivalResult();clearFestivalTimers();festivalGame=null;$('#festival-game-overlay').classList.add('hidden');if(!silent)toast('已退出节庆小游戏，没有消耗日程或报名次数。')}

  function pigCard(p){
    const b=E.breed(p.breedId),stage=E.phaseName(p),dead=!p.alive,ill=p.illness?E.disease(p.illness):null,satiety=p.hunger>=75?'饱足':p.hunger>=45?'正常':p.hunger>=25?'偏饿':'饥饿';
    return `<article class="pig-card ${dead?'dead-card':''}" style="--pig-color:${b.color}"><div class="pig-card-head"><div class="pig-avatar" data-breed="${esc(b.id)}"></div><div class="pig-title"><h3>${esc(p.name)} <small>${E.sexName(p)}</small></h3><p>${esc(b.name)} · ${stage}</p><div class="pig-tags"><span class="pill ${b.role==='肉猪'?'meat':b.role==='宠物猪'?'pet':'breed'}">${b.role}</span>${ill?`<span class="pill danger">${ill.name}</span>`:''}${p.pregnant?`<span class="pill breed">妊娠 ${p.pregnant}日</span>`:''}</div></div></div>
      <div class="pig-meters"><label>健康 <b>${Math.round(p.health)}</b><div class="meter ${p.health<35?'low':''}"><span style="width:${p.health}%"></span></div></label><label>心情 <b>${Math.round(p.mood)}</b><div class="meter mood ${p.mood<35?'low':''}"><span style="width:${p.mood}%"></span></div></label><label>饱食 · ${satiety} <b>${Math.round(p.hunger)}</b><div class="meter hunger ${p.hunger<25?'low':''}"><span style="width:${p.hunger}%"></span></div></label></div>
      <div class="pig-facts"><div><small>年龄</small><b>${p.ageDays} 日</b></div><div><small>体重</small><b>${p.weight} kg</b></div><div><small>亲密</small><b>${p.bond}</b></div></div>
      ${dead?'':`<div class="pig-pen-picker"><span>所在圈舍</span><b>${PIG_PENS[0].id}</b><small>全部猪只共享宽阔活动区</small></div>`}
      ${ill?`<div class="illness-line">⚠ ${ill.desc}</div>`:''}${p.pregnant?`<div class="pregnant-line">✦ 预计 ${p.pregnant} 日后产仔；哺育料可提高成活。</div>`:''}
      <div class="pig-actions">${dead?`<button class="action-btn red" data-action="dispose" data-pig="${p.id}">处理并消毒 <span class="time-cost">· 半日</span></button>`:`<button class="action-btn" data-action="interact-open" data-pig="${p.id}">互动</button>${ill?`<button class="action-btn red" data-action="treat" data-pig="${p.id}">治疗 <span class="time-cost">· 半日</span></button>`:''}`}</div></article>`;
  }
  function recommendedFeed(p){
    const b=E.breed(p.breedId),preferred=p.pregnant?['lactation','balanced','basic']:b.role==='肉猪'?['balanced','protein','basic']:b.role==='宠物猪'?['petmix','fiber','basic']:['lactation','balanced','basic'];return preferred.find(id=>(state.inventory.feeds[id]||0)>0)||Object.keys(D.FEEDS).find(id=>(state.inventory.feeds[id]||0)>0)||preferred[0];
  }
  function feedPigCard(p){
    const b=E.breed(p.breedId),feedId=recommendedFeed(p),last=p.lastFed?D.FEEDS[p.lastFed]:null,hasFeed=Object.values(state.inventory.feeds).some(n=>n>0),satiety=p.hunger>=75?'饱足':p.hunger>=45?'正常':p.hunger>=25?'偏饿':'饥饿',reason=p.pregnant?'妊娠期建议母猪哺育料':b.role==='肉猪'?'建议均衡育肥料或高蛋白料':b.role==='宠物猪'?'建议果蔬宠物餐或高纤维草料':'建议母猪哺育料或均衡育肥料';
    const feedCost=E.feedTimeCost(state,p.id);return `<article class="pig-card feed-pig-card" style="--pig-color:${b.color}"><div class="pig-card-head"><div class="pig-avatar" data-breed="${esc(b.id)}"></div><div class="pig-title"><h3>${esc(p.name)} <small>${E.sexName(p)}</small></h3><p>${esc(b.name)} · ${E.phaseName(p)} · ${b.role}</p></div></div><div class="pig-meters"><label>饱食 · ${satiety} <b>${Math.round(p.hunger)}</b><div class="meter hunger ${p.hunger<25?'low':''}"><span style="width:${p.hunger}%"></span></div></label><label>心情 <b>${Math.round(p.mood)}</b><div class="meter mood"><span style="width:${p.mood}%"></span></div></label><label>健康 <b>${Math.round(p.health)}</b><div class="meter"><span style="width:${p.health}%"></span></div></label></div><div class="feed-recommendation">${p.pregnant?'✦':'◆'} ${reason}</div><div class="individual-feed-controls"><label>本次饲料<select data-pig-feed-select data-pig="${p.id}">${Object.entries(D.FEEDS).map(([id,f])=>`<option value="${id}" ${id===feedId?'selected':''} ${(state.inventory.feeds[id]||0)<=0?'disabled':''}>${f.icon} ${f.name} · 库存${state.inventory.feeds[id]||0} · 饱食+${f.nutrition}</option>`).join('')}</select></label><button class="action-btn green" data-action="feed-pig" data-pig="${p.id}" ${!hasFeed||state.ended?'disabled':''}>喂养 ${esc(p.name)} · ${feedCost?'1/4日':'本轮不另计时'}</button></div><small class="last-feed">${last?`上次食用：${last.icon} ${last.name} · 当前耐饱期 ${p.satietyDays||0} 天`:'还没有个体喂养记录'}</small></article>`;
  }
  function renderPigs(tab='herd'){
    currentTab=tab;panelSetup('猪群与照料','猪圈管理',[{id:'herd',label:`猪群 ${E.livePigs(state).length}/${E.capacity(state)}`},{id:'feed',label:'逐只喂养'},{id:'breed',label:'配种繁育'},{id:'memorial',label:`离场记录 ${state.memorial.length}`}],tab);
    const body=$('#panel-body');
    if(tab==='herd'){
      const list=state.pigs.filter(p=>!p.disposed);body.innerHTML=`<div class="section-head"><div><h3>综合大猪圈</h3><p>原有四处圈舍已打通为一个连续活动区；所有猪只都在同一外围栏内活动，并会避开谷仓、食槽和遮雨棚。</p></div><span class="pill">环境加成 +${Math.round((state.facilities.pen-1)*3.5)}%</span></div>${interactionPig?interactionChooser(interactionPig):''}<div class="pig-grid">${list.length?list.map(pigCard).join(''):'<div class="empty-state"><b>空</b>猪圈里没有猪</div>'}</div>`;
    }else if(tab==='feed'){
    body.innerHTML=`<div class="section-head"><div><h3>分别为每只猪安排饲料</h3><p>仍然逐只选择饲料；连续喂养时每 3 只合计占用 1/4 日，每只消耗所选饲料 1 份。穿插其他行动后会开始新的喂养轮次。将光标停在饲料上可查看完整配方。</p></div></div><div class="feed-stock-grid">${Object.entries(D.FEEDS).map(([id,f])=>`<div ${resourceAttrs('feed',id)}><span>${f.icon} ${f.name}</span><b>${state.inventory.feeds[id]||0}</b><small>耐饱 ${f.satiety||0} 天 · 生长倍率 ${f.growth}×</small></div>`).join('')}</div><div class="pig-grid individual-feed-grid">${E.livePigs(state).length?E.livePigs(state).map(feedPigCard).join(''):'<div class="empty-state"><b>空</b>没有可以喂养的活猪</div>'}</div>`;
    }else if(tab==='breed'){
      const females=E.livePigs(state).filter(p=>p.sex==='female'&&E.phaseOf(p)==='adult'),males=E.livePigs(state).filter(p=>p.sex==='male'&&E.phaseOf(p)==='adult');
      body.innerHTML=`<div class="section-head"><div><h3>配种繁育</h3><p>妊娠期压缩为 12 个游戏日。品种繁殖率、产仔范围和哺育料会影响结果。</p></div></div><div class="breeding-form"><label>母猪<select id="mother-select">${females.map(p=>`<option value="${p.id}">${esc(p.name)} · ${esc(E.breed(p.breedId).name)}${p.pregnant?'（已妊娠）':''}</option>`).join('')}</select></label><span>×</span><label>公猪<select id="father-select">${males.map(p=>`<option value="${p.id}">${esc(p.name)} · ${esc(E.breed(p.breedId).name)}</option>`).join('')}</select></label><button class="action-btn green" data-action="breed" ${!females.length||!males.length||state.ended?'disabled':''}>安排配种 · 半日</button></div><div class="catalog-grid" style="margin-top:15px">${D.BREEDS.filter(b=>b.role==='繁育猪').map(breedCard).join('')}</div>`;
    }else{
      body.innerHTML=`<div class="section-head"><div><h3>离场与纪念记录</h3><p>售出、死亡并妥善处理的猪只都会留在账本中。</p></div></div><div class="pig-grid">${state.memorial.length?state.memorial.map(p=>`<article class="pig-card dead-card" style="--pig-color:${E.breed(p.breedId).color}"><div class="pig-card-head"><div class="pig-avatar" data-breed="${esc(p.breedId)}"></div><div class="pig-title"><h3>${esc(p.name)}</h3><p>${esc(E.breed(p.breedId).name)}</p></div></div><p>${p.sold?`在集市售出 · ¥${money(p.salePrice)}`:`因${esc(p.cause||'疾病')}离开 · 已完成消毒处理`}</p></article>`).join(''):'<div class="empty-state"><b>♡</b>暂无离场记录</div>'}</div>`;
    }
    syncPigArt();
  }
  function interactionChooser(id){const p=state.pigs.find(x=>x.id===id);if(!p||!p.alive)return'';const stage=E.phaseOf(p),free=E.freeCareRemaining(state);return `<div class="market-note interaction-chooser" style="margin-bottom:12px"><b>今日轻松关怀剩余 ${free}/2 次</b> · 每天前两只猪的短互动不推进日程，长互动仍按实际耗时。<br><span>选择适合${E.phaseName(p)}“${esc(p.name)}”的互动：</span><div class="interaction-choice-row">${D.INTERACTIONS[stage].map(it=>{const q=E.interactionTimeCost(state,p.id,it.id),cost=state.ended||q===0?'不推进日程':q===1?'1/4日':'半日';return `<button class="action-btn small" data-action="interact" data-pig="${p.id}" data-interaction="${it.id}">${it.name} · ${cost}</button>`}).join('')}</div></div>`}
  function cropResourceTip(id){const c=D.CROPS[id],uses=Object.entries(D.RECIPES).filter(([,r])=>r.ingredients[id]).map(([feedId,r])=>`${D.FEEDS[feedId].icon}${D.FEEDS[feedId].name}（每批需${r.ingredients[id]}份）`),seasons=c.seasons.map(n=>D.SEASONS[n-1]+'季').join('、');return `${c.icon} ${c.name}\n生长：${c.grow}日 · 季节：${seasons} · 基础收购价 ¥${c.sell}\n可制作：${uses.join('；')||'当前没有对应饲料配方'}`}
  function feedResourceTip(id){const f=D.FEEDS[id],r=D.RECIPES[id],ingredients=r?Object.entries(r.ingredients).map(([cropId,n])=>`${D.CROPS[cropId].icon}${D.CROPS[cropId].name}×${n}`).join(' + '):'集市直接购买',bonus=Math.floor((state?.facilities?.mill||0)/2),output=r?`${r.makes}袋${bonus?`（当前工坊 ${r.makes+bonus} 袋）`:''}`:'—';return `${f.icon} ${f.name}\n配方：${ingredients} → ${output}\n效果：饱食+${f.nutrition} · 耐饱${f.satiety}天 · 心情+${f.mood} · 生长${f.growth}×\n用途：${f.desc}`}
  function resourceAttrs(kind,id,className=''){const tip=kind==='crop'?cropResourceTip(id):feedResourceTip(id);return `class="${className} resource-help" tabindex="0" data-resource-tip="${esc(tip)}" aria-label="${esc(tip.replace(/\n/g,'；'))}"`}

  function renderFarm(){
    panelSetup('农田与作物','农场管理');const season=E.season(state);
    const harvestQ=E.harvestTimeCost(state),harvestLabel=harvestQ===1?'1/4日':harvestQ===2?'半日':'按成熟田数计算';$('#panel-body').innerHTML=`<div class="section-head"><div><h3>${D.SEASONS[season-1]}季田地 · ${state.fields.length} 块</h3><p>连续播种每3块田合计1/4日；统一浇水占1/4日；收获1—3块田占1/4日，4块以上占半日。HUD 显示当前天气，雨天在当日结算时自动浇水。将光标停在作物上可查看饲料用途。</p></div><div class="right-actions"><button class="action-btn" data-action="water" ${state.ended?'disabled':''}>💧 浇灌未浇田地 · 1/4日</button><button class="action-btn green" data-action="harvest" ${state.ended||!harvestQ?'disabled':''}>收获成熟作物 · ${harvestLabel}</button></div></div><div class="farm-layout"><div class="field-grid">${state.fields.map((f,i)=>plotHTML(f,i,season)).join('')}</div><div><h3 style="margin-top:0">粮仓库存</h3><div class="crop-inventory">${Object.entries(D.CROPS).map(([id,c])=>`<div ${resourceAttrs('crop',id,'crop-row')}><i>${c.icon}</i><div><b>${c.name}</b><small>作物 ${state.inventory.crops[id]||0} · 种子 ${state.inventory.seeds[id]||0}</small></div><span>¥${E.marketPrice(state,'crop',id,'sell')}</span></div>`).join('')}</div></div></div>`;
  }
  function plotHTML(f,i,season){if(!f.crop){const options=Object.entries(D.CROPS).map(([id,c])=>`<option value="${id}" ${!c.seasons.includes(season)?'disabled':''}>${c.name}（种${state.inventory.seeds[id]||0} · ${c.grow}日）</option>`).join(''),cost=E.plantTimeCost(state,i)?'1/4日':'本轮不另计时';return `<div class="plot empty"><div><b>第 ${i+1} 块田 · 空地</b><select class="plot-crop">${options}</select><button class="action-btn small" data-action="plant" data-plot="${i}" ${state.ended?'disabled':''}>播种 · ${cost}</button></div></div>`}const c=D.CROPS[f.crop],pct=Math.min(100,f.progress/c.grow*100);return `<div ${resourceAttrs('crop',f.crop,`plot ${f.ready?'ready':''}`)}><span class="crop-icon">${c.icon}</span><b>${c.name}${f.ready?' · 可收获':''}</b><small>${f.watered?'💧 已浇水':`生长 ${Math.floor(pct)}%`}</small><div class="meter" style="margin-top:7px"><span style="width:${pct}%"></span></div></div>`}

  function renderWorkshop(){
    panelSetup('饲料工坊','加工与配方');$('#panel-body').innerHTML=`<div class="section-head"><div><h3>把作物加工成专用饲料</h3><p>工坊 Lv.${state.facilities.mill} · 每份配方额外产出 ${Math.floor(state.facilities.mill/2)} 袋 · 当前耗时 ${state.facilities.mill>=3?'1/4日':'半日'}。悬停饲料卡可查看完整用途。</p></div></div><div class="recipe-list">${Object.entries(D.RECIPES).map(([id,r])=>{const f=D.FEEDS[id],ok=Object.entries(r.ingredients).every(([c,n])=>(state.inventory.crops[c]||0)>=n);return `<article ${resourceAttrs('feed',id,'recipe-card')}><div class="recipe-icon">${f.icon}</div><div><h4>${f.name} × ${r.makes+Math.floor(state.facilities.mill/2)}</h4><p>${f.desc} · 库存 ${state.inventory.feeds[id]||0}</p><div class="ingredients">${Object.entries(r.ingredients).map(([c,n])=>`<span class="ingredient ${(state.inventory.crops[c]||0)<n?'missing':''}">${D.CROPS[c].name} ${state.inventory.crops[c]||0}/${n}</span>`).join('')}</div></div><button class="action-btn ${ok?'green':''}" data-action="craft" data-feed="${id}" ${!ok||state.ended?'disabled':''}>制作 · ${state.facilities.mill>=3?'1/4日':'半日'}</button></article>`}).join('')}</div>`;
  }

  function contractRequirementText(req,showOwned=false){const item=req.type==='crop'?D.CROPS[req.itemId]:req.type==='feed'?D.FEEDS[req.itemId]:{icon:'💊',name:'常备兽药'},owned=showOwned?E.contractRequirementOwned(state,req):null;return `${item?.icon||'□'} ${item?.name||req.itemId}×${req.qty}${showOwned?`（${owned}/${req.qty}）`:''}`;}
  function contractText(c){if(!c)return '未知合同';if(c.type==='crop')return `${D.CROPS[c.itemId].icon} ${D.CROPS[c.itemId].name}×${c.qty}`;if(c.type==='feed')return `${D.FEEDS[c.itemId].icon} ${D.FEEDS[c.itemId].name}×${c.qty}`;if(c.type==='mixed')return `📦 ${c.title||'混合供货'}：${(c.requirements||[]).map(req=>contractRequirementText(req)).join(' + ')}`;return `🐖 ${c.role} · 至少${c.minWeight}kg · 无疾病`;}
  function mixedContractHTML(c){if(c.type!=='mixed')return '';return `<div class="mixed-requirements">${c.requirements.map(req=>{const owned=E.contractRequirementOwned(state,req),ok=owned>=req.qty;return `<span class="${ok?'ready':'missing'}">${contractRequirementText(req,true)}</span>`}).join('')}</div>`;}
  const MARKET_STALL_UI={
    produce:{title:'蔬果粮店',kicker:'只经营种子与农作物',tabs:[{id:'buy-crops',label:'种子与作物'}]},
    supplies:{title:'青石饲料铺',kicker:'只经营成品饲料',tabs:[{id:'buy-feeds',label:'购买饲料'}]},
    goods:{title:'杂货药铺',kicker:'只经营常备兽药',tabs:[{id:'buy-medicine',label:'购买兽药'}]},
    livestock:{title:'何伯牲畜行',kicker:'只经营猪只',tabs:[{id:'pigbuy',label:'购买猪只'}]},
    contracts:{title:'集市合同板',kicker:'接单与整单交付',tabs:[{id:'contracts',label:'查看合同'}]},
    stall:{title:'我的集市摊位',kicker:'每个栏目只陈列一种商品',tabs:[{id:'sell-crops',label:'出售作物'},{id:'sell-feeds',label:'出售饲料'},{id:'sell-medicine',label:'出售兽药'},{id:'pigsell',label:'出售自养猪'}]}
  };
  function marketStallForTab(tab){if(tab==='buy-crops')return'produce';if(tab==='buy-feeds')return'supplies';if(tab==='buy-medicine')return'goods';if(tab==='pigbuy')return'livestock';if(tab==='contracts')return'contracts';return'stall'}
  function renderMarket(tab='buy-crops'){
    const stallId=activeMarketStall||marketStallForTab(tab),cfg=MARKET_STALL_UI[stallId]||MARKET_STALL_UI.produce,allowed=cfg.tabs.map(item=>item.id);if(!allowed.includes(tab))tab=allowed[0];currentTab=tab;panelSetup(state.yearEnd?`年底年市 · ${cfg.title}`:cfg.title,state.yearEnd?`第${state.year}年固定交易环节 · ${cfg.kicker}`:`${cfg.kicker} · 返回农场时结算 ${timeCost(E.returnTripCost(state,4))}`,cfg.tabs,tab);const body=$('#panel-body');
    const annual=state.yearEnd?`<div class="market-note">🧧 年底年市期间可自由买卖，不额外消耗时间。交易完成后才能进入下一年。 ${state.year<3?'<button class="action-btn green" data-action="finish-year">结束年市，迎接新年</button>':''}</div>`:'';
    const stallNote=stallId==='stall'?`<div class="market-note" style="margin-top:${annual?'8':'0'}px">🏮 这里是你的摊位。每个栏目只陈列一种商品；猪只会登记在旁边的安全寄存栏，不会与普通货品混卖。</div>`:'';
    if(['buy-crops','buy-feeds','buy-medicine','sell-crops','sell-feeds','sell-medicine'].includes(tab)){
      const mode=tab.startsWith('buy-')?'buy':'sell',category=tab.split('-')[1],names={crops:'种子与农作物',feeds:'成品饲料',medicine:'常备兽药'};body.innerHTML=annual+stallNote+`<div class="section-head" style="margin-top:12px"><div><h3>${mode==='buy'?'购买':'出售'}${names[category]}</h3><p>本摊位只显示这一类商品；将光标停在作物或饲料上可查看配方关系。</p></div></div><div class="market-list">${marketItems(mode,category)}</div>`;
    }else if(tab==='pigbuy'){
      body.innerHTML=annual+`<div class="section-head" style="margin-top:12px"><div><h3>猪仔与成熟猪</h3><p>每次赶集会刷新货源；成年猪更贵但能立即配种或参赛。</p></div><span class="pill">猪圈 ${E.livePigs(state).length}/${E.capacity(state)}</span></div><div class="market-list">${state.marketOffers.map(o=>{const b=E.breed(o.breedId);return `<article data-breed="${esc(b.id)}" class="market-row pig-offer" style="--offer:${b.color}"><div class="market-icon"></div><div><h4>${esc(b.name)} · ${o.adult?'成年':'猪仔'}${o.sex==='female'?'母':'公'}</h4><p><span class="pill ${b.role==='肉猪'?'meat':b.role==='宠物猪'?'pet':'breed'}">${b.role}</span> ${esc(b.trait)}</p></div><button class="action-btn green" data-action="buy-pig" data-offer="${o.id}">¥${money(o.price)}</button></article>`}).join('')}</div>`;
    }else if(tab==='pigsell'){
      const pigs=E.livePigs(state);body.innerHTML=annual+stallNote+`<div class="section-head" style="margin-top:12px"><div><h3>出售自养猪</h3><p>成交价由品种、成熟度、健康、心情与宠物猪亲密度共同决定。售出后不可撤回。</p></div></div><div class="pig-grid">${pigs.map(p=>{const b=E.breed(p.breedId);return `<article class="pig-card" style="--pig-color:${b.color}"><div class="pig-card-head"><div class="pig-avatar" data-breed="${esc(b.id)}"></div><div class="pig-title"><h3>${esc(p.name)}</h3><p>${esc(b.name)} · ${p.weight}kg · 健康${Math.round(p.health)}</p></div></div><button class="action-btn red" data-action="sell-pig" data-pig="${p.id}" style="margin-top:10px">卖出 · ¥${money(E.pigValue(state,p))}</button></article>`}).join('')}</div>`;
    }else{
      const cs=E.refreshContracts(state),today=E.totalDay(state);body.innerHTML=annual+`<div class="section-head" style="margin-top:12px"><div><h3>五日合同板</h3><p>合同接取、交货都不额外耗时；最多同时3份。混合合同必须备齐全部货物才会一次性交付，缺货时不会部分扣除。</p></div><span class="pill">第${today}日</span></div><h3>已接合同</h3><div class="contract-grid">${cs.active.length?cs.active.map(c=>{const pigs=c.type==='pig'?E.contractEligiblePigs(state,c):[],ready=E.contractReady(state,c);return `<article class="contract-card active ${c.type==='mixed'?'mixed':''}"><small>截止第${c.deadline}日 · 剩${Math.max(0,c.deadline-today)}日</small><h4>${contractText(c)}</h4>${mixedContractHTML(c)}<p>交付报酬 ¥${money(c.reward)} · 口碑+2</p>${c.type==='pig'?`<select data-contract-pig>${pigs.map(p=>`<option value="${p.id}">${esc(p.name)} · ${p.weight}kg</option>`).join('')}</select>`:''}<button class="action-btn ${ready?'green':''}" data-action="contract-complete" data-contract="${c.id}" ${!ready?'disabled':''}>${ready?'整单交付':'尚未备齐'}</button></article>`}).join(''):'<div class="empty-state"><b>▤</b>还没有承接合同</div>'}</div><h3>本期可接</h3><div class="contract-grid">${cs.offers.length?cs.offers.map(c=>`<article class="contract-card ${c.type==='mixed'?'mixed':''}"><small>${c.type==='mixed'?'多品类联合订单':'本期合同'} · 承接后7日内交付</small><h4>${contractText(c)}</h4>${mixedContractHTML(c)}<p>报酬 ¥${money(c.reward)} · 未接取不会产生惩罚</p><button class="action-btn green" data-action="contract-accept" data-contract="${c.id}" ${cs.active.length>=3?'disabled':''}>承接合同</button></article>`).join(''):'<div class="empty-state"><b>✓</b>本期合同已经全部处理</div>'}</div><h3>最近记录</h3><div class="rival-history">${cs.history.slice(0,6).map(c=>`<div class="${c.status==='complete'?'win':'loss'}"><span>${contractText(c)}</span><b>${c.status==='complete'?'已完成':'已逾期'}</b></div>`).join('')||'<div class="empty-state">暂无合同记录</div>'}</div>`;
    }
    syncPigArt();
  }
  function marketItems(mode,category){
    const rows=[];
    if(category==='crops')Object.entries(D.CROPS).forEach(([id,c])=>rows.push(`<article ${resourceAttrs('crop',id,'market-row')}><div class="market-icon">${c.icon}</div><div><h4>${c.name}${mode==='buy'?' / 种子':''}</h4><p>库存 作物${state.inventory.crops[id]||0} · 种子${state.inventory.seeds[id]||0} · ${c.grow}日成熟</p></div><div class="market-actions">${mode==='buy'?`<button class="action-btn small" data-action="trade" data-type="seed" data-id="${id}" data-mode="buy">种子 ¥${E.marketPrice(state,'seed',id,'buy')}</button><button class="action-btn small" data-action="trade" data-type="crop" data-id="${id}" data-mode="buy">作物 ¥${E.marketPrice(state,'crop',id,'buy')}</button>`:`<button class="action-btn small" data-action="trade" data-type="crop" data-id="${id}" data-mode="sell">卖1 ¥${E.marketPrice(state,'crop',id,'sell')}</button><button class="action-btn small" data-action="trade" data-type="crop" data-id="${id}" data-mode="sell" data-qty="5">卖5</button>`}</div></article>`));
    if(category==='feeds')Object.entries(D.FEEDS).forEach(([id,f])=>rows.push(`<article ${resourceAttrs('feed',id,'market-row')}><div class="market-icon">${f.icon}</div><div><h4>${f.name}</h4><p>${f.desc} · 库存${state.inventory.feeds[id]||0}</p></div><div class="market-actions"><button class="action-btn small" data-action="trade" data-type="feed" data-id="${id}" data-mode="${mode}">${mode==='buy'?'买1':'卖1'} ¥${E.marketPrice(state,'feed',id,mode)}</button>${mode==='buy'?`<button class="action-btn small" data-action="trade" data-type="feed" data-id="${id}" data-mode="buy" data-qty="5">买5</button>`:''}</div></article>`));
    if(category==='medicine')rows.push(`<article class="market-row"><div class="market-icon">💊</div><div><h4>常备兽药</h4><p>治疗疾病时消耗 · 库存${state.inventory.medicine}</p></div><button class="action-btn small" data-action="trade" data-type="medicine" data-id="medicine" data-mode="${mode}">${mode==='buy'?'买1':'卖1'} ¥${E.marketPrice(state,'medicine','medicine',mode)}</button></article>`);
    return rows.join('');
  }

  function renderBuild(tab='facilities'){
    currentTab=tab;const staff=E.staffState(state),active=Object.values(staff.employees).filter(Boolean).length,daily=Object.entries(staff.employees).filter(([,on])=>on).reduce((n,[id])=>n+D.STAFF[id].wage,0);panelSetup('农场建设与雇员','长期经营',[{id:'facilities',label:'设施升级'},{id:'staff',label:`雇员 ${active}/${E.staffSlots(state)}`}],tab);
    if(tab==='staff'){$('#panel-body').innerHTML=`<div class="section-head"><div><h3>雇员排班</h3><p>雇用、解雇和调整排班不消耗日程。每天清晨自动结算工资；资金不足时对应雇员暂停工作。</p></div><span class="pill">日薪合计 ¥${money(daily)}</span></div><div class="staff-summary"><span>第${state.year}年岗位 ${active}/${E.staffSlots(state)}</span><span>累计工资 ¥${money(staff.totalWages)}</span><span>${staff.lastReport?esc(staff.lastReport):'尚无今日雇员日报'}</span></div><div class="staff-grid">${Object.entries(D.STAFF).map(([id,p])=>{const on=staff.employees[id],unlocked=E.totalDay(state)>=p.unlock,full=active>=E.staffSlots(state);return `<article class="staff-card ${on?'active':''}"><div class="staff-icon">${p.icon}</div><div><h3>${p.name}</h3><p>${p.desc}</p><small>签约 ¥${money(p.hire)} · 日薪 ¥${money(p.wage)} · ${unlocked?'已解锁':`第${p.unlock}日解锁`}</small></div><button class="action-btn ${on?'red':unlocked&&!full?'green':''}" data-action="${on?'staff-dismiss':'staff-hire'}" data-staff="${id}" ${!on&&(!unlocked||full||state.ended)?'disabled':''}>${on?'结束雇用':'立即雇用'}</button></article>`}).join('')}</div>`;return;}
    $('#panel-body').innerHTML=`<div class="section-head"><div><h3>改善环境，建立长期增益</h3><p>建造会消耗 1—2 个游戏日；若本年剩余时间不足，工程不会开工，也不会扣款。</p></div><span class="pill">可用资金 ¥${money(state.money)}</span></div><div class="build-grid">${Object.entries(D.FACILITIES).map(([id,f])=>{const lv=state.facilities[id]||0,cost=Math.round(f.base*Math.pow(1.65,lv));return `<article class="build-card"><div class="build-icon">${f.icon}</div><div><h4>${f.name} · Lv.${lv}/${f.max}</h4><p>${f.desc}</p><div class="level-pips">${Array.from({length:f.max},(_,i)=>`<i class="${i<lv?'on':''}"></i>`).join('')}</div></div><button class="action-btn ${state.money>=cost?'green':''}" data-action="upgrade" data-facility="${id}" ${lv>=f.max||state.ended?'disabled':''}>${lv>=f.max?'已满级':`¥${money(cost)} · ${f.days}日`}</button></article>`}).join('')}</div>`;
  }
  function breedCard(b){return `<article class="breed-card"><div class="breed-card-head"><div class="breed-swatch" data-breed="${esc(b.id)}"></div><div><h4>${esc(b.name)}</h4><small>${esc(b.origin)} · ${b.role}</small></div></div><p class="breed-appearance">${esc(window.PIG_ART[b.id].note)}</p><p>${esc(b.trait)}</p><div class="breed-stats"><span>成熟 ${b.adult}日</span><span>耗料 ${b.feed}</span><span>成长 ×${b.growth}</span><span>耐病 ×${b.hardy}</span><span>心情 ×${b.mood}</span><span>产仔 ${b.litter[0]}–${b.litter[1]}</span></div></article>`}
  function renderCatalog(filter='all'){
    currentTab=filter;panelSetup('猪种图鉴','28 种独立外观 · 毛色、耳形与体态');const list=filter==='all'?D.BREEDS:D.BREEDS.filter(b=>b.role===filter);
    $('#panel-body').innerHTML=`<div class="catalog-filter"><button data-filter="all" class="${filter==='all'?'active':''}">全部 ${D.BREEDS.length}</button><button data-filter="肉猪" class="${filter==='肉猪'?'active':''}">肉猪</button><button data-filter="宠物猪" class="${filter==='宠物猪'?'active':''}">宠物猪</button><button data-filter="繁育猪" class="${filter==='繁育猪'?'active':''}">繁育猪</button></div><div class="catalog-grid">${list.map(breedCard).join('')}</div>`;
    syncPigArt();
  }
  function renderJournal(tab='ledger'){
    const rival=E.rivalState(state);currentTab=tab;panelSetup('农场账本','存档与记录',[{id:'ledger',label:'三年统计'},{id:'log',label:'行动日志'},{id:'saves',label:'存档管理'}],tab);const b=$('#panel-body');
    if(tab==='ledger')b.innerHTML=`<div class="journal-layout"><div class="ledger"><h3>${esc(state.farmName)} · 第${state.year}年</h3>${[['总游戏日',`${Math.min(180,E.totalDay(state))} / 180`],['行动次数',state.actionCount],['当前资金',`¥${money(state.money)}`],['累计收入',`¥${money(state.stats.earned)}`],['累计支出',`¥${money(state.stats.spent)}`],['收获作物',`${state.stats.cropsHarvested}份`],['出生仔猪',`${state.stats.pigsBorn}只`],['售出猪只',`${state.stats.pigsSold}只`],['治愈疾病',`${state.stats.illnessCured}次`],['处理事件',`${state.stats.eventsResolved}件`],['拜访石桥牧场',`${rival.visits}次`],['训练赛战绩',`${rival.practiceWins}胜${rival.practiceLosses}负`]].map(([a,c])=>`<div class="ledger-row"><span>${a}</span><b>${c}</b></div>`).join('')}</div><div class="ledger"><h3>设施与猪群</h3>${Object.entries(D.FACILITIES).map(([id,f])=>`<div class="ledger-row"><span>${f.icon} ${f.name}</span><b>Lv.${state.facilities[id]||0}</b></div>`).join('')}<div class="ledger-row"><span>活猪 / 容量</span><b>${E.livePigs(state).length} / ${E.capacity(state)}</b></div><div class="ledger-row"><span>口碑</span><b>${state.reputation}</b></div><div class="ledger-row"><span>与陆野关系</span><b>${rival.rapport} / 20</b></div></div></div>`;
    else if(tab==='log')b.innerHTML=`<div class="log-list">${state.journal.map(l=>`<div class="log-row ${l.type}"><span>${esc(l.at)}</span><b>${esc(l.text)}</b></div>`).join('')}</div>`;
    else b.innerHTML=`<div class="section-head"><div><h3>本地账本</h3><p>每次行动和交易都会自动保存。JSON 文件可以导出，也可以作为新存档恢复。</p></div></div><div class="build-grid"><article class="build-card"><div class="build-icon">▣</div><div><h4>立即保存</h4><p>覆盖当前账本中的这一份存档。</p></div><button class="action-btn green" data-action="save">保存</button></article><article class="build-card"><div class="build-icon">⇩</div><div><h4>导出备份</h4><p>下载当前农场的 JSON 账本文件。</p></div><button class="action-btn" data-action="export">导出</button></article><article class="build-card"><div class="build-icon">⇧</div><div><h4>导入备份</h4><p>校验 JSON 后恢复为独立的新存档，不覆盖当前进度。</p></div><button class="action-btn" data-action="import">导入</button></article><article class="build-card"><div class="build-icon">↩</div><div><h4>返回标题</h4><p>从标题页载入其他存档或新建农场。</p></div><button class="action-btn" data-action="home">返回</button></article></div>`;
  }

  function handleAction(r,success='行动完成',rerender=true){
    closeConfirm();if(!r||!r.ok){audio.sfx('bad');toast(r?.error||'行动失败','error');return false}E.storyUpdate(state);const beforeDay=displayedTotalDay??E.totalDay(state),afterDay=E.totalDay(state),wakeHome=afterDay>beforeDay&&!state.ended&&!state.yearEnd&&state.location!=='farm';if(wakeHome){state.location='farm';revealFarm(false)}audio.sfx('good');toast(success,'success');saveCurrent();renderHUD();renderWorldPigs();if(afterDay>beforeDay)queueDayTransitions(beforeDay,afterDay);displayedTotalDay=afterDay;
    if(state.ended&&!r.noTime){closePanel();setTimeout(continueFinalSequence,180);return true}if(state.pendingEvent){closePanel();setTimeout(showEvent,180);return true}if(state.yearEnd?.type==='annual'&&!marketActive){closePanel();setTimeout(enterMarketScene,180);return true}if(rerender&&currentPanel)renderPanel(currentPanel,currentTab);setTimeout(showPendingStory,afterDay>beforeDay?1250:240);return true;
  }
  function showEvent(){
    if(!state?.pendingEvent)return;const e=state.pendingEvent,fallback={trader:'merchant',wolf:'farmer',neighbor:'merchant',vet:'vet',storm:'farmer',inspector:'vet',gift:'rival',boar:'merchant'},lines=e.dialogue?.length?e.dialogue:[{portrait:e.portrait||fallback[e.type]||'farmer',name:e.speaker||'小禾',text:e.text}];
    $('#event-overlay').classList.add('hidden');audio.sfx('bad');showDialogueSequence(lines,()=>showDialogueChoices(e.portrait||fallback[e.type]||'farmer',e.speaker||'小禾',e.prompt||'你准备怎么处理？',e.choices))
  }
  function showDialogue(kind,name,text,callback){
    clearInterval(dialogTimer);dialogueChoicesActive=false;dialogFull=text;dialogCallback=callback||null;$('#dialogue').className='dialogue';$('#dialogue-choices').className='dialogue-choices hidden';$('#dialogue-choices').innerHTML='';$('#portrait').className='portrait '+kind;$('#speaker').textContent=name;$('#dialogue-text').textContent='';let i=0;dialogTimer=setInterval(()=>{i+=2;$('#dialogue-text').textContent=text.slice(0,i);if(i>=text.length)clearInterval(dialogTimer)},24)
  }
  function showDialogueSequence(lines,callback){const queue=(lines||[]).map(line=>Array.isArray(line)?{portrait:line[0],name:line[1],text:line[2]}:line);const next=()=>{const line=queue.shift();if(!line){if(callback)callback();return}showDialogue(line.portrait||'farmer',line.name||state?.playerName||'小禾',line.text||'',next)};next()}
  function showPendingStory(){if(!state||state.pendingEvent||state.yearEnd||state.ended||!$('#dialogue').classList.contains('hidden'))return;const scene=E.consumeStoryScene(state);if(!scene)return;saveCurrent();showDialogueSequence(scene.lines,()=>{renderHUD();saveCurrent();setTimeout(showPendingStory,180)})}
  function continueFinalSequence(){
    if(!state?.ended)return;const scene=E.consumeStoryScene(state);
    if(scene){saveCurrent();showDialogueSequence(scene.lines,()=>{renderHUD();saveCurrent();setTimeout(continueFinalSequence,180)});return}
    if(state.ending?.ceremonyPending)enterExtraScene('contest');else if(!state.ending?.viewed)showEnding();
  }
  function showDialogueChoices(kind,name,text,choices){
    clearInterval(dialogTimer);dialogueChoicesActive=true;dialogFull=text;dialogCallback=null;$('#dialogue').className='dialogue has-choices';$('#portrait').className='portrait '+kind;$('#speaker').textContent=name;$('#dialogue-text').textContent='';const box=$('#dialogue-choices');box.className='dialogue-choices';box.innerHTML=(choices||[]).map(c=>`<button class="pixel-btn" data-event-choice="${c.id}">${esc(c.label)}</button>`).join('');let i=0;dialogTimer=setInterval(()=>{i+=2;$('#dialogue-text').textContent=text.slice(0,i);if(i>=text.length)clearInterval(dialogTimer)},24)
  }
  function closeDialogue(){if(dialogueChoicesActive)return;clearInterval(dialogTimer);$('#dialogue').className='dialogue hidden';const cb=dialogCallback;dialogCallback=null;if(cb)cb()}
  function resolveEventChoice(choice){
    if(!state?.pendingEvent)return;const event=state.pendingEvent,portrait=event.portrait||'farmer',speaker=event.speaker||state.playerName,resumeMarket=marketAfterEvent||state.pendingDestination==='market',resumeRival=rivalAfterEvent||state.pendingDestination==='rival',r=E.resolveEvent(state,choice);marketAfterEvent=false;rivalAfterEvent=false;state.pendingDestination=null;dialogueChoicesActive=false;$('#dialogue').className='dialogue hidden';E.storyUpdate(state);audio.sfx('good');saveCurrent();renderHUD();renderWorldPigs();showDialogue(portrait,speaker,r.result||'事情已经处理妥当。',()=>{if(resumeMarket)enterMarketScene();else if(resumeRival)enterRivalScene();else if(rivalActive)$('#rival-world').focus();else if(marketActive)$('#market-world').focus();else if(extraActive)$('#extra-world').focus();else $('#world').focus();setTimeout(showPendingStory,180)})
  }
  function showEnding(){
    if(!state?.ending)return;const e=state.ending;$('#ending-cup').textContent=e.win?'🏆':'🎗️';$('#ending-title').textContent=e.title;$('#ending-text').textContent=e.text;$('#ranking-list').innerHTML=e.rankings.map((r,i)=>`<div class="rank-row ${r.player?'player':''}"><b>#${i+1}</b><div><b>${esc(r.name)} · ${esc(r.breed)}</b><small>${esc(r.farm)}</small></div><strong>${r.score}分</strong></div>`).join('');$('#ending-overlay').classList.remove('hidden');audio.sfx(e.win?'save':'click')
  }
  let exportPending=false;
  async function exportSave(){
    if(!state||exportPending)return false;exportPending=true;
    try{
      saveCurrent();const name=`${state.farmName}-第${state.year}年-存档.json`.replace(/[\\/:*?"<>|]/g,'-'),blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
      const mobile=(window.matchMedia&&window.matchMedia('(pointer: coarse)').matches)||/iPhone|iPad|iPod/.test(navigator.userAgent);
      const file=typeof File==='function'?new File([blob],name,{type:'application/json'}):null;let canShare=false;
      if(mobile&&file&&typeof navigator.share==='function'&&typeof navigator.canShare==='function'){try{canShare=navigator.canShare({files:[file]})}catch(_){}}
      if(canShare){
        try{await navigator.share({files:[file],title:'豚物语存档备份'});toast('存档已交给分享面板，请保存到“文件”以便备份。','success');return true}
        catch(error){if(error?.name==='AbortError')return false;}
      }
      const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('备份文件已导出','success');return true;
    }finally{exportPending=false;}
  }
  async function importSaveFile(file){
    if(!file)return false;try{
      const raw=JSON.parse(await file.text()),imported=E.migrate(E.clone(raw)),check=E.validate(imported);if(!check.ok)throw new Error(check.errors.join('、'));
      const existing=getSaves();if(existing.length>=8)throw new Error('本地已有 8 份存档，请先在标题页删除一份旧账本。');
      imported.id='save_import_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);imported.createdAt=Date.now();imported.updatedAt=Date.now();imported.settings=Object.assign({},prefs,imported.settings||{});
      const saves=[E.clone(imported),...existing].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));if(!setSaves(saves))return false;
      toast(`已导入“${imported.farmName}”，返回标题即可载入。`,'success');renderSaveList();if(currentPanel==='journal'&&currentTab==='saves')renderJournal('saves');return true;
    }catch(error){toast('导入失败：'+(error?.message||'文件不是有效存档'),'error');return false}
  }

  $('#panel-body').addEventListener('click',e=>{
    const filter=e.target.closest('[data-filter]');if(filter){renderCatalog(filter.dataset.filter);return}
    const btn=e.target.closest('[data-action]');if(!btn)return;audio.ensure();const a=btn.dataset.action;
    if(a==='interact-open'){interactionPig=btn.dataset.pig;renderPigs('herd')}
    else if(a==='interact'){const p=state.pigs.find(x=>x.id===btn.dataset.pig),it=D.INTERACTIONS[E.phaseOf(p)].find(x=>x.id===btn.dataset.interaction);const r=E.interact(state,p.id,it.id);if(r.ok)audio.sfx('pig');handleAction(r,`${p.name}${it.name}，心情变好了${r.freeCare?' · 今日轻松关怀':''}`)}
    else if(a==='feed-pig'){const p=state.pigs.find(x=>x.id===btn.dataset.pig),select=btn.closest('.feed-pig-card')?.querySelector('[data-pig-feed-select]'),feedId=select?.value,r=E.feedPig(state,p?.id,feedId);if(r.ok)audio.sfx('pig');handleAction(r,r.ok?`${p.name}吃下${D.FEEDS[feedId].name} · ${r.preference}`:'喂养失败')}
    else if(a==='treat'){const p=state.pigs.find(x=>x.id===btn.dataset.pig);confirmBox('治疗疾病',`为${p.name}治疗会消耗兽药并占用半日。治疗可能需要不止一次。`,()=>handleAction(E.treat(state,p.id),`已为${p.name}治疗`),false)}
    else if(a==='dispose'){const p=state.pigs.find(x=>x.id===btn.dataset.pig);confirmBox('处理死猪并消毒',`必须及时处理${p.name}，否则每经过一个完整游戏日，疫病传播风险都会继续上升。处理占用半日。`,()=>handleAction(E.dispose(state,p.id),'遗体已妥善处理，猪圈完成消毒'))}
    else if(a==='breed'){handleAction(E.breedPigs(state,$('#mother-select').value,$('#father-select').value),'配种安排完成')}
    else if(a==='plant'){const sel=btn.closest('.plot').querySelector('.plot-crop');handleAction(E.plant(state,+btn.dataset.plot,sel.value),`已播种${D.CROPS[sel.value].name}`)}
    else if(a==='water')handleAction(E.waterAll(state),'田地浇水完成')
    else if(a==='harvest')handleAction(E.harvestAll(state),'成熟作物已入库')
    else if(a==='craft')handleAction(E.craft(state,btn.dataset.feed),`制成${D.FEEDS[btn.dataset.feed].name}`)
    else if(a==='trade'){const r=E.tradeItem(state,btn.dataset.type,btn.dataset.id,btn.dataset.mode,+(btn.dataset.qty||1));if(r.ok){E.storyUpdate(state);audio.sfx('click');toast(`${btn.dataset.mode==='buy'?'买入':'卖出'}成交 · ¥${money(r.total)}`,'success');saveCurrent();renderHUD();renderMarket(currentTab);setTimeout(showPendingStory,180)}else toast(r.error,'error')}
   else if(a==='buy-pig'){const offer=state.marketOffers.find(o=>o.id===btn.dataset.offer),b=E.breed(offer.breedId);confirmBox('买下这只猪',`${b.name}，${offer.adult?'成年':'猪仔'}${offer.sex==='female'?'母':'公'}猪，价格 ¥${money(offer.price)}。`,()=>{const r=E.buyPig(state,offer.id);if(handleAction(r,'新猪已经送到猪圈')&&!state.pendingEvent)showDialogue('merchant','何伯',`好眼光！${r.pig.name}往后就是你农场的一员了。不同品种脾气不一样，记得按它的路线照料。`,showPendingStory)},false)}
    else if(a==='sell-pig'){const p=state.pigs.find(x=>x.id===btn.dataset.pig);confirmBox('确认出售',`${p.name}将以 ¥${money(E.pigValue(state,p))} 成交，之后只能在离场记录中查看。`,()=>handleAction(E.sellPig(state,p.id),`${p.name}已经成交`))}
    else if(a==='upgrade'){const id=btn.dataset.facility,f=D.FACILITIES[id],lv=state.facilities[id]||0,cost=Math.round(f.base*Math.pow(1.65,lv));confirmBox(`升级${f.name}`,`花费 ¥${money(cost)}，并占用 ${f.days} 个游戏日。`,()=>handleAction(E.upgrade(state,id),`${f.name}升级完成`),false)}
   else if(a==='rival-practice'){const p=state.pigs.find(x=>x.id===btn.dataset.pig);confirmBox('参加石桥训练赛',`带${p.name}与黑将军进行一次模拟评分，占用半日；本季只能参加一次。`,()=>{const r=E.practiceRival(state,p.id);if(handleAction(r,r.ok?`${p.name}完成训练赛 · ${r.playerScore}:${r.rivalScore}`:'训练赛未开始',false)&&!state.pendingEvent){closePanel();showDialogue('rival','陆野',r.win?`${p.name}这次赢得干净。记住这种状态，正式比赛时黑将军会更强。`:`黑将军这次占了上风。不过${p.name}没有乱阵脚，这场训练不算白来。`,showPendingStory)}},false)}
    else if(a==='travel-extra'){
      const place=btn.dataset.place,cfg=EXTRA_SCENES[place],visit={forest:E.visitForest,village:E.visitVillage,contest:E.visitContest}[place];
      if(!cfg||!visit)return toast('这个地点暂时无法前往。','error');
      const r=visit(state);if(handleAction(r,`来到了${cfg.title}`,false))enterExtraScene(place);
    }
    else if(a==='village-quest'){
      const r=E.completeVillageQuest(state);
     if(handleAction(r,r.ok?`委托完成 · 获得 ¥${money(r.reward)}`:'委托交付失败')&&!state.pendingEvent)showDialogue('merchant','何伯','货物数目和成色都对。报酬已经记进你的农场账本，下期委托会在新的五日周期张贴。',showPendingStory);
    }
    else if(a==='contest-enter'){
      const p=state.pigs.find(x=>x.id===btn.dataset.pig),category=btn.closest('.contest-entry-card')?.querySelector('[data-contest-category]')?.value||'overall',labels={overall:'综合状态',body:'体格与生长',health:'健康与稳定',bond:'亲和与配合'};
      if(!p)return toast('没有找到参赛猪。','error');
     confirmBox('登记季度评比',`带${p.name}参加“${labels[category]}”项目，占用1个游戏日；本季只能报名一次。`,()=>{const r=E.enterLocalContest(state,p.id,category);if(handleAction(r,r.ok?`${p.name}完成评比 · ${r.playerScore}:${r.rivalScore}`:'赛事未能开始',false)&&!state.pendingEvent){closePanel();const medal=r.medal==='gold'?'金奖':r.medal==='silver'?'银奖':'参与奖';showDialogue('vet','林医生',`${p.name}本次获得${medal}，评审分数 ${r.playerScore}，对照组 ${r.rivalScore}。季度成绩会留下记录，但最终大赛仍按第三年结束时的真实状态重新评审。`,showPendingStory)}},false);
    }
   else if(a==='festival-enter'){const p=state.pigs.find(x=>x.id===btn.dataset.pig),def=E.festivalDefinition(state);if(!p)return toast('没有找到参赛猪。','error');confirmBox(`参加${def.name}`,`带${p.name}进入本季专属小游戏。完成后统一结算半日；中途退出不耗时，也不占用报名名额。`,()=>startFestivalGame(p.id),false)}
    else if(a==='contract-accept')handleAction(E.acceptContract(state,btn.dataset.contract),'合同已承接')
    else if(a==='contract-complete'){const card=btn.closest('.contract-card'),pigId=card?.querySelector('[data-contract-pig]')?.value,contract=E.contractState(state).active.find(c=>c.id===btn.dataset.contract);confirmBox('交付合同',`${contractText(contract)} 将从库存或猪群中移交，完成后不可撤回。`,()=>handleAction(E.completeContract(state,contract.id,pigId),`合同完成 · ¥${money(contract.reward)}`),false)}
    else if(a==='staff-hire'){const id=btn.dataset.staff,p=D.STAFF[id];confirmBox(`雇用${p.name}`,`签约费 ¥${money(p.hire)}，之后每天自动结算日薪 ¥${money(p.wage)}。排班本身不消耗日程。`,()=>handleAction(E.hireStaff(state,id),`${p.name}加入农场`),false)}
    else if(a==='staff-dismiss'){const id=btn.dataset.staff,p=D.STAFF[id];handleAction(E.dismissStaff(state,id),`${p.name}已结束本期工作`)}
    else if(a==='story-choice'){const type=btn.dataset.storyType,value=btn.dataset.value,apply=()=>handleAction(E.chooseStory(state,type,value),'主线记录已更新');if(type==='decision'&&value==='短期冲重')confirmBox('采用短期冲重',`候选猪会立即增加少量体重，但损失健康，且这段记录会保留。这个选择不消耗日程。`,apply,false);else apply()}
    else if(a==='finish-year'){confirmBox('结束年市',`确认结束第${state.year}年？离开后要等到下一年年底才能再次进入免计时年市。`,()=>{const old=state.year,r=E.finishYear(state);if(handleAction(r,`第${old+1}年开始了`,false)){closePanel();leaveMarketScene(false);setTimeout(showPendingStory,260)}},false)}
    else if(a==='save')saveCurrent(true);else if(a==='export')exportSave();else if(a==='import')$('#save-import-input').click();else if(a==='home')returnTitle();
  });

  $('#panel-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)renderPanel(currentPanel,b.dataset.tab)});
  $('#event-choices').addEventListener('click',e=>{const b=e.target.closest('[data-event-choice]');if(b)resolveEventChoice(b.dataset.eventChoice)});
  $('#dialogue-choices').addEventListener('click',e=>{e.stopPropagation();const b=e.target.closest('[data-event-choice]');if(b)resolveEventChoice(b.dataset.eventChoice)});
  $('#dialogue').addEventListener('click',e=>{if(e.target.closest('[data-event-choice]'))return;if($('#dialogue-text').textContent!==dialogFull){clearInterval(dialogTimer);$('#dialogue-text').textContent=dialogFull}else if(!dialogueChoicesActive)closeDialogue()});
  $('#festival-game-start').onclick=beginFestivalGame;$('#festival-game-abandon').onclick=()=>closeFestivalGame();$('#festival-result-close').onclick=closeFestivalResult;
  $('#festival-game-stage').addEventListener('click',e=>{const flower=e.target.closest('[data-festival-flower]');if(flower)return chooseFestivalFlower(flower.dataset.festivalFlower,flower);if(e.target.closest('[data-festival-mud]'))return hitFestivalMud();const direction=e.target.closest('[data-festival-direction]');if(direction)inputFestivalDirection(direction.dataset.festivalDirection)});
  $('#confirm-cancel').onclick=closeConfirm;$('#confirm-ok').onclick=()=>{const cb=confirmCallback;confirmCallback=null;$('#confirm-overlay').classList.add('hidden');if(cb)cb()};
  $$('[data-close="panel"]').forEach(b=>b.onclick=closePanel);$$('[data-close="new-save"]').forEach(b=>b.onclick=()=>$('#new-save-overlay').classList.add('hidden'));
  $$('.dock [data-open]').forEach(b=>b.onclick=()=>openPanel(b.dataset.open));
  $('#story-rail').onclick=()=>openPanel('story');
  $$('.hotspot').forEach(b=>b.onclick=()=>walkTo(b.dataset.zone));
  $$('.market-hotspot').forEach(b=>b.onclick=()=>walkMarketTo(b.dataset.marketZone));
  $$('.rival-hotspot').forEach(b=>b.onclick=()=>walkRivalTo(b.dataset.rivalZone));
  $('#extra-hotspots').addEventListener('click',e=>{const b=e.target.closest('[data-extra-zone]');if(b)walkExtraTo(b.dataset.extraZone)});
  $('#save-btn').onclick=()=>saveCurrent(true);$('#home-btn').onclick=()=>confirmBox('返回标题','当前进度会先自动保存。',returnTitle,false);$('#audio-btn').onclick=()=>audio.toggle();$('#title-audio').onclick=()=>audio.toggle();
  $('#new-game-btn').onclick=()=>{if(getSaves().length>=8)return toast('已有 8 份存档，请先删除一份旧账本。','error');$('#new-save-overlay').classList.remove('hidden')};
  $('#continue-btn').onclick=()=>{const s=getSaves().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))[0];if(s)loadSave(s.id)};
  $('#new-save-form').addEventListener('submit',e=>{e.preventDefault();const player=$('#player-name-input').value.trim()||'小禾',farm=$('#farm-name-input').value.trim()||'青禾猪场';state=E.createState(player,farm);state.settings={...prefs};setSaves([E.clone(state),...getSaves()].slice(0,8));$('#new-save-overlay').classList.add('hidden');enterGame(true)});
  $('#save-import-input').addEventListener('change',e=>{const file=e.target.files?.[0];e.target.value='';importSaveFile(file)});
  $('#save-list').addEventListener('click',e=>{const del=e.target.closest('[data-delete]');if(del){e.stopPropagation();const s=getSaves().find(x=>x.id===del.dataset.delete);return confirmBox('删除农场账本',`“${s?.farmName||'这份存档'}”将被永久删除，此操作不能撤回。`,()=>{deleteSave(del.dataset.delete);closeConfirm()})}const card=e.target.closest('[data-load]');if(card)loadSave(card.dataset.load)});
  $('#ending-return').onclick=()=>{state.ending.viewed=true;saveCurrent();$('#ending-overlay').classList.add('hidden');renderHUD()};$('#ending-new').onclick=()=>{state.ending.viewed=true;saveCurrent();$('#ending-overlay').classList.add('hidden');returnTitle();$('#new-game-btn').click()};
  window.addEventListener('beforeunload',()=>saveCurrent());
  function editableTarget(target){return target instanceof Element&&!!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')}
  function cancelMovement(){player.keys.clear();clearRoute();clearMarketRoute();clearRivalRoute();clearExtraRoute();player.last=0;$$('.player-sprite.walking').forEach(el=>el.classList.remove('walking'))}
  function setMovement(x,y){
    if(typeof x==='object'){y=x?.y;x=x?.x;}player.keys.clear();
    if(lifecycleSuspended||document.hidden||!state||isModalOpen()||editableTarget(document.activeElement))return;
    if(x<0)player.keys.add('ArrowLeft');else if(x>0)player.keys.add('ArrowRight');
    if(y<0)player.keys.add('ArrowUp');else if(y>0)player.keys.add('ArrowDown');
  }
  function interactNearby(){
    if(lifecycleSuspended||document.hidden||!state||isModalOpen())return false;
    const n=marketActive?nearestMarketZone():rivalActive?nearestRivalZone():extraActive?nearestExtraZone():nearestZone();
    if(!n||n.dist>=8)return false;
    cancelMovement();if(marketActive)activateMarketZone(n);else if(rivalActive)activateRivalZone(n);else if(extraActive)activateExtraZone(n);else activateZone(n.panel);return true;
  }
  function suspendLifecycle(){
    if(lifecycleSuspended)return;saveCurrent();cancelMovement();lifecycleSuspended=true;animationPausedAt=Date.now();performancePausedAt=performance.now();
    audio.stopMusic();if(audio.ctx&&audio.ctx.state!=='closed')audio.ctx.suspend().catch(()=>{});
    clearInterval(festivalClock);festivalClock=null;if(festivalFrame)cancelAnimationFrame(festivalFrame);festivalFrame=null;
    for(const timer of festivalTimeouts){clearTimeout(timer.id);timer.id=null;timer.remaining=Math.max(0,timer.due-animationPausedAt);}
  }
  function resumeLifecycle(){
    if(document.hidden||!lifecycleSuspended)return;const elapsed=Math.max(0,Date.now()-animationPausedAt),performanceElapsed=Math.max(0,performance.now()-performancePausedAt);
    for(const records of [pigBehaviors,rivalPigBehaviors])for(const record of records.values()){record.nextAt+=elapsed;if(record.motion)record.motion.started+=elapsed;}
    if(festivalGame?.phase==='play'){festivalGame.deadline+=elapsed;if(Number.isFinite(festivalGame.targetAt))festivalGame.targetAt+=elapsed;if(Number.isFinite(festivalGame.mudStarted))festivalGame.mudStarted+=performanceElapsed;}
    lifecycleSuspended=false;animationPausedAt=0;performancePausedAt=0;player.last=0;
    for(const timer of festivalTimeouts)scheduleFestivalTimer(timer);
    if(festivalGame?.phase==='play'){startFestivalClock();if(festivalGame.mode==='mud'&&!festivalGame.locked)festivalFrame=requestAnimationFrame(mudLoop);updateFestivalGameHUD();}
    if(audio.ctx)audio.ensure();
  }
  window.addEventListener('keydown',e=>{
    if(editableTarget(e.target)||lifecycleSuspended||document.hidden)return;audio.ensure();
    if(festivalGame){const key=e.key.toLowerCase();if(key==='escape')closeFestivalGame();else if(festivalGame.phase==='intro'&&(key==='enter'||key===' '))beginFestivalGame();else if(festivalGame.phase==='play'&&festivalGame.mode==='mud'&&(key===' '||key==='enter'))hitFestivalMud();else if(festivalGame.phase==='play'&&festivalGame.mode==='directions'){const direction={arrowup:'up',w:'up',arrowright:'right',d:'right',arrowdown:'down',s:'down',arrowleft:'left',a:'left'}[key];if(direction)inputFestivalDirection(direction)}else if(festivalGame.phase==='result'&&(key==='enter'||key===' '))closeFestivalResult();e.preventDefault();return}
    const k=e.key.toLowerCase();if(!state)return;if(k==='escape'){closePanel();cancelMovement();return;}if(isModalOpen())return;if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(k)){player.keys.add(e.key.startsWith('Arrow')?e.key:k);e.preventDefault()}
    if(k==='e')interactNearby();
    const map={'1':'pigs','2':'farm','3':'workshop','4':'marketTrip','5':'build','6':'catalog','7':'journal','8':'story'};if(map[k])openPanel(map[k]);
  });
  window.addEventListener('blur',cancelMovement);
  document.addEventListener('focusin',e=>{if(editableTarget(e.target))cancelMovement()});
  document.addEventListener('visibilitychange',()=>document.hidden?suspendLifecycle():resumeLifecycle());
  window.addEventListener('pagehide',suspendLifecycle);
  window.addEventListener('pageshow',resumeLifecycle);
  window.addEventListener('keyup',e=>{player.keys.delete(e.key);player.keys.delete(e.key.toLowerCase())});
  document.addEventListener('pointerdown',()=>audio.ensure(),{passive:true});

  window.GamePlatform=Object.freeze({
    getState:()=>state?E.clone(state):null,save:saveCurrent,isModalOpen,cancelMovement,setMovement,interact:interactNearby,exportSave,importSaveFile,
    getVersion:()=>document.documentElement.dataset.gameVersion||'1.12.0',
    getStatus:()=>({active:!!state,modal:isModalOpen(),location:state?.location||null,festival:!!festivalGame,paused:lifecycleSuspended||document.hidden})
  });

  renderSaveList();renderAudioButtons();updatePlayer();
})();
