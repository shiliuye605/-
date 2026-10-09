import assert from 'node:assert/strict';
import { connect, wait } from './cdp.mjs';

const baseUrl = process.env.PIG_TEST_URL || 'http://127.0.0.1:8767';
const browser = await connect();
async function until(expression, message, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await browser.evaluate(expression)) return; await wait(100); }
  throw new Error(`Timeout: ${message}`);
}
async function fixture(quarter = 0) {
  await browser.evaluate(`(() => {
    const raw=PigEngine.createState('生命周期验收','测试农场');raw.quarter=${quarter};raw.location='contest';raw.pendingEvent=null;raw.pigs[0].ageDays=8;
    PigEngine.storyUpdate(raw);raw.story.pendingScenes=[];
    localStorage.setItem('pigFarmStory_saves_v3',JSON.stringify([raw]));
    document.querySelector('#continue-btn').click();
  })()`);
  await until('GamePlatform.getStatus().active&&!GamePlatform.getStatus().modal', 'fixture enters the contest map');
}
try {
  await browser.send('Page.navigate', { url: baseUrl });
  await until('!!window.GamePlatform', 'game platform loads');
  assert.equal(await browser.evaluate(`(() => {
    document.querySelector('#new-game-btn').click();const input=document.querySelector('#player-name-input');input.focus();
    const event=new KeyboardEvent('keydown',{key:'w',bubbles:true,cancelable:true});input.dispatchEvent(event);
    document.querySelector('[data-close="new-save"]').click();return event.defaultPrevented;
  })()`), false, 'name input keeps WASD as normal typing');
  await fixture();
  assert.equal(await browser.evaluate(`(() => {
    document.querySelector('.dock [data-open="journal"]').click();
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    return document.querySelector('#panel-overlay').classList.contains('hidden');
  })()`), true, 'Escape keeps desktop panel dismissal');
  assert.equal(await browser.evaluate(`(() => {const s=GamePlatform.getState();s.money=-1;return GamePlatform.getState().money>0;})()`), true, 'shared API returns an independent state copy');
  await browser.evaluate('GamePlatform.setMovement({x:0,y:-1})'); await wait(220);
  const moving = await browser.evaluate('document.querySelector("#extra-player").classList.contains("walking")');
  assert.equal(moving, true, 'movement API drives the rendered map');
  await browser.evaluate('window.dispatchEvent(new Event("blur"))');
  const stoppedAt = await browser.evaluate('document.querySelector("#extra-player").style.top'); await wait(220);
  assert.equal(await browser.evaluate('document.querySelector("#extra-player").style.top'), stoppedAt, 'blur cancels held movement');
  await browser.evaluate('document.querySelector("[data-extra-zone=weigh]").click()');
  await until('!!document.querySelector("#panel-tabs [data-tab=festival]")', 'automatic route reaches contest desk');
  await browser.evaluate('document.querySelector("#panel-tabs [data-tab=festival]").click();document.querySelector("[data-action=festival-enter]").click();document.querySelector("#confirm-ok").click();document.querySelector("#festival-game-start").click()');
  await wait(350);
  const before = await browser.evaluate('({timer:parseInt(document.querySelector("#festival-game-timer").textContent),quarter:GamePlatform.getState().quarter})');
  await browser.evaluate(`(() => {
    window.__lifecycleHidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__lifecycleHidden});
    document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
  })()`);
  assert.equal(await browser.evaluate('GamePlatform.getStatus().paused'), true);
  assert.equal(await browser.evaluate('JSON.parse(localStorage.getItem("pigFarmStory_saves_v3"))[0].quarter'), before.quarter, 'pagehide saves without advancing the game');
  await wait(2000);
  assert.equal(await browser.evaluate('GamePlatform.getState().quarter'), before.quarter);
  await browser.evaluate('window.__lifecycleHidden=false;document.dispatchEvent(new Event("visibilitychange"));window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true}))');
  const after = await browser.evaluate('({timer:parseInt(document.querySelector("#festival-game-timer").textContent),quarter:GamePlatform.getState().quarter,paused:GamePlatform.getStatus().paused})');
  assert.equal(after.paused, false); assert.equal(after.quarter, before.quarter); assert(Math.abs(after.timer - before.timer) <= 1, 'festival countdown retains the hidden interval');
  await browser.evaluate('document.querySelector("#festival-game-abandon").click()');
  assert.equal(await browser.evaluate('GamePlatform.getState().quarter'), before.quarter, 'abandoning the resumed game remains free');
  assert.equal(await browser.evaluate(`(() => {
    const saved=GamePlatform.getState();const file=new File([JSON.stringify(saved)],'desktop-save.json',{type:'application/json'});
    return GamePlatform.importSaveFile(file);
  })()`), true, 'version 3 JSON backup imports through the platform');

  await browser.evaluate(`(() => {
    window.__shareCalls=0;window.__downloads=[];window.__downloadClick=HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click=function(){if(this.download){window.__downloads.push(this.download);return;}return window.__downloadClick.call(this);};
    Object.defineProperty(navigator,'userAgent',{configurable:true,value:'iPhone'});
    Object.defineProperty(navigator,'canShare',{configurable:true,value:({files})=>files.length===1&&files[0] instanceof File});
    Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{window.__shareCalls++;throw new DOMException('cancelled','AbortError');}});
  })()`);
  assert.equal(await browser.evaluate('GamePlatform.exportSave()'), false);
  assert.deepEqual(await browser.evaluate('({share:window.__shareCalls,downloads:window.__downloads.length})'), { share: 1, downloads: 0 }, 'cancelled iPhone share never repeats as a download');
  await browser.evaluate('Object.defineProperty(navigator,"share",{configurable:true,value:async()=>{throw new Error("share unavailable")}})');
  assert.equal(await browser.evaluate('GamePlatform.exportSave()'), true);
  assert.equal(await browser.evaluate('window.__downloads.length'), 1, 'share failure falls back to a JSON file');
  await browser.evaluate('Object.defineProperty(navigator,"userAgent",{configurable:true,value:"Desktop"})');
  assert.equal(await browser.evaluate('GamePlatform.exportSave()'), true);
  assert.equal(await browser.evaluate('window.__downloads.length'), 2, 'desktop keeps the direct download flow');
  assert.deepEqual(browser.errors, [], 'no browser exceptions');
  console.log('Browser lifecycle checks passed: editable inputs, real movement/blur, automatic contest route, festival hidden/resume, synchronous save, JSON import, iPhone share cancellation/fallback and desktop export.');
} finally { browser.close(); }
