const assert = require('assert');
const E = require('../../game/engine.js');

function ok(result,msg){ assert(result?.ok,`${msg}: ${result?.error||'失败'}`); }
function fresh(){ const s=E.createState('场景测试员','场景测试猪场'); s.nextEventIn=999; return s; }

// 后山林场：去程免费、采集点每日一次、返程半日。
let s=fresh(),q=s.quarter;
ok(E.visitForest(s),'进入后山林场');assert.equal(s.quarter,q);assert.equal(s.location,'forest');
const gathered=E.forageForest(s,'oak');ok(gathered,'采集橡果');assert(gathered.amount>=2&&gathered.amount<=4);assert.equal(s.quarter,q,'采集点不应在返程时间外重复计时');
assert(!E.forageForest(s,'oak').ok,'同一采集点同日不能重复采集');
E.forestState(s).resources.herb=3;const medicine=s.inventory.medicine;ok(E.brewForestRemedy(s),'制作山野兽药');assert.equal(s.inventory.medicine,medicine+1);assert.equal(s.quarter,q+1);
ok(E.returnFromForest(s),'离开后山');assert.equal(s.location,'farm');assert.equal(s.quarter,q+3);

// 青石村：茶馆交谈和公告栏交货不耗时，铁匠保养与返程分别计时。
s=fresh();q=s.quarter;ok(E.visitVillage(s),'进入青石村');assert.equal(s.quarter,q);
const talk=E.talkVillage(s);ok(talk,'茶馆交谈');assert(talk.firstToday);assert.equal(s.quarter,q);
const quest=E.ensureVillageQuest(s);s.inventory.crops[quest.cropId]=quest.qty;
const rewardMoney=s.money;ok(E.completeVillageQuest(s),'交付村庄委托');assert(s.money>rewardMoney);assert.equal(s.quarter,q);
ok(E.sharpenTools(s),'铁匠铺保养农具');assert.equal(E.villageState(s).harvestBoost,1);assert.equal(s.quarter,q,'铁匠服务不应在返程时间外重复计时');
ok(E.returnFromVillage(s),'离开青石村');assert.equal(s.location,'farm');assert.equal(s.quarter,q+2);

// 青石赛场：成年猪每季一次，赛事一天，返程半日。
s=fresh();q=s.quarter;const pig=s.pigs[0];pig.ageDays=E.breed(pig.breedId).adult+2;pig.health=95;pig.mood=92;pig.bond=80;
ok(E.visitContest(s),'进入青石赛场');assert.equal(s.quarter,q);
const entry=E.enterLocalContest(s,pig.id,'health');ok(entry,'参加季度赛事');assert(['gold','silver','bronze'].includes(entry.medal));assert.equal(s.quarter,q+4);
assert(!E.enterLocalContest(s,pig.id,'body').ok,'同一季不能重复参赛');
ok(E.returnFromContest(s),'离开青石赛场');assert.equal(s.location,'farm');assert.equal(s.quarter,q+6);

// 新状态必须可存档并通过完整性校验。
assert(E.validate(s).ok);const restored=E.migrate(JSON.parse(JSON.stringify(s)));assert(E.validate(restored).ok);
assert.equal(restored.contest.entries,1);assert(restored.forest&&restored.village&&restored.contest);
console.log('PASS · 后山林场/青石村/青石赛场 · 去程/互动/返程/存档');

