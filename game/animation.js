/* Continuous, distance-driven sprite poses. Art state never enters the save file. */
(function(root){
  'use strict';
  const TAU=Math.PI*2,clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  const damp=(a,b,dt,rate=12)=>a+(b-a)*(1-Math.exp(-rate*dt));
  const images=new Map(),actors=new Map(),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let last=0,dirty=true,visibleActors=[];
  function getImage(src){if(!images.has(src)){const img=new Image();img.src=src;images.set(src,img)}return images.get(src)}
  function create(el,type){
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
    canvas.className='art-canvas';canvas.setAttribute('aria-hidden','true');el.append(canvas);el.classList.add('art-ready');
    const a={el,type,canvas,c:canvas.getContext('2d'),phase:0,blend:0,rest:0,head:0,roll:0,turn:1,
      x:parseFloat(el.style.left)||0,y:parseFloat(el.style.top)||0,mode:'idle',modeTime:0,seed:(actors.size*1.713)%6.28};
    a.c.imageSmoothingEnabled=false;actors.set(el,a);return a;
  }
  function scan(){
    document.querySelectorAll('.player-sprite,.pig-sprite[data-breed]').forEach(el=>{if(!actors.has(el))create(el,el.classList.contains('player-sprite')?'farmer':'pig')});
    for(const [el] of actors)if(!el.isConnected)actors.delete(el);
    visibleActors=[...actors.values()].filter(a=>!a.el.closest('.hidden'));dirty=false;
  }
  function region(c,img,sx,sy,sw,sh,px,py,angle=0,dx=0,dy=0){
    c.save();c.translate(px+dx,py+dy);c.rotate(angle);c.drawImage(img,sx,sy,sw,sh,sx-px,sy-py,sw,sh);c.restore();
  }
  function farmer(a,dt,t,distance){
    const el=a.el,c=a.c,img=getImage('assets/farmer-idle-v2.png');if(!img.complete||!img.naturalWidth)return;
    const moving=el.classList.contains('walking')&&distance>.002;
    a.blend=damp(a.blend,moving?1:0,dt,moving?16:20);
    a.phase+=Math.min(distance,8)*TAU/24;
    const row=el.classList.contains('dir-left')?1:el.classList.contains('dir-right')?2:el.classList.contains('dir-up')?3:0;
    c.clearRect(0,0,128,128);c.save();c.scale(2,2);c.translate(0,-row*64);
    const y=row*64,swing=Math.sin(a.phase)*a.blend,bob=-Math.abs(Math.sin(a.phase))*a.blend*.8;
    // One stable silhouette in every state; articulated arms and hips share their source pixels.
    c.save();c.beginPath();c.rect(0,y,64,46);
    if(row===0||row===3){c.rect(18,y+31,6,15);c.rect(40,y+31,6,15)}
    c.clip('evenodd');c.drawImage(img,0,bob);c.restore();
    if(row===0||row===3){
      region(c,img,22,y+44,10,18,28,y+45,swing*.18,0,bob);
      region(c,img,32,y+44,10,18,35,y+45,-swing*.18,0,bob);
      // Shoulder overlays add the return swing without changing the torso or hat.
      region(c,img,18,y+31,6,15,23,y+32,-swing*.12,0,bob);
      region(c,img,40,y+31,6,15,40,y+32,swing*.12,0,bob);
    }else{
      region(c,img,22,y+45,20,17,32,y+45,-swing*.32,0,bob);
      c.globalAlpha=.98;region(c,img,27,y+45,10,17,32,y+45,swing*.32,0,bob);c.globalAlpha=1;
    }
    c.restore();el.dataset.gait=a.blend>.05?'moving':'settled';
  }
  function pig(a,dt,t,distance){
    const el=a.el,c=a.c,def=root.PIG_ART[el.dataset.breed];if(!def)return;
    const img=getImage(def.src),rollImage=getImage(def.rollSrc);if(!img.complete||!img.naturalWidth)return;
    const dead=el.classList.contains('dead'),mode=dead?'idle':el.dataset.behavior||'idle';
    if(a.mode!==mode){a.mode=mode;a.modeTime=0}a.modeTime+=dt;
    const walking=!dead&&(mode==='walking'||mode==='movingDrink')&&distance>.001;
    a.blend=damp(a.blend,walking?1:0,dt,13);
    a.phase+=Math.min(distance,6)*TAU/(16*def.stride);
    const quiet=reduced.matches||dead;
    a.rest=damp(a.rest,!quiet&&mode==='resting'?1:0,dt,5);
    a.head=damp(a.head,!quiet&&(mode==='drinking'||mode==='rooting')?1:0,dt,7);
    // A complete crouch -> side -> back -> side -> stand arc, with no loop reset.
    const duration=Number(el.dataset.behaviorDuration)||3.4;
    const progress=clamp(a.modeTime/duration),rollTarget=!quiet&&mode==='rolling'?Math.pow(Math.sin(progress*Math.PI),2):0;
    a.roll=damp(a.roll,rollTarget,dt,18);
    const targetTurn=el.classList.contains('flip')?-1:1;a.turn=damp(a.turn,targetTurn,dt,12);
    const breath=quiet?0:Math.sin(t*1.8+a.seed)*.28;
    const step=Math.sin(a.phase),bob=-Math.abs(step)*a.blend*.7+breath;
    const sw=img.naturalWidth,sh=img.naturalHeight,cut=Math.floor(sh*def.legCut);
    const width=58,height=Math.min(45,sh/sw*width),x=3,y=60-height,scaleX=width/sw,scaleY=height/sh;
    c.clearRect(0,0,128,128);c.save();c.scale(2,2);
    // Foot shadow stays on the ground while the body lifts and settles.
    c.fillStyle='rgba(39,28,22,.16)';c.beginPath();c.ellipse(32,60,23,2.2,0,0,TAU);c.fill();
    c.translate(32,60);c.scale((a.turn<0?-1:1)*(.35+.65*Math.abs(a.turn)),1);c.translate(-32,-60);
    c.translate(0,a.rest*5+a.roll*((sh-cut)*scaleY+1)+bob);
    const bodyH=(cut*scaleY)*(1-a.rest*.12-a.roll*.22),bodyY=y+(cut*scaleY-bodyH);
    const turnOver=clamp((a.roll-.32)/.36),backMix=turnOver*turnOver*(3-2*turnOver);
    // Four leg bands pivot at their own hip; diagonal pairs alternate, hooves lift on recovery.
    const legBands=[[0,.28],[.28,.5],[.5,.75],[.75,1]];
    legBands.forEach(([lo,hi],i)=>{
      const start=Math.floor(sw*lo),end=Math.floor(sw*hi),cx=x+(start+end)*.5*scaleX;
      const legPhase=step*(i===0||i===2?1:-1),angle=legPhase*.27*a.blend;
      c.save();c.globalAlpha=1-backMix;c.translate(cx,bodyY+bodyH*(1-a.roll)-1);c.rotate(angle+(i<2?-1:1)*a.roll*.3);
      const legH=(sh-cut)*scaleY*(1-a.rest*.65),up=1-2*a.roll;
      c.scale(1,up);c.drawImage(img,start,cut,end-start,sh-cut,(x+start*scaleX)-cx,-1,(end-start)*scaleX,legH);c.restore();
    });
    // A narrow strip mesh bends the neck, so drinking does not rotate the whole animal.
    const nod=a.head*(3.4+(quiet?0:Math.sin(t*5)*.7));
    function torso(opacity){if(opacity<.001)return;c.save();c.globalAlpha=opacity;
      for(let sx=0;sx<sw;sx+=2){const n=sx/sw,headWeight=clamp((n-.59)/.41),dy=nod*headWeight*headWeight;
        const destX=x+sx*scaleX,stripW=Math.min(2,sw-sx);
        c.drawImage(img,sx,0,stripW,cut,destX,bodyY+dy,stripW*scaleX+.2,bodyH);
      }c.restore();
    }
    torso(1-backMix);
    if(backMix>.001){
      // Breed-specific bent-leg back pose; keeps identity and avoids flipped standing anatomy.
      const back=rollImage.complete&&rollImage.naturalWidth?rollImage:img;
      const backHeight=Math.min(42,back.naturalHeight/back.naturalWidth*width);
      const backY=60-backHeight-a.rest*5-a.roll*((sh-cut)*scaleY+1)-bob;
      c.save();c.globalAlpha=backMix;
      const rock=quiet?0:Math.sin(t*6)*.065*a.roll;
      c.translate(32,backY+backHeight*.68);c.rotate(rock);c.translate(-32,-backY-backHeight*.68);
      c.drawImage(back,x,backY,width,backHeight);c.restore();
    }
    c.restore();el.dataset.gait=a.blend>.05?'moving':'settled';
  }
  function frame(t){
    const dt=Math.min(.04,(t-(last||t))/1000);last=t;
    if(!document.hidden){
      if(dirty)scan();
      visibleActors.forEach(a=>{
        const x=parseFloat(a.el.style.left)||0,y=parseFloat(a.el.style.top)||0;
        const w=a.el.parentElement?.clientWidth||800,h=a.el.parentElement?.clientHeight||450;
        const distance=Math.hypot((x-a.x)*w/100,(y-a.y)*h/100);a.x=x;a.y=y;
        if(a.type==='farmer')farmer(a,dt,t/1000,distance<25?distance:0);else pig(a,dt,t/1000,distance<25?distance:0);
      });
    }
    requestAnimationFrame(frame);
  }
  const observer=new MutationObserver(records=>{if(records.some(r=>r.type==='childList'||r.attributeName==='class'))dirty=true});
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  root.FarmArt={refresh:()=>{dirty=true},actors,ready:()=>[...images.values()].every(i=>i.complete&&i.naturalWidth>0)};
  requestAnimationFrame(frame);
})(window);
