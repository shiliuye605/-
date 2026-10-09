/* Deterministic lifecycle tests: run the real app and engine with controllable
 * browser events and clocks. Browser rendering is checked separately. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const gameDir = path.resolve(__dirname, '../game');

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) {
    const list = this.listeners.get(type) || [];
    list.push(callback); this.listeners.set(type, list);
  }
  fire(type, event = {}) {
    for (const callback of this.listeners.get(type) || []) callback({ target: this, preventDefault() {}, ...event });
  }
}
class Element extends Events {
  constructor(selector = '') {
    super(); this.selector = selector; this.children = []; this.style = { setProperty() {} }; this.dataset = {};
    this.textContent = ''; this.innerHTML = ''; this.value = ''; this.title = ''; this.download = '';
    const classes = new Set(selector.includes('overlay') || selector === '#dialogue' || selector === '#game' ? ['hidden'] : []);
    this.classList = { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name), toggle: (name, on) => { const add = on === undefined ? !classes.has(name) : on; add ? classes.add(name) : classes.delete(name); return add; } };
  }
  closest(selector) { return /input,textarea,select/.test(selector) && this.editable ? this : null; }
  querySelector(selector) { return this.doc.querySelector(`${this.selector} ${selector}`); }
  focus() { this.doc.activeElement = this; }
  setAttribute() {}
  click() { if (this.download) this.doc.downloads.push(this.download); if (this.onclick) this.onclick({ target: this }); this.fire('click'); }
  appendChild(child) { this.children.push(child); return child; }
  remove() {}
}
function harness({ mobile = false } = {}) {
  let now = 1700000000000, monotonic = 1000, id = 0;
  const timers = new Map(), frames = new Map(), storage = new Map(), nodes = new Map();
  const doc = new Events(); doc.hidden = false; doc.downloads = []; doc.activeElement = null;
  doc.querySelector = selector => { if (!nodes.has(selector)) { const node = new Element(selector); node.doc = doc; nodes.set(selector, node); } return nodes.get(selector); };
  doc.querySelectorAll = selector => selector === '.player-sprite.walking' ? [...nodes.values()].filter(node => /#(?:player|market-player|rival-player|extra-player)$/.test(node.selector) && node.classList.contains('walking')) : [];
  doc.createElement = tag => { const node = new Element(tag); node.doc = doc; return node; };
  doc.body = doc.querySelector('body'); doc.documentElement = doc.querySelector('html');
  const win = new Events(); win.matchMedia = () => ({ matches: mobile });
  let audioResumes = 0, audioSuspends = 0;
  class AudioContext {
    constructor() { this.state = 'running'; this.currentTime = 0; }
    resume() { this.state = 'running'; audioResumes++; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; audioSuspends++; return Promise.resolve(); }
    createOscillator() { return { frequency: {}, connect(target) { return target; }, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect(target) { return target; } }; }
  }
  win.AudioContext = AudioContext;
  win.FarmScene = { mount: () => ({ setPigProvider() {}, setPath() {}, setWeather() {}, resolveMovement: (x, y, nx, ny) => ({ x: nx, y: ny }), findPath: (_, target) => [target] }) };
  win.PIG_ART = { duroc: { src: 'pig.png' }, largewhite: { src: 'pig.png' } };
  class FakeDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const setTimer = (fn, delay = 0, interval = 0) => { const value = ++id; timers.set(value, { fn, due: now + delay, interval }); return value; };
  const nav = { userAgent: mobile ? 'iPhone' : 'Desktop', canShare: () => false };
  const sandbox = { window: win, document: doc, navigator: nav, Element, Date: FakeDate, performance: { now: () => monotonic }, console, Blob, File,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    setTimeout: (fn, delay) => setTimer(fn, delay), clearTimeout: value => timers.delete(value),
    setInterval: (fn, delay) => setTimer(fn, delay, delay), clearInterval: value => timers.delete(value),
    requestAnimationFrame: fn => { const value = ++id; frames.set(value, fn); return value; }, cancelAnimationFrame: value => frames.delete(value) };
  vm.createContext(sandbox);
  for (const name of ['data.js', 'engine.js']) vm.runInContext(fs.readFileSync(path.join(gameDir, name), 'utf8'), sandbox, { filename: name });
  let app = fs.readFileSync(path.join(gameDir, 'app.js'), 'utf8');
  app = app.replace(/\}\)\(\);\s*$/, `window.__lifecycleTest = {
    fixture(quarter=0) { closeFestivalGame(true);state=E.createState('测试玩家','测试农场');state.location='contest';state.quarter=quarter;state.pendingEvent=null;state.pigs[0].ageDays=8;displayedTotalDay=E.totalDay(state);return state.pigs[0].id; },
    startFestivalGame, beginFestivalGame, chooseFestivalFlower, getFestival:()=>festivalGame,
    player,marketPlayer,rivalPlayer,extraPlayer,pigBehaviors,worldLoop,audio
  };})();`);
  vm.runInContext(app, sandbox, { filename: 'app.js' });
  function tick(ms) {
    const finish = now + ms;
    for (;;) {
      let nextId = null, next = null;
      for (const [timerId, timer] of timers) if (timer.due <= finish && (!next || timer.due < next.due)) { nextId = timerId; next = timer; }
      if (!next) break;
      monotonic += next.due - now; now = next.due;
      if (next.interval) next.due += next.interval; else timers.delete(nextId);
      next.fn();
    }
    monotonic += finish - now; now = finish;
  }
  function visibility(hidden) { doc.hidden = hidden; doc.fire('visibilitychange'); }
  return { win, doc, nav, storage, timers, frames, tick, visibility, api: win.GamePlatform, test: win.__lifecycleTest, audioCounts: () => ({ resumes: audioResumes, suspends: audioSuspends }), now: () => now, monotonic: () => monotonic };
}

async function run() {
  const h = harness(); const pigId = h.test.fixture();
  const copy = h.api.getState(); copy.money = -100; assert(h.api.getState().money > 0, 'platform state is a defensive clone');
  h.doc.querySelector('#game').classList.remove('hidden');
  const input = h.doc.querySelector('#player-name-input'); input.editable = true;
  let prevented = false;
  h.win.fire('keydown', { target: input, key: 'w', preventDefault() { prevented = true; } });
  assert.equal(h.test.player.keys.size, 0); assert.equal(prevented, false, 'typing a name keeps normal keyboard behavior');
  h.win.fire('keydown', { key: '7' }); assert.equal(h.api.isModalOpen(), true);
  h.win.fire('keydown', { key: 'ArrowDown' }); assert.equal(h.test.player.keys.size, 0, 'modal keyboard input never holds a movement key');
  h.win.fire('keydown', { key: 'Escape' }); assert.equal(h.api.isModalOpen(), false, 'Escape still closes a desktop panel');
  h.api.setMovement({ x: 1, y: -1 }); assert.equal(h.test.player.keys.size, 2);
  for (const player of [h.test.player, h.test.marketPlayer, h.test.rivalPlayer, h.test.extraPlayer]) { player.target = { x: 10, y: 10 }; player.path = [{ x: 10, y: 10 }]; }
  h.win.fire('blur'); assert.equal(h.test.player.keys.size, 0);
  for (const player of [h.test.player, h.test.marketPlayer, h.test.rivalPlayer, h.test.extraPlayer]) assert.equal(player.target, null, 'blur cancels all automatic routes');

  h.test.startFestivalGame(pigId); h.test.beginFestivalGame();
  assert.equal(h.test.getFestival().mode, 'flowers');
  h.tick(1100); const g = h.test.getFestival(); const remaining = g.deadline - h.now(); const responseTime = h.now() - g.targetAt;
  const quarter = h.api.getState().quarter;
  h.visibility(true); h.win.fire('pagehide');
  const saved = JSON.parse(h.storage.get('pigFarmStory_saves_v3')); assert.equal(saved[0].quarter, quarter, 'background writes a synchronous save');
  assert.equal(h.test.audio.timer, null); assert.equal(h.api.getStatus().paused, true);
  h.tick(120000); assert.equal(g.phase, 'play'); assert.equal(h.api.getState().quarter, quarter, 'background does not finish or charge a festival');
  h.visibility(false); h.win.fire('pageshow');
  assert.deepEqual(h.audioCounts(), { suspends: 1, resumes: 1 }, 'visibility and page events do not pause/resume audio twice');
  assert.equal(g.deadline - h.now(), remaining, 'timer retains its remaining time after two minutes hidden');
  assert.equal(h.now() - g.targetAt, responseTime, 'hidden time does not lower flower response points');
  assert.equal(h.api.getStatus().paused, false);
  h.test.chooseFestivalFlower(g.flowerTarget.id); assert.equal(g.round, 1);
  h.tick(200); h.visibility(true); h.tick(120000); h.visibility(false); h.tick(229);
  assert.equal(g.locked, true, 'inter-round timeout retains its remaining delay'); h.tick(1); assert.equal(g.locked, false);
  assert.equal(g.round, 1, 'repeated hide/show does not replay or double-count a round');
  const activeIntervals = [...h.timers.values()].filter(timer => timer.interval === 100); assert.equal(activeIntervals.length, 1, 'exactly one festival clock resumes');
  const beforePagehide = g.deadline - h.now(); h.win.fire('pagehide');
  assert.equal(h.doc.hidden, false); assert.equal(h.api.getStatus().paused, true, 'pagehide also pauses when hidden is not updated yet');
  h.tick(100000); assert.equal(g.phase, 'play'); h.win.fire('pageshow');
  assert.equal(g.deadline - h.now(), beforePagehide, 'pagehide alone preserves the festival clock');

  const directions = harness(); const dirPig = directions.test.fixture(160); directions.test.startFestivalGame(dirPig); directions.test.beginFestivalGame();
  assert.equal(directions.test.getFestival().mode, 'directions');
  directions.tick(900); directions.visibility(true); directions.tick(70000); assert.equal(directions.test.getFestival().accepting, false);
  directions.visibility(false); directions.tick(1429); assert.equal(directions.test.getFestival().accepting, false); directions.tick(1); assert.equal(directions.test.getFestival().accepting, true, 'direction demonstration continues after the same remaining delay');

  const mud = harness(); const mudPig = mud.test.fixture(80); mud.test.startFestivalGame(mudPig); mud.test.beginFestivalGame(); assert.equal(mud.test.getFestival().mode, 'mud');
  mud.tick(230); const mudTime = mud.monotonic() - mud.test.getFestival().mudStarted;
  mud.visibility(true); mud.tick(80000); mud.visibility(false); assert.equal(mud.monotonic() - mud.test.getFestival().mudStarted, mudTime, 'mud cursor resumes its animation phase');

  const share = harness({ mobile: true }); share.test.fixture();
  share.nav.canShare = () => true; let shares = 0;
  share.nav.share = async () => { shares++; const error = new Error('cancelled'); error.name = 'AbortError'; throw error; };
  assert.equal(await share.api.exportSave(), false); assert.equal(shares, 1); assert.equal(share.doc.downloads.length, 0, 'cancelling iPhone share never starts a duplicate download');
  share.nav.share = async () => { throw new Error('share unavailable'); };
  assert.equal(await share.api.exportSave(), true); assert.equal(share.doc.downloads.length, 1, 'non-cancelled share failure falls back to a JSON download');
  const desktop = harness(); desktop.test.fixture(); desktop.nav.canShare = () => true; desktop.nav.share = async () => { throw new Error('desktop share should not run'); };
  assert.equal(await desktop.api.exportSave(), true); assert.equal(desktop.doc.downloads.length, 1, 'desktop keeps its download flow');
  const backup = JSON.stringify(desktop.api.getState()); assert.equal(await desktop.api.importSaveFile({ text: async () => backup }), true);
  assert.equal(JSON.parse(desktop.storage.get('pigFarmStory_saves_v3')).length, 2, 'version 3 backups import as separate saves');
  assert.equal(await desktop.api.importSaveFile({ text: async () => '{ invalid JSON' }), false);
  console.log('Lifecycle tests passed: save, keyboard, routes, all festival modes, single resume clock, audio, iPhone share cancel/fallback, desktop backup compatibility.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
