import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)),dist=path.join(root,'dist'),asset=JSON.parse(fs.readFileSync(path.join(dist,'asset-manifest.json'))),manifest=JSON.parse(fs.readFileSync(path.join(dist,'manifest.webmanifest')));
assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'./');assert.equal(manifest.start_url,'./');
for(const icon of manifest.icons){const b=fs.readFileSync(path.join(dist,icon.src));assert.equal(b.subarray(1,4).toString(),'PNG');assert.equal(b.readUInt32BE(16)+'x'+b.readUInt32BE(20),icon.sizes)}
assert(fs.existsSync(path.join(dist,'icons/apple-touch-icon.png')));assert(asset.bytes<30*1024*1024);
for(const f of asset.files){assert(fs.existsSync(path.join(dist,f)),'Missing offline asset '+f)}
const text=fs.readFileSync(path.join(dist,'index.html'),'utf8');assert(text.includes('viewport-fit=cover'));assert(text.includes('apple-mobile-web-app-capable'));assert(text.includes('mobile.js'));assert(text.includes('pwa.js'));
const desktop=fs.readFileSync(path.join(root,'desktop-build/index.html'),'utf8');assert(!desktop.includes('mobile.js'));assert(!desktop.includes('pwa.js'));assert(!desktop.includes('manifest.webmanifest'));
const breedSource=fs.readFileSync(path.join(root,'game/data.js'),'utf8');const ids=[...breedSource.matchAll(/id:'([^']+)', name:/g)].map(m=>m[1]);assert.equal(ids.length,28);
for(const id of ids)for(const folder of ['breeds','roll-poses'])assert(fs.existsSync(path.join(dist,'assets',folder,id+'.png')));
for(const name of ['app.js','data.js','engine.js','scene.js','animation.js','breed-art.js','mobile.js','pwa.js','sw.js']){const r=spawnSync(process.execPath,['--check',path.join(dist,name)],{encoding:'utf8'});assert.equal(r.status,0,r.stderr)}
console.log('PASS · manifest/icons · all '+asset.files.length+' offline assets · 28 breed/roll pairs · desktop separation · JavaScript syntax');
