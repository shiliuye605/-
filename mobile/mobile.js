/* Touch presentation only. All rules, saves and scenes stay in the shared game. */
(() => {
  'use strict';

  const root = document.documentElement;
  const forced = new URLSearchParams(location.search).get('mobile');
  const touchDevice = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
  const useMobile = forced === '1' || (forced !== '0' && touchDevice && Math.min(screen.width, screen.height) < 1100);
  if (!useMobile) return;
  root.classList.add('mobile-shell');

  const $ = selector => document.querySelector(selector);
  const game = $('#game');
  const playArea = $('.play-area');
  const worldWrap = $('#world-wrap');
  if (!game || !playArea || !worldWrap) return;

  const controls = document.createElement('div');
  controls.id = 'mobile-controls';
  controls.className = 'mobile-controls hidden';
  controls.setAttribute('aria-label', '触屏行走与互动');
  controls.innerHTML = `
    <div class="mobile-touch-caption"><b>青石镇 · 随身农场</b><span>拖动摇杆行走 · 点击发光地点自动前往</span></div>
    <div class="mobile-joystick-group">
      <div id="mobile-joystick" class="mobile-joystick" role="group" aria-label="八方向行走摇杆">
        <i class="mobile-stick-arrow up" aria-hidden="true">⌃</i><i class="mobile-stick-arrow right" aria-hidden="true">›</i>
        <i class="mobile-stick-arrow down" aria-hidden="true">⌄</i><i class="mobile-stick-arrow left" aria-hidden="true">‹</i>
        <div id="mobile-stick-knob" class="mobile-stick-knob" aria-hidden="true"><span>✦</span></div>
      </div>
      <span class="mobile-control-label">行走</span>
    </div>
    <div class="mobile-interact-group">
      <button id="mobile-interact" class="mobile-interact" type="button" aria-label="与附近地点互动"><span>✦</span><b>互动</b></button>
      <span id="mobile-interact-hint" class="mobile-control-label">走近发光地点</span>
    </div>`;
  playArea.append(controls);

  const joystick = $('#mobile-joystick');
  const knob = $('#mobile-stick-knob');
  const interactButton = $('#mobile-interact');
  const interactHint = $('#mobile-interact-hint');
  const caption = controls.querySelector('.mobile-touch-caption b');
  const sceneIds = ['world', 'market-world', 'rival-world', 'extra-world'];
  const promptIds = ['near-prompt', 'market-near-prompt', 'rival-near-prompt', 'extra-near-prompt'];
  const modalIds = ['panel-overlay', 'event-overlay', 'confirm-overlay', 'dialogue', 'ending-overlay', 'festival-game-overlay', 'new-save-overlay', 'day-transition', 'scene-transition'];
  const arrowCodes = { ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown' };
  let heldKeys = new Set();
  let activePointer = null;
  let movement = { x: 0, y: 0 };
  let blocked = true;
  let layoutFrame = 0;
  let stateFrame = 0;

  const visible = element => !!element && !element.classList.contains('hidden');
  const editing = () => !!document.activeElement?.closest('input, textarea, select, [contenteditable="true"]');
  function status() {
    const api = window.GamePlatform;
    if (typeof api?.getStatus === 'function') {
      const current = api.getStatus();
      return { ...current, active: current.active && visible(game), modal: current.modal || visible($('#install-help')) };
    }
    return { active: visible(game), modal: modalIds.some(id => visible(document.getElementById(id))) };
  }
  function keyEvent(type, key) {
    window.dispatchEvent(new KeyboardEvent(type, { key, code: arrowCodes[key] || 'KeyE', bubbles: true, cancelable: true }));
  }
  function setMovement(x, y) {
    if (movement.x === x && movement.y === y) return;
    movement = { x, y };
    const api = window.GamePlatform;
    if (typeof api?.setMovement === 'function') {
      api.setMovement(movement);
    } else {
      const next = new Set();
      if (x < 0) next.add('ArrowLeft');
      if (x > 0) next.add('ArrowRight');
      if (y < 0) next.add('ArrowUp');
      if (y > 0) next.add('ArrowDown');
      heldKeys.forEach(key => { if (!next.has(key)) keyEvent('keyup', key); });
      next.forEach(key => { if (!heldKeys.has(key)) keyEvent('keydown', key); });
      heldKeys = next;
    }
    joystick.dataset.direction = x === 0 && y === 0 ? 'idle' : `${x},${y}`;
  }
  function releaseMovement(cancelRoute = false) {
    setMovement(0, 0);
    // Always release fallback events, including when the bridge appears after a touch began.
    heldKeys.forEach(key => keyEvent('keyup', key));
    heldKeys.clear();
    if (cancelRoute) window.GamePlatform?.cancelMovement?.();
    const previousPointer = activePointer;
    activePointer = null;
    if (previousPointer !== null && joystick.hasPointerCapture?.(previousPointer)) {
      try { joystick.releasePointerCapture(previousPointer); } catch (_) { /* capture already ended */ }
    }
    joystick.classList.remove('pressed');
    knob.style.setProperty('--stick-x', '0px');
    knob.style.setProperty('--stick-y', '0px');
    joystick.dataset.direction = 'idle';
  }
  function updateStick(event) {
    const rect = joystick.getBoundingClientRect();
    const radius = rect.width * 0.31;
    let x = event.clientX - rect.left - rect.width / 2;
    let y = event.clientY - rect.top - rect.height / 2;
    const length = Math.hypot(x, y);
    if (length > radius) { x = x / length * radius; y = y / length * radius; }
    knob.style.setProperty('--stick-x', `${x.toFixed(1)}px`);
    knob.style.setProperty('--stick-y', `${y.toFixed(1)}px`);
    if (length < rect.width * 0.10) { setMovement(0, 0); return; }
    // Eight equal sectors keep diagonal movement intentional and stable.
    const sector = (Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8;
    const directions = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    setMovement(...directions[sector]);
  }
  joystick.addEventListener('pointerdown', event => {
    if (blocked || activePointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    window.GamePlatform?.cancelMovement?.();
    activePointer = event.pointerId;
    joystick.setPointerCapture(event.pointerId);
    joystick.classList.add('pressed');
    updateStick(event);
  });
  joystick.addEventListener('pointermove', event => {
    if (event.pointerId !== activePointer) return;
    event.preventDefault();
    if (blocked) releaseMovement(true); else updateStick(event);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => joystick.addEventListener(type, event => {
    if (event.pointerId === activePointer) { event.preventDefault(); releaseMovement(); }
  }));
  interactButton.addEventListener('click', event => {
    event.preventDefault();
    if (blocked || interactButton.disabled) return;
    releaseMovement(true);
    if (typeof window.GamePlatform?.interact === 'function') window.GamePlatform.interact();
    else { keyEvent('keydown', 'e'); keyEvent('keyup', 'e'); }
    scheduleState();
  });

  function updateState() {
    stateFrame = 0;
    const current = status();
    const nextBlocked = !current.active || current.modal || current.paused || document.hidden || editing();
    if (nextBlocked && !blocked) releaseMovement(true);
    blocked = !!nextBlocked;
    controls.classList.toggle('hidden', blocked);
    controls.setAttribute('aria-hidden', String(blocked));
    root.classList.toggle('mobile-in-game', !!current.active);
    root.classList.toggle('mobile-modal-open', !!current.modal);
    const index = sceneIds.findIndex(id => visible(document.getElementById(id)));
    const world = document.getElementById(sceneIds[index] || 'world');
    const prompt = document.getElementById(promptIds[index] || 'near-prompt');
    const ready = !blocked && visible(prompt);
    interactButton.disabled = !ready;
    interactButton.classList.toggle('ready', ready);
    const label = ready ? prompt.querySelector('span')?.textContent || '附近地点' : '走近发光地点';
    if (interactHint.textContent !== label) interactHint.textContent = label;
    interactButton.setAttribute('aria-label', ready ? `互动：${label}` : '走近发光地点后互动');
    const locationName = world?.querySelector('.world-caption > span')?.textContent || '青石镇 · 随身农场';
    if (caption.textContent !== locationName) caption.textContent = locationName;
    scheduleLayout();
  }
  function scheduleState() {
    if (!stateFrame) stateFrame = requestAnimationFrame(updateState);
  }
  function updateLayout() {
    layoutFrame = 0;
    const viewport = window.visualViewport;
    const viewportHeight = viewport?.height || window.innerHeight;
    const viewportWidth = viewport?.width || window.innerWidth;
    root.style.setProperty('--mobile-viewport-height', `${Math.round(viewportHeight)}px`);
    root.style.setProperty('--mobile-viewport-width', `${Math.round(viewportWidth)}px`);
    root.style.setProperty('--mobile-viewport-left', `${Math.round(viewport?.offsetLeft || 0)}px`);
    root.style.setProperty('--mobile-viewport-top', `${Math.round(viewport?.offsetTop || 0)}px`);
    root.classList.toggle('mobile-landscape', viewportWidth > viewportHeight);
    root.classList.toggle('mobile-compact', viewportWidth < 620);
    root.classList.toggle('mobile-keyboard-open', editing() && viewportHeight < screen.height * 0.74);
    const rect = worldWrap.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const landscape = viewportWidth > viewportHeight;
    // Reserve a comfortable control strip in portrait. In landscape the controls use side gutters.
    const freeHeight = Math.max(80, rect.height - (landscape ? 12 : 168));
    const freeWidth = Math.max(120, rect.width - (landscape ? 14 : 12));
    const mapWidth = Math.min(freeWidth, freeHeight * 16 / 9);
    root.style.setProperty('--mobile-map-width', `${Math.floor(mapWidth)}px`);
    root.style.setProperty('--mobile-map-height', `${Math.floor(mapWidth * 9 / 16)}px`);
    root.style.setProperty('--mobile-sprite-size', `${Math.max(26, Math.min(64, mapWidth * 0.058)).toFixed(1)}px`);
  }
  function scheduleLayout() {
    if (!layoutFrame) layoutFrame = requestAnimationFrame(updateLayout);
  }
  const stateObserver = new MutationObserver(scheduleState);
  [game, $('#title-screen'), ...modalIds.map(id => document.getElementById(id)), ...promptIds.map(id => document.getElementById(id)), ...sceneIds.map(id => document.getElementById(id))]
    .filter(Boolean).forEach(element => stateObserver.observe(element, { attributes: true, attributeFilter: ['class'] }));
  const labelObserver = new MutationObserver(scheduleState);
  promptIds.map(id => document.getElementById(id)?.querySelector('span')).filter(Boolean)
    .forEach(element => labelObserver.observe(element, { childList: true, characterData: true, subtree: true }));
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(scheduleLayout).observe(worldWrap);
  window.addEventListener('resize', () => { releaseMovement(true); scheduleLayout(); });
  window.addEventListener('orientationchange', () => { releaseMovement(true); scheduleLayout(); });
  window.visualViewport?.addEventListener('resize', scheduleLayout);
  window.visualViewport?.addEventListener('scroll', scheduleLayout);
  window.addEventListener('blur', () => { releaseMovement(true); scheduleState(); });
  window.addEventListener('mobile-modal-change', scheduleState);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseMovement(true); scheduleState(); });
  document.addEventListener('focusin', () => { if (editing()) releaseMovement(true); scheduleState(); });
  document.addEventListener('focusout', scheduleState);
  document.addEventListener('pointerdown', event => {
    if (event.target.closest('button, input, select, textarea') && !event.target.closest('#mobile-joystick')) releaseMovement(true);
  }, true);
  // Only prevent browser movement on the map and pad; lists and panels retain native scrolling.
  worldWrap.addEventListener('touchmove', event => { if (!editing()) event.preventDefault(); }, { passive: false });
  controls.addEventListener('contextmenu', event => event.preventDefault());
  const titleInstructions = $('.title-foot > span');
  const version = titleInstructions?.textContent.match(/v[\d.]+/)?.[0] || '豚物语';
  if (titleInstructions) titleInstructions.textContent = `${version} · iPhone 版 · 触屏摇杆 / 点击地点行走`;
  promptIds.map(id => document.getElementById(id)).filter(Boolean).forEach(prompt => {
    const first = prompt.firstChild;
    if (first?.nodeType === Node.TEXT_NODE) first.textContent = '✦ · ';
  });
  const railTip = $('#rail-tip');
  if (railTip) railTip.textContent = '拖动摇杆行走，走近地点点“互动”，也可直接点发光地点。';
  $('#audio-btn')?.setAttribute('aria-label', '切换音乐与音效');
  $('#save-btn')?.setAttribute('aria-label', '立即保存游戏');
  $('#home-btn')?.setAttribute('aria-label', '保存并返回标题');
  updateState();
})();
