import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),game=path.join(root,'game'),version=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version;
function empty(name){const out=path.resolve(root,name);if(!out.startsWith(root)||path.dirname(out)!==path.resolve(root))throw Error('Unsafe build directory');fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});return out}
const desktop=empty('desktop-build');fs.cpSync(game,desktop,{recursive:true});
fs.writeFileSync(path.join(desktop,'package.json'),JSON.stringify({name:'tun-story-desktop',version,private:true,type:'commonjs'},null,2));
const desktopHTML=fs.readFileSync(path.join(desktop,'index.html'),'utf8').replace('<html lang="zh-CN">','<html lang="zh-CN" data-game-version="'+version+'" data-platform="desktop">').replace('v1.12.0 ·','v'+version+' ·');
fs.writeFileSync(path.join(desktop,'index.html'),desktopHTML);
const desktopReadme=fs.readFileSync(path.join(desktop,'README.md'),'utf8').replace('当前版本：1.12.0 动作与猪种美术优化版。','当前版本：'+version+' 桌面兼容版。\n\n本版继续支持原有键盘、鼠标和本地离线启动。与手机版共用经营核心，补上输入框快捷键保护、后台保存和小游戏暂停恢复；手机专用触控、安装和联网托管层没有加入本桌面包。旧版美术与经营进度仍可通过存档导入继续。');
fs.writeFileSync(path.join(desktop,'README.md'),desktopReadme);
if(process.argv.includes('--desktop')){console.log('Desktop build ready, shared game core; no touch/PWA layer.');process.exit(0)}
const dist=empty('dist'),runtime=['index.html','styles.css','data.js','engine.js','scene.js','app.js','breed-art.js','animation.js'];
for(const f of runtime)fs.copyFileSync(path.join(game,f),path.join(dist,f));
fs.cpSync(path.join(game,'assets'),path.join(dist,'assets'),{recursive:true,filter:p=>!['pig-breeds-atlas-v3.png','pig-roll-atlas-v3.png','pixel-farm.png'].includes(path.basename(p))});
for(const f of ['mobile.js','mobile.css','pwa.js','pwa.css']){const src=path.join(root,'mobile',f);if(!fs.existsSync(src))throw Error('Missing mobile layer: '+f);fs.copyFileSync(src,path.join(dist,f))}
fs.cpSync(path.join(root,'mobile/icons'),path.join(dist,'icons'),{recursive:true});
let html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
html=html.replace('<html lang="zh-CN">','<html lang="zh-CN" data-game-version="'+version+'" data-platform="pwa">');
html=html.replace('<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">','<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">');
html=html.replace('<title>豚物语 · 三年育成记</title>','<title>豚物语 · 口袋猪场</title>\n  <meta name="description" content="种田、育猪、赶集。在 iPhone 上经营你的像素猪场，支持主屏幕安装和离线游玩。">\n  <meta name="apple-mobile-web-app-capable" content="yes">\n  <meta name="apple-mobile-web-app-title" content="豚物语">\n  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n  <link rel="manifest" href="manifest.webmanifest">\n  <link rel="apple-touch-icon" sizes="180x180" href="icons/apple-touch-icon.png">');
html=html.replace('<link rel="stylesheet" href="styles.css">','<link rel="stylesheet" href="styles.css">\n  <link rel="stylesheet" href="mobile.css">\n  <link rel="stylesheet" href="pwa.css">');
html=html.replace('<script src="animation.js"></script>','<script src="animation.js"></script>\n  <script src="mobile.js"></script>\n  <script src="pwa.js"></script>');
html=html.replace('v1.12.0 · 方向键 / WASD 行走 · E 互动 · 点击地点自动前往','v'+version+' · 点击地点前往 · 摇杆自由行走');
fs.writeFileSync(path.join(dist,'index.html'),html);
const manifest={id:'./',name:'豚物语 · 口袋猪场',short_name:'豚物语',description:'三年育成记 · 像素养猪与农场经营',lang:'zh-CN',start_url:'./',scope:'./',display:'standalone',orientation:'any',background_color:'#f5dfad',theme_color:'#3d2b20',icons:[{src:'icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:'icons/maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]};
fs.writeFileSync(path.join(dist,'manifest.webmanifest'),JSON.stringify(manifest,null,2));
const files=[];function walk(dir){for(const d of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,d.name);if(d.isDirectory())walk(p);else files.push(path.relative(dist,p).replaceAll(path.sep,'/'))}}walk(dist);files.sort();
const hash=crypto.createHash('sha256');for(const f of files){hash.update(f);hash.update(fs.readFileSync(path.join(dist,f)))}const build=version+'-'+hash.digest('hex').slice(0,12);
const list=files.map(f=>'./'+f);const sw=fs.readFileSync(path.join(root,'mobile/sw.template.js'),'utf8').replace('__BUILD__',build).replace('__FILES__',JSON.stringify(list));fs.writeFileSync(path.join(dist,'sw.js'),sw);
fs.writeFileSync(path.join(dist,'asset-manifest.json'),JSON.stringify({version,build,files:list,bytes:files.reduce((n,f)=>n+fs.statSync(path.join(dist,f)).size,0)},null,2));
console.log(JSON.stringify({version,build,files:files.length,bytes:files.reduce((n,f)=>n+fs.statSync(path.join(dist,f)).size,0),mobile:dist,desktop}));
