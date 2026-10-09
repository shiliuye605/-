const assert=require('assert');
const D=require('../../game/data.js');
const E=require('../../game/engine.js');

for(let run=0;run<30;run++){
  const s=E.createState('压力测试','随机农场');s.rng=run+1;s.inventory.feeds.basic=500;s.inventory.medicine=200;s.money=100000;
  let guard=0;
  while(!s.ended&&guard++<900){
    if(s.pendingEvent){const r=E.resolveEvent(s,s.pendingEvent.choices[run%s.pendingEvent.choices.length].id);assert(r.ok);}
    else if(s.yearEnd){assert(E.finishYear(s).ok);}
    else{
      const live=E.livePigs(s),sick=live.find(p=>p.illness),corpse=s.pigs.find(p=>!p.alive&&!p.disposed);let r;
      if(corpse)r=E.dispose(s,corpse.id);
      else if(sick)r=E.treat(s,sick.id);
      else switch((guard+run)%8){
        case 0:{const p=live[0];r=p?E.feedPig(s,p.id,'basic'):null;break;}
        case 1:{const empty=s.fields.findIndex(f=>!f.crop);r=empty>=0?E.plant(s,empty,Object.keys(D.CROPS)[(guard+run)%8]):E.waterAll(s);break;}
        case 2:r=E.waterAll(s);break;
        case 3:r=E.harvestAll(s);break;
        case 4:{const p=live[0];r=p?E.interact(s,p.id,D.INTERACTIONS[E.phaseOf(p)][0].id):null;break;}
        case 5:r=E.craft(s,'basic');break;
        case 6:r=E.visitMarket(s);if(r.ok)r=E.returnFromMarket(s);break;
        default:r=E.upgrade(s,Object.keys(D.FACILITIES)[(guard+run)%6]);
      }
      if(!r||!r.ok)E.advance(s,1,'压力测试等待');
    }
    const check=E.validate(s);assert(check.ok,check.errors.join(','));
    assert(Number.isFinite(s.money)&&Number.isFinite(s.quarter));
    s.pigs.forEach(p=>{assert(Number.isFinite(p.health)&&Number.isFinite(p.mood)&&Number.isFinite(p.weight));});
  }
  assert(s.ended,`第${run}轮未在限制内结束`);assert(s.ending&&s.ending.rank>=1&&s.ending.rank<=4);
}
console.log('PASS · 30 份随机农场完整跑完 3 年，无越界、NaN、死锁或终局缺失');

