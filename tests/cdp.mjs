import fs from 'node:fs';export const wait=ms=>new Promise(r=>setTimeout(r,ms));
export async function connect(url='about:blank'){
 const target=await fetch('http://127.0.0.1:'+Number(process.env.TUN_CDP_PORT||9266)+'/json/new?'+encodeURIComponent(url),{method:'PUT'}).then(r=>r.json());
 const ws=new WebSocket(target.webSocketDebuggerUrl),pending=new Map(),errors=[];let seq=0;
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text)};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method))},60000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
 await send('Runtime.enable');await send('Page.enable');
 return{send,evaluate,errors,close:()=>ws.close(),targetId:target.id,screenshot:async file=>fs.writeFileSync(file,Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'))};
}
