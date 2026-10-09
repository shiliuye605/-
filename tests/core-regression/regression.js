const assert = require('assert');
const D = require('../../game/data.js');
const E = require('../../game/engine.js');

function ok(result,msg){ assert(result.ok, `${msg}: ${result.error||'失败'}`); }
function fresh(){ const s=E.createState('测试员','测试猪场'); s.nextEventIn=999; return s; }

// 猪种和初始状态
assert(D.BREEDS.length >= 28,'猪种数量不足');
['肉猪','宠物猪','繁育猪'].forEach(role=>assert(D.BREEDS.filter(b=>b.role===role).length>=6,`${role}覆盖不足`));
let s=fresh(); assert(E.validate(s).ok); assert.equal(E.capacity(s),7); assert.equal(E.livePigs(s).length,3);

// 喂养、互动和时间差
const q0=s.quarter,firstPig=s.pigs[0],otherPig=s.pigs[1],thirdPig=s.pigs[2],firstHunger=firstPig.hunger,otherHunger=otherPig.hunger,feedStock=s.inventory.feeds.basic;ok(E.feedPig(s,firstPig.id,'basic'),'个体喂养');assert(firstPig.hunger>firstHunger);assert.equal(otherPig.hunger,otherHunger,'个体喂养不应影响其他猪');assert.equal(s.inventory.feeds.basic,feedStock-1,'个体喂养只应消耗1份');assert.equal(s.quarter,q0+1,'第一只个体喂养应耗时1/4日');
ok(E.feedPig(s,otherPig.id,'basic'),'同轮第二只喂养');ok(E.feedPig(s,thirdPig.id,'balanced'),'同轮第三只喂养');assert.equal(s.quarter,q0+1,'同一喂养轮次的三只猪应合计耗时1/4日');
const fourth=E.makePig(s,'largewhite',{name:'第四只'});s.pigs.push(fourth);ok(E.feedPig(s,fourth.id,'basic'),'第四只开始新轮次');assert.equal(s.quarter,q0+2,'第四只猪应开始新的1/4日喂养轮次');
const pet=s.pigs.find(p=>E.breed(p.breedId).role==='宠物猪');
const mood=pet.mood; ok(E.interact(s,pet.id,D.INTERACTIONS[E.phaseOf(pet)][0].id),'互动'); assert(pet.mood>mood); assert.equal(s.quarter,q0+2,'每日前两只猪的短互动不应推进日程');
E.generateEvent(s);const blockedMood=pet.mood;const blocked=E.interact(s,pet.id,D.INTERACTIONS[E.phaseOf(pet)][0].id);assert(!blocked.ok);assert.equal(pet.mood,blockedMood,'待处理事件期间不应偷加互动收益');

// 农田播种、浇水、成长和收获
s=fresh();const springPumpkinSeeds=s.inventory.seeds.pumpkin,plantQ=s.quarter;const offSeason=E.plant(s,0,'pumpkin');assert(!offSeason.ok,'引擎应阻止反季播种');assert.equal(s.inventory.seeds.pumpkin,springPumpkinSeeds);assert.equal(s.quarter,plantQ);
ok(E.plant(s,0,'wheat'),'播种'); ok(E.waterAll(s),'浇水');const wateredQ=s.quarter,repeatWater=E.waterAll(s);assert(!repeatWater.ok,'同一天重复浇水应被阻止');assert.equal(s.quarter,wateredQ,'重复浇水不应消耗时间');
for(let i=0;i<5;i++){ s.fields[0].watered=true; E.advance(s,4,'测试过日'); s.pendingEvent=null; s.nextEventIn=999; }
assert(s.fields[0].ready,'小麦应成熟'); const before=s.inventory.crops.wheat; ok(E.harvestAll(s),'收获'); assert(s.inventory.crops.wheat>before);

// 饲料制作和集市
s=fresh(); s.inventory.crops.corn=20;s.inventory.crops.wheat=20;s.inventory.crops.soy=20;
const fq=s.quarter; ok(E.craft(s,'balanced'),'制作饲料'); assert(s.inventory.feeds.balanced>=8); assert.equal(s.quarter,fq+2);
const mq=s.quarter; ok(E.visitMarket(s),'前往集市'); assert.equal(s.quarter,mq,'前往集市不应耗时');assert.equal(s.location,'market');
const money=s.money; ok(E.tradeItem(s,'seed','corn','buy',2),'买种子'); assert(s.money<money);
ok(E.returnFromMarket(s),'从集市返回');assert.equal(s.quarter,mq+4,'从集市返回后应耗时1日');assert.equal(s.location,'farm');
const farmCash=s.money,farmTrade=E.tradeItem(s,'seed','corn','buy',1);assert(!farmTrade.ok,'普通交易必须在集市进行');assert.equal(s.money,farmCash);

// 建造、治疗与死亡处理
s=fresh(); const cap=E.capacity(s),cash=s.money; ok(E.upgrade(s,'pen'),'升级猪圈'); assert(E.capacity(s)>cap); assert(s.money<cash);
s.pendingEvent=null;s.yearEnd=null;s.ended=false;s.nextEventIn=999;
const sick=s.pigs[0];sick.illness='cold';s.inventory.medicine=9; ok(E.treat(s,sick.id),'治疗'); assert(sick.health>0);
s.pendingEvent=null;s.yearEnd=null;s.ended=false;s.nextEventIn=999;sick.alive=false;sick.exposure=0;
ok(E.dispose(s,sick.id),'处理死猪'); assert(s.memorial.some(p=>p.id===sick.id));

// 事件强制处理且不占时间
s=fresh(); E.generateEvent(s); const eq=s.quarter,ac=s.actionCount; ok(E.resolveEvent(s,s.pendingEvent.choices[0].id),'处理事件'); assert.equal(s.quarter,eq);assert.equal(s.actionCount,ac);

// 事件、遗体和天气按经过时间结算，而不是按点击次数结算
s=fresh();s.nextEventIn=8;ok(E.advance(s,4,'第一天'),'推进第一天');assert(!s.pendingEvent);assert.equal(s.nextEventIn,4);ok(E.advance(s,4,'第二天'),'推进第二天');assert(s.pendingEvent,'经过2个完整游戏日后应触发事件');
s=fresh();const corpse=s.pigs[0];corpse.alive=false;corpse.exposure=0;for(let i=0;i<3;i++)ok(E.advance(s,1,'短行动'),'短行动');assert.equal(corpse.exposure,0,'同一天多次短行动不应累计遗体暴露');ok(E.advance(s,1,'跨日行动'),'跨日行动');assert.equal(corpse.exposure,1,'遗体暴露应按完整游戏日累计');

// 饲料生长加成要持续到每日成长结算
s=fresh();const boosted=E.clone(s),plain=E.clone(s),bp=boosted.pigs[0],pp=plain.pigs[0];bp.feedGrowthMultiplier=1.3;bp.feedGrowthDays=1;pp.feedGrowthMultiplier=1;pp.feedGrowthDays=1;boosted.rng=plain.rng=777;ok(E.advance(boosted,4,'加成成长'),'加成成长');ok(E.advance(plain,4,'普通成长'),'普通成长');assert(bp.weight>pp.weight,'高蛋白等饲料的成长倍率应进入每日成长公式');assert.equal(bp.feedGrowthDays,0);

// 场景权限与年底剩余时间必须在扣资源前拦截
s=fresh();ok(E.visitMarket(s),'前往集市');const remoteSeeds=s.inventory.seeds.wheat,remotePlant=E.plant(s,0,'wheat');assert(!remotePlant.ok);assert.equal(s.inventory.seeds.wheat,remoteSeeds,'在集市不能远程播种');
s=fresh();s.quarter=239;const beforeUpgradeMoney=s.money,beforePen=s.facilities.pen;const lateUpgrade=E.upgrade(s,'pen');assert(!lateUpgrade.ok,'年底剩余时间不足时不能开工');assert.equal(s.money,beforeUpgradeMoney,'被拒绝的工程不应扣款');assert.equal(s.facilities.pen,beforePen);

// 产后冷却与溢出仔猪补贴上限
s=fresh();const mother=s.pigs.find(p=>p.sex==='female'),father=s.pigs.find(p=>p.sex==='male');mother.ageDays=E.breed(mother.breedId).adult+2;father.ageDays=E.breed(father.breedId).adult+2;mother.postpartum=3;assert(!E.breedPigs(s,mother.id,father.id).ok,'产后恢复期不能连续配种');mother.postpartum=0;while(E.livePigs(s).length<E.capacity(s))s.pigs.push(E.makePig(s,'largewhite',{adult:true}));mother.pregnant=1;mother.fatherBreed=father.breedId;mother.prenatal=6;const beforeFarrowMoney=s.money;ok(E.advance(s,4,'等待分娩'),'等待分娩');assert.equal(mother.postpartum,8);assert.equal(mother.litters,1);assert(s.money-beforeFarrowMoney<=720,'溢出仔猪安置补贴每胎最多¥720');

// 售价同时体现心情与类型价值
s=fresh();const valued=s.pigs[0],lowMood=E.clone(valued),highMood=E.clone(valued);lowMood.mood=10;highMood.mood=100;assert(E.pigValue(s,highMood)>E.pigValue(s,lowMood),'心情应影响猪只成交价');

// 旧存档的“行动计数事件”自动迁移成游戏时间
s=fresh();delete s.eventClockVersion;s.nextEventIn=3;E.migrate(s);assert.equal(s.eventClockVersion,2);assert.equal(s.nextEventIn,12);

// 年底年市、跨年与第三年大赛
s=fresh();s.quarter=239;E.advance(s,1,'跨年测试');assert(s.yearEnd&&s.yearEnd.type==='annual');
ok(E.finishYear(s),'结束年市');assert.equal(s.year,2);assert.equal(s.quarter,0);
s.year=3;s.quarter=239;s.pendingEvent=null;s.yearEnd=null;s.nextEventIn=999;
s.pigs.forEach(p=>{p.ageDays=E.breed(p.breedId).adult+3;p.health=100;p.mood=100;p.bond=100;p.pedigree=100;p.weight=E.breed(p.breedId).max*.9;});
E.advance(s,1,'最终日');assert(s.ended&&s.ending&&s.ending.rank>=1);assert.equal(s.location,'contest');assert(s.ending.ceremonyPending,'终局后应先进入赛场颁奖流程');
ok(E.completeContestCeremony(s),'完成最终颁奖');ok(E.returnFromContest(s),'赛后返回农场');
const endQ=s.quarter;const ip=s.pigs.find(p=>p.alive);ok(E.interact(s,ip.id,D.INTERACTIONS[E.phaseOf(ip)][0].id),'赛后互动');assert.equal(s.quarter,endQ,'赛后互动不应推进时间');

// 存档序列化回归
const roundtrip=JSON.parse(JSON.stringify(s));assert(E.validate(roundtrip).ok);assert.equal(roundtrip.ending.rank,s.ending.rank);
console.log(`PASS · ${D.BREEDS.length}猪种 · 农场/市场/建造/事件/疾病/三年终局/赛后互动/存档`);

