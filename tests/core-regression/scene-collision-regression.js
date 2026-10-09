const fs=require('fs');
const assert=require('assert');

const source=fs.readFileSync(require('path').join(__dirname,'..','..','game','app.js'),'utf8');
const match=source.match(/const EXTRA_SCENES=(\{[\s\S]*?\n  \});\r?\n  const extraPlayer/);
assert(match,'无法读取新场景碰撞配置');
const scenes=Function(`"use strict";return (${match[1]})`)();
const X=16/9;

function inside(x,y,points){let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j],cross=(a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0];if(cross)hit=!hit}return hit}
function canStand(scene,x,y){const samples=[[0,0],[-.72,0],[.72,0],[0,-.88],[0,.96],[-.52,.68],[.52,.68]];return samples.every(([dx,dy])=>scene.walkable.some(poly=>inside(x+dx,y+dy,poly))&&!scene.blockers.some(poly=>inside(x+dx,y+dy,poly)))}
function lineClear(scene,a,b){const distance=Math.hypot((b.x-a.x)*X,b.y-a.y),steps=Math.max(1,Math.ceil(distance/.65));for(let i=1;i<=steps;i++){const t=i/steps;if(!canStand(scene,a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t))return false}return true}
function nearestGrid(scene,point,step=1){const cx=Math.round(point.x/step),cy=Math.round(point.y/step);for(let r=0;r<10;r++)for(let oy=-r;oy<=r;oy++)for(let ox=-r;ox<=r;ox++){if(Math.max(Math.abs(ox),Math.abs(oy))!==r)continue;const x=(cx+ox)*step,y=(cy+oy)*step;if(canStand(scene,x,y))return{x,y,i:cx+ox,j:cy+oy}}return null}
function connected(scene,start,goal){if(lineClear(scene,start,goal))return true;const step=1,s=nearestGrid(scene,start,step),g=nearestGrid(scene,goal,step);if(!s||!g)return false;const key=(i,j)=>`${i},${j}`,queue=[s],seen=new Set([key(s.i,s.j)]),goalKey=key(g.i,g.j);for(let index=0;index<queue.length&&index<15000;index++){const cur=queue[index],ck=key(cur.i,cur.j);if(ck===goalKey)return true;for(const [di,dj] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]){const ni=cur.i+di,nj=cur.j+dj,nk=key(ni,nj),next={x:ni*step,y:nj*step,i:ni,j:nj};if(seen.has(nk)||!canStand(scene,next.x,next.y)||!lineClear(scene,cur,next))continue;seen.add(nk);queue.push(next)}}return false}

const report={};
for(const [sceneId,scene] of Object.entries(scenes)){
  assert(canStand(scene,scene.start.x,scene.start.y),`${sceneId} 出生点不在可行走地面`);
  report[sceneId]={};
  for(const [zoneId,zone] of Object.entries(scene.zones)){
    const target={x:zone.walkX,y:zone.walkY};
    const standable=canStand(scene,target.x,target.y),reachable=standable&&connected(scene,scene.start,target);
    report[sceneId][zoneId]={standable,reachable};
    assert(standable,`${sceneId}.${zoneId} 落脚点与实体碰撞重叠`);
    if(!reachable){const candidates=[];for(let y=20;y<=90;y++)for(let x=5;x<=95;x++)if(canStand(scene,x,y)&&connected(scene,scene.start,{x,y}))candidates.push({x,y,d:Number(Math.hypot(x-zone.x,y-zone.y).toFixed(1))});candidates.sort((a,b)=>a.d-b.d);assert(reachable,`${sceneId}.${zoneId} 无法从场景入口到达；最近可达点 ${JSON.stringify(candidates.slice(0,8))}`)}
  }
}

console.log('PASS · 3个独立场景 · 17个交互点全部可站立且与入口连通');

