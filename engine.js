(function (root) {
  'use strict';
  const D = root.PIG_DATA || (typeof require !== 'undefined' ? require('./data.js') : null);

  function clamp(n,min=0,max=100){ return Math.max(min,Math.min(max,n)); }
  function clone(v){ return JSON.parse(JSON.stringify(v)); }
  function uid(prefix='id'){ return prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7); }
  function rand(s){ s.rng=(Math.imul(s.rng||1234567,1664525)+1013904223)>>>0; return s.rng/4294967296; }
  function rnd(s,a,b){ return Math.floor(rand(s)*(b-a+1))+a; }
  function pick(s,arr){ return arr[Math.floor(rand(s)*arr.length)]; }
  function breed(id){ return D.BREEDS.find(x=>x.id===id) || D.BREEDS[0]; }
  function disease(id){ return D.DISEASES.find(x=>x.id===id); }
  function log(s,text,type='info'){ s.journal.unshift({id:uid('log'),at:timeLabel(s),text,type}); s.journal=s.journal.slice(0,120); }
  function capacity(s){ return 4+(s.facilities.pen||1)*3; }
  function plotCapacity(s){ return 4+(s.facilities.field||1)*2; }
  function livePigs(s){ return s.pigs.filter(p=>p.alive); }
  function phaseOf(p){ const b=breed(p.breedId); if(p.ageDays<b.adult*.42)return 'piglet'; if(p.ageDays<b.adult)return 'juvenile'; if(p.ageDays>b.adult+110)return 'senior'; return 'adult'; }
  function phaseName(p){ return ({piglet:'乳猪',juvenile:'育成猪',adult:'成年猪',senior:'老年猪'})[phaseOf(p)]; }
  function sexName(p){ return p.sex==='female'?'母':'公'; }
  function currentDay(s){ return Math.min(D.YEAR_DAYS,Math.floor(s.quarter/4)+1); }
  function totalDay(s){ return (s.year-1)*D.YEAR_DAYS+currentDay(s); }
  function phaseIndex(s){ return s.quarter>=D.YEAR_DAYS*4?3:Math.min(3,s.quarter%4); }
  function timeLabel(s){ return `第${s.year}年·${D.SEASONS[Math.min(2,Math.floor((currentDay(s)-1)/20))]}·${currentDay(s)}日 ${D.PHASES[phaseIndex(s)]}`; }
  function season(s){ return Math.min(3,Math.floor((currentDay(s)-1)/20)+1); }

  function makePig(s,breedId,opts={}){
    const b=breed(breedId), adult=opts.adult===true;
    const age=opts.ageDays!=null?opts.ageDays:(adult?b.adult+rnd(s,1,15):rnd(s,2,5));
    const baseW=adult?b.max*(.52+rand(s)*.12):Math.max(4,b.max*(.035+age/b.adult*.07));
    return {
      id:uid('pig'), name:opts.name||pick(s,D.NAMES), breedId:b.id, role:b.role,
      sex:opts.sex||pick(s,['female','male']), ageDays:age, weight:+(opts.weight||baseW).toFixed(1),
      health:opts.health||rnd(s,82,96), mood:opts.mood||rnd(s,72,92), hunger:opts.hunger||rnd(s,68,88),
      bond:opts.bond||0, pedigree:opts.pedigree||rnd(s,58,78), alive:true, disposed:false,
      illness:null, pregnant:0, fatherBreed:null, prenatal:0, lastFed:null, bornYear:s.year,
      history:[`${timeLabel(s)} 来到${s.farmName}`]
    };
  }

  function createState(playerName='小禾',farmName='青禾猪场'){
    const s={
      version:3,id:uid('save'),createdAt:Date.now(),updatedAt:Date.now(),playerName,farmName,
      year:1,quarter:0,actionCount:0,rng:(Date.now()>>>0)||1234567,money:5200,reputation:10,
      pigs:[],memorial:[],fields:[],facilities:{pen:1,field:1,mill:1,clinic:0,fence:1,silo:1},
      inventory:{crops:{corn:5,wheat:4,soy:2,sweetpotato:2,pumpkin:0,carrot:2,alfalfa:4,barley:2},seeds:{corn:6,wheat:5,soy:4,sweetpotato:3,pumpkin:2,carrot:3,alfalfa:5,barley:3},feeds:{basic:8,balanced:3,protein:1,fiber:2,petmix:1,lactation:1},medicine:5},
      journal:[],pendingEvent:null,nextEventIn:3,yearEnd:null,ending:null,ended:false,marketOffers:[],marketTrend:{},
      stats:{earned:0,spent:0,cropsHarvested:0,pigsBorn:0,pigsSold:0,eventsResolved:0,illnessCured:0},
      settings:{music:true,sfx:true,volume:.32},weather:'晴',lastDailyTick:0
    };
    for(let i=0;i<plotCapacity(s);i++)s.fields.push({id:uid('plot'),crop:null,progress:0,watered:false,ready:false});
    s.pigs.push(makePig(s,'duroc',{name:'红豆',sex:'female'}));
    s.pigs.push(makePig(s,'potbelly',{name:'团团',sex:'male'}));
    s.pigs.push(makePig(s,'meishan',{name:'福花',sex:'female'}));
    refreshMarket(s);
    log(s,'接手了旧农场。三年后，镇上将举办比猪大赛。','story');
    return s;
  }

  function refreshMarket(s){
    s.marketTrend={};
    Object.keys(D.CROPS).forEach(id=>s.marketTrend[id]=.82+rand(s)*.42);
    Object.keys(D.FEEDS).forEach(id=>s.marketTrend[id]=.9+rand(s)*.25);
    const ids=D.BREEDS.map(b=>b.id), offers=[];
    const roles=['肉猪','宠物猪','繁育猪'];
    roles.forEach(role=>{
      const pool=D.BREEDS.filter(b=>b.role===role);
      for(let i=0;i<2;i++){
        const b=pick(s,pool), adult=rand(s)<.28;
        offers.push({id:uid('offer'),breedId:b.id,adult,sex:pick(s,['female','male']),price:Math.round(b.price*(adult?1.65:.72)*(0.92+rand(s)*.2))});
      }
    });
    for(let i=0;i<2;i++){
      const b=breed(pick(s,ids));
      offers.push({id:uid('offer'),breedId:b.id,adult:rand(s)<.4,sex:pick(s,['female','male']),price:Math.round(b.price*(.78+rand(s)*.8))});
    }
    s.marketOffers=offers;
  }

  function marketPrice(s,type,id,mode='buy'){
    if(type==='crop'){
      const base=D.CROPS[id].sell*(s.marketTrend[id]||1)*(1+(s.facilities.silo||0)*.025);
      return Math.max(1,Math.round(base*(mode==='buy'?1.45:1)));
    }
    if(type==='seed')return Math.round(D.CROPS[id].seed*(mode==='buy'?1:0.55));
    if(type==='feed')return Math.round(D.FEEDS[id].price*(s.marketTrend[id]||1)*(mode==='buy'?1:.62));
    if(type==='medicine')return mode==='buy'?160:70;
    return 0;
  }

  function ensureAction(s){
    if(s.ended)return {ok:false,error:'三年赛程已经结束，日程不再推进。'};
    if(s.pendingEvent)return {ok:false,error:'先处理眼前的突发事件。'};
    if(s.yearEnd)return {ok:false,error:'先完成年底年市。'};
    return {ok:true};
  }
  function actionResult(s,quarters,label){
    const gate=ensureAction(s); if(!gate.ok)return gate;
    advance(s,quarters,label);
    return {ok:true,event:!!s.pendingEvent,yearEnd:!!s.yearEnd};
  }

  function advance(s,quarters,label){
    const oldDay=Math.floor(s.quarter/4);
    s.quarter+=quarters; s.actionCount++; s.updatedAt=Date.now();
    const newDay=Math.min(D.YEAR_DAYS,Math.floor(s.quarter/4));
    for(let d=oldDay;d<newDay;d++)dailyTick(s,d+1);
    corpseTick(s);
    log(s,`${label}，耗时${quarters===1?'1/4日':quarters===2?'半日':quarters===4?'1日':(quarters/4)+'日'}。`);
    if(s.quarter>=D.YEAR_DAYS*4){
      s.quarter=D.YEAR_DAYS*4;
      if(s.year<3){ s.yearEnd={type:'annual',year:s.year}; refreshMarket(s); log(s,`第${s.year}年结束，年市开张了。`,'story'); }
      else finishContest(s);
      return;
    }
    s.nextEventIn--;
    if(s.nextEventIn<=0)generateEvent(s);
  }

  function dailyTick(s,dayNo){
    s.lastDailyTick++;
    s.weather=pick(s,['晴','晴','多云','小雨','晴','大风']);
    const env=1+(s.facilities.pen-1)*.035+(s.facilities.fence||0)*.012;
    s.fields.forEach(f=>{
      if(!f.crop||f.ready)return;
      f.progress+=f.watered||s.weather==='小雨'?1:.32;
      f.watered=false;
      if(f.progress>=D.CROPS[f.crop].grow)f.ready=true;
    });
    const newborns=[];
    s.pigs.forEach(p=>{
      if(!p.alive)return;
      const b=breed(p.breedId); p.ageDays++;
      p.hunger=clamp(p.hunger-(14+b.feed*.18));
      p.mood=clamp(p.mood-(5.2/(b.mood||1))/env);
      if(p.hunger<35){ p.health=clamp(p.health-(35-p.hunger)/5.5); p.mood=clamp(p.mood-3); }
      if(p.mood<28)p.hunger=clamp(p.hunger-4);
      if(p.illness){ const dis=disease(p.illness); p.health=clamp(p.health-dis.severity/(2.2+(s.facilities.clinic||0)*.35)); p.mood=clamp(p.mood-4); }
      const grow=b.growth*(.35+p.hunger/100*.75)*(.55+p.health/220)*env*(p.mood<30?.58:1);
      p.weight=Math.min(b.max*1.12,+(p.weight+grow).toFixed(1));
      if(!p.illness&&p.health<55&&rand(s)<(.18/(b.hardy||1))/(1+(s.facilities.clinic||0)*.35)){
        p.illness=pick(s,D.DISEASES.slice(0,p.health<28?4:3)).id;
        p.history.push(`${timeLabel(s)} 患上${disease(p.illness).name}`); log(s,`${p.name}患上了${disease(p.illness).name}。`,'danger');
      }
      if(p.pregnant>0){
        p.pregnant--; if(p.lastFed==='lactation')p.prenatal++;
        if(p.pregnant===0)newborns.push(p);
      }
      if(p.health<=0)diePig(s,p,'病情恶化');
    });
    newborns.forEach(m=>farrow(s,m));
    if(dayNo%5===0)refreshMarket(s);
  }

  function farrow(s,mother){
    const b=breed(mother.breedId), father=breed(mother.fatherBreed||mother.breedId);
    let count=rnd(s,b.litter[0],b.litter[1]);
    count=Math.max(1,Math.round(count*(.7+b.fertility*.18)+(mother.prenatal>=5?2:0)));
    const room=Math.max(0,capacity(s)-livePigs(s).length), kept=Math.min(room,count);
    for(let i=0;i<kept;i++){
      const child=makePig(s,rand(s)<.62?b.id:father.id,{ageDays:0,weight:3+rnd(s,0,3),pedigree:clamp((mother.pedigree+65)/2+rnd(s,-4,8))});
      child.history=[`${timeLabel(s)} 由${mother.name}产下`]; newbornSafe(child); s.pigs.push(child);
    }
    const overflow=count-kept;
    if(overflow>0){ const income=overflow*180; s.money+=income;s.stats.earned+=income; log(s,`育幼位不足，${overflow}只仔猪由合作社接养，获得¥${income}。`,'warn'); }
    mother.prenatal=0;mother.fatherBreed=null;mother.health=clamp(mother.health-10);mother.mood=clamp(mother.mood+12);
    s.stats.pigsBorn+=count; log(s,`${mother.name}顺利产下${count}只仔猪，农场留下${kept}只。`,'story');
  }
  function newbornSafe(p){ p.health=88;p.mood=78;p.hunger=70;p.bond=3;p.alive=true; }
  function diePig(s,p,cause){
    if(!p.alive)return; p.alive=false;p.health=0;p.cause=cause;p.deadAction=s.actionCount;p.exposure=0;
    p.history.push(`${timeLabel(s)} 因${cause}死亡`); log(s,`${p.name}因${cause}死亡。必须尽快处理，否则会传播疫病。`,'danger');
  }
  function corpseTick(s){
    const corpses=s.pigs.filter(p=>!p.alive&&!p.disposed);
    corpses.forEach(c=>{
      c.exposure=(c.exposure||0)+1;
      if(c.exposure>=2){
        const risk=.24/(1+(s.facilities.clinic||0)*.5)/(1+(s.facilities.pen-1)*.15);
        livePigs(s).forEach(p=>{
          if(rand(s)<risk){p.illness='plague';p.health=clamp(p.health-12);}
        });
        if(livePigs(s).some(p=>p.illness==='plague'))log(s,'未处理的死猪引发了疫病传播！','danger');
      }
    });
  }

  function feedAll(s,feedId){
    const gate=ensureAction(s);if(!gate.ok)return gate;
    const pigs=livePigs(s), n=pigs.length, f=D.FEEDS[feedId];
    if(!f)return {ok:false,error:'未知饲料。'};
    if(!n)return {ok:false,error:'猪圈里没有活猪。'};
    if((s.inventory.feeds[feedId]||0)<n)return {ok:false,error:`${f.name}需要${n}份，库存不足。`};
    s.inventory.feeds[feedId]-=n;
    pigs.forEach(p=>{
      const b=breed(p.breedId); let mood=f.mood, nutrition=f.nutrition;
      if(b.role==='肉猪'&&(feedId==='balanced'||feedId==='protein'))nutrition+=6;
      if(b.role==='宠物猪'&&(feedId==='petmix'||feedId==='fiber'))mood+=8;
      if(b.role==='繁育猪'&&feedId==='lactation'){nutrition+=5;mood+=5;}
      p.hunger=clamp(p.hunger+nutrition);p.mood=clamp(p.mood+mood);p.lastFed=feedId;
      p.weight=Math.min(b.max*1.15,+(p.weight+b.growth*f.growth*.35).toFixed(1));
      if(b.role==='宠物猪'&&p.weight>b.max*.94&&feedId==='balanced')p.health=clamp(p.health-3);
    });
    const r=actionResult(s,2,`给${n}只猪喂了${f.name}`);return {...r,count:n};
  }

  function plant(s,index,cropId){
    const gate=ensureAction(s);if(!gate.ok)return gate;
    const f=s.fields[index],c=D.CROPS[cropId];
    if(!f||f.crop)return {ok:false,error:'这块田不能播种。'};
    if(!c||!(s.inventory.seeds[cropId]>0))return {ok:false,error:'种子不足。'};
    s.inventory.seeds[cropId]--;Object.assign(f,{crop:cropId,progress:0,watered:false,ready:false});
    return actionResult(s,1,`播种${c.name}`);
  }
  function waterAll(s){
    const gate=ensureAction(s);if(!gate.ok)return gate;
    const fs=s.fields.filter(f=>f.crop&&!f.ready);if(!fs.length)return {ok:false,error:'没有需要浇水的作物。'};
    fs.forEach(f=>f.watered=true);return actionResult(s,1,`给${fs.length}块田浇水`);
  }
  function harvestAll(s){
    const gate=ensureAction(s);if(!gate.ok)return gate;
    const fs=s.fields.filter(f=>f.crop&&f.ready);if(!fs.length)return {ok:false,error:'还没有成熟作物。'};
    let total=0;const got={};
    fs.forEach(f=>{const c=D.CROPS[f.crop],bonus=(s.facilities.field||1)-1,n=rnd(s,c.yield[0],c.yield[1])+bonus;got[f.crop]=(got[f.crop]||0)+n;total+=n;s.inventory.crops[f.crop]=(s.inventory.crops[f.crop]||0)+n;Object.assign(f,{crop:null,progress:0,watered:false,ready:false});});
    s.stats.cropsHarvested+=total;const r=actionResult(s,2,`收获${total}份作物`);return {...r,got};
  }
  function craft(s,feedId){
    const gate=ensureAction(s);if(!gate.ok)return gate;
    const rec=D.RECIPES[feedId];if(!rec)return {ok:false,error:'未知配方。'};
    for(const [id,n] of Object.entries(rec.ingredients))if((s.inventory.crops[id]||0)<n)return {ok:false,error:`制作需要${D.CROPS[id].name}×${n}。`};
    Object.entries(rec.ingredients).forEach(([id,n])=>s.inventory.crops[id]-=n);
    const made=rec.makes+Math.floor((s.facilities.mill||1)/2);s.inventory.feeds[feedId]=(s.inventory.feeds[feedId]||0)+made;
    const q=(s.facilities.mill||1)>=3?1:2;const r=actionResult(s,q,`制作${D.FEEDS[feedId].name}×${made}`);return {...r,made};
  }
  function visitMarket(s){
    const gate=ensureAction(s);if(!gate.ok)return gate;
    refreshMarket(s);const r=actionResult(s,4,'往返青石镇集市');return {...r,openMarket:true};
  }
  function tradeItem(s,type,id,mode,qty=1){
    if(s.ended)return {ok:false,error:'赛程结束后市场已休市。'};
    qty=Math.max(1,Math.floor(qty));const unit=marketPrice(s,type,id,mode),total=unit*qty;
    let bag;
    if(type==='crop')bag=s.inventory.crops;
    else if(type==='seed')bag=s.inventory.seeds;
    else if(type==='feed')bag=s.inventory.feeds;
    if(type==='medicine'){
      if(mode==='buy'){if(s.money<total)return {ok:false,error:'钱不够。'};s.money-=total;s.inventory.medicine+=qty;s.stats.spent+=total;}
      else {if(s.inventory.medicine<qty)return {ok:false,error:'药品不足。'};s.inventory.medicine-=qty;s.money+=total;s.stats.earned+=total;}
    } else if(mode==='buy'){
      if(s.money<total)return {ok:false,error:'钱不够。'};s.money-=total;bag[id]=(bag[id]||0)+qty;s.stats.spent+=total;
    } else {
      if((bag[id]||0)<qty)return {ok:false,error:'库存不足。'};bag[id]-=qty;s.money+=total;s.stats.earned+=total;
    }
    s.updatedAt=Date.now();return {ok:true,total,unit};
  }
  function buyPig(s,offerId){
    if(s.ended)return {ok:false,error:'赛程结束后不能再购买猪只。'};
    const o=s.marketOffers.find(x=>x.id===offerId);if(!o)return {ok:false,error:'这只猪已经售出。'};
    if(livePigs(s).length>=capacity(s))return {ok:false,error:'猪圈容量不足，请先升级。'};
    if(s.money<o.price)return {ok:false,error:'钱不够。'};
    s.money-=o.price;s.stats.spent+=o.price;const p=makePig(s,o.breedId,{adult:o.adult,sex:o.sex});s.pigs.push(p);s.marketOffers=s.marketOffers.filter(x=>x.id!==offerId);log(s,`从集市买下了${p.name}（${breed(p.breedId).name}）。`,'story');return {ok:true,pig:p};
  }
  function pigValue(s,p){
    const b=breed(p.breedId), maturity=clamp(p.weight/(b.max*.65),.25,1.35);
    return Math.max(120,Math.round(b.price*maturity*(.55+p.health/220)*(b.role==='宠物猪'?(.65+p.bond/180):1)*(p.illness?.42:1)));
  }
  function sellPig(s,pigId){
    if(s.ended)return {ok:false,error:'赛程结束后不能再出售猪只。'};
    const p=s.pigs.find(x=>x.id===pigId);if(!p||!p.alive)return {ok:false,error:'无法出售这只猪。'};
    const price=pigValue(s,p);s.money+=price;s.stats.earned+=price;s.stats.pigsSold++;s.pigs=s.pigs.filter(x=>x.id!==pigId);p.history.push(`${timeLabel(s)} 在集市售出`);s.memorial.push({...p,sold:true,salePrice:price});log(s,`${p.name}以¥${price}成交。`);return {ok:true,price};
  }

  function interact(s,pigId,interactionId){
    const p=s.pigs.find(x=>x.id===pigId);if(!p||!p.alive)return {ok:false,error:'无法互动。'};
    const stage=phaseOf(p),it=D.INTERACTIONS[stage].find(x=>x.id===interactionId);if(!it)return {ok:false,error:'该年龄段不能这样互动。'};
    if(!s.ended){const gate=ensureAction(s);if(!gate.ok)return gate;}
    const b=breed(p.breedId),boost=b.role==='宠物猪'?1.25:1;
    p.mood=clamp(p.mood+it.mood*boost);p.health=clamp(p.health+it.health);p.bond=clamp(p.bond+Math.round(4*boost));p.history.push(`${timeLabel(s)} ${it.name}`);
    if(s.ended){log(s,`赛后陪${p.name}${it.name}。时间停在了大赛后的这个下午。`);return {ok:true,noTime:true};}
    return actionResult(s,it.time,`陪${p.name}${it.name}`);
  }
  function breedPigs(s,motherId,fatherId){
    const gate=ensureAction(s);if(!gate.ok)return gate;
    const m=s.pigs.find(p=>p.id===motherId),f=s.pigs.find(p=>p.id===fatherId);
    if(!m||!f||!m.alive||!f.alive)return {ok:false,error:'请选择健康的种猪。'};
    if(m.sex!=='female'||f.sex!=='male')return {ok:false,error:'配种需要一只成年母猪和一只成年公猪。'};
    if(phaseOf(m)!=='adult'||phaseOf(f)!=='adult')return {ok:false,error:'种猪尚未成年或已经进入老年。'};
    if(m.pregnant>0)return {ok:false,error:`${m.name}已经怀孕。`};
    if(m.health<55||f.health<55)return {ok:false,error:'种猪健康过低。'};
    const chance=clamp((breed(m.breedId).fertility+breed(f.breedId).fertility)/2*.78,.38,.97);
    const success=rand(s)<chance;
    if(success){m.pregnant=12;m.fatherBreed=f.breedId;m.prenatal=0;m.history.push(`${timeLabel(s)} 与${f.name}配种成功`);}
    const r=actionResult(s,2,success?`${m.name}与${f.name}配种成功`:`${m.name}与${f.name}配种未成功`);return {...r,success};
  }
  function treat(s,pigId){
    const gate=ensureAction(s);if(!gate.ok)return gate;
    const p=s.pigs.find(x=>x.id===pigId);if(!p||!p.alive||!p.illness)return {ok:false,error:'这只猪不需要治疗。'};
    const dis=disease(p.illness),cost=Math.max(1,dis.cost-(s.facilities.clinic>=3?1:0));
    if(s.inventory.medicine<cost)return {ok:false,error:`需要兽药×${cost}。`};
    s.inventory.medicine-=cost;const cured=rand(s)<(.76+(s.facilities.clinic||0)*.07);
    p.health=clamp(p.health+(s.facilities.clinic||0)*4+16);
    if(cured){p.history.push(`${timeLabel(s)} 治愈${dis.name}`);p.illness=null;s.stats.illnessCured++;}
    const r=actionResult(s,2,cured?`为${p.name}治疗并痊愈`:`为${p.name}治疗，病情暂时稳定`);return {...r,cured};
  }
  function dispose(s,pigId){
    const gate=ensureAction(s);if(!gate.ok)return gate;
    const p=s.pigs.find(x=>x.id===pigId);if(!p||p.alive||p.disposed)return {ok:false,error:'无需处理。'};
    p.disposed=true;s.pigs=s.pigs.filter(x=>x.id!==pigId);s.memorial.push(p);return actionResult(s,2,`妥善处理${p.name}并消毒猪圈`);
  }
  function upgrade(s,id){
    const gate=ensureAction(s);if(!gate.ok)return gate;const f=D.FACILITIES[id],lv=s.facilities[id]||0;
    if(!f)return {ok:false,error:'未知设施。'};if(lv>=f.max)return {ok:false,error:'已经升到最高级。'};
    const cost=Math.round(f.base*Math.pow(1.65,lv));if(s.money<cost)return {ok:false,error:`升级需要¥${cost}。`};
    s.money-=cost;s.stats.spent+=cost;s.facilities[id]=lv+1;
    if(id==='field')while(s.fields.length<plotCapacity(s))s.fields.push({id:uid('plot'),crop:null,progress:0,watered:false,ready:false});
    const r=actionResult(s,f.days*4,`将${f.name}升级到Lv.${lv+1}`);return {...r,cost};
  }

  const EVENT_TEXT={
    trader:{title:'挑担商人',text:'一位走村商人想用两份玉米换一袋均衡育肥料。',choices:[['trade','成交'],['decline','婉拒']]},
    wolf:{title:'围栏外的绿眼睛',text:'夜里传来低吼，一只狼正在试探猪圈围栏。',choices:[['chase','敲盆赶狼'],['secure','加固门闩（¥180）']]},
    neighbor:{title:'邻场来客',text:'邻居桂婶的饲料见了底，她想借三份小麦。',choices:[['help','借给她'],['refuse','留下库存']]},
    vet:{title:'巡乡兽医',text:'林兽医经过农场，愿意免费为一只病猪做检查。',choices:[['check','接受检查'],['advice','请教防疫']]},
    storm:{title:'午后暴雨',text:'乌云压过山头。田地和粮仓都可能受损。',choices:[['field','抢救田地'],['silo','守住粮仓']]},
    inspector:{title:'防疫抽查',text:'镇上的防疫员突然到访，正在检查猪圈卫生。',choices:[['clean','配合消毒（兽药×1）'],['talk','说明情况']]},
    gift:{title:'门口的竹篮',text:'有人留下一篮新鲜胡萝卜，纸条上写着“给最亲人的小猪”。',choices:[['share','给宠物猪尝尝'],['store','收进粮仓']]},
    boar:{title:'迷路的小猪',text:'一只陌生仔猪跟着你回到农场，耳牌上没有名字。',choices:[['keep','留下（需空位）'],['owner','寻找主人']]}
  };
  function generateEvent(s){
    const candidates=['trader','wolf','neighbor','vet','storm','inspector','gift','boar'];
    const type=pick(s,candidates),e=EVENT_TEXT[type];s.pendingEvent={id:uid('event'),type,title:e.title,text:e.text,choices:e.choices.map(([id,label])=>({id,label}))};log(s,`事件：${e.title}`,'event');
  }
  function resolveEvent(s,choice){
    const e=s.pendingEvent;if(!e)return {ok:false,error:'没有待处理事件。'};let result='';
    switch(e.type){
      case'trader':if(choice==='trade'&&(s.inventory.crops.corn||0)>=2){s.inventory.crops.corn-=2;s.inventory.feeds.balanced++;result='换得一袋均衡育肥料。';}else result='商人挑着担子离开了。';break;
      case'wolf':{
        if(choice==='secure'&&s.money>=180){s.money-=180;s.stats.spent+=180;result='门闩牢牢顶住了狼。';}
        else{const safe=rand(s)<(.35+(s.facilities.fence||0)*.13);if(safe)result='盆声吓跑了狼。';else{const p=pick(s,livePigs(s));if(p){p.health=clamp(p.health-18);p.mood=clamp(p.mood-22);result=`狼抓伤了${p.name}。`;}}}break;}
      case'neighbor':if(choice==='help'&&(s.inventory.crops.wheat||0)>=3){s.inventory.crops.wheat-=3;s.reputation+=4;result='桂婶记下了这份人情。';}else result='桂婶空手回去了。';break;
      case'vet':{const p=livePigs(s).find(x=>x.illness);if(choice==='check'&&p){p.health=clamp(p.health+18);p.illness=null;s.stats.illnessCured++;result=`林兽医治好了${p.name}。`;}else{s.inventory.medicine++;result='你学到防疫知识，并得到一份兽药。';}break;}
      case'storm':if(choice==='field'){s.fields.filter(f=>f.crop).forEach(f=>f.watered=true);const loss=Math.min(2,s.inventory.crops.corn||0);s.inventory.crops.corn-=loss;result='作物保住了，粮仓少了些玉米。';}else{s.fields.filter(f=>f.crop&&!f.ready).forEach(f=>f.progress=Math.max(0,f.progress-1));result='库存安然无恙，田里作物倒伏了一点。';}break;
      case'inspector':if(choice==='clean'&&s.inventory.medicine>0){s.inventory.medicine--;livePigs(s).forEach(p=>p.health=clamp(p.health+5));s.reputation+=3;result='消毒合格，农场口碑提升。';}else{const bad=livePigs(s).some(p=>p.illness);s.reputation+=bad?-3:1;result=bad?'病猪让检查结果不太理想。':'记录齐全，顺利过关。';}break;
      case'gift':if(choice==='share'){livePigs(s).filter(p=>breed(p.breedId).role==='宠物猪').forEach(p=>{p.mood=clamp(p.mood+15);p.bond=clamp(p.bond+5)});result='宠物猪们吃得很开心。';}else{s.inventory.crops.carrot=(s.inventory.crops.carrot||0)+5;result='收获胡萝卜×5。';}break;
      case'boar':if(choice==='keep'&&livePigs(s).length<capacity(s)){const p=makePig(s,pick(s,['largewhite','ningxiang','juliana']),{});s.pigs.push(p);result=`仔猪留下了，取名${p.name}。`;}else{s.reputation+=3;s.money+=300;s.stats.earned+=300;result='主人送来¥300谢礼。';}break;
    }
    s.pendingEvent=null;s.nextEventIn=rnd(s,2,3);s.stats.eventsResolved++;log(s,`事件处理：${result}`,'event');return {ok:true,result};
  }

  function finishYear(s){
    if(!s.yearEnd||s.yearEnd.type!=='annual')return {ok:false,error:'现在不是年市。'};
    const old=s.year;s.year++;s.quarter=0;s.yearEnd=null;s.pendingEvent=null;s.nextEventIn=rnd(s,2,3);s.reputation+=2;refreshMarket(s);livePigs(s).forEach(p=>p.mood=clamp(p.mood+8));log(s,`第${old+1}年开始了。镇民都在谈论最终的比猪大赛。`,'story');return {ok:true};
  }
  function scorePig(s,p){
    const b=breed(p.breedId),health=p.health*.22,mood=p.mood*.18,bond=p.bond*.08,pedigree=p.pedigree*.08;
    let specialty=0;
    if(b.role==='肉猪')specialty=clamp(p.weight/(b.max*.82)*30,5,30);
    if(b.role==='宠物猪')specialty=clamp((p.mood+p.bond)/200*30,5,30);
    if(b.role==='繁育猪')specialty=clamp((b.fertility/1.42*18)+(p.pedigree/100*12),5,30);
    const facility=Math.min(8,(s.facilities.pen||0)+(s.facilities.clinic||0));
    return Math.round((health+mood+bond+pedigree+specialty+facility)*(p.illness?.7:1));
  }
  function finishContest(s){
    const eligible=livePigs(s).filter(p=>phaseOf(p)==='adult'||phaseOf(p)==='senior');
    const entries=eligible.map(p=>({name:p.name,farm:s.farmName,breed:breed(p.breedId).name,score:scorePig(s,p),player:true,pigId:p.id})).sort((a,b)=>b.score-a.score);
    const player=entries[0]||{name:'空栏',farm:s.farmName,breed:'无参赛猪',score:0,player:true};
    const rivals=[
      {name:'黑将军',farm:'石桥牧场',breed:'杜洛克',score:rnd(s,73,89)},
      {name:'雪球',farm:'桂婶农庄',breed:'大白猪',score:rnd(s,70,87)},
      {name:'铃铛',farm:'河湾小院',breed:'库内库内猪',score:rnd(s,68,86)}
    ];
    const rankings=[player,...rivals].sort((a,b)=>b.score-a.score);const rank=rankings.findIndex(x=>x.player)+1,win=rank===1;
    s.quarter=D.YEAR_DAYS*4;s.ended=true;s.yearEnd=null;s.pendingEvent=null;
    s.ending={win,rank,champion:player,rankings,at:Date.now(),title:win?'金猪奖杯':'未完的农场故事',text:win?`${player.name}在健康、状态与培育表现上赢得全场最高分。`:`${player.name}获得第${rank}名。三年赛程结束，但农场与猪只会保留。`};
    log(s,win?`${player.name}赢得了比猪大赛！`:`比猪大赛结束，${player.name}获得第${rank}名。`,'story');
  }

  function warnings(s){
    const w=[];s.pigs.filter(p=>!p.alive&&!p.disposed).forEach(p=>w.push({level:'danger',text:`${p.name}的遗体已暴露${p.exposure||0}次行动，需立即处理。`}));
    livePigs(s).filter(p=>p.illness).forEach(p=>w.push({level:'danger',text:`${p.name}患有${disease(p.illness).name}。`}));
    livePigs(s).filter(p=>p.hunger<35).forEach(p=>w.push({level:'warn',text:`${p.name}很饿，成长与健康受影响。`}));
    if(livePigs(s).length>=capacity(s))w.push({level:'warn',text:'猪圈已满，无法购入或留下更多仔猪。'});
    const ready=s.fields.filter(f=>f.ready).length;if(ready)w.push({level:'good',text:`${ready}块田可以收获。`});
    return w;
  }
  function summary(s){return {time:timeLabel(s),day:currentDay(s),totalDay:totalDay(s),season:season(s),phase:D.PHASES[phaseIndex(s)],capacity:capacity(s),plots:plotCapacity(s),live:livePigs(s).length,warnings:warnings(s)};}
  function validate(s){
    const errors=[];
    if(!s||s.version!==3)errors.push('存档版本不匹配');
    if(s.year<1||s.year>3)errors.push('年份越界');
    if(s.quarter<0||s.quarter>D.YEAR_DAYS*4)errors.push('时间越界');
    if(!s.inventory||!s.facilities||!Array.isArray(s.pigs))errors.push('核心数据缺失');
    const ids=new Set();(s.pigs||[]).forEach(p=>{if(ids.has(p.id))errors.push('猪只编号重复');ids.add(p.id);if(!breed(p.breedId))errors.push('未知猪种');});
    return {ok:errors.length===0,errors};
  }
  function migrate(raw){
    if(!raw)return null;if(raw.version===3)return raw;
    const fresh=createState(raw.playerName||'小禾',raw.farmName||'青禾猪场');return Object.assign(fresh,raw,{version:3});
  }

  const Engine={createState,makePig,breed,disease,phaseOf,phaseName,sexName,currentDay,totalDay,timeLabel,season,capacity,plotCapacity,livePigs,refreshMarket,marketPrice,pigValue,feedAll,plant,waterAll,harvestAll,craft,visitMarket,tradeItem,buyPig,sellPig,interact,breedPigs,treat,dispose,upgrade,resolveEvent,finishYear,scorePig,warnings,summary,validate,migrate,clone,generateEvent,advance,finishContest};
  root.PigEngine=Engine;if(typeof module!=='undefined'&&module.exports)module.exports=Engine;
})(typeof window!=='undefined'?window:globalThis);
