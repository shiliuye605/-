'use strict';
const assert=require('assert');
const path=require('path');
const E=require(path.join(__dirname,'..','..','game','engine.js'));

const chapters=['1-1','1-2','1-3','2-1','2-2','2-3','3-1','3-2','3-3'];
function makeFinalist(seed,profile){
  const s=E.createState('平衡测试员','平衡测试农场');
  s.rng=seed;s.year=3;s.quarter=240;
  const p=s.pigs[0];
  p.ageDays=80;p.weight=287;p.hunger=100;p.illness=null;
  s.pigs=[p];s.story.candidateId=p.id;s.story.route='育肥路线';s.story.integrity=2;
  if(profile==='max'){
    Object.assign(p,{health:100,mood:100,bond:100,pedigree:70});
    s.facilities.pen=4;s.facilities.clinic=4;
    s.story.outcomes=Object.fromEntries(chapters.map(key=>[key,'complete']));
    s.story.welfareTotal=90*180;s.story.welfareDays=180;
  }else if(profile==='prepared'){
    Object.assign(p,{health:95,mood:95,bond:85,pedigree:70});
    s.facilities.pen=3;s.facilities.clinic=3;
    s.story.outcomes=Object.fromEntries(chapters.map(key=>[key,'complete']));
    s.story.welfareTotal=90*180;s.story.welfareDays=180;
  }else{
    Object.assign(p,{health:92,mood:90,bond:70,pedigree:65});
    s.facilities.pen=3;s.facilities.clinic=3;
    s.story.outcomes=Object.fromEntries(chapters.slice(0,8).map(key=>[key,'complete']));
    s.story.welfareTotal=80*180;s.story.welfareDays=180;
  }
  return s;
}

const trials=1000,wins={max:0,prepared:0,developing:0},scores={},rivalFinal=[],rivalRaw=[];
for(let seed=1;seed<=trials;seed++){
  for(const profile of Object.keys(wins)){
    const s=makeFinalist(seed,profile);
    scores[profile]=E.scorePig(s,s.pigs[0]);
    E.finishContest(s);
    if(profile==='max'){
      rivalFinal.push(s.ending.rivalScore);
      rivalRaw.push(s.ending.rivalRawScore);
    }
    if(s.ending.win)wins[profile]++;
  }
}

assert.deepEqual(scores,{max:100,prepared:94,developing:90});
assert(Math.min(...rivalFinal)>=89&&Math.max(...rivalFinal)<=95,'最终对手应落在89—95分');
assert(Math.min(...rivalRaw)>=99,'原始动态经营评分仍应保持训练赛强度');
assert.equal(wins.max,trials,'100分候选猪应稳定夺冠');
assert(wins.prepared/trials>=.8,'94分候选猪应有明显胜算');
assert(wins.developing/trials>=.12&&wins.developing/trials<=.35,'90分候选猪应有机会但不能稳定夺冠');
console.log(`PASS · 最终决赛平衡：黑将军${Math.min(...rivalFinal)}—${Math.max(...rivalFinal)}分；100分胜率${wins.max/trials*100}%；94分胜率${(wins.prepared/trials*100).toFixed(1)}%；90分胜率${(wins.developing/trials*100).toFixed(1)}%`);

