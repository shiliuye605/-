(function(){
  'use strict';

  const X_SCALE=16/9;
  // 可行走区只描述“地面在哪里”，不把作物、草丛等视觉内容误当成实体。
  // 中央窄多边形对应通往青石镇的最上方土路，主体多边形对应农场前景土地。
  const WALKABLE_AREAS=[
    [[1.8,48],[7,43],[17,40],[27,39],[35,38],[42,37],[50,36],[59,37],[68,36],[78,37],[89,39],[97.5,43],[97.5,78],[91,81],[85,86],[76,90],[64,93],[50,94],[35,93],[20,92],[2,91]],
    [[42.1,39],[42.7,34.1],[44.6,30.2],[47.7,29.8],[49.5,34.2],[50.2,39]]
  ];
  const STATIC_BLOCKERS=[
    {id:'农舍',kind:'polygon',points:[[2.5,17],[20.5,14],[30.4,27],[30.1,43.4],[25.8,48],[8,47.7],[2.4,41.2]]},
    {id:'谷仓',kind:'polygon',points:[[75.4,18.2],[88.8,13.5],[96.2,23.5],[96,42.6],[75.7,43.5]]},
    {id:'水井',kind:'ellipse',x:32.7,y:43.8,rx:3.9,ry:5.3},
    {id:'大树树干',kind:'ellipse',x:30.4,y:30.5,rx:2.2,ry:6.2},
    {id:'河岸与悬崖',kind:'polygon',points:[[82,87.5],[100,76.8],[100,100],[72.5,100]]},
    {id:'东侧巨石',kind:'ellipse',x:96.1,y:69.2,rx:2.4,ry:3.2},
    {id:'南侧巨石',kind:'ellipse',x:92.5,y:72.2,rx:2.4,ry:3},
    {id:'大猪圈西北围栏',kind:'segment',a:[45.8,33.8],b:[63.1,22.8],r:1.05},
    {id:'大猪圈北侧围栏',kind:'segment',a:[63.1,22.8],b:[75.2,28.2],r:1.05},
    {id:'大猪圈谷仓连接围栏',kind:'segment',a:[95.2,37.8],b:[99.2,39.5],r:1.05},
    {id:'大猪圈东侧围栏',kind:'segment',a:[99.2,39.5],b:[99.1,58.8],r:1.05},
    {id:'大猪圈东南围栏',kind:'segment',a:[99.1,58.8],b:[83.1,69.1],r:1.05},
    {id:'大猪圈南侧围栏1',kind:'segment',a:[83.1,69.1],b:[78.7,73.4],r:1.05},
    {id:'大猪圈南侧围栏2',kind:'segment',a:[78.7,73.4],b:[65.7,66.5],r:1.05},
    {id:'大猪圈栏门',kind:'segment',a:[65.7,66.5],b:[61.5,63.8],r:1.12},
    {id:'大猪圈西南围栏',kind:'segment',a:[61.5,63.8],b:[52.4,56.2],r:1.05},
    {id:'大猪圈西侧围栏',kind:'segment',a:[52.4,56.2],b:[45.9,48.1],r:1.05},
    {id:'大猪圈西侧上段',kind:'segment',a:[45.9,48.1],b:[45.8,33.8],r:1.05}
  ];

  let pigProvider=()=>[];
  const sq=n=>n*n;
  function pointInPolygon(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j],cross=(a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0];if(cross)inside=!inside}return inside}
  function segmentDistance(x,y,a,b){const px=x*X_SCALE,py=y,ax=a[0]*X_SCALE,ay=a[1],bx=b[0]*X_SCALE,by=b[1],dx=bx-ax,dy=by-ay,l=sq(dx)+sq(dy),t=l?Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/l)):0;return Math.hypot(px-(ax+t*dx),py-(ay+t*dy))}
  function hitsBlocker(x,y,b){if(b.kind==='polygon')return pointInPolygon(x,y,b.points);if(b.kind==='ellipse')return sq((x-b.x)/b.rx)+sq((y-b.y)/b.ry)<=1;if(b.kind==='segment')return segmentDistance(x,y,b.a,b.b)<=b.r;return false}
  function onWalkableGround(x,y){return WALKABLE_AREAS.some(points=>pointInPolygon(x,y,points))}
  function pointBlocked(x,y,includePigs=true){if(!onWalkableGround(x,y))return true;if(STATIC_BLOCKERS.some(blocker=>hitsBlocker(x,y,blocker)))return true;if(includePigs&&pigProvider().some(p=>Math.hypot((x-p.x)*X_SCALE,y-p.y)<1.55))return true;return false}
  function canStand(x,y,options={}){const includePigs=options.pigs!==false,samples=[[0,0],[-.68,0],[.68,0],[0,-.82],[0,.88],[-.48,.62],[.48,.62]];return samples.every(([dx,dy])=>!pointBlocked(x+dx,y+dy,includePigs))}
  function resolveMovement(x,y,nx,ny){if(canStand(nx,ny))return {x:nx,y:ny,blocked:false};if(canStand(nx,y))return {x:nx,y,blocked:true};if(canStand(x,ny))return {x,y:ny,blocked:true};return {x,y,blocked:true}}
  function lineClear(a,b){const d=Math.hypot((b.x-a.x)*X_SCALE,b.y-a.y),steps=Math.max(1,Math.ceil(d/.65));for(let i=1;i<=steps;i++){const t=i/steps;if(!canStand(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,{pigs:false}))return false}return true}

  class MinHeap{constructor(){this.items=[]}push(value){const a=this.items;a.push(value);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p].f<=value.f)break;a[i]=a[p];i=p}a[i]=value}pop(){const a=this.items,root=a[0],tail=a.pop();if(a.length){let i=0;a[0]=tail;while(true){let l=i*2+1,r=l+1,b=i;if(l<a.length&&a[l].f<a[b].f)b=l;if(r<a.length&&a[r].f<a[b].f)b=r;if(b===i)break;[a[i],a[b]]=[a[b],a[i]];i=b}}return root}get length(){return this.items.length}}
  function nearestGrid(point,step=2){const cx=Math.round(point.x/step),cy=Math.round(point.y/step);for(let radius=0;radius<7;radius++)for(let oy=-radius;oy<=radius;oy++)for(let ox=-radius;ox<=radius;ox++){if(Math.max(Math.abs(ox),Math.abs(oy))!==radius)continue;const x=(cx+ox)*step,y=(cy+oy)*step;if(canStand(x,y,{pigs:false}))return {x,y,i:cx+ox,j:cy+oy}}return null}
  function findPath(start,goal){
    const target=canStand(goal.x,goal.y,{pigs:false})?goal:nearestGrid(goal);if(!target)return [];if(lineClear(start,target))return [{x:target.x,y:target.y}];
    const step=2,s=nearestGrid(start,step),g=nearestGrid(target,step);if(!s||!g)return [];const key=(i,j)=>`${i},${j}`,open=new MinHeap(),came=new Map(),cost=new Map(),closed=new Set(),startKey=key(s.i,s.j),goalKey=key(g.i,g.j);cost.set(startKey,0);open.push({...s,f:Math.hypot((s.x-g.x)*X_SCALE,s.y-g.y)});
    const dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];let found=null,guard=0;while(open.length&&guard++<6000){const cur=open.pop(),ck=key(cur.i,cur.j);if(closed.has(ck))continue;closed.add(ck);if(ck===goalKey){found=cur;break}for(const [di,dj] of dirs){const ni=cur.i+di,nj=cur.j+dj,nx=ni*step,ny=nj*step,nk=key(ni,nj);if(closed.has(nk)||!canStand(nx,ny,{pigs:false})||!lineClear(cur,{x:nx,y:ny}))continue;const nextCost=cost.get(ck)+Math.hypot(di*step*X_SCALE,dj*step);if(nextCost>=(cost.get(nk)??Infinity))continue;cost.set(nk,nextCost);came.set(nk,ck);open.push({x:nx,y:ny,i:ni,j:nj,f:nextCost+Math.hypot((nx-g.x)*X_SCALE,ny-g.y)})}}
    if(!found)return [];const raw=[];let current=goalKey;while(current!==startKey){const [i,j]=current.split(',').map(Number);raw.push({x:i*step,y:j*step});current=came.get(current);if(!current)return []}raw.reverse();raw.push({x:target.x,y:target.y});const smooth=[],points=[...raw],origin={x:start.x,y:start.y};let from=origin,index=0;while(index<points.length){let far=index;for(let j=points.length-1;j>=index;j--)if(lineClear(from,points[j])){far=j;break}smooth.push(points[far]);from=points[far];index=far+1}return smooth;
  }

  class WeatherFX{
    constructor(canvas,world){this.canvas=canvas;this.world=world;this.ctx=canvas.getContext('2d');this.weather='';this.drops=[];this.splashes=[];this.motes=[];this.last=0;this.resize();new ResizeObserver(()=>this.resize()).observe(world);requestAnimationFrame(t=>this.frame(t))}
    resize(){const r=this.world.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);this.width=Math.max(1,r.width);this.height=Math.max(1,r.height);this.canvas.width=Math.round(this.width*dpr);this.canvas.height=Math.round(this.height*dpr);this.canvas.style.width=this.width+'px';this.canvas.style.height=this.height+'px';this.ctx.setTransform(dpr,0,0,dpr,0,0)}
    setWeather(weather){if(this.weather===weather)return;this.weather=weather;this.drops=[];this.splashes=[];this.motes=[];this.world.dataset.weather=weather==='小雨'?'rain':weather==='大风'?'wind':weather==='多云'?'cloudy':'clear'}
    newDrop(){const depth=.2+Math.random()*.8,wind=-35-depth*35,ground=this.height*(.47+Math.random()*.53);return{x:Math.random()*(this.width+180)+40,y:-Math.random()*this.height,depth,wind,ground,speed:300+depth*620,length:6+depth*19,alpha:.15+depth*.43}}
    newMote(wind=false){return{x:Math.random()*this.width,y:Math.random()*this.height,speed:wind?45+Math.random()*85:4+Math.random()*8,vy:wind?-8+Math.random()*16:-3-Math.random()*4,size:wind?2+Math.random()*4:.8+Math.random()*1.5,life:Math.random()*10,leaf:wind,turn:Math.random()*Math.PI*2}}
    frame(time){const dt=Math.min(.034,(time-(this.last||time))/1000);this.last=time;this.draw(dt,time);requestAnimationFrame(t=>this.frame(t))}
    draw(dt,time){const c=this.ctx,w=this.width,h=this.height;c.clearRect(0,0,w,h);if(!this.world.offsetParent)return;if(this.weather==='小雨')this.drawRain(c,w,h,dt);else this.drawAir(c,w,h,dt,time,this.weather==='大风')}
    drawRain(c,w,h,dt){const wanted=Math.min(240,Math.max(95,Math.round(w*h/7200)));while(this.drops.length<wanted)this.drops.push(this.newDrop());const mist=c.createLinearGradient(0,0,0,h);mist.addColorStop(0,'rgba(105,150,170,.04)');mist.addColorStop(.65,'rgba(94,132,145,.10)');mist.addColorStop(1,'rgba(58,82,83,.15)');c.fillStyle=mist;c.fillRect(0,0,w,h);c.lineCap='round';for(const d of this.drops){d.x+=d.wind*dt;d.y+=d.speed*dt;if(d.y>=d.ground){if(d.depth>.48&&this.splashes.length<70)this.splashes.push({x:d.x,y:d.ground,age:0,depth:d.depth});Object.assign(d,this.newDrop());d.y=-d.length}c.beginPath();c.moveTo(d.x,d.y);c.lineTo(d.x+d.wind/d.speed*d.length,d.y-d.length);c.strokeStyle=`rgba(220,241,246,${d.alpha})`;c.lineWidth=.55+d.depth*1.15;c.stroke()}this.splashes=this.splashes.filter(s=>{s.age+=dt;if(s.age>.24)return false;const p=s.age/.24,r=1+p*6*s.depth;c.beginPath();c.ellipse(s.x,s.y,r,r*.28,0,Math.PI,Math.PI*2);c.strokeStyle=`rgba(221,242,244,${(1-p)*.58})`;c.lineWidth=.7;c.stroke();for(const side of [-1,1]){c.beginPath();c.moveTo(s.x+side*r*.25,s.y);c.lineTo(s.x+side*r*.75,s.y-r*(1-p));c.stroke()}return true})}
    drawAir(c,w,h,dt,time,wind){const wanted=wind?38:18;while(this.motes.length<wanted)this.motes.push(this.newMote(wind));for(const m of this.motes){m.life+=dt;m.turn+=dt*(wind?5:1);m.x+=m.speed*dt;m.y+=m.vy*dt+Math.sin(m.turn)*dt*(wind?18:3);if(m.x>w+15||m.y<-15||m.y>h+15)Object.assign(m,this.newMote(wind),{x:-10});c.save();c.translate(m.x,m.y);c.rotate(m.turn);c.fillStyle=wind?(m.life%2>1?'rgba(207,159,54,.62)':'rgba(86,129,48,.68)'):`rgba(255,238,160,${.18+.12*Math.sin(time/900+m.turn)})`;if(m.leaf)c.fillRect(-m.size,-m.size/2,m.size*2,m.size);else{c.beginPath();c.arc(0,0,m.size,0,Math.PI*2);c.fill()}c.restore()}}
  }

  class SceneController{
    constructor(world){this.world=world;this.weather=new WeatherFX(document.querySelector('#weather-canvas'),world);this.debugCanvas=document.querySelector('#collision-canvas');this.debug=false;this.path=[];this.initGrass();new ResizeObserver(()=>this.drawDebug()).observe(world)}
    initGrass(){const layer=document.querySelector('#grass-layer'),zones=[[35,45,48,62],[3,56,21,69],[73,68,95,84],[37,50,58,65]],rand=(()=>{let seed=71237;return()=>((seed=Math.imul(seed,48271)%2147483647)&2147483647)/2147483647})();let made=0;for(let tries=0;tries<180&&made<24;tries++){const z=zones[Math.floor(rand()*zones.length)],x=z[0]+rand()*(z[2]-z[0]),y=z[1]+rand()*(z[3]-z[1]);if(pointBlocked(x,y,false))continue;const blade=document.createElement('i');blade.className='grass-tuft';blade.style.cssText=`--x:${x}%;--y:${y}%;--delay:${(-rand()*4).toFixed(2)}s;--scale:${(.62+rand()*.5).toFixed(2)}`;layer.appendChild(blade);made++}}
    setWeather(weather){this.weather.setWeather(weather)}setPigProvider(provider){pigProvider=provider}resolveMovement(x,y,nx,ny){return resolveMovement(x,y,nx,ny)}findPath(start,goal){return findPath(start,goal)}canStand(x,y,options){return canStand(x,y,options)}setPath(path){this.path=path||[];this.drawDebug()}setDebug(flag){this.debug=!!flag;this.debugCanvas.classList.toggle('active',this.debug);this.drawDebug()}
    drawDebug(){if(!this.debug)return;const c=this.debugCanvas,rect=this.world.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);c.width=Math.round(rect.width*dpr);c.height=Math.round(rect.height*dpr);c.style.width=rect.width+'px';c.style.height=rect.height+'px';const x=v=>v/100*rect.width,y=v=>v/100*rect.height,ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);ctx.lineWidth=2;ctx.fillStyle='rgba(77,174,96,.14)';ctx.strokeStyle='rgba(125,255,151,.72)';for(const points of WALKABLE_AREAS){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(x(p[0]),y(p[1])):ctx.moveTo(x(p[0]),y(p[1])));ctx.closePath();ctx.fill();ctx.stroke()}ctx.fillStyle='rgba(194,52,45,.24)';ctx.strokeStyle='rgba(255,230,120,.88)';for(const b of STATIC_BLOCKERS){ctx.beginPath();if(b.kind==='polygon'){b.points.forEach((p,i)=>i?ctx.lineTo(x(p[0]),y(p[1])):ctx.moveTo(x(p[0]),y(p[1])));ctx.closePath();ctx.fill();ctx.stroke()}else if(b.kind==='ellipse'){ctx.ellipse(x(b.x),y(b.y),x(b.rx),y(b.ry),0,0,Math.PI*2);ctx.fill();ctx.stroke()}else{ctx.moveTo(x(b.a[0]),y(b.a[1]));ctx.lineTo(x(b.b[0]),y(b.b[1]));ctx.lineWidth=Math.max(3,y(b.r*2));ctx.stroke();ctx.lineWidth=2}}if(this.path.length){ctx.strokeStyle='#69f0ae';ctx.lineWidth=3;ctx.setLineDash([8,5]);ctx.beginPath();this.path.forEach((p,i)=>i?ctx.lineTo(x(p.x),y(p.y)):ctx.moveTo(x(p.x),y(p.y)));ctx.stroke();ctx.setLineDash([])}}
  }

  let controller=null;window.FarmScene={blockers:STATIC_BLOCKERS,walkableAreas:WALKABLE_AREAS,onWalkableGround,canStand,findPath,resolveMovement,mount(world){controller=controller||new SceneController(world);this.controller=controller;return controller}};
})();
