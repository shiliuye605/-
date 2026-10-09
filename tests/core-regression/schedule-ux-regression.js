const assert=require('assert');
const D=require('../../game/data.js');
const E=require('../../game/engine.js');

function ok(result,message){assert(result.ok,`${message}: ${result.error||'失败'}`)}
function fresh(){const state=E.createState('日程测试员','日程测试场');state.nextEventIn=999;return state}

// 同一轮连续播种三块地只结算一次整地时间，第四块开始新一轮。
let s=fresh(),q=s.quarter;
ok(E.plant(s,0,'wheat'),'播种第1块');
ok(E.plant(s,1,'wheat'),'播种第2块');
ok(E.plant(s,2,'wheat'),'播种第3块');
assert.equal(s.quarter,q+1,'连续播种3块田应合计1/4日');
ok(E.plant(s,3,'wheat'),'播种第4块');
assert.equal(s.quarter,q+2,'第4块田应开始新的播种批次');

// 小规模收获不再一律占半日，大规模收获仍保留劳动成本。
s=fresh();q=s.quarter;
s.fields.slice(0,3).forEach(f=>Object.assign(f,{crop:'wheat',ready:true,progress:99}));
assert.equal(E.harvestTimeCost(s),1);
ok(E.harvestAll(s),'收获3块田');
assert.equal(s.quarter,q+1,'收获1—3块田应占1/4日');
s=fresh();q=s.quarter;
s.fields.slice(0,4).forEach(f=>Object.assign(f,{crop:'wheat',ready:true,progress:99}));
assert.equal(E.harvestTimeCost(s),2);
ok(E.harvestAll(s),'收获4块田');
assert.equal(s.quarter,q+2,'收获4块以上应占半日');

// 每日前两只猪的短互动免费；重复照料或长互动仍有时间成本。
s=fresh();q=s.quarter;
const [a,b,c]=s.pigs;
ok(E.interact(s,a.id,D.INTERACTIONS[E.phaseOf(a)][0].id),'第一只短互动');
ok(E.interact(s,b.id,D.INTERACTIONS[E.phaseOf(b)][0].id),'第二只短互动');
assert.equal(s.quarter,q,'前两只猪的短互动不应推进日程');
ok(E.interact(s,a.id,D.INTERACTIONS[E.phaseOf(a)][1].id),'重复照料第一只');
assert.equal(s.quarter,q+1,'超过免费关怀规则的短互动应占1/4日');
c.ageDays=E.breed(c.breedId).adult+1;
const long=D.INTERACTIONS.adult.find(item=>item.time===2);
ok(E.interact(s,c.id,long.id),'成年猪长互动');
assert.equal(s.quarter,q+3,'泥浴等长互动仍应占半日');

// 外地采集、对话、交易和服务不重复扣时，返程统一结算路程。
s=fresh();q=s.quarter;
ok(E.visitForest(s),'前往后山');
for(const spot of ['oak','herbs','bridge','deadwood'])ok(E.forageForest(s,spot),`采集${spot}`);
assert.equal(s.quarter,q,'后山采集点应并入返程时间');
ok(E.returnFromForest(s),'后山返程');
assert.equal(s.quarter,q+2,'后山往返统一结算半日');

s=fresh();q=s.quarter;
ok(E.visitVillage(s),'前往青石村');
ok(E.talkVillage(s),'茶馆交谈');
ok(E.sharpenTools(s),'铁匠服务');
assert.equal(s.quarter,q,'村庄交谈和服务不应单独扣时');
ok(E.returnFromVillage(s),'村庄返程');
assert.equal(s.quarter,q+2,'村庄往返统一结算半日');

s=fresh();q=s.quarter;
ok(E.visitMarket(s),'前往市场');
ok(E.tradeItem(s,'seed','corn','buy',1),'市场买种子');
assert.equal(s.quarter,q,'场内交易不应单独扣时');
ok(E.returnFromMarket(s),'市场返程');
assert.equal(s.quarter,q+4,'市场往返仍应按设定结算1日');

console.log('PASS · 日程体验：批量播种/弹性收获/每日关怀/外地统一结算');

