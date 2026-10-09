'use strict';
const E=require('../../game/engine.js');
const assert=(condition,message)=>{if(!condition)throw new Error(message)};

const state=E.createState('测试员','测试农场');
state.nextEventIn=999;
const first=state.pigs[0];
first.ageDays=E.breed(first.breedId).adult+3;
first.health=96;first.mood=92;first.bond=35;first.pedigree=80;

const visit=E.visitRival(state);
assert(visit.ok&&state.quarter===0&&state.location==='rival','前往石桥牧场不应耗时');
assert(state.rival.visits===1,'拜访次数未记录');
const talk1=E.talkRival(state),talk2=E.talkRival(state);
assert(talk1.firstToday&&!talk2.firstToday&&state.rival.rapport===1,'同一天交谈只能增加一次关系');
const practice=E.practiceRival(state,first.id);
assert(practice.ok&&Number.isFinite(practice.playerScore)&&Number.isFinite(practice.rivalScore),'训练赛评分异常');
assert(state.rival.practiceHistory.length===1,'训练记录未写入');
assert(!E.practiceRival(state,first.id).ok,'同一季不应重复参加训练赛');
const beforeReturn=state.quarter;assert(E.returnFromRival(state).ok,'应能从石桥牧场返回');
assert(state.quarter===beforeReturn+2&&state.location==='farm','从石桥牧场返回后应结算半日');

const old=E.createState();delete old.rival;
delete old.location;old.pigs.forEach((pig,index)=>pig.worldPen=index%4);
assert(E.migrate(old).rival&&Array.isArray(old.rival.practiceHistory),'旧存档未补齐竞争对手数据');
assert(old.location==='farm'&&old.pigs.every(pig=>pig.worldPen===0),'旧存档未迁移到农场与综合大猪圈');

const events=E.createState();events.nextEventIn=999;events.money=99999;
Object.keys(events.inventory.crops).forEach(key=>events.inventory.crops[key]=99);
const types=new Set();
for(let i=0;i<120&&types.size<8;i++){
  E.generateEvent(events);const event=events.pendingEvent;types.add(event.type);
  assert(event.speaker&&event.portrait&&event.dialogue?.length&&event.choices?.length===2,`事件 ${event.type} 缺少人物对话数据`);
  E.resolveEvent(events,event.choices[0].id);
}
assert(types.size===8,'未覆盖全部 8 类人物事件');

const ending=E.createState();ending.year=3;ending.nextEventIn=999;
const entrant=ending.pigs[0];entrant.ageDays=E.breed(entrant.breedId).adult+4;entrant.health=100;entrant.mood=100;entrant.bond=100;entrant.pedigree=100;entrant.weight=E.breed(entrant.breedId).max;
E.finishContest(ending);
assert(ending.ending.rankings.some(row=>row.rival&&row.name==='黑将军'),'最终排名缺少石桥牧场黑将军');
assert(ending.ending.text.includes('陆野'),'最终结局没有竞争对手对决叙事');

console.log(`PASS · 石桥牧场拜访/关系/训练赛/旧存档 · ${types.size}类人物事件 · 黑将军终局对决`);

