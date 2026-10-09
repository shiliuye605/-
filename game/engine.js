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

  const STAT_DEFAULTS={earned:0,spent:0,cropsHarvested:0,pigsBorn:0,pigsSold:0,pigsBought:0,eventsResolved:0,illnessCured:0,forestGathered:0,villageQuests:0,contestEntries:0,feedings:0,plotsPlanted:0,marketTrips:0,marketTrades:0,crafts:0,interactions:0,breedingAttempts:0,upgrades:0,rivalVisits:0,rivalPractices:0,festivalEntries:0,contractsAccepted:0,contractsCompleted:0,staffDays:0,staffFeedings:0};

  function storyState(s){
    const defaults={currentKey:'',introduced:{},outcomes:{},snapshots:{},route:'',candidateId:null,decision:'',shortcutTaken:false,community:0,integrity:0,welfareTotal:0,welfareDays:0,pendingScenes:[],history:[],finalBonus:0};
    const story=s.story||(s.story={});Object.entries(defaults).forEach(([k,v])=>{if(story[k]===undefined)story[k]=clone(v)});story.introduced=story.introduced||{};story.outcomes=story.outcomes||{};story.snapshots=story.snapshots||{};if(!Array.isArray(story.pendingScenes))story.pendingScenes=[];if(!Array.isArray(story.history))story.history=[];return story;
  }
  function storyKey(s){return `${s.year}-${season(s)}`;}
  function templateText(s,value){return String(value??'').replaceAll('{player}',s.playerName).replaceAll('{farm}',s.farmName);}
  function dialogueLines(s,lines){return (lines||[]).map(([portrait,name,text])=>({portrait,name:templateText(s,name),text:templateText(s,text)}));}
  function storyChapter(s){const key=storyKey(s);return {key,definition:D.STORY_CHAPTERS[key],state:storyState(s)};}
  function storySnapshot(s,key){const story=storyState(s);if(!story.snapshots[key])story.snapshots[key]={stats:clone(s.stats),facilities:clone(s.facilities),live:livePigs(s).length,at:totalDay(s)};return story.snapshots[key];}
  function avgPig(s,field){const pigs=livePigs(s);return pigs.length?pigs.reduce((n,p)=>n+(Number(p[field])||0),0)/pigs.length:0;}
  function statDelta(s,snap,id){return Math.max(0,(Number(s.stats[id])||0)-(Number(snap.stats?.[id])||0));}
  function storyGoals(s,key=storyKey(s)){
    const snap=storySnapshot(s,key),candidate=s.pigs.find(p=>p.id===storyState(s).candidateId&&p.alive),healthy=avgPig(s,'health');
    const goal=(id,label,current,target,done=current>=target)=>({id,label,current:Math.round(current*10)/10,target,done});
    const maps={
      '1-1':[goal('feed','分别完成3次喂养',statDelta(s,snap,'feedings'),3),goal('plant','播种3块田',statDelta(s,snap,'plotsPlanted'),3),goal('harvest','收获5份作物',statDelta(s,snap,'cropsHarvested'),5)],
      '1-2':[goal('health','猪群平均健康达到78',healthy,78),goal('care','完成4次互动或治疗',statDelta(s,snap,'interactions')+statDelta(s,snap,'illnessCured'),4),goal('upgrade','升级1项设施',statDelta(s,snap,'upgrades'),1)],
      '1-3':[goal('market','前往集市1次',statDelta(s,snap,'marketTrips'),1),goal('trade','完成3笔交易或合同',statDelta(s,snap,'marketTrades')+statDelta(s,snap,'contractsCompleted'),3),goal('route','选择经营方向',storyState(s).route?1:0,1)],
      '2-1':[goal('expand','购买或尝试繁育1次',statDelta(s,snap,'pigsBought')+statDelta(s,snap,'breedingAttempts'),1),goal('feed','完成6次精细喂养',statDelta(s,snap,'feedings'),6),goal('herd','猪群达到4只或诞生仔猪',Math.max(livePigs(s).length,statDelta(s,snap,'pigsBorn')?4:0),4)],
      '2-2':[goal('forest','采集6份林场资源',statDelta(s,snap,'forestGathered'),6),goal('craft','制作2次饲料或药品',statDelta(s,snap,'crafts'),2),goal('help','完成1份村庄委托或市场合同',statDelta(s,snap,'villageQuests')+statDelta(s,snap,'contractsCompleted'),1)],
      '2-3':[goal('visit','拜访石桥牧场',statDelta(s,snap,'rivalVisits'),1),goal('practice','参加1次训练赛',statDelta(s,snap,'rivalPractices'),1),goal('event','参加1次正式评比或季节活动',statDelta(s,snap,'contestEntries')+statDelta(s,snap,'festivalEntries'),1)],
      '3-1':[goal('candidate','选定重点培养猪',candidate?1:0,1),goal('bond','完成4次互动',statDelta(s,snap,'interactions'),4),goal('condition','候选猪健康和心情均达到75',candidate?Math.min(candidate.health,candidate.mood):0,75)],
      '3-2':[goal('decision','做出饲养原则选择',storyState(s).decision?1:0,1),goal('health','保持平均健康80或完成治疗',Math.max(healthy,statDelta(s,snap,'illnessCured')?80:0),80),goal('community','完成1份合同或村庄委托',statDelta(s,snap,'contractsCompleted')+statDelta(s,snap,'villageQuests'),1)],
      '3-3':[goal('candidate','保有参赛候选猪',candidate?1:0,1),goal('condition','候选猪健康、心情与饱食均达到80',candidate?Math.min(candidate.health,candidate.mood,candidate.hunger):0,80),goal('practice','完成1次训练、赛事或季节活动',statDelta(s,snap,'rivalPractices')+statDelta(s,snap,'contestEntries')+statDelta(s,snap,'festivalEntries'),1)]
    };return maps[key]||[];
  }
  function storyProgress(s){const {key,definition}=storyChapter(s),goals=storyGoals(s,key),done=goals.filter(g=>g.done).length,required=definition?.required||2;return {key,definition,goals,done,required,complete:done>=required,outcome:storyState(s).outcomes[key]||''};}
  function queueStoryScene(s,key,kind,lines){const story=storyState(s),id=`${key}-${kind}`;if(story.history.some(h=>h.id===id)||story.pendingScenes.some(x=>x.id===id))return;story.pendingScenes.push({id,key,kind,lines:dialogueLines(s,lines)});story.history.push({id,key,kind,at:timeLabel(s)});story.history=story.history.slice(-40);}
  function storyUpdate(s){
    if(!D.STORY_CHAPTERS)return null;const story=storyState(s),key=storyKey(s),def=D.STORY_CHAPTERS[key];
    if(story.currentKey&&story.currentKey!==key&&!story.outcomes[story.currentKey]){const prior=storyProgressForKey(s,story.currentKey);story.outcomes[story.currentKey]=prior.complete?'complete':'missed';}
    story.currentKey=key;storySnapshot(s,key);if(!story.introduced[key]){story.introduced[key]=true;queueStoryScene(s,key,'intro',def?.intro||[]);}
    const progress=storyProgress(s);if(progress.complete&&!story.outcomes[key]){story.outcomes[key]='complete';const reward=def?.reward||0;s.money+=reward;s.stats.earned+=reward;s.reputation+=2;story.community++;queueStoryScene(s,key,'complete',def?.complete||[]);log(s,`主线“${def?.title||key}”完成，获得¥${reward}与口碑奖励。`,'story');}
    story.finalBonus=storyFarmBonus(s);return progress;
  }
  function storyProgressForKey(s,key){const def=D.STORY_CHAPTERS[key],goals=storyGoals(s,key),done=goals.filter(g=>g.done).length,required=def?.required||2;return {key,definition:def,goals,done,required,complete:done>=required};}
  function consumeStoryScene(s){return storyState(s).pendingScenes.shift()||null;}
  function chooseStory(s,type,value){const story=storyState(s);if(type==='route'){if(!['育肥路线','伙伴路线','繁育路线','综合路线'].includes(value))return {ok:false,error:'未知经营方向。'};story.route=value;}else if(type==='candidate'){const p=s.pigs.find(x=>x.id===value&&x.alive);if(!p)return {ok:false,error:'请选择一只仍在农场的猪。'};story.candidateId=p.id;}else if(type==='decision'){if(!['长期照料','短期冲重'].includes(value))return {ok:false,error:'未知选择。'};if(story.decision===value)return {ok:true,noTime:true};story.decision=value;if(value==='长期照料'){story.integrity=story.shortcutTaken?0:2;livePigs(s).forEach(p=>p.mood=clamp(p.mood+3));}else{story.integrity=-1;if(!story.shortcutTaken){story.shortcutTaken=true;const p=s.pigs.find(x=>x.id===story.candidateId&&x.alive);if(p){p.weight=+(p.weight+breed(p.breedId).growth*3).toFixed(1);p.health=clamp(p.health-4);}}}}else return {ok:false,error:'未知主线选择。'};s.updatedAt=Date.now();storyUpdate(s);return {ok:true,noTime:true};}
  function storyFarmBonus(s){const story=storyState(s),completed=Object.values(story.outcomes).filter(x=>x==='complete').length,welfare=story.welfareDays?story.welfareTotal/story.welfareDays:0,candidate=s.pigs.find(p=>p.id===story.candidateId&&p.alive),role=candidate?breed(candidate.breedId).role:'',routeMatch=story.route==='综合路线'||(story.route==='育肥路线'&&role==='肉猪')||(story.route==='伙伴路线'&&role==='宠物猪')||(story.route==='繁育路线'&&role==='繁育猪');return Math.min(8,Math.round(completed*.55+Math.max(0,welfare-60)/20+(story.integrity>0?1:0)+(routeMatch?1:0)));}

  function staffState(s){const defaults={employees:{caretaker:false,fieldhand:false,vet:false,courier:false},totalWages:0,lastReport:'',history:[]},staff=s.staff||(s.staff={});Object.entries(defaults).forEach(([k,v])=>{if(staff[k]===undefined)staff[k]=clone(v)});staff.employees=Object.assign({caretaker:false,fieldhand:false,vet:false,courier:false},staff.employees||{});if(!Array.isArray(staff.history))staff.history=[];return staff;}
  function staffSlots(s){return Math.min(3,s.year);}
  function hireStaff(s,id){const def=D.STAFF?.[id],staff=staffState(s);if(!def)return {ok:false,error:'没有这位雇员。'};if(staff.employees[id])return {ok:false,error:'这位雇员已经在农场工作。'};if(totalDay(s)<def.unlock)return {ok:false,error:`第${def.unlock}个游戏日后才能雇用。`};if(Object.values(staff.employees).filter(Boolean).length>=staffSlots(s))return {ok:false,error:`第${s.year}年最多同时雇用${staffSlots(s)}人。`};if(s.money<def.hire)return {ok:false,error:`签约需要¥${def.hire}。`};s.money-=def.hire;s.stats.spent+=def.hire;staff.employees[id]=true;staff.history.unshift({at:timeLabel(s),text:`雇用了${def.name}`});log(s,`${def.name}加入农场。雇用和排班不消耗日程。`,'story');return {ok:true,noTime:true,cost:def.hire};}
  function dismissStaff(s,id){const staff=staffState(s),def=D.STAFF?.[id];if(!def||!staff.employees[id])return {ok:false,error:'这位雇员当前不在岗。'};staff.employees[id]=false;staff.history.unshift({at:timeLabel(s),text:`结束了与${def.name}的本期雇用`});log(s,`${def.name}结束本期工作。`);return {ok:true,noTime:true};}
  function returnTripCost(s,base){return staffState(s).employees.courier?Math.max(1,base-1):base;}

  function contractState(s){const defaults={block:-1,offers:[],active:[],history:[]},cs=s.contracts||(s.contracts={});Object.entries(defaults).forEach(([k,v])=>{if(cs[k]===undefined)cs[k]=clone(v)});if(!Array.isArray(cs.offers))cs.offers=[];if(!Array.isArray(cs.active))cs.active=[];if(!Array.isArray(cs.history))cs.history=[];return cs;}
  function contractRequirementValue(req){if(req.type==='crop')return (D.CROPS[req.itemId]?.sell||0)*req.qty;if(req.type==='feed')return (D.FEEDS[req.itemId]?.price||0)*req.qty;if(req.type==='medicine')return 160*req.qty;return 0;}
  function contractRequirementOwned(s,req){if(req.type==='crop')return s.inventory.crops[req.itemId]||0;if(req.type==='feed')return s.inventory.feeds[req.itemId]||0;if(req.type==='medicine')return s.inventory.medicine||0;return 0;}
  function contractReady(s,contract){if(!contract)return false;if(contract.type==='pig')return contractEligiblePigs(s,contract).length>0;if(contract.type==='mixed')return Array.isArray(contract.requirements)&&contract.requirements.length>=2&&contract.requirements.every(req=>contractRequirementOwned(s,req)>=req.qty);return contractRequirementOwned(s,{type:contract.type,itemId:contract.itemId,qty:contract.qty})>=contract.qty;}
  function refreshContracts(s,force=false){const cs=contractState(s),block=Math.floor((totalDay(s)-1)/5);if(!force&&cs.block===block&&cs.offers.length)return cs;const cropIds=Object.keys(D.CROPS),feedIds=Object.keys(D.FEEDS),cropId=cropIds[block%cropIds.length],feedId=feedIds[(block+2)%feedIds.length],role=['肉猪','宠物猪','繁育猪'][block%3],deadline=Math.min(180,totalDay(s)+7),mixedRequirements=[{type:'crop',itemId:cropIds[(block+3)%cropIds.length],qty:2+block%3},{type:'feed',itemId:feedIds[(block+1)%feedIds.length],qty:1+block%2}];if(block%3===2)mixedRequirements.push({type:'medicine',itemId:'medicine',qty:1});const mixedReward=Math.round(mixedRequirements.reduce((sum,req)=>sum+contractRequirementValue(req),0)*(1.5+(block%4)*.04));cs.block=block;cs.offers=[{id:`c-${block}-crop`,type:'crop',itemId:cropId,qty:4+block%3,reward:Math.round(D.CROPS[cropId].sell*(4+block%3)*1.75),deadline},{id:`c-${block}-feed`,type:'feed',itemId:feedId,qty:2+block%2,reward:Math.round(D.FEEDS[feedId].price*(2+block%2)*1.45),deadline},{id:`c-${block}-pig`,type:'pig',role,minWeight:role==='宠物猪'?20:role==='繁育猪'?45:80,reward:950+block*45,deadline},{id:`c-${block}-mixed`,type:'mixed',title:block%2?'旅店联合备货':'赛场综合补给',requirements:mixedRequirements,reward:mixedReward,deadline}].filter(o=>!cs.active.some(a=>a.id===o.id)&&!cs.history.some(h=>h.id===o.id));return cs;}
  function acceptContract(s,id){if(!s.yearEnd&&s.location!=='market')return {ok:false,error:'请在青石镇集市的合同板接单。'};const cs=refreshContracts(s),offer=cs.offers.find(o=>o.id===id);if(!offer)return {ok:false,error:'这份合同已经撤下。'};if(cs.active.length>=3)return {ok:false,error:'最多同时承接3份合同。'};const acceptedAt=totalDay(s);cs.active.push({...offer,acceptedAt,deadline:Math.min(180,acceptedAt+7)});cs.offers=cs.offers.filter(o=>o.id!==id);s.stats.contractsAccepted++;log(s,'承接了一份限期合同。合同登记不消耗日程。','story');return {ok:true,noTime:true};}
  function contractEligiblePigs(s,contract){return livePigs(s).filter(p=>breed(p.breedId).role===contract.role&&p.weight>=contract.minWeight&&!p.illness);}
  function completeContract(s,id,pigId){if(!s.yearEnd&&s.location!=='market')return {ok:false,error:'请到青石镇集市交付合同。'};const cs=contractState(s),c=cs.active.find(x=>x.id===id);if(!c)return {ok:false,error:'找不到这份已接合同。'};if(totalDay(s)>c.deadline)return {ok:false,error:'合同已经逾期。'};if(c.type==='mixed'){if(!contractReady(s,c))return {ok:false,error:'混合合同尚有物资不足；库存不会被部分扣除。'};c.requirements.forEach(req=>{if(req.type==='crop')s.inventory.crops[req.itemId]-=req.qty;else if(req.type==='feed')s.inventory.feeds[req.itemId]-=req.qty;else if(req.type==='medicine')s.inventory.medicine-=req.qty;});}else if(c.type==='crop'||c.type==='feed'){if(!contractReady(s,c))return {ok:false,error:'交付库存不足。'};const bag=c.type==='crop'?s.inventory.crops:s.inventory.feeds;bag[c.itemId]-=c.qty;}else{const p=s.pigs.find(x=>x.id===pigId&&x.alive);if(!p||!contractEligiblePigs(s,c).some(x=>x.id===p.id))return {ok:false,error:'请选择符合角色、体重且健康的猪。'};s.pigs=s.pigs.filter(x=>x.id!==p.id);p.history.push(`${timeLabel(s)} 通过合同交付`);s.memorial.push({...p,sold:true,contract:true,salePrice:c.reward});s.stats.pigsSold++;}
    s.money+=c.reward;s.stats.earned+=c.reward;s.reputation+=2;s.stats.contractsCompleted++;storyState(s).community++;cs.active=cs.active.filter(x=>x.id!==id);cs.history.unshift({...c,status:'complete',completedAt:totalDay(s)});cs.history=cs.history.slice(0,20);log(s,`完成合同，收到¥${c.reward}。`,'story');storyUpdate(s);return {ok:true,noTime:true,reward:c.reward};}
  function contractDaily(s){const cs=contractState(s),today=totalDay(s),expired=cs.active.filter(c=>today>c.deadline);if(expired.length){expired.forEach(c=>cs.history.unshift({...c,status:'expired',completedAt:today}));cs.active=cs.active.filter(c=>today<=c.deadline);s.reputation=Math.max(0,s.reputation-expired.length);log(s,`${expired.length}份合同逾期，口碑小幅下降。`,'warn');}refreshContracts(s);}

  function festivalState(s){const defaults={seasonKey:'',entries:0,gold:0,silver:0,bronze:0,bestPerformance:0,lastResult:null,history:[],minigameVersion:2},fs=s.festival||(s.festival={});Object.entries(defaults).forEach(([k,v])=>{if(fs[k]===undefined)fs[k]=clone(v)});if(!Array.isArray(fs.history))fs.history=[];return fs;}
  function festivalDefinition(s){return D.FESTIVALS?.[season(s)];}

  function makePig(s,breedId,opts={}){
    const b=breed(breedId), adult=opts.adult===true;
    const age=opts.ageDays!=null?opts.ageDays:(adult?b.adult+rnd(s,1,15):rnd(s,2,5));
    const baseW=adult?b.max*(.52+rand(s)*.12):Math.max(4,b.max*(.035+age/b.adult*.07));
    return {
      id:uid('pig'), name:opts.name||pick(s,D.NAMES), breedId:b.id, role:b.role,
      sex:opts.sex||pick(s,['female','male']), ageDays:age, weight:+(opts.weight||baseW).toFixed(1),
      health:opts.health||rnd(s,82,96), mood:opts.mood||rnd(s,72,92), hunger:opts.hunger||rnd(s,68,88),
      bond:opts.bond||0, pedigree:opts.pedigree||rnd(s,58,78), alive:true, disposed:false,
      illness:null, pregnant:0, fatherBreed:null, prenatal:0, postpartum:0, litters:0,
      lastFed:null, satietyDays:0, feedGrowthMultiplier:1, feedGrowthDays:0, bornYear:s.year, worldPen:0,
      history:[`${timeLabel(s)} 来到${s.farmName}`]
    };
  }

  function createState(playerName='小禾',farmName='青禾猪场'){
    const s={
      version:3,id:uid('save'),createdAt:Date.now(),updatedAt:Date.now(),playerName,farmName,
      year:1,quarter:0,actionCount:0,rng:(Date.now()>>>0)||1234567,money:5200,reputation:10,location:'farm',
      pigs:[],memorial:[],fields:[],facilities:{pen:1,field:1,mill:1,clinic:0,fence:1,silo:1},
      inventory:{crops:{corn:5,wheat:4,soy:2,sweetpotato:2,pumpkin:0,carrot:2,alfalfa:4,barley:2},seeds:{corn:6,wheat:5,soy:4,sweetpotato:3,pumpkin:2,carrot:3,alfalfa:5,barley:3},feeds:{basic:8,balanced:3,protein:1,fiber:2,petmix:1,lactation:1},medicine:5},
      journal:[],pendingEvent:null,nextEventIn:12,eventClockVersion:2,yearEnd:null,ending:null,ended:false,marketOffers:[],marketTrend:{},feedBatch:null,plantBatch:null,careDaily:{day:1,pigIds:[]},
      rival:{visits:0,rapport:0,lastTalkDay:0,practiceSeason:'',practiceWins:0,practiceLosses:0,bestPlayerScore:0,lastPractice:null,practiceHistory:[],lastSimDay:0,strategy:'均衡训练',businessPlan:'稳健育成',herd:[],news:[],money:6800,feedStock:24,medicine:3,commercialPigs:6,reputation:12,facilities:{pen:1,training:1,clinic:0,storehouse:1},lifetimeIncome:0,lifetimeExpense:0,lastFeedQuality:1,ledger:[]},
      forest:{visits:0,used:{},resources:{acorn:0,herb:0,mushroom:0,wood:0},remedies:0,discoveries:0},
      village:{visits:0,rapport:0,lastTalkDay:0,quest:null,questHistory:[],harvestBoost:0,lastSharpenBlock:-1},
      contest:{visits:0,seasonKey:'',entries:0,gold:0,silver:0,bronze:0,lastResult:null,history:[]},
      story:{currentKey:'',introduced:{},outcomes:{},snapshots:{},route:'',candidateId:null,decision:'',shortcutTaken:false,community:0,integrity:0,welfareTotal:0,welfareDays:0,pendingScenes:[],history:[],finalBonus:0},
      staff:{employees:{caretaker:false,fieldhand:false,vet:false,courier:false},totalWages:0,lastReport:'',history:[]},
      contracts:{block:-1,offers:[],active:[],history:[]},
      festival:{seasonKey:'',entries:0,gold:0,silver:0,bronze:0,bestPerformance:0,lastResult:null,history:[],minigameVersion:2},
      stats:clone(STAT_DEFAULTS),
      settings:{music:true,sfx:true,volume:.32},weather:'晴',lastDailyTick:0
    };
    for(let i=0;i<plotCapacity(s);i++)s.fields.push({id:uid('plot'),crop:null,progress:0,watered:false,ready:false});
    s.pigs.push(makePig(s,'duroc',{name:'红豆',sex:'female'}));
    s.pigs.push(makePig(s,'potbelly',{name:'团团',sex:'male'}));
    s.pigs.push(makePig(s,'meishan',{name:'福花',sex:'female'}));
    refreshMarket(s);
    log(s,'接手了旧农场。三年后，镇上将举办比猪大赛。','story');
    storyUpdate(s);
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
    refreshContracts(s);
  }

  function marketPrice(s,type,id,mode='buy'){
    if(type==='crop'){
      const siloLevel=Math.max(1,s.facilities.silo||1),siloBonus=1.025+(siloLevel-1)*.05;
      const base=D.CROPS[id].sell*(s.marketTrend[id]||1)*siloBonus;
      return Math.max(1,Math.round(base*(mode==='buy'?1.45:1)));
    }
    if(type==='seed')return Math.round(D.CROPS[id].seed*(mode==='buy'?1:0.55));
    if(type==='feed')return Math.round(D.FEEDS[id].price*(s.marketTrend[id]||1)*(mode==='buy'?1:.45));
    if(type==='medicine')return mode==='buy'?160:70;
    return 0;
  }

  function remainingQuarters(s){ return Math.max(0,D.YEAR_DAYS*4-s.quarter); }
  function ensureAction(s,quarters=0,location=null){
    if(s.ended)return {ok:false,error:'三年赛程已经结束，日程不再推进。'};
    if(s.pendingEvent)return {ok:false,error:'先处理眼前的突发事件。'};
    if(s.yearEnd)return {ok:false,error:'先完成年底年市。'};
    if(location&&s.location!==location){
      const names={farm:'自己的农场',market:'青石镇集市',rival:'石桥牧场'};
      return {ok:false,error:`这项行动只能在${names[location]||location}进行。`};
    }
    if(quarters>remainingQuarters(s))return {ok:false,error:'本年剩余时间不足，无法开始这项行动。'};
    return {ok:true};
  }
  function actionResult(s,quarters,label){
    const gate=ensureAction(s,quarters); if(!gate.ok)return gate;
    const advanced=advance(s,quarters,label);if(!advanced.ok)return advanced;
    storyUpdate(s);
    return {ok:true,event:!!s.pendingEvent,yearEnd:!!s.yearEnd};
  }

  function advance(s,quarters,label){
    const gate=ensureAction(s,quarters);if(!gate.ok)return gate;
    const oldDay=Math.floor(s.quarter/4);
    s.feedBatch=null;s.plantBatch=null;s.quarter+=quarters; s.actionCount++; s.updatedAt=Date.now();
    const newDay=Math.min(D.YEAR_DAYS,Math.floor(s.quarter/4));
    for(let d=oldDay;d<newDay;d++)dailyTick(s,d+1);
    log(s,`${label}，耗时${quarters===1?'1/4日':quarters===2?'半日':quarters===4?'1日':(quarters/4)+'日'}。`);
    if(s.quarter>=D.YEAR_DAYS*4){
      s.quarter=D.YEAR_DAYS*4;
      if(s.year<3){ s.yearEnd={type:'annual',year:s.year}; refreshMarket(s); log(s,`第${s.year}年结束，年市开张了。`,'story'); }
      else finishContest(s);
      return {ok:true};
    }
    s.nextEventIn-=quarters;
    if(s.nextEventIn<=0)generateEvent(s);
    return {ok:true};
  }

  function runStaffDay(s){
    const staff=staffState(s),reports=[];for(const [id,active] of Object.entries(staff.employees)){if(!active)continue;const def=D.STAFF[id];if(s.money<def.wage){staff.employees[id]=false;reports.push(`${def.name}因薪资不足暂停工作`);continue;}s.money-=def.wage;s.stats.spent+=def.wage;staff.totalWages+=def.wage;s.stats.staffDays++;}
    if(staff.employees.fieldhand){const fields=s.fields.filter(f=>f.crop&&!f.ready&&!f.watered);fields.forEach(f=>f.watered=true);if(fields.length)reports.push(`青芽浇灌${fields.length}块田`);}
    if(staff.employees.caretaker){const targets=[...livePigs(s)].filter(p=>p.hunger<55).sort((a,b)=>a.hunger-b.hunger).slice(0,3);let fed=0;targets.forEach(p=>{const role=breed(p.breedId).role,candidates=role==='肉猪'?['balanced','protein','basic','fiber']:role==='宠物猪'?['petmix','fiber','basic']:['lactation','balanced','basic'],feedId=candidates.find(id=>(s.inventory.feeds[id]||0)>0);if(!feedId)return;const feed=D.FEEDS[feedId];s.inventory.feeds[feedId]--;p.hunger=clamp(p.hunger+feed.nutrition);p.mood=clamp(p.mood+feed.mood);p.satietyDays=Math.max(p.satietyDays||0,feed.satiety||0);p.lastFed=feedId;p.feedGrowthMultiplier=feed.growth||1;p.feedGrowthDays=Math.max(1,feed.satiety||1);fed++;});if(fed){s.stats.staffFeedings+=fed;s.stats.feedings+=fed;reports.push(`阿满给${fed}只饥饿猪补充饲料`);}}
    if(staff.employees.vet){const target=[...livePigs(s)].sort((a,b)=>a.health-b.health)[0];if(target&&target.health<92){target.health=clamp(target.health+3);reports.push(`小岚为${target.name}巡诊`);}}
    staff.lastReport=reports.join('；');if(reports.length)log(s,`雇员日报：${staff.lastReport}。`,'info');
  }

  function dailyTick(s,dayNo){
    s.lastDailyTick++;
    runStaffDay(s);
    const weatherForDay=s.weather||'晴';
    const env=1+(s.facilities.pen-1)*.035+(s.facilities.fence||0)*.012;
    s.fields.forEach(f=>{
      if(!f.crop||f.ready)return;
      f.progress+=f.watered||weatherForDay==='小雨'?1:.32;
      f.watered=false;
      if(f.progress>=D.CROPS[f.crop].grow)f.ready=true;
    });
    corpseTick(s);
    const newborns=[];
    s.pigs.forEach(p=>{
      if(!p.alive)return;
      const b=breed(p.breedId); p.ageDays++;
      const reserve=Math.max(0,Number(p.satietyDays)||0),appetite=6+b.feed*.1+(p.pregnant?1:0),penSaving=1+(s.facilities.pen-1)*.04;
      p.hunger=clamp(p.hunger-appetite*(reserve>0?.68:1)/penSaving);p.satietyDays=Math.max(0,reserve-1);
      p.mood=clamp(p.mood-(5.2/(b.mood||1))/env);
      if(p.hunger<25){ p.health=clamp(p.health-(25-p.hunger)/7); p.mood=clamp(p.mood-3); }
      else if(p.hunger<40)p.mood=clamp(p.mood-1);
      if(p.mood<28)p.hunger=clamp(p.hunger-2);
      if(p.illness){ const dis=disease(p.illness); p.health=clamp(p.health-dis.severity/(2.2+(s.facilities.clinic||0)*.35)); p.mood=clamp(p.mood-4); }
      const feedBoost=(Number(p.feedGrowthDays)||0)>0?(Number(p.feedGrowthMultiplier)||1):1;
      const grow=b.growth*(.48+p.hunger/100*.62)*(.55+p.health/220)*env*(p.mood<30?.58:1)*feedBoost;
      p.weight=Math.min(b.max*1.12,+(p.weight+grow).toFixed(1));
      const vetGuard=staffState(s).employees.vet?.58:1;
      if(!p.illness&&p.health<55&&rand(s)<(.18/(b.hardy||1))/(1+(s.facilities.clinic||0)*.35)*vetGuard){
        p.illness=pick(s,D.DISEASES.slice(0,p.health<28?4:3)).id;
        p.history.push(`${timeLabel(s)} 患上${disease(p.illness).name}`); log(s,`${p.name}患上了${disease(p.illness).name}。`,'danger');
      }
      if(p.pregnant>0){
        p.pregnant--; if(p.lastFed==='lactation'&&(Number(p.feedGrowthDays)||0)>0)p.prenatal++;
        if(p.pregnant===0)newborns.push(p);
      }
      p.feedGrowthDays=Math.max(0,(Number(p.feedGrowthDays)||0)-1);if(!p.feedGrowthDays)p.feedGrowthMultiplier=1;
      p.postpartum=Math.max(0,(Number(p.postpartum)||0)-1);
      if(p.health<=0)diePig(s,p,'病情恶化');
    });
    newborns.forEach(m=>farrow(s,m));
    if(dayNo%5===0)refreshMarket(s);
    contractDaily(s);simulateRivalDay(s,totalDay(s));
    const story=storyState(s),pigs=livePigs(s);if(pigs.length){story.welfareTotal+=pigs.reduce((n,p)=>n+(p.health+p.mood+p.hunger)/3,0)/pigs.length;story.welfareDays++;}
    storyUpdate(s);
    s.weather=pick(s,['晴','晴','多云','小雨','晴','大风']);
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
    if(overflow>0){ const paid=Math.min(4,overflow),income=paid*180; s.money+=income;s.stats.earned+=income; log(s,`育幼位不足，${overflow}只仔猪由合作社接养；其中${paid}只获得安置补贴¥${income}。`,'warn'); }
    mother.prenatal=0;mother.fatherBreed=null;mother.postpartum=8;mother.litters=(mother.litters||0)+1;mother.health=clamp(mother.health-10);mother.mood=clamp(mother.mood+12);
    s.stats.pigsBorn+=count; log(s,`${mother.name}顺利产下${count}只仔猪，农场留下${kept}只。`,'story');
  }
  function newbornSafe(p){ p.health=88;p.mood=78;p.hunger=70;p.satietyDays=1;p.feedGrowthMultiplier=1;p.feedGrowthDays=0;p.postpartum=0;p.litters=0;p.bond=3;p.alive=true; }
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

  function feedTimeCost(s,pigId){
    const batch=s.feedBatch;
    return batch&&batch.actionCount===s.actionCount&&batch.remaining>0&&!batch.pigIds.includes(pigId)?0:1;
  }
  function feedPig(s,pigId,feedId){
    const q=feedTimeCost(s,pigId),gate=ensureAction(s,q,'farm');if(!gate.ok)return gate;
    const p=s.pigs.find(item=>item.id===pigId&&item.alive),f=D.FEEDS[feedId];
    if(!p)return {ok:false,error:'找不到需要喂养的活猪。'};
    if(!f)return {ok:false,error:'未知饲料。'};
    if(q===0&&s.feedBatch.pigIds.includes(pigId))return {ok:false,error:'这只猪在本轮喂养中已经吃过了。'};
    if((s.inventory.feeds[feedId]||0)<1)return {ok:false,error:`${f.name}库存不足。`};
    const b=breed(p.breedId),before={hunger:p.hunger,mood:p.mood,weight:p.weight};let mood=f.mood,nutrition=f.nutrition,preference='普通适配';
    if(b.role==='肉猪'&&(feedId==='balanced'||feedId==='protein')){nutrition+=6;preference='肉猪适配';}
    if(b.role==='宠物猪'&&(feedId==='petmix'||feedId==='fiber')){mood+=8;preference='宠物猪偏好';}
    if(b.role==='繁育猪'&&feedId==='lactation'){nutrition+=p.pregnant?8:4;mood+=p.pregnant?7:4;preference=p.pregnant?'妊娠专用':'繁育猪适配';}
    if(phaseOf(p)==='juvenile'&&feedId==='protein'){nutrition+=4;preference='育成期适配';}
    s.inventory.feeds[feedId]--;
    s.stats.feedings++;
    p.hunger=clamp(p.hunger+nutrition);p.satietyDays=Math.max(Number(p.satietyDays)||0,f.satiety||0);p.mood=clamp(p.mood+mood);p.lastFed=feedId;p.feedGrowthMultiplier=f.growth||1;p.feedGrowthDays=Math.max(1,f.satiety||1);
    p.weight=Math.min(b.max*1.15,+(p.weight+b.growth*f.growth*.35).toFixed(1));
    if(b.role==='宠物猪'&&p.weight>b.max*.94&&feedId==='balanced')p.health=clamp(p.health-3);
    let r;
    if(q===0){s.inventory.feeds[feedId]=Math.max(0,s.inventory.feeds[feedId]);s.feedBatch.remaining--;s.feedBatch.pigIds.push(p.id);s.updatedAt=Date.now();log(s,`同一轮继续给${p.name}喂了${f.name}，未额外耗时。`);r={ok:true,noTime:true,batched:true,event:false,yearEnd:false};}
    else{r=actionResult(s,1,`开始喂养并给${p.name}喂了${f.name}`);if(r.ok)s.feedBatch={actionCount:s.actionCount,remaining:2,pigIds:[p.id]};}
    return {...r,pigId:p.id,pigName:p.name,feedId,nutrition:Math.round(p.hunger-before.hunger),mood:Math.round(p.mood-before.mood),weight:+(p.weight-before.weight).toFixed(1),preference,timeCost:q};
  }

  function plantTimeCost(s,index){
    const batch=s.plantBatch;
    return batch&&batch.actionCount===s.actionCount&&batch.remaining>0&&!batch.plotIndexes.includes(index)?0:1;
  }
  function plant(s,index,cropId){
    const q=plantTimeCost(s,index),gate=ensureAction(s,q,'farm');if(!gate.ok)return gate;
    const f=s.fields[index],c=D.CROPS[cropId];
    if(!f||f.crop)return {ok:false,error:'这块田不能播种。'};
    if(!c||!(s.inventory.seeds[cropId]>0))return {ok:false,error:'种子不足。'};
    if(!c.seasons.includes(season(s)))return {ok:false,error:`${c.name}不适合在当前季节播种。`};
    s.inventory.seeds[cropId]--;s.stats.plotsPlanted++;Object.assign(f,{crop:cropId,progress:0,watered:false,ready:false});
    if(q===0){s.plantBatch.remaining--;s.plantBatch.plotIndexes.push(index);s.updatedAt=Date.now();log(s,`同一轮继续在第${index+1}块田播种${c.name}，未额外耗时。`);return {ok:true,noTime:true,batched:true,event:false,yearEnd:false,timeCost:0};}
    const r=actionResult(s,1,`开始整地并在第${index+1}块田播种${c.name}`);if(r.ok)s.plantBatch={actionCount:s.actionCount,remaining:2,plotIndexes:[index]};return {...r,timeCost:1};
  }
  function waterAll(s){
    const gate=ensureAction(s,1,'farm');if(!gate.ok)return gate;
    const fs=s.fields.filter(f=>f.crop&&!f.ready&&!f.watered);if(!fs.length)return {ok:false,error:s.fields.some(f=>f.crop&&!f.ready)?'今天已经浇过水了。':'没有需要浇水的作物。'};
    fs.forEach(f=>f.watered=true);return actionResult(s,1,`给${fs.length}块田浇水`);
  }
  function harvestAll(s){
    let gate=ensureAction(s,0,'farm');if(!gate.ok)return gate;
    const fs=s.fields.filter(f=>f.crop&&f.ready);if(!fs.length)return {ok:false,error:'还没有成熟作物。'};
    const q=fs.length<=3?1:2;gate=ensureAction(s,q,'farm');if(!gate.ok)return gate;
    let total=0;const got={};
    const sharpen=villageState(s).harvestBoost>0;
    fs.forEach(f=>{const c=D.CROPS[f.crop],bonusChance=Math.max(0,(s.facilities.field||1)-1)*.18,n=rnd(s,c.yield[0],c.yield[1])+(rand(s)<bonusChance?1:0)+(sharpen?1:0);got[f.crop]=(got[f.crop]||0)+n;total+=n;s.inventory.crops[f.crop]=(s.inventory.crops[f.crop]||0)+n;Object.assign(f,{crop:null,progress:0,watered:false,ready:false});});
    if(sharpen)villageState(s).harvestBoost--;
    s.stats.cropsHarvested+=total;const r=actionResult(s,q,`收获${fs.length}块田的${total}份作物`);return {...r,got,timeCost:q,plots:fs.length};
  }
  function harvestTimeCost(s){const count=(s.fields||[]).filter(f=>f.crop&&f.ready).length;return count?count<=3?1:2:0;}
  function craft(s,feedId){
    const rec=D.RECIPES[feedId];if(!rec)return {ok:false,error:'未知配方。'};
    const q=(s.facilities.mill||1)>=3?1:2,gate=ensureAction(s,q,'farm');if(!gate.ok)return gate;
    for(const [id,n] of Object.entries(rec.ingredients))if((s.inventory.crops[id]||0)<n)return {ok:false,error:`制作需要${D.CROPS[id].name}×${n}。`};
    Object.entries(rec.ingredients).forEach(([id,n])=>s.inventory.crops[id]-=n);
    const made=rec.makes+Math.floor((s.facilities.mill||1)/2);s.inventory.feeds[feedId]=(s.inventory.feeds[feedId]||0)+made;s.stats.crafts++;
    const r=actionResult(s,q,`制作${D.FEEDS[feedId].name}×${made}`);return {...r,made};
  }
  function visitMarket(s){
    const gate=ensureAction(s,0,'farm');if(!gate.ok)return gate;
    refreshMarket(s);s.location='market';s.stats.marketTrips++;s.updatedAt=Date.now();log(s,'前往青石镇集市，去程不消耗日程。');storyUpdate(s);return {ok:true,noTime:true,openMarket:true};
  }
  function returnFromMarket(s){
    const q=returnTripCost(s,4),gate=ensureAction(s,q,'market');if(!gate.ok)return gate;
    s.location='farm';return actionResult(s,q,'从青石镇集市返回农场');
  }

  function rivalState(s){
    const defaults={visits:0,rapport:0,lastTalkDay:0,practiceSeason:'',practiceWins:0,practiceLosses:0,bestPlayerScore:0,lastPractice:null,practiceHistory:[],lastSimDay:0,strategy:'均衡训练',businessPlan:'稳健育成',herd:[],news:[],money:6800,feedStock:24,medicine:3,commercialPigs:6,reputation:12,facilities:{pen:1,training:1,clinic:0,storehouse:1},lifetimeIncome:0,lifetimeExpense:0,lastFeedQuality:1,ledger:[]};
    const rival=s.rival||(s.rival={});Object.entries(defaults).forEach(([k,v])=>{if(rival[k]===undefined)rival[k]=clone(v)});if(!Array.isArray(rival.practiceHistory))rival.practiceHistory=[];if(!Array.isArray(rival.news))rival.news=[];if(!Array.isArray(rival.ledger))rival.ledger=[];rival.facilities=Object.assign({pen:1,training:1,clinic:0,storehouse:1},rival.facilities||{});for(const key of ['money','feedStock','medicine','commercialPigs','reputation','lifetimeIncome','lifetimeExpense'])rival[key]=Math.max(0,Number(rival[key])||0);if(!Array.isArray(rival.herd)||!rival.herd.length)rival.herd=[{id:'black-general',name:'黑将军',breedId:'duroc',weight:166,health:91,mood:82,training:66,pedigree:89,focus:true},{id:'stone-bell',name:'石铃',breedId:'berkshire',weight:122,health:88,mood:87,training:58,pedigree:84},{id:'cloud-hoof',name:'云蹄',breedId:'largewhite',weight:145,health:86,mood:80,training:55,pedigree:81}];return rival;
  }
  function rivalRecord(rival,day,type,text,amount=0){rival.ledger.unshift({day,type,text,amount,balance:Math.round(rival.money)});rival.ledger=rival.ledger.slice(0,24);}
  function runRivalBusinessCycle(s,rival,day){
    const avgHealth=rival.herd.reduce((n,p)=>n+p.health,0)/rival.herd.length,avgMood=rival.herd.reduce((n,p)=>n+p.mood,0)/rival.herd.length,capacity=8+rival.facilities.pen*4,born=Math.min(capacity-rival.commercialPigs,day%10===0?2:1);rival.commercialPigs+=Math.max(0,born);const sold=Math.min(rival.commercialPigs-4,day%10===0?2:1),saleIncome=Math.max(0,sold)*(420+rival.facilities.pen*55+rival.facilities.storehouse*20);rival.commercialPigs-=Math.max(0,sold);rival.money+=saleIncome;rival.lifetimeIncome+=saleIncome;if(saleIncome)rivalRecord(rival,day,'income',`出售育成猪${sold}只`,saleIncome);
    if(day%10===0){const contractIncome=360+rival.facilities.storehouse*95+Math.round(rival.reputation*4);rival.money+=contractIncome;rival.lifetimeIncome+=contractIncome;rival.reputation++;rivalRecord(rival,day,'income','完成镇上批量供货',contractIncome);}
    const targetFeed=(rival.herd.length+rival.commercialPigs)*(2+rival.facilities.storehouse),buy=Math.max(0,Math.ceil(targetFeed-rival.feedStock)),feedUnit=Math.max(1,22-rival.facilities.storehouse),received=Math.min(buy,Math.floor(rival.money/feedUnit)),feedCost=received*feedUnit;if(feedCost>0){rival.money-=feedCost;rival.lifetimeExpense+=feedCost;rival.feedStock+=received;rivalRecord(rival,day,'expense',`补充标准饲料${received}袋`,-feedCost);}
    if(rival.medicine<2&&rival.money>=150){rival.money-=150;rival.lifetimeExpense+=150;rival.medicine++;rivalRecord(rival,day,'expense','补充常备兽药',-150);}
    if(day%15===0){const order=avgHealth<86?['clinic','training','pen','storehouse']:rival.feedStock<10?['storehouse','pen','training','clinic']:['training','pen','storehouse','clinic'],id=order.find(key=>rival.facilities[key]<3);if(id){const names={pen:'育成猪舍',training:'训练场',clinic:'兽医室',storehouse:'饲料仓'},base={pen:1400,training:1600,clinic:1750,storehouse:1200}[id],cost=Math.round(base*(1+rival.facilities[id]*.52));if(rival.money>=cost+1800){rival.money-=cost;rival.lifetimeExpense+=cost;rival.facilities[id]++;rivalRecord(rival,day,'upgrade',`${names[id]}升级至Lv.${rival.facilities[id]}`,-cost);rival.news.unshift({day,text:`石桥牧场投资升级${names[id]}，经营结余进入下一阶段。`});}}}
    if(rival.money<1800)rival.businessPlan='保守周转';else if(avgHealth<86)rival.businessPlan='防疫恢复';else if(avgMood<80)rival.businessPlan='环境改善';else if(rival.facilities.training<3)rival.businessPlan='赛事投入';else rival.businessPlan='稳定供货';rival.news.unshift({day,text:`五日结算：育成猪${rival.commercialPigs}只，资金¥${Math.round(rival.money)}，计划“${rival.businessPlan}”。`});rival.news=rival.news.slice(0,10);
  }
  function simulateRivalDay(s,target=totalDay(s)){
    const rival=rivalState(s),strategies=['均衡训练','体格冲刺','情绪稳定','健康恢复'];target=Math.max(1,Math.min(180,target));while(rival.lastSimDay<target){rival.lastSimDay++;const day=rival.lastSimDay;if(day%5===1){const avgHealth=rival.herd.reduce((n,p)=>n+p.health,0)/rival.herd.length,avgMood=rival.herd.reduce((n,p)=>n+p.mood,0)/rival.herd.length;rival.strategy=avgHealth<80?'健康恢复':avgMood<75?'情绪稳定':rival.money<1600?'均衡训练':pick(s,strategies);rival.news.unshift({day,text:`陆野将参赛猪训练重点调整为“${rival.strategy}”。`});rival.news=rival.news.slice(0,10);}const feedNeed=Math.max(2,Math.ceil((rival.herd.length+rival.commercialPigs)/4)),available=Math.min(feedNeed,rival.feedStock),feedQuality=available/feedNeed;rival.feedStock=Math.max(0,rival.feedStock-available);rival.lastFeedQuality=feedQuality;const operationCost=18+rival.commercialPigs*3+rival.herd.length*5,paid=Math.min(rival.money,operationCost);rival.money-=paid;rival.lifetimeExpense+=paid;const cashStress=paid<operationCost?(operationCost-paid)/operationCost:0;rival.herd.forEach(p=>{const b=breed(p.breedId),body=rival.strategy==='体格冲刺'?1.28:1,rest=rival.strategy==='健康恢复'?1.1:1,calm=rival.strategy==='情绪稳定'?1.14:1,clinic=1+rival.facilities.clinic*.08,comfort=1+rival.facilities.pen*.05,training=1+rival.facilities.training*.1,growthFactor=.45+feedQuality*.55;p.weight=Math.min(b.max*1.04,+(p.weight+b.growth*(.82+(day/180)*.32)*body*growthFactor).toFixed(1));p.health=clamp(p.health+(.15*rest*clinic)-(.04+(1-feedQuality)*.48+cashStress*.35)-(rival.strategy==='体格冲刺'?.08:0));p.mood=clamp(p.mood+(.12*calm*comfort)-(.03+(1-feedQuality)*.38+cashStress*.28)-(rival.strategy==='体格冲刺'?.07:0));p.training=clamp(p.training+(.14+(p.focus?.08:0))*training*(.55+feedQuality*.45));});if(day%5===0)runRivalBusinessCycle(s,rival,day);}return rival;
  }
  function rivalPigScore(s,p,category='overall'){
    const b=breed(p.breedId),body=clamp(p.weight/(b.max*.82)*30,5,30),base=p.health*.23+p.mood*.16+p.training*.17+p.pedigree*.1+body;if(category==='body')return Math.round(base*.7+body);if(category==='health')return Math.round(base*.7+p.health*.3);if(category==='bond')return Math.round(base*.76+p.mood*.24);return Math.round(base);
  }
  function rivalScoreFor(s,category='overall'){const rival=simulateRivalDay(s),facility=Math.min(6,rival.facilities.training*1.25+rival.facilities.clinic*.65+rival.facilities.pen*.45),finance=rival.money>=2000?.5:rival.money<600?-2:0,scores=rival.herd.map(p=>rivalPigScore(s,p,category)+facility+finance);return Math.round(Math.max(...scores));}

  function forestState(s){
    const defaults={visits:0,used:{},resources:{acorn:0,herb:0,mushroom:0,wood:0},remedies:0,discoveries:0};
    const forest=s.forest||(s.forest={});Object.entries(defaults).forEach(([k,v])=>{if(forest[k]===undefined)forest[k]=clone(v)});forest.used=forest.used||{};forest.resources=Object.assign({acorn:0,herb:0,mushroom:0,wood:0},forest.resources||{});return forest;
  }
  function villageState(s){
    const defaults={visits:0,rapport:0,lastTalkDay:0,quest:null,questHistory:[],harvestBoost:0,lastSharpenBlock:-1};
    const village=s.village||(s.village={});Object.entries(defaults).forEach(([k,v])=>{if(village[k]===undefined)village[k]=clone(v)});if(!Array.isArray(village.questHistory))village.questHistory=[];return village;
  }
  function contestState(s){
    const defaults={visits:0,seasonKey:'',entries:0,gold:0,silver:0,bronze:0,lastResult:null,history:[]};
    const contest=s.contest||(s.contest={});Object.entries(defaults).forEach(([k,v])=>{if(contest[k]===undefined)contest[k]=clone(v)});if(!Array.isArray(contest.history))contest.history=[];return contest;
  }

  function visitForest(s){
    const gate=ensureAction(s,0,'farm');if(!gate.ok)return gate;const area=forestState(s);area.visits++;s.location='forest';s.updatedAt=Date.now();log(s,'沿山脚小路进入后山林场，去程不消耗日程。','story');return {ok:true,noTime:true,firstVisit:area.visits===1};
  }
  function returnFromForest(s){
    const q=returnTripCost(s,2),gate=ensureAction(s,q,'forest');if(!gate.ok)return gate;s.location='farm';return actionResult(s,q,'从后山林场返回农场');
  }
  function forageForest(s,spot){
    const gate=ensureAction(s,0,'forest');if(!gate.ok)return gate;const area=forestState(s),today=totalDay(s),key=`${today}-${spot}`;
    if(area.used[key])return {ok:false,error:'这个采集点今天已经找过了。'};
    const tables={oak:{id:'acorn',name:'橡果',min:2,max:4},herbs:{id:'herb',name:'山野药草',min:1,max:3},bridge:{id:'mushroom',name:'林下菌菇',min:1,max:2},deadwood:{id:'wood',name:'干燥木料',min:1,max:3}},item=tables[spot];
    if(!item)return {ok:false,error:'这里没有可采集的资源。'};
    const amount=rnd(s,item.min,item.max);area.used[key]=true;area.resources[item.id]+=amount;area.discoveries++;s.stats.forestGathered=(s.stats.forestGathered||0)+amount;
    s.updatedAt=Date.now();log(s,`在后山采集${item.name}×${amount}，采集时间并入本次返程。`);return {ok:true,noTime:true,event:false,yearEnd:false,item:item.id,itemName:item.name,amount};
  }
  function brewForestRemedy(s){
    const gate=ensureAction(s,1,'forest');if(!gate.ok)return gate;const area=forestState(s);if(area.resources.herb<3)return {ok:false,error:'需要山野药草×3。'};
    area.resources.herb-=3;area.remedies++;s.inventory.medicine++;s.stats.crafts++;const r=actionResult(s,1,'在猎人小屋整理药草，制成兽药×1');return {...r,made:1};
  }

  function visitVillage(s){
    const gate=ensureAction(s,0,'farm');if(!gate.ok)return gate;const village=villageState(s);village.visits++;s.location='village';s.updatedAt=Date.now();ensureVillageQuest(s);log(s,'沿村道来到青石村，去程不消耗日程。','story');return {ok:true,noTime:true,firstVisit:village.visits===1};
  }
  function returnFromVillage(s){
    const q=returnTripCost(s,2),gate=ensureAction(s,q,'village');if(!gate.ok)return gate;s.location='farm';return actionResult(s,q,'从青石村返回农场');
  }
  function ensureVillageQuest(s){
    const village=villageState(s),block=Math.floor((totalDay(s)-1)/5);if(village.quest&&village.quest.block===block)return village.quest;
    const ids=Object.keys(D.CROPS),cropId=ids[block%ids.length],qty=3+block%3,reward=Math.round(D.CROPS[cropId].sell*qty*1.55);
    village.quest={id:`quest-${block}`,block,cropId,qty,reward,done:false};return village.quest;
  }
  function talkVillage(s){
    if(s.location!=='village')return {ok:false,error:'请先前往青石村。'};const village=villageState(s),today=totalDay(s),first=village.lastTalkDay!==today;
    if(first){village.lastTalkDay=today;village.rapport=Math.min(30,village.rapport+1);s.reputation++;s.updatedAt=Date.now();log(s,'在茶馆和何伯聊了村里的近况。','story');}
    const trends=Object.entries(s.marketTrend).filter(([id])=>D.CROPS[id]).sort((a,b)=>b[1]-a[1]),best=trends[0]?.[0]||'corn';return {ok:true,noTime:true,firstToday:first,rapport:village.rapport,forecast:best};
  }
  function completeVillageQuest(s){
    if(s.location!=='village')return {ok:false,error:'请到青石村公告栏交付委托。'};const village=villageState(s),q=ensureVillageQuest(s);
    if(q.done)return {ok:false,error:'这一期委托已经完成。'};if((s.inventory.crops[q.cropId]||0)<q.qty)return {ok:false,error:`还需要${D.CROPS[q.cropId].name}×${q.qty}。`};
    s.inventory.crops[q.cropId]-=q.qty;s.money+=q.reward;s.stats.earned+=q.reward;s.reputation+=2;s.stats.villageQuests=(s.stats.villageQuests||0)+1;q.done=true;village.questHistory.unshift({...q,at:timeLabel(s)});village.questHistory=village.questHistory.slice(0,12);log(s,`完成青石村委托，获得¥${q.reward}。`,'story');return {ok:true,noTime:true,reward:q.reward};
  }
  function sharpenTools(s){
    const gate=ensureAction(s,0,'village');if(!gate.ok)return gate;const village=villageState(s),block=Math.floor((totalDay(s)-1)/10),cost=180;
    if(village.lastSharpenBlock===block)return {ok:false,error:'这十天内已经保养过农具。'};if(s.money<cost)return {ok:false,error:`农具保养需要¥${cost}。`};
    s.money-=cost;s.stats.spent+=cost;village.lastSharpenBlock=block;village.harvestBoost++;s.updatedAt=Date.now();log(s,'铁匠铺完成农具保养，等候时间并入本次村庄行程。');return {ok:true,noTime:true,event:false,yearEnd:false,cost};
  }

  function visitContest(s){
    if(s.ended&&s.ending?.ceremonyPending){s.location='contest';return {ok:true,noTime:true,final:true};}
    const gate=ensureAction(s,0,'farm');if(!gate.ok)return gate;const contest=contestState(s);contest.visits++;s.location='contest';s.updatedAt=Date.now();log(s,'前往青石赛场，去程不消耗日程。','story');return {ok:true,noTime:true,firstVisit:contest.visits===1};
  }
  function returnFromContest(s){
    if(s.ended){if(s.ending?.ceremonyPending)return {ok:false,error:'最终颁奖尚未完成，暂时不能离场。'};s.location='farm';return {ok:true,noTime:true};}
    const q=returnTripCost(s,2),gate=ensureAction(s,q,'contest');if(!gate.ok)return gate;s.location='farm';return actionResult(s,q,'从青石赛场返回农场');
  }
  function enterLocalContest(s,pigId,category='overall'){
    const gate=ensureAction(s,4,'contest');if(!gate.ok)return gate;const contest=contestState(s),key=`${s.year}-${season(s)}`,p=s.pigs.find(x=>x.id===pigId&&x.alive);
    if(!p)return {ok:false,error:'请选择一只活猪参赛。'};if(!['adult','senior'].includes(phaseOf(p)))return {ok:false,error:'季度赛事只接受成年猪。'};if(contest.seasonKey===key)return {ok:false,error:'本季已经参加过青石赛场的赛事。'};
    let playerScore=scorePig(s,p);if(category==='body')playerScore=Math.round(playerScore*.72+clamp(p.weight/(breed(p.breedId).max*.82)*28,4,28));if(category==='health')playerScore=Math.round(playerScore*.7+p.health*.3);if(category==='bond')playerScore=Math.round(playerScore*.68+(p.mood+p.bond)*.16);
    playerScore=Math.max(0,playerScore+rnd(s,-4,5));const rivalScore=Math.max(50,rivalScoreFor(s,category)+rnd(s,-3,3)),diff=playerScore-rivalScore,medal=diff>=0?'gold':diff>=-8?'silver':'bronze',reward=medal==='gold'?450+s.year*150:medal==='silver'?240:100;
    contest.seasonKey=key;contest.entries++;contest[medal]++;contest.lastResult={key,pigId:p.id,pigName:p.name,category,playerScore,rivalScore,medal,reward};contest.history.unshift(contest.lastResult);contest.history=contest.history.slice(0,12);s.money+=reward;s.stats.earned+=reward;s.reputation+=medal==='gold'?5:medal==='silver'?2:1;s.stats.contestEntries=(s.stats.contestEntries||0)+1;p.mood=clamp(p.mood+(medal==='gold'?8:3));p.bond=clamp(p.bond+3);p.hunger=clamp(p.hunger-7);
    const r=actionResult(s,4,`带${p.name}参加青石赛场季度评比`);return {...r,...contest.lastResult};
  }
  function festivalEligibility(s,pigId){
    const gate=ensureAction(s,2,'contest');if(!gate.ok)return gate;const fs=festivalState(s),key=`${s.year}-${season(s)}`,def=festivalDefinition(s),p=s.pigs.find(x=>x.id===pigId&&x.alive);
    if(!p)return {ok:false,error:'请选择一只活猪参加活动。'};if((p.ageDays||0)<2)return {ok:false,error:'新生仔猪还不能参加节庆活动。'};if(fs.seasonKey===key)return {ok:false,error:'本季已经参加过季节活动。'};return {ok:true,pig:p,definition:def,key};
  }
  function completeFestival(s,pigId,performance=50){
    const eligible=festivalEligibility(s,pigId);if(!eligible.ok)return eligible;const {pig:p,definition:def,key}=eligible,fs=festivalState(s),skill=Math.round((clamp(Number(performance)||0,0,100)-50)*.18);
    const young=['piglet','juvenile'].includes(phaseOf(p)),b=breed(p.breedId);let playerScore;
    if(season(s)===1)playerScore=p.health*.32+p.mood*.25+p.bond*.23+p.pedigree*.12+(young?def.youngBonus:0);
    else if(season(s)===2)playerScore=p.mood*.34+p.health*.3+p.hunger*.16+(s.facilities.pen||1)*2.2;
    else playerScore=scorePig(s,p)*.83+Math.min(12,(s.stats.cropsHarvested||0)/12);
    const baseScore=Math.round(playerScore),finalPerformance=Math.round(clamp(Number(performance)||0,0,100));playerScore=Math.round(playerScore+skill+rnd(s,-3,5));const rivalScore=Math.max(48,rivalScoreFor(s,'overall')+(season(s)===1?-7:season(s)===2?-3:0)+rnd(s,-3,3)),diff=playerScore-rivalScore,medal=diff>=0?'gold':diff>=-7?'silver':'bronze',reward=medal==='gold'?360+s.year*100:medal==='silver'?220:90;
    fs.seasonKey=key;fs.entries++;fs[medal]++;fs.bestPerformance=Math.max(fs.bestPerformance||0,finalPerformance);fs.lastResult={key,name:def.name,mode:def.mode,pigId:p.id,pigName:p.name,baseScore,performance:finalPerformance,skillBonus:skill,playerScore,rivalScore,medal,reward};fs.history.unshift(fs.lastResult);fs.history=fs.history.slice(0,12);s.money+=reward;s.stats.earned+=reward;s.reputation+=medal==='gold'?4:medal==='silver'?2:1;s.stats.festivalEntries++;p.mood=clamp(p.mood+(medal==='gold'?12:6));p.bond=clamp(p.bond+4);p.hunger=clamp(p.hunger-4);const r=actionResult(s,2,`带${p.name}参加${def.name}`);return {...r,...fs.lastResult};
  }
  function enterFestival(s,pigId){return completeFestival(s,pigId,50);}
  function completeContestCeremony(s){
    if(!s.ended||!s.ending?.ceremonyPending)return {ok:false,error:'现在没有待完成的最终颁奖。'};if(s.location!=='contest')return {ok:false,error:'请先到青石赛场。'};
    s.ending.ceremonyPending=false;s.ending.viewed=false;s.updatedAt=Date.now();log(s,'在青石赛场完成了三年最终颁奖。','story');return {ok:true,noTime:true,ending:s.ending};
  }
  function visitRival(s){
    const gate=ensureAction(s,0,'farm');if(!gate.ok)return gate;const rival=rivalState(s);rival.visits++;s.stats.rivalVisits++;
    s.location='rival';s.updatedAt=Date.now();log(s,'沿左侧小路前往石桥牧场，去程不消耗日程。','story');storyUpdate(s);return {ok:true,noTime:true,firstVisit:rival.visits===1,visits:rival.visits};
  }
  function returnFromRival(s){
    const q=returnTripCost(s,2),gate=ensureAction(s,q,'rival');if(!gate.ok)return gate;
    s.location='farm';return actionResult(s,q,'从石桥牧场返回农场');
  }
  function talkRival(s){
    if(s.location!=='rival')return {ok:false,error:'请先前往石桥牧场。'};
    const rival=rivalState(s),today=totalDay(s),first=rival.lastTalkDay!==today;
    if(first){rival.lastTalkDay=today;rival.rapport=Math.min(20,rival.rapport+1);s.updatedAt=Date.now();log(s,'与石桥牧场的陆野交流了养猪心得。','story');}
    return {ok:true,firstToday:first,rapport:rival.rapport};
  }
  function practiceRival(s,pigId){
    const gate=ensureAction(s,2,'rival');if(!gate.ok)return gate;const rival=rivalState(s),pig=s.pigs.find(p=>p.id===pigId&&p.alive),seasonKey=`${s.year}-${season(s)}`;
    if(!pig)return {ok:false,error:'请选择一只健康的参赛猪。'};
    if(phaseOf(pig)!=='adult'&&phaseOf(pig)!=='senior')return {ok:false,error:'训练赛只接受成年猪。'};
    if(rival.practiceSeason===seasonKey)return {ok:false,error:'本季已经参加过石桥牧场训练赛。'};
    const playerScore=Math.max(0,scorePig(s,pig)+rnd(s,-4,6)),rivalScore=Math.max(50,rivalScoreFor(s)+rnd(s,-3,4)),win=playerScore>=rivalScore;
    rival.practiceSeason=seasonKey;rival.bestPlayerScore=Math.max(rival.bestPlayerScore,playerScore);rival.lastPractice={year:s.year,season:season(s),pigId:pig.id,pigName:pig.name,playerScore,rivalScore,win};rival.practiceHistory.unshift(rival.lastPractice);rival.practiceHistory=rival.practiceHistory.slice(0,12);
    if(win){rival.practiceWins++;rival.rapport=Math.min(20,rival.rapport+2);s.reputation+=3;pig.mood=clamp(pig.mood+7);pig.bond=clamp(pig.bond+4);}
    else{rival.practiceLosses++;rival.rapport=Math.min(20,rival.rapport+1);pig.mood=clamp(pig.mood-2);pig.bond=clamp(pig.bond+2);}
    s.stats.rivalPractices++;pig.hunger=clamp(pig.hunger-5);const r=actionResult(s,2,`带${pig.name}参加石桥牧场训练赛`);
    return {...r,win,playerScore,rivalScore,pigName:pig.name};
  }
  function tradeItem(s,type,id,mode,qty=1){
    if(s.ended)return {ok:false,error:'赛程结束后市场已休市。'};
    if(s.pendingEvent)return {ok:false,error:'先处理眼前的突发事件。'};
    if(!s.yearEnd&&s.location!=='market')return {ok:false,error:'普通交易只能在青石镇集市进行。'};
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
    s.stats.marketTrades++;s.updatedAt=Date.now();storyUpdate(s);return {ok:true,total,unit};
  }
  function buyPig(s,offerId){
    if(s.ended)return {ok:false,error:'赛程结束后不能再购买猪只。'};
    if(s.pendingEvent)return {ok:false,error:'先处理眼前的突发事件。'};
    if(!s.yearEnd&&s.location!=='market')return {ok:false,error:'购买猪只需要前往青石镇集市。'};
    const o=s.marketOffers.find(x=>x.id===offerId);if(!o)return {ok:false,error:'这只猪已经售出。'};
    if(livePigs(s).length>=capacity(s))return {ok:false,error:'猪圈容量不足，请先升级。'};
    if(s.money<o.price)return {ok:false,error:'钱不够。'};
    s.money-=o.price;s.stats.spent+=o.price;s.stats.pigsBought++;s.stats.marketTrades++;const p=makePig(s,o.breedId,{adult:o.adult,sex:o.sex});s.pigs.push(p);s.marketOffers=s.marketOffers.filter(x=>x.id!==offerId);log(s,`从集市买下了${p.name}（${breed(p.breedId).name}）。`,'story');storyUpdate(s);return {ok:true,pig:p};
  }
  function pigValue(s,p){
    const b=breed(p.breedId),maturity=clamp(p.weight/(b.max*.65),.35,1.45),condition=(.6+p.health*.004)*(.75+p.mood*.0025);
    let roleFactor=1.25;
    if(b.role==='宠物猪')roleFactor=.95+p.bond/120;
    if(b.role==='繁育猪')roleFactor=1+p.pedigree/250+(p.litters||0)*.08;
    return Math.max(120,Math.round(b.price*maturity*condition*roleFactor*(p.illness?.45:1)));
  }
  function sellPig(s,pigId){
    if(s.ended)return {ok:false,error:'赛程结束后不能再出售猪只。'};
    if(s.pendingEvent)return {ok:false,error:'先处理眼前的突发事件。'};
    if(!s.yearEnd&&s.location!=='market')return {ok:false,error:'出售猪只需要前往青石镇集市。'};
    const p=s.pigs.find(x=>x.id===pigId);if(!p||!p.alive)return {ok:false,error:'无法出售这只猪。'};
    const price=pigValue(s,p);s.money+=price;s.stats.earned+=price;s.stats.pigsSold++;s.stats.marketTrades++;s.pigs=s.pigs.filter(x=>x.id!==pigId);p.history.push(`${timeLabel(s)} 在集市售出`);s.memorial.push({...p,sold:true,salePrice:price});log(s,`${p.name}以¥${price}成交。`);storyUpdate(s);return {ok:true,price};
  }

  function careState(s){
    const day=totalDay(s);if(!s.careDaily||s.careDaily.day!==day)s.careDaily={day,pigIds:[]};
    if(!Array.isArray(s.careDaily.pigIds))s.careDaily.pigIds=[];return s.careDaily;
  }
  function interactionTimeCost(s,pigId,interactionId){
    if(s.ended)return 0;const p=s.pigs.find(x=>x.id===pigId),it=p&&D.INTERACTIONS[phaseOf(p)]?.find(x=>x.id===interactionId);if(!it)return 0;
    if(it.time>=2)return it.time;const care=careState(s);return care.pigIds.length<2&&!care.pigIds.includes(pigId)?0:it.time;
  }
  function freeCareRemaining(s){return Math.max(0,2-careState(s).pigIds.length);}
  function interact(s,pigId,interactionId){
    const p=s.pigs.find(x=>x.id===pigId);if(!p||!p.alive)return {ok:false,error:'无法互动。'};
    const stage=phaseOf(p),it=D.INTERACTIONS[stage].find(x=>x.id===interactionId);if(!it)return {ok:false,error:'该年龄段不能这样互动。'};
    if(s.location!=='farm')return {ok:false,error:'请回到自己的农场再和猪互动。'};
    const q=interactionTimeCost(s,pigId,interactionId);if(!s.ended){const gate=ensureAction(s,q,'farm');if(!gate.ok)return gate;}
    const b=breed(p.breedId),boost=b.role==='宠物猪'?1.25:1;
    p.mood=clamp(p.mood+it.mood*boost);p.health=clamp(p.health+it.health);p.bond=clamp(p.bond+Math.round(4*boost));p.history.push(`${timeLabel(s)} ${it.name}`);s.stats.interactions++;
    if(s.ended){log(s,`赛后陪${p.name}${it.name}。时间停在了大赛后的这个下午。`);return {ok:true,noTime:true};}
    if(q===0){const care=careState(s);if(!care.pigIds.includes(p.id))care.pigIds.push(p.id);s.updatedAt=Date.now();log(s,`利用今日的轻松关怀时间陪${p.name}${it.name}，未推进日程。`);return {ok:true,noTime:true,event:false,yearEnd:false,timeCost:0,freeCare:true};}
    return {...actionResult(s,q,`陪${p.name}${it.name}`),timeCost:q};
  }
  function breedPigs(s,motherId,fatherId){
    const gate=ensureAction(s,2,'farm');if(!gate.ok)return gate;
    const m=s.pigs.find(p=>p.id===motherId),f=s.pigs.find(p=>p.id===fatherId);
    if(!m||!f||!m.alive||!f.alive)return {ok:false,error:'请选择健康的种猪。'};
    if(m.sex!=='female'||f.sex!=='male')return {ok:false,error:'配种需要一只成年母猪和一只成年公猪。'};
    if(phaseOf(m)!=='adult'||phaseOf(f)!=='adult')return {ok:false,error:'种猪尚未成年或已经进入老年。'};
    if(m.pregnant>0)return {ok:false,error:`${m.name}已经怀孕。`};
    if((m.postpartum||0)>0)return {ok:false,error:`${m.name}仍在产后恢复期，还需${m.postpartum}天。`};
    if(m.health<55||f.health<55)return {ok:false,error:'种猪健康过低。'};
    s.stats.breedingAttempts++;const chance=clamp((breed(m.breedId).fertility+breed(f.breedId).fertility)/2*.78,.38,.97);
    const success=rand(s)<chance;
    if(success){m.pregnant=12;m.fatherBreed=f.breedId;m.prenatal=0;m.history.push(`${timeLabel(s)} 与${f.name}配种成功`);}
    const r=actionResult(s,2,success?`${m.name}与${f.name}配种成功`:`${m.name}与${f.name}配种未成功`);return {...r,success};
  }
  function treat(s,pigId){
    const gate=ensureAction(s,2,'farm');if(!gate.ok)return gate;
    const p=s.pigs.find(x=>x.id===pigId);if(!p||!p.alive||!p.illness)return {ok:false,error:'这只猪不需要治疗。'};
    const dis=disease(p.illness),cost=Math.max(1,dis.cost-(s.facilities.clinic>=3?1:0));
    if(s.inventory.medicine<cost)return {ok:false,error:`需要兽药×${cost}。`};
    s.inventory.medicine-=cost;const cured=rand(s)<(.76+(s.facilities.clinic||0)*.07);
    p.health=clamp(p.health+(s.facilities.clinic||0)*4+16);
    if(cured){p.history.push(`${timeLabel(s)} 治愈${dis.name}`);p.illness=null;s.stats.illnessCured++;}
    const r=actionResult(s,2,cured?`为${p.name}治疗并痊愈`:`为${p.name}治疗，病情暂时稳定`);return {...r,cured};
  }
  function dispose(s,pigId){
    const gate=ensureAction(s,2,'farm');if(!gate.ok)return gate;
    const p=s.pigs.find(x=>x.id===pigId);if(!p||p.alive||p.disposed)return {ok:false,error:'无需处理。'};
    p.disposed=true;s.pigs=s.pigs.filter(x=>x.id!==pigId);s.memorial.push(p);return actionResult(s,2,`妥善处理${p.name}并消毒猪圈`);
  }
  function upgrade(s,id){
    const f=D.FACILITIES[id],lv=s.facilities[id]||0;
    if(!f)return {ok:false,error:'未知设施。'};const gate=ensureAction(s,f.days*4,'farm');if(!gate.ok)return gate;if(lv>=f.max)return {ok:false,error:'已经升到最高级。'};
    const cost=Math.round(f.base*Math.pow(1.65,lv));if(s.money<cost)return {ok:false,error:`升级需要¥${cost}。`};
    s.money-=cost;s.stats.spent+=cost;s.stats.upgrades++;s.facilities[id]=lv+1;
    if(id==='field')while(s.fields.length<plotCapacity(s))s.fields.push({id:uid('plot'),crop:null,progress:0,watered:false,ready:false});
    const r=actionResult(s,f.days*4,`将${f.name}升级到Lv.${lv+1}`);return {...r,cost};
  }

  const EVENT_TEXT={
    trader:{title:'挑担商人',speaker:'何伯',portrait:'merchant',text:'何伯挑着货担停在门前，想用两份玉米换一袋均衡育肥料。',dialogue:[['merchant','何伯','{player}，我这袋均衡料配得扎实。你若有两份玉米，咱们就在门口换了，彼此都省一趟集市。'],['farmer','{player}','玉米也要留给猪群和工坊……这笔交换得算清楚。']],prompt:'何伯等着你的答复。',choices:[['trade','拿两份玉米成交'],['decline','婉拒交换']]},
    wolf:{title:'围栏外的绿眼睛',speaker:'{player}',portrait:'farmer',text:'夜里传来低吼，一只狼正在试探猪圈围栏。',dialogue:[['farmer','{player}','嘘……围栏外有一双绿眼睛。猪群已经不安了，不能让它找到门闩的空隙。']],prompt:'现在必须马上处理。',choices:[['chase','敲盆赶狼'],['secure','加固门闩（¥180）']]},
    neighbor:{title:'何伯来借粮',speaker:'何伯',portrait:'merchant',text:'牲畜行临时断了饲料，何伯来借三份小麦。',dialogue:[['merchant','何伯','镇口运粮的车陷在泥里，牲畜行今晚就要断料。能先借我三份小麦吗？下一批货到了，我记着你这份人情。'],['farmer','{player}','粮仓里的小麦也有安排，不过邻里遇上难处，不能只看眼前。']],prompt:'何伯把空布袋递了过来。',choices:[['help','借给他三份小麦'],['refuse','说明库存也紧张']]},
    vet:{title:'巡乡兽医',speaker:'林医生',portrait:'vet',text:'林医生经过农场，愿意免费检查病猪或讲解防疫。',dialogue:[['vet','林医生','我刚巡完河湾，顺路来看看你家的猪。若有病猪，我可以先做一次检查；没有的话，就给你留一份常用兽药。']],prompt:'林医生打开了随身药箱。',choices:[['check','请她检查病猪'],['advice','请教防疫并领药']]},
    storm:{title:'午后暴雨',speaker:'{player}',portrait:'farmer',text:'乌云压过山头，田地和粮仓都可能受损。',dialogue:[['farmer','{player}','风向变了，雨墙已经越过山口。田里的作物会倒伏，粮仓屋檐也可能进水，我只能先保住一边。']],prompt:'第一阵大雨已经落下。',choices:[['field','抢救田地'],['silo','守住粮仓']]},
    inspector:{title:'防疫抽查',speaker:'林医生',portrait:'vet',text:'受镇上委托，林医生来检查猪圈卫生和防疫记录。',dialogue:[['vet','林医生','这次不只是巡诊，镇上托我做防疫抽查。我要看饮水槽、隔离记录和猪圈地面。你可以现在用一份兽药完成消毒，也可以先出示近期记录。']],prompt:'林医生翻开检查表，等你配合。',choices:[['clean','立即消毒（兽药×1）'],['talk','出示记录并说明']]},
    gift:{title:'陆野的竹篮',speaker:'陆野',portrait:'rival',text:'陆野带来一篮胡萝卜，说石桥牧场的比赛猪用不上这些。',dialogue:[['rival','陆野','黑将军严格按配方吃料，这篮胡萝卜留着也是浪费。你家的宠物猪或许喜欢；暂时不用，就收进粮仓。别误会，这不算赛前放水。']],prompt:'陆野把竹篮放在门边。',choices:[['share','分给宠物猪'],['store','收进粮仓']]},
    boar:{title:'何伯寻找小猪',speaker:'何伯',portrait:'merchant',text:'一只陌生仔猪跟来农场，何伯随后拿着空耳牌找到了门口。',dialogue:[['merchant','何伯','总算找到了……这只仔猪从牲畜行后栏溜走，可它一路跟着你，似乎很喜欢这里。若你愿意收养，我就把空耳牌留下。'],['farmer','{player}','留下它需要空圈位；送它回牲畜行，也能让何伯安心。']],prompt:'仔猪在你们脚边轻轻哼叫。',choices:[['keep','留下仔猪（需空位）'],['owner','送回牲畜行']]}
  };
  function generateEvent(s){
    const candidates=['trader','wolf','neighbor','vet','storm','inspector','gift','boar'];
    const type=pick(s,candidates),e=EVENT_TEXT[type];s.pendingEvent={id:uid('event'),type,title:templateText(s,e.title),text:templateText(s,e.text),speaker:templateText(s,e.speaker),portrait:e.portrait,prompt:templateText(s,e.prompt),dialogue:dialogueLines(s,e.dialogue),choices:e.choices.map(([id,label])=>({id,label:templateText(s,label)}))};log(s,`事件：${e.title}`,'event');
  }
  function resolveEvent(s,choice){
    const e=s.pendingEvent;if(!e)return {ok:false,error:'没有待处理事件。'};let result='';
    switch(e.type){
      case'trader':if(choice==='trade'&&(s.inventory.crops.corn||0)>=2){s.inventory.crops.corn-=2;s.inventory.feeds.balanced++;result='换得一袋均衡育肥料。';}else result='商人挑着担子离开了。';break;
      case'wolf':{
        if(choice==='secure'&&s.money>=180){s.money-=180;s.stats.spent+=180;result='门闩牢牢顶住了狼。';}
        else{const safe=rand(s)<(.35+(s.facilities.fence||0)*.13);if(safe)result='盆声吓跑了狼。';else{const p=pick(s,livePigs(s));if(p){p.health=clamp(p.health-18);p.mood=clamp(p.mood-22);result=`狼抓伤了${p.name}。`;}}}break;}
      case'neighbor':if(choice==='help'&&(s.inventory.crops.wheat||0)>=3){s.inventory.crops.wheat-=3;s.reputation+=4;result='何伯记下了这份人情。';}else result='何伯提着空布袋回去了。';break;
      case'vet':{const p=livePigs(s).find(x=>x.illness);if(choice==='check'&&p){p.health=clamp(p.health+18);p.illness=null;s.stats.illnessCured++;result=`林兽医治好了${p.name}。`;}else{s.inventory.medicine++;result='你学到防疫知识，并得到一份兽药。';}break;}
      case'storm':if(choice==='field'){s.fields.filter(f=>f.crop).forEach(f=>f.watered=true);const loss=Math.min(2,s.inventory.crops.corn||0);s.inventory.crops.corn-=loss;result='作物保住了，粮仓少了些玉米。';}else{s.fields.filter(f=>f.crop&&!f.ready).forEach(f=>f.progress=Math.max(0,f.progress-1));result='库存安然无恙，田里作物倒伏了一点。';}break;
      case'inspector':if(choice==='clean'&&s.inventory.medicine>0){s.inventory.medicine--;livePigs(s).forEach(p=>p.health=clamp(p.health+5));s.reputation+=3;result='消毒合格，农场口碑提升。';}else{const bad=livePigs(s).some(p=>p.illness);s.reputation+=bad?-3:1;result=bad?'病猪让检查结果不太理想。':'记录齐全，顺利过关。';}break;
      case'gift':if(choice==='share'){livePigs(s).filter(p=>breed(p.breedId).role==='宠物猪').forEach(p=>{p.mood=clamp(p.mood+15);p.bond=clamp(p.bond+5)});result='宠物猪们吃得很开心。';}else{s.inventory.crops.carrot=(s.inventory.crops.carrot||0)+5;result='收获胡萝卜×5。';}break;
      case'boar':if(choice==='keep'&&livePigs(s).length<capacity(s)){const p=makePig(s,pick(s,['largewhite','ningxiang','juliana']),{});s.pigs.push(p);result=`仔猪留下了，取名${p.name}。`;}else{s.reputation+=3;s.money+=300;s.stats.earned+=300;result='主人送来¥300谢礼。';}break;
    }
    s.pendingEvent=null;s.nextEventIn=rnd(s,8,12);s.stats.eventsResolved++;log(s,`事件处理：${result}`,'event');return {ok:true,result};
  }

  function finishYear(s){
    if(!s.yearEnd||s.yearEnd.type!=='annual')return {ok:false,error:'现在不是年市。'};
    const old=s.year;s.year++;s.quarter=0;s.location='farm';s.yearEnd=null;s.pendingEvent=null;s.nextEventIn=rnd(s,8,12);s.feedBatch=null;s.reputation+=2;refreshMarket(s);livePigs(s).forEach(p=>p.mood=clamp(p.mood+8));log(s,`第${old+1}年开始了。镇民都在谈论最终的比猪大赛。`,'story');storyUpdate(s);return {ok:true};
  }
  function scorePig(s,p){
    const b=breed(p.breedId),health=p.health*.22,mood=p.mood*.18,bond=p.bond*.08,pedigree=p.pedigree*.08;
    let specialty=0;
    if(b.role==='肉猪')specialty=clamp(p.weight/(b.max*.82)*30,5,30);
    if(b.role==='宠物猪')specialty=clamp((p.mood+p.bond)/200*30,5,30);
    if(b.role==='繁育猪')specialty=clamp((b.fertility/1.42*18)+(p.pedigree/100*12),5,30);
    const facility=Math.min(8,(s.facilities.pen||0)+(s.facilities.clinic||0));
    return Math.round((health+mood+bond+pedigree+specialty+facility+storyFarmBonus(s))*(p.illness?.7:1));
  }
  function finishContest(s){
    const eligible=livePigs(s).filter(p=>phaseOf(p)==='adult'||phaseOf(p)==='senior');
    const entries=eligible.map(p=>({name:p.name,farm:s.farmName,breed:breed(p.breedId).name,score:scorePig(s,p),player:true,pigId:p.id})).sort((a,b)=>b.score-a.score);
    const player=entries[0]||{name:'空栏',farm:s.farmName,breed:'无参赛猪',score:0,player:true};
    const rawRivalScore=rivalScoreFor(s),finalRivalScore=Math.max(60,clamp(rawRivalScore-10,82,92)+rnd(s,-2,3));
    const rivals=[
      {name:'黑将军',farm:'陆野 · 石桥牧场',breed:'杜洛克',score:finalRivalScore,rival:true},
      {name:'雪球',farm:'桂婶农庄',breed:'大白猪',score:rnd(s,70,87)},
      {name:'铃铛',farm:'河湾小院',breed:'库内库内猪',score:rnd(s,68,86)}
    ];
    const rankings=[player,...rivals].sort((a,b)=>b.score-a.score);const rank=rankings.findIndex(x=>x.player)+1,win=rank===1;
    s.quarter=D.YEAR_DAYS*4;s.location='contest';s.ended=true;s.yearEnd=null;s.pendingEvent=null;
    const stone=rankings.find(x=>x.rival);s.ending={win,rank,champion:player,rankings,at:Date.now(),rivalScore:stone?.score||0,rivalRawScore:rawRivalScore,ceremonyPending:true,title:win?'金猪奖杯':'未完的农场故事',text:win?`${player.name}在最终对决中压过陆野的黑将军，以健康、状态与培育表现赢得全场最高分。`:`${player.name}获得第${rank}名。陆野与黑将军守住了石桥牧场的强敌位置，三年赛程至此结束。`};
    log(s,win?`${player.name}赢得了比猪大赛，正在等待正式颁奖。`:`比猪大赛结束，${player.name}获得第${rank}名，正在等待正式颁奖。`,'story');
  }

  function warnings(s){
    const w=[];s.pigs.filter(p=>!p.alive&&!p.disposed).forEach(p=>w.push({level:'danger',text:`${p.name}的遗体已暴露${p.exposure||0}天，需立即处理。`}));
    livePigs(s).filter(p=>p.illness).forEach(p=>w.push({level:'danger',text:`${p.name}患有${disease(p.illness).name}。`}));
    livePigs(s).filter(p=>p.hunger<30).forEach(p=>w.push({level:'warn',text:`${p.name}很饿；低于25后健康会开始下降。`}));
    if(livePigs(s).length>=capacity(s))w.push({level:'warn',text:'猪圈已满，无法购入或留下更多仔猪。'});
    const ready=s.fields.filter(f=>f.ready).length;if(ready)w.push({level:'good',text:`${ready}块田可以收获。`});
    return w;
  }
  function summary(s){return {time:timeLabel(s),day:currentDay(s),totalDay:totalDay(s),season:season(s),phase:D.PHASES[phaseIndex(s)],capacity:capacity(s),plots:plotCapacity(s),live:livePigs(s).length,warnings:warnings(s)};}
  function validate(s){
    const errors=[];
    if(!s||typeof s!=='object')return {ok:false,errors:['存档不是有效对象']};
    if(s.version!==3)errors.push('存档版本不匹配');
    if(!Number.isInteger(s.year)||s.year<1||s.year>3)errors.push('年份越界');
    if(!Number.isInteger(s.quarter)||s.quarter<0||s.quarter>D.YEAR_DAYS*4)errors.push('时间越界');
    if(!Number.isFinite(s.money)||!Number.isFinite(s.reputation)||!Number.isFinite(s.actionCount))errors.push('数值数据无效');
    if(!s.inventory||typeof s.inventory!=='object'||!s.facilities||typeof s.facilities!=='object'||!Array.isArray(s.pigs)||!Array.isArray(s.fields))errors.push('核心数据缺失');
    if(!['farm','market','rival','forest','village','contest'].includes(s.location||'farm'))errors.push('场景位置无效');
    const ids=new Set();(s.pigs||[]).forEach(p=>{
      if(!p||typeof p!=='object'){errors.push('猪只数据无效');return;}
      if(typeof p.id!=='string'||!p.id.trim())errors.push('猪只编号无效');else if(ids.has(p.id))errors.push('猪只编号重复');else ids.add(p.id);
      if(!D.BREEDS.some(b=>b.id===p.breedId))errors.push(`未知猪种：${p.breedId||'空'}`);
      if(!Number.isFinite(p.ageDays)||p.ageDays<0||!Number.isFinite(p.weight)||p.weight<0)errors.push(`猪只成长数据无效：${p.name||p.id||'未命名'}`);
      for(const key of ['health','mood','hunger','bond','pedigree'])if(!Number.isFinite(p[key])||p[key]<0||p[key]>100)errors.push(`猪只属性无效：${p.name||p.id||'未命名'}·${key}`);
    });
    return {ok:errors.length===0,errors};
  }
  function migrate(raw){
    if(!raw)return null;const normalize=s=>{
      s.stats=Object.assign(clone(STAT_DEFAULTS),s.stats||{});rivalState(s);forestState(s);villageState(s);contestState(s);storyState(s);staffState(s);contractState(s);festivalState(s);
      if(!['farm','market','rival','forest','village','contest'].includes(s.location))s.location='farm';
      if(!s.eventClockVersion){s.nextEventIn=Math.max(4,(Number(s.nextEventIn)||3)*4);s.eventClockVersion=2;}s.nextEventIn=Math.max(1,Number(s.nextEventIn)||12);
      if(s.feedBatch&&(!Array.isArray(s.feedBatch.pigIds)||s.feedBatch.actionCount!==s.actionCount))s.feedBatch=null;if(s.plantBatch&&(!Array.isArray(s.plantBatch.plotIndexes)||s.plantBatch.actionCount!==s.actionCount))s.plantBatch=null;careState(s);if(s.ending&&s.ending.ceremonyPending==null)s.ending.ceremonyPending=false;
      (s.pigs||[]).forEach(p=>{p.worldPen=0;p.satietyDays=Math.max(0,Number(p.satietyDays)||0);p.feedGrowthMultiplier=Number(p.feedGrowthMultiplier)||1;p.feedGrowthDays=Math.max(0,Number(p.feedGrowthDays)||0);p.postpartum=Math.max(0,Number(p.postpartum)||0);p.litters=Math.max(0,Number(p.litters)||0);});refreshContracts(s);if(!s.ended)storyUpdate(s);return s
    };if(raw.version===3)return normalize(raw);
    const fresh=createState(raw.playerName||'小禾',raw.farmName||'青禾猪场'),merged=Object.assign(fresh,raw,{version:3});return normalize(merged);
  }

  const Engine={createState,makePig,breed,disease,phaseOf,phaseName,sexName,currentDay,totalDay,timeLabel,season,capacity,plotCapacity,livePigs,refreshMarket,marketPrice,pigValue,feedTimeCost,feedPig,plantTimeCost,plant,waterAll,harvestTimeCost,harvestAll,craft,visitMarket,returnFromMarket,visitRival,returnFromRival,talkRival,practiceRival,rivalState,simulateRivalDay,rivalScoreFor,visitForest,returnFromForest,forageForest,brewForestRemedy,forestState,visitVillage,returnFromVillage,ensureVillageQuest,talkVillage,completeVillageQuest,sharpenTools,villageState,visitContest,returnFromContest,enterLocalContest,festivalEligibility,completeFestival,enterFestival,completeContestCeremony,contestState,festivalState,festivalDefinition,tradeItem,buyPig,sellPig,interactionTimeCost,freeCareRemaining,interact,breedPigs,treat,dispose,upgrade,resolveEvent,finishYear,scorePig,warnings,summary,validate,migrate,clone,generateEvent,advance,finishContest,remainingQuarters,storyState,storyChapter,storyProgress,storyGoals,storyUpdate,consumeStoryScene,chooseStory,storyFarmBonus,staffState,staffSlots,hireStaff,dismissStaff,returnTripCost,contractState,refreshContracts,acceptContract,completeContract,contractEligiblePigs,contractReady,contractRequirementOwned};
  root.PigEngine=Engine;if(typeof module!=='undefined'&&module.exports)module.exports=Engine;
})(typeof window!=='undefined'?window:globalThis);
