import assert from 'node:assert/strict';
import fs from 'node:fs';
import { connect, wait } from './cdp.mjs';

const page = await connect();
const origin = process.env.PIG_TEST_URL || 'http://127.0.0.1:8767';
const reports = [];
const reportDir = new URL('./touch-results/', import.meta.url);
fs.mkdirSync(reportDir, { recursive: true });
const metrics = async (width, height) => {
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
};
const evaluate = page.evaluate;
const tap = async selector => {
  const p = await evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 1 }] });
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(80);
};
const settle = async () => {
  await wait(650);
  for (let i = 0; i < 4; i++) {
    if (!await evaluate(`document.querySelector('#dialogue').classList.contains('hidden')`)) {
      await tap('#dialogue-text');
      await tap('#dialogue-text');
      await wait(100);
    }
  }
};
const activeWorld = `['world','market-world','rival-world','extra-world'].map(id=>document.getElementById(id)).find(el=>!el.classList.contains('hidden'))`;
const activePlayer = `(${activeWorld}).querySelector('.player-sprite')`;
const position = () => evaluate(`(() => {const p=${activePlayer};return{x:parseFloat(p.style.left),y:parseFloat(p.style.top)}})()`);

try {
  await page.send('Network.enable');
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await metrics(390, 844);
  await page.send('Page.navigate', { url: origin + '/?mobile=1' });
  await wait(900);
  assert.equal(await evaluate(`document.documentElement.classList.contains('mobile-shell')`), true);
  assert.equal(await evaluate(`document.querySelector('#mobile-controls').classList.contains('hidden')`), true);
  await tap('#new-game-btn');
  await evaluate(`document.querySelector('#player-name-input').value='Touch QA';document.querySelector('#farm-name-input').value='口袋测试';`);
  await tap('#new-save-form .pixel-btn.primary');
  await settle();
  assert.equal(await evaluate(`document.querySelector('#mobile-controls').classList.contains('hidden')`), false);

  const measure = async label => {
    const r = await evaluate(`(() => {
      const ids=['game','world-wrap','mobile-joystick','mobile-interact','audio-btn','save-btn','home-btn'];
      const rects=Object.fromEntries(ids.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return[id,{x:r.x,y:r.y,width:r.width,height:r.height}]}));
      const w=${activeWorld};const m=w.getBoundingClientRect();
      const buttons=[...document.querySelectorAll('.dock button')].map(b=>{const r=b.getBoundingClientRect();return{label:b.textContent.trim(),x:r.x,y:r.y,width:r.width,height:r.height}});
      return{viewport:{width:visualViewport?.width||innerWidth,height:visualViewport?.height||innerHeight},rects,map:{x:m.x,y:m.y,width:m.width,height:m.height},buttons,scrollWidth:document.body.scrollWidth};
    })()`);
    assert.equal(r.buttons.length, 8);
    assert.ok(r.map.width >= (label.includes('zoom') ? 200 : 250), `${label}: map too small`);
    assert.ok(Math.abs(r.map.width / r.map.height - 16 / 9) < 0.03);
    assert.ok(r.scrollWidth <= r.viewport.width + 1, `${label}: horizontal overflow`);
    for (const b of [...r.buttons, ...['audio-btn','save-btn','home-btn','mobile-joystick','mobile-interact'].map(id=>r.rects[id])]) {
      assert.ok(b.x >= -1 && b.x + b.width <= r.viewport.width + 1, `${label}: inaccessible horizontal button`);
      assert.ok(b.y >= -1 && b.y + b.height <= r.viewport.height + 1, `${label}: inaccessible vertical button`);
      assert.ok(b.height >= 43 && b.width >= 43, `${label}: undersized touch target`);
    }
    reports.push({ label, ...r });
    await page.screenshot(new URL(`${label}.png`, reportDir));
  };
  await measure('portrait');
  await metrics(844, 390);
  await wait(220);
  await measure('landscape');
  for (const [label, width, height] of [['se-portrait',375,667],['se-landscape',667,375],['short-portrait',320,568],['short-landscape',568,320]]) {
    await metrics(width, height);
    await wait(220);
    await measure(label);
  }
  await metrics(844,390);
  await page.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.5 });
  await wait(250);
  await measure('landscape-zoom');
  await page.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  await wait(150);

  await evaluate(`window.dispatchEvent(new Event('open-install-help'));`);
  await wait(120);
  assert.equal(await evaluate(`document.querySelector('#mobile-controls').classList.contains('hidden')`), true, 'install help must block movement');
  await tap('#install-help .pwa-help-close');

  // Hit all eight real buttons and confirm that the opened panel hides movement controls.
  for (let i = 0; i < 8; i++) {
    await tap(`.dock button:nth-child(${i + 1})`);
    const overlay = i === 3 ? '#confirm-overlay' : '#panel-overlay';
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(overlay)}).classList.contains('hidden')`), false, `dock ${i + 1}`);
    assert.equal(await evaluate(`document.querySelector('#mobile-controls').classList.contains('hidden')`), true);
    await tap(i === 3 ? '#confirm-cancel' : '[data-close="panel"]');
  }
  const joystickRect = await evaluate(`(() => {const r=document.querySelector('#mobile-joystick').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,width:r.width}})()`);
  const directions = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  for (const [dx,dy] of directions) {
    const p = { x: joystickRect.x + dx * 27, y: joystickRect.y + dy * 27, id: 1 };
    await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
    await wait(40);
    assert.equal(await evaluate(`document.querySelector('#mobile-joystick').dataset.direction`), `${dx},${dy}`);
    await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  assert.equal(await evaluate(`document.querySelector('#mobile-joystick').dataset.direction`), 'idle');

  // Load one valid shared-core save per map. Actual touch movement must move and then stop.
  for (const location of ['farm','market','rival','forest','village','contest']) {
    await evaluate(`(() => {const s=PigEngine.createState('测试','触屏猪场');s.updatedAt=Date.now()+60000;s.location=${JSON.stringify(location)};s.story.introduced=Object.fromEntries(Object.keys(PIG_DATA.STORY_CHAPTERS||{}).map(key=>[key,true]));s.story.pendingScenes=[];localStorage.setItem('pigFarmStory_saves_v3',JSON.stringify([s]));})()`);
    await page.send('Page.navigate', { url: origin + '/?mobile=1&qa=' + location });
    await wait(400);
    await tap('#continue-btn');
    await settle();
    assert.equal(await evaluate(`GamePlatform.getStatus().location`), location);
    const rect = await evaluate(`(() => {const r=document.querySelector('#mobile-joystick').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    const start = await position();
    const delta = location === 'rival' ? { x: 28, y: 0 } : { x: 0, y: -28 };
    await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x + delta.x, y: rect.y + delta.y, id: 1 }] });
    await wait(320);
    await page.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await wait(80);
    const end = await position();
    assert.ok(Math.hypot(end.x - start.x, end.y - start.y) > 0.1, `${location}: character did not move`);
    const stopped = await position();
    await wait(140);
    const afterStop = await position();
    assert.ok(Math.hypot(stopped.x - afterStop.x, stopped.y - afterStop.y) < 0.001, `${location}: cancelled touch kept moving`);
    reports.push({ location, start, end, stopped: afterStop });
  }
  assert.equal(await evaluate(`document.querySelector('#mobile-interact').disabled`), false, 'nearby exit should allow interaction');
  await tap('#mobile-interact');
  await wait(1400);
  assert.equal(await evaluate(`GamePlatform.getStatus().location`), 'farm', 'touch interaction should return from the contest map');
  await metrics(390, 844);
  await wait(180);
  await tap('#audio-btn');
  await tap('#save-btn');
  await tap('#home-btn');
  assert.equal(await evaluate(`document.querySelector('#confirm-overlay').classList.contains('hidden')`), false);
  await tap('#confirm-ok');
  assert.equal(await evaluate(`document.querySelector('#title-screen').classList.contains('hidden')`), false);
  assert.equal(page.errors.length, 0, page.errors.join('\n'));
  fs.writeFileSync(new URL('report.json', reportDir), JSON.stringify({ ok: true, reports, errors: page.errors }, null, 2));
  console.log(JSON.stringify({ ok: true, maps: 6, directions: 8, dockButtons: 8, layouts: 7, reports: reportDir.pathname }));
} finally {
  page.close();
}
