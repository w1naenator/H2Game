/*
  Flip to Match Game
  License: MIT. You may use, copy, modify, and distribute this code freely,
  provided you keep the copyright and permission notice. See LICENSE.
*/
// Build a fallback inline SVG image used if a PNG fails to load
function svgDataUri(bg, text) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320' viewBox='0 0 100 100'>` +
    `<defs>` +
    `<linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0%' stop-color='${bg}' stop-opacity='1'/>` +
    `<stop offset='100%' stop-color='black' stop-opacity='0.15'/>` +
    `</linearGradient>` +
    `</defs>` +
    `<rect x='0' y='0' width='100' height='100' rx='14' fill='url(#g)'/>` +
    `<text x='50' y='55' text-anchor='middle' font-family='Segoe UI, Arial, sans-serif' font-size='54' fill='#fff' stroke='rgba(0,0,0,0.15)' stroke-width='0.8'>${text}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}


const IMAGE_COUNT = 20;
const ICONS = Array.from({ length: IMAGE_COUNT }, (_, i) => ({
  id: `img-${i}`,
  label: `Image ${i}`,
  src: `assets/img/cards/${i}.png`
}));

// Reverse (back) image used for the card's hidden side
let REVERSE_IMAGE_SRC = 'assets/img/cards/r.png';

// Pause between revealing two cards and taking next action (match or flip back)
const RESULT_PAUSE_MS = 800;

const DOM = {
  board: document.querySelector(".game-board"),
  status: document.querySelector(".status-message"),
  gameTitle: document.querySelector(".game-title"),
  playerName: document.querySelector(".player-name"),
  playerNameHighlight: document.querySelector(".player-name-highlight"),
  restartButton: document.querySelector(".restart-btn"),
  startOverlay: document.querySelector(".start-overlay"),
  startForm: document.querySelector(".start-form"),
  startError: document.querySelector(".start-error"),
  playerNameInput: document.querySelector("#playerName"),
  emailInput: document.querySelector("#email"),
  rowsSelect: document.querySelector("#rows"),
  columnsSelect: document.querySelector("#columns"),
  hideMatchedInput: document.querySelector("#hideMatched"),
  scoreValue: document.querySelector(".score-value"),
  movesValue: document.querySelector(".moves-value"),
  timeValue: document.querySelector(".time-value"),
  bestValue: document.querySelector(".best-value"),
  finalScoreValue: document.querySelector(".final-score-value"),
  finalMovesValue: document.querySelector(".final-moves"),
  finalTimeValue: document.querySelector(".final-time"),
  winOverlay: document.querySelector(".win-overlay"),
  winRestartButton: document.querySelector(".win-restart-btn")
};

const state = {
  config: null,
  cardsInPlay: [],
  matchesFound: 0,
  busy: false,
  moves: 0,
  score: 0,
  maxScore: 0,
  timePenaltyPerSecond: 0,
  cardAspect: 1.2,
  timer: {
    intervalId: null,
    running: false,
    startTimestamp: null,
    elapsedMs: 0
  }
};

const STORAGE = { prefix: "FlipToMatchGame:best:slots-", legacyPrefix: "H2Game:best:slots-" };

// Simple IndexedDB helper for storing per-game results locally (offline)
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('flip2match', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('games')) {
        const store = db.createObjectStore('games', { keyPath: 'id', autoIncrement: true });
        store.createIndex('email', 'email', { unique: false });
        store.createIndex('slots', 'slots', { unique: false });
        store.createIndex('ts', 'ts', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function saveResultRecord(record) {
  try {
    openDB().then((db) => {
      const tx = db.transaction('games', 'readwrite');
      tx.objectStore('games').add(record);
    }).catch(() => {});
  } catch (_) {}
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getTotalCards(config) {
  return config.rows * config.columns;
}

function getTotalPairs(config) {
  return Math.floor(getTotalCards(config) / 2);
}

function hasOddCard(config) {
  return getTotalCards(config) % 2 !== 0;
}

// Single fallback message used if configs cannot be loaded
const DEFAULT_MESSAGE = "Let's play!";

// Dynamic message templates loaded from JS/JSON configs
const MESSAGES = { onMatch: [], onMismatch: [], onWin: [], onStart: [] };

function fillTemplate(tpl, data) {
  try {
    return String(tpl).replace(/\{(\w+)\}/g, (_, k) =>
      Object.prototype.hasOwnProperty.call(data, k) ? String(data[k]) : `{${k}}`
    );
  } catch (_) {
    return String(tpl || "");
  }
}

// Load messages.json if available; ignore failures silently
(function loadDynamicMessages() {
  try {

function uniqueStrings(list) {
  try {
    const seen = new Set();
    const out = [];
    for (const s of list || []) {
      if (typeof s !== 'string') continue;
      const v = s.trim();
      if (!v || seen.has(v)) continue;
      seen.add(v); out.push(v);
    }
    return out;
  } catch (_) { return Array.isArray(list) ? list : []; }
}

    // Prefer global JS messages (works on file://)
    try {
      if (window.APP_MESSAGES) {
        const m = window.APP_MESSAGES;
        if (Array.isArray(m.onMatch)) MESSAGES.onMatch = uniqueStrings(m.onMatch);
        if (Array.isArray(m.onMismatch)) MESSAGES.onMismatch = uniqueStrings(m.onMismatch);
        if (Array.isArray(m.onWin)) MESSAGES.onWin = uniqueStrings(m.onWin);
        if (Array.isArray(m.onStart)) MESSAGES.onStart = uniqueStrings(m.onStart);
        // Backwards compatibility keys
        if ((!MESSAGES.onMatch || !MESSAGES.onMatch.length) && Array.isArray(m.encouragements)) {
          MESSAGES.onMatch = uniqueStrings(m.encouragements);
        }
        if ((!MESSAGES.onWin || !MESSAGES.onWin.length) && Array.isArray(m.wins)) {
          MESSAGES.onWin = uniqueStrings(m.wins);
        }
      }
    } catch (_) {}

    if (typeof fetch !== 'function' || !/^https?:$/.test(location.protocol)) return;
    fetch('assets/data/messages.json', { cache: 'no-store' })
      .then((resp) => { if (!resp.ok) throw new Error('http'); return resp.json(); })
      .then((data) => {
        // Preferred keys (deduped)
        if (data && Array.isArray(data.onMatch)) MESSAGES.onMatch = uniqueStrings(data.onMatch);
        if (data && Array.isArray(data.onMismatch)) MESSAGES.onMismatch = uniqueStrings(data.onMismatch);
        if (data && Array.isArray(data.onWin)) MESSAGES.onWin = uniqueStrings(data.onWin);
        if (data && Array.isArray(data.onStart)) MESSAGES.onStart = uniqueStrings(data.onStart);
        // Backwards compatibility with older schema
        if ((!MESSAGES.onMatch || !MESSAGES.onMatch.length) && Array.isArray(data.encouragements)) {
          MESSAGES.onMatch = uniqueStrings(data.encouragements);
        }
        if ((!MESSAGES.onWin || !MESSAGES.onWin.length) && Array.isArray(data.wins)) {
          MESSAGES.onWin = uniqueStrings(data.wins);
        }
      })
      .catch(() => { /* rely on inline/defaults */ });
  } catch (_) { /* noop */ }
})();

function buildIntroMessage(config, name) {
  try {
    const list = Array.isArray(MESSAGES.onStart) && MESSAGES.onStart.length ? MESSAGES.onStart : null;
    if (list) {
      const tpl = list[Math.floor(Math.random() * list.length)];
      return fillTemplate(tpl, { name });
    }
  } catch (_) {}
  return DEFAULT_MESSAGE;
}

function buildProgressMessage(name, found, total) {
  try {
    const list = Array.isArray(MESSAGES.onMatch) && MESSAGES.onMatch.length ? MESSAGES.onMatch : null;
    if (list) {
      const tpl = list[Math.floor(Math.random() * list.length)];
      return fillTemplate(tpl, { name, found, total });
    }
  } catch (_) {}
  return DEFAULT_MESSAGE;
}

function buildTryAgainMessage(name) {
  try {
    const list = Array.isArray(MESSAGES.onMismatch) && MESSAGES.onMismatch.length ? MESSAGES.onMismatch : null;
    if (list) {
      const tpl = list[Math.floor(Math.random() * list.length)];
      return fillTemplate(tpl, { name });
    }
  } catch (_) {}
  return DEFAULT_MESSAGE;
}

function buildWinMessage(name) {
  try {
    const list = Array.isArray(MESSAGES.onWin) && MESSAGES.onWin.length ? MESSAGES.onWin : null;
    if (list) {
      const tpl = list[Math.floor(Math.random() * list.length)];
      return fillTemplate(tpl, { name });
    }
  } catch (_) {}
  return DEFAULT_MESSAGE;
}

function setStatusMessage(message) {
  DOM.status.textContent = message;
}

function clearBoard() {
  DOM.board.replaceChildren();
  state.cardsInPlay = [];
}

function setOverlayVisible(isVisible) {
  try {
    if (isVisible) {
      // Show immediately: re-enable interaction, clear aria-hidden
      try { DOM.startOverlay.removeAttribute('inert'); } catch {}
      DOM.startOverlay.classList.remove('is-hidden');
      DOM.startOverlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('wizard-open');
      return;
    }

    // Hiding: first move focus outside the overlay, then hide/accessibility-toggle
    const active = document.activeElement;
    if (active && DOM.startOverlay && DOM.startOverlay.contains(active)) {
      // Prefer a visible control outside the overlay
      let target = (DOM.restartButton && !DOM.restartButton.disabled) ? DOM.restartButton : document.querySelector('h1');
      if (!target) target = document.body;
      if (target && target.tagName === 'H1') {
        target.setAttribute('tabindex', '-1');
        target.focus();
        target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
      } else if (target && typeof target.focus === 'function') {
        target.focus();
      }
      try { active.blur && active.blur(); } catch {}
    }

    // Defer aria-hidden/inert to the next frame so focus move commits first
    requestAnimationFrame(() => {
      try { DOM.startOverlay.setAttribute('inert', ''); } catch {}
      DOM.startOverlay.classList.add('is-hidden');
      DOM.startOverlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('wizard-open');
    });
  } catch {}
}

function updateScoreDisplay() {
  DOM.scoreValue.textContent = `${state.score} / ${state.maxScore}`;
}

function updateMovesDisplay() {
  DOM.movesValue.textContent = String(state.moves);
}

function getVariantStorageKey(config) {
  const slots = getTotalCards(config);
  return `${STORAGE.prefix}${slots}`;
}

function loadBestScore(config) {
  try {
    const key = getVariantStorageKey(config);
    let raw = localStorage.getItem(key);
    if (!raw && STORAGE.legacyPrefix) {
      const legacyKey = `${STORAGE.legacyPrefix}${getTotalCards(config)}`;
      raw = localStorage.getItem(legacyKey);
      if (raw) {
        try { localStorage.setItem(key, raw); } catch {}
      }
    }
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveBestScoreIfHigher(config, payload) {
  try {
    const existing = loadBestScore(config);
    if (!existing || (payload && typeof payload.score === "number" && payload.score > existing.score)) {
      localStorage.setItem(getVariantStorageKey(config), JSON.stringify(payload));
      return payload;
    }
    return existing;
  } catch {
    return null;
  }
}

function updateBestDisplay() {
  if (!DOM.bestValue || !state.config) return;
  const best = loadBestScore(state.config);
  DOM.bestValue.textContent = best && typeof best.score === "number" ? String(best.score) : "—";
}

// Try posting a result to server-side PHP endpoint if available; ignore failures
async function postResultToServer(record) {
  try {
    if (!/^https?:$/.test(location.protocol)) return false;
    const res = await fetch('api/save_result.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });
    return res.ok;
  } catch {
    return false;
  }
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updateTimeDisplay() {
  DOM.timeValue.textContent = formatTime(state.timer.elapsedMs);
}

function updateScoreFromTime() {
  if (state.maxScore === 0) {
    state.score = 0;
  } else {
    const elapsedSeconds = Math.floor(state.timer.elapsedMs / 1000);
    const penalty = elapsedSeconds * state.timePenaltyPerSecond;
    state.score = Math.max(0, state.maxScore - penalty);
  }
  updateScoreDisplay();
}

function tickTimer() {
  if (!state.timer.running || state.timer.startTimestamp === null) {
    return;
  }
  state.timer.elapsedMs = Date.now() - state.timer.startTimestamp;
  updateTimeDisplay();
  updateScoreFromTime();
}

function startTimer() {
  if (state.timer.running) {
    return;
  }
  state.timer.running = true;
  state.timer.startTimestamp = Date.now() - state.timer.elapsedMs;
  state.timer.intervalId = setInterval(tickTimer, 250);
}

function stopTimer() {
  if (!state.timer.running) {
    return;
  }
  tickTimer();
  clearInterval(state.timer.intervalId);
  state.timer.intervalId = null;
  state.timer.running = false;
  state.timer.startTimestamp = null;
}

function resetTimer() {
  stopTimer();
  state.timer.elapsedMs = 0;
  updateTimeDisplay();
  updateScoreFromTime();
}

function ensureTimerRunning() {
  if (!state.timer.running) {
    startTimer();
  }
}

function initialiseScore(totalPairs) {
  state.moves = 0;
  state.maxScore = totalPairs * 100;
  state.timePenaltyPerSecond = state.maxScore > 0 ? Math.max(1, Math.round(state.maxScore / 180)) : 0;
  state.score = state.maxScore;
  updateMovesDisplay();
  resetTimer();
  updateScoreDisplay();
  updateBestDisplay();
}

function resizeBoard() {
  if (!state.config) {
    return;
  }

  const { columns, rows } = state.config;
  // Prefer dynamic aspect ratio set from reverse image; fallback to 1.2
  let ratio = state.cardAspect || 1.2; // numeric height/width
  const boardStyles = getComputedStyle(DOM.board);
  const cssVar = (boardStyles.getPropertyValue('--card-aspect') || '').trim();
  if (cssVar) {
    // Support either numeric height/width or CSS ratio 'w / h'
    const slash = cssVar.indexOf('/');
    if (slash !== -1) {
      const left = parseFloat(cssVar.slice(0, slash));
      const right = parseFloat(cssVar.slice(slash + 1));
      if (isFinite(left) && isFinite(right) && left > 0 && right > 0) {
        // cssVar is w / h; convert to h/w numeric for calculations
        ratio = right / left;
      }
    } else {
      const numeric = parseFloat(cssVar);
      if (!Number.isNaN(numeric) && numeric > 0.1) ratio = numeric;
    }
  }
  const gap = parseFloat(boardStyles.gap) || 16;

  const main = DOM.board.closest("main");
  if (!main) {
    return;
  }

  const mainStyles = getComputedStyle(main);
  const mainWidth = main.getBoundingClientRect().width;
  const horizontalPadding = parseFloat(mainStyles.paddingLeft) + parseFloat(mainStyles.paddingRight);
  const availableWidth = Math.max(0, mainWidth - horizontalPadding);

  const header = main.querySelector("header");
  const headerHeight = header ? header.getBoundingClientRect().height : 0;
  const mainRect = main.getBoundingClientRect();
  const paddingBottom = parseFloat(mainStyles.paddingBottom);
  const breathingSpace = gap + 24;
  const availableHeight = Math.max(120, window.innerHeight - mainRect.top - headerHeight - paddingBottom - breathingSpace);

  const widthBased = (availableWidth - gap * (columns - 1)) / columns;
  const heightBased = (availableHeight - gap * (rows - 1)) / rows / ratio;
  const computedSize = Math.max(56, Math.min(widthBased, heightBased, 180));

  DOM.board.style.setProperty("--card-size", `${computedSize}px`);
  DOM.board.style.gridTemplateColumns = `repeat(${columns}, var(--card-size))`;
}

function buildDeckFor(config) {
  const totalPairs = getTotalPairs(config);
  const selectedIcons = shuffle(ICONS).slice(0, totalPairs);
  const deck = selectedIcons.flatMap((icon) => [icon, icon]);
  if (hasOddCard(config)) {
    deck.push(null);
  }
  return shuffle(deck);
}

function createCardElement(icon, index) {
  const button = document.createElement("button");
  button.className = "card";
  button.type = "button";
  button.setAttribute("aria-label", "Hidden card " + (index + 1));
  button.dataset.value = icon.id;
  button.dataset.label = icon.label;
  const imageSrc = icon.src ? icon.src : svgDataUri('#000', icon.glyph || "?");

  // Initialise FlipCard library instance (creates inner structure lazily)
  const flip = new FlipCard(button, {
    faceSrc: imageSrc,
    backSrc: REVERSE_IMAGE_SRC,
    duration: (CONFIG.card && Number(CONFIG.card.durationMs)) || 600,
    dwellAtRibMs: (CONFIG.card && Number(CONFIG.card.dwellAtRibMs)) || 0,
    postFlipPauseMs: (CONFIG.card && Number(CONFIG.card.postFlipPauseMs)) || 0,
    mirrorBack: CONFIG.card && typeof CONFIG.card.mirrorBack === 'boolean' ? CONFIG.card.mirrorBack : true,
    faceBg: CONFIG.card && CONFIG.card.faceBg ? CONFIG.card.faceBg : '#000000',
    backBg: CONFIG.card && CONFIG.card.backBg ? CONFIG.card.backBg : '#000000',
    radius: CONFIG.card && Object.prototype.hasOwnProperty.call(CONFIG.card, 'radius') ? CONFIG.card.radius : null,
    highlight: false,
    onFlipStart: (dir) => {
      if (dir === 'to-face') {
        const label = button.dataset.label || 'card';
        button.setAttribute('aria-label', 'Revealed card showing ' + label);
      }
    },
    onReverse: () => {
      button.setAttribute('aria-label', 'Hidden card');
    }
  });
  // Attach instance for game logic
  button._flipCard = flip;

  // Use capture to fully control flip start and prevent auto-toggle
  button.addEventListener("click", handleCardClick, { capture: true });

  // Debug creation radii
  try {
    if (APP_CONFIG && APP_CONFIG.debug && APP_CONFIG.debug.cardRadius) {
      const inner = button.querySelector('.card__inner');
      const plane = button.querySelector('.card__plane');
      const rootR = getComputedStyle(button).borderRadius;
      const innerR = inner ? getComputedStyle(inner).borderRadius : 'n/a';
      const planeR = plane ? getComputedStyle(plane).borderRadius : 'n/a';
      console.log('[CreateCard][radius]', { rootR, innerR, planeR, option: flip.options.radius });
    }
  } catch {}

  return button;
}
function createEmptySlot() {
  const slot = document.createElement("div");
  slot.className = "empty-slot";
  slot.setAttribute("aria-hidden", "true");
  return slot;
}

function hideWinAnimation() {
  DOM.winOverlay.classList.remove("is-visible");
  DOM.winOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("game-won");
}

function showWinAnimation() {
  if (!state.config) {
    return;
  }
  const name = state.config.name;
  // Update overlay heading with a randomized win message and keep name highlighted
  try {
    const heading = DOM.winOverlay && DOM.winOverlay.querySelector('h2');
    if (heading) {
      const msg = buildWinMessage(name);
      const idx = msg.indexOf(name);
      heading.replaceChildren();
      if (idx >= 0) {
        const before = msg.slice(0, idx);
        const after = msg.slice(idx + name.length);
        if (before) heading.appendChild(document.createTextNode(before));
        const span = document.createElement('span');
        span.className = 'player-name-highlight';
        span.textContent = name;
        heading.appendChild(span);
        if (after) heading.appendChild(document.createTextNode(after));
        // Keep DOM cache in sync
        DOM.playerNameHighlight = span;
      } else {
        heading.textContent = msg;
      }
    }
  } catch (_) {
    // Fallback to original static name placement
    if (DOM.playerNameHighlight) DOM.playerNameHighlight.textContent = name;
  }
  if (DOM.playerNameHighlight) DOM.playerNameHighlight.textContent = name;
  DOM.finalScoreValue.textContent = `${state.score} / ${state.maxScore}`;
  DOM.finalMovesValue.textContent = String(state.moves);
  DOM.finalTimeValue.textContent = formatTime(state.timer.elapsedMs);
  DOM.winOverlay.classList.add("is-visible");
  DOM.winOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("game-won");
  // Move focus to popup restart for accessibility
  if (DOM.winRestartButton) {
    DOM.winRestartButton.focus();
  }
}

function resetGameState() {
  state.cardsInPlay = [];
  state.matchesFound = 0;
  state.busy = false;
}

function resetBoard() {
  if (!state.config) {
    return;
  }

  resetGameState();
  hideWinAnimation();
  DOM.restartButton.disabled = false;

  setStatusMessage(buildIntroMessage(state.config, state.config.name));
  clearBoard();

  const totalPairs = getTotalPairs(state.config);
  initialiseScore(totalPairs);

  // Log a started game into local DB for history, even if not completed later
  (function(){ const rec = {
    status: 'started',
    name: state.config.name,
    email: state.config.email || '',
    rows: state.config.rows,
    columns: state.config.columns,
    hideMatched: !!state.config.hideMatched,
    slots: getTotalCards(state.config),
    score: 0,
    maxScore: state.maxScore,
    timeMs: 0,
    moves: 0,
    ts: Date.now()
  }; saveResultRecord(rec); postResultToServer(rec); })();

  const deck = buildDeckFor(state.config);
  let cardIndex = 0;
  for (let i = 0; i < deck.length; i += 1) {
    const entry = deck[i];
    if (entry === null) {
      DOM.board.appendChild(createEmptySlot());
    } else {
      DOM.board.appendChild(createCardElement(entry, cardIndex));
      cardIndex += 1;
    }
  }

  requestAnimationFrame(resizeBoard);
}

function handleCardClick(event) {
  const card = event.currentTarget;
  const api = card._flipCard;
  if (!api) return;

  // Prevent FlipCard's own click from toggling; we drive it
  event.preventDefault();
  event.stopImmediatePropagation();

  if (state.busy) return;
  if (card.classList.contains("matched") || card.disabled) return;
  if (api.isFlipping || api.isFace) return;

  ensureTimerRunning();
  flipCard(card);
  state.cardsInPlay.push(card);

  if (state.cardsInPlay.length === 2) {
    state.busy = true;
    checkForMatch();
  }
}

// Flip helpers backed by FlipCard library
function waitFlipEnd(card) {
  const api = card._flipCard;
  if (!api) return Promise.resolve();
  if (api.prefersReduced) return Promise.resolve();
  const inner = card.querySelector('.card__inner');
  if (!inner) return Promise.resolve();
  return new Promise((resolve) => {
    const handler = (e) => {
      if (e.propertyName !== 'transform') return;
      if (!card.classList.contains('to-rib')) {
        inner.removeEventListener('transitionend', handler);
        resolve();
      }
    };
    inner.addEventListener('transitionend', handler);
  });
}

function flipCard(card) {
  const api = card._flipCard;
  if (!api) return;
  api.flipToFace();
}

function hideCard(card) {
  const api = card._flipCard;
  if (!api) return Promise.resolve();
  if (!api.isFace || api.isFlipping) return Promise.resolve();
  api.flipToReverse();
  return waitFlipEnd(card);
}

function markAsMatched(card) {
  const label = card.dataset.label || "card";
  card.classList.add("matched");
  card.setAttribute("aria-label", "Matched card showing " + label);
  card.disabled = true;
  // Optionally hide matched cards after a brief animation
  if (state.config && state.config.hideMatched) {
    setTimeout(() => {
      card.classList.add("fade-out");
    }, 600);

    setTimeout(() => {
      card.classList.add("is-hidden");
    }, 900);
  }
}

function recordMove() {
  state.moves += 1;
  updateMovesDisplay();
}

function clearFlippedCards() {
  state.cardsInPlay = [];
  state.busy = false;
}

function checkForMatch() {
  const [firstCard, secondCard] = state.cardsInPlay;
  recordMove();

  const isMatch = firstCard.dataset.value === secondCard.dataset.value;
  // Hold a consistent pause before proceeding (match or mismatch)
  // For mismatches, provide immediate feedback (replace onStart message too)
  if (!isMatch) {
    setStatusMessage(buildTryAgainMessage(state.config.name));
  }

  setTimeout(() => {
    if (isMatch) {
      // Remove highlights after the pause
      try { firstCard._flipCard && firstCard._flipCard.hideHighlight(); } catch {}
      try { secondCard._flipCard && secondCard._flipCard.hideHighlight(); } catch {}

      const totalPairs = getTotalPairs(state.config);
      markAsMatched(firstCard);
      markAsMatched(secondCard);
      state.matchesFound += 1;

      // Now that the match is confirmed and counted, update progress message once
      setStatusMessage(buildProgressMessage(state.config.name, state.matchesFound, totalPairs));
      clearFlippedCards();

      if (state.matchesFound === totalPairs) {
        stopTimer();
        updateScoreFromTime();
        setStatusMessage(buildWinMessage(state.config.name));
        // Persist best score per total slots (rows x columns)
        saveBestScoreIfHigher(state.config, {
          score: state.score,
          slots: getTotalCards(state.config),
          timeMs: state.timer.elapsedMs,
          moves: state.moves,
          timestamp: Date.now()
        });
        updateBestDisplay();
        // Save full game result to local database (IndexedDB)
        (function saveDB() {
          const record = {
            status: 'completed',
            name: state.config.name,
            email: state.config.email,
            rows: state.config.rows,
            columns: state.config.columns,
            hideMatched: !!state.config.hideMatched,
            slots: getTotalCards(state.config),
            score: state.score,
            maxScore: state.maxScore,
            timeMs: state.timer.elapsedMs,
            moves: state.moves,
            ts: Date.now()
          };
          saveResultRecord(record);
          postResultToServer(record);
        })();
        const delay = state.config && state.config.hideMatched ? 600 : 0;
        setTimeout(showWinAnimation, delay);
      }
    } else {
      // Mismatch: keep highlights during flip-back, then clear after both complete
      Promise.all([hideCard(firstCard), hideCard(secondCard)]).then(() => {
        try { firstCard._flipCard && firstCard._flipCard.hideHighlight(); } catch {}
        try { secondCard._flipCard && secondCard._flipCard.hideHighlight(); } catch {}
        clearFlippedCards();
      });
    }
  }, RESULT_PAUSE_MS);
}

function populateWizardFields() {
  if (!state.config) {
    // Default values when no prior config
    if (DOM.hideMatchedInput) DOM.hideMatchedInput.checked = false;
    return;
  }
  DOM.playerNameInput.value = state.config.name;
  if (DOM.emailInput) DOM.emailInput.value = state.config.email || "";
  DOM.rowsSelect.value = String(state.config.rows);
  DOM.columnsSelect.value = String(state.config.columns);
  if (DOM.hideMatchedInput) DOM.hideMatchedInput.checked = Boolean(state.config.hideMatched);
}

function openStartOverlay() {
  resetGameState();
  hideWinAnimation();
  // If there was an ongoing game, log it as abandoned so it appears in results
  if (state.config) {
    const totalPairs = getTotalPairs(state.config);
    const wasInProgress = state.matchesFound < totalPairs && (state.moves > 0 || state.timer.elapsedMs > 0);
    if (wasInProgress) {
      (function(){ const rec = {
        status: 'abandoned',
        name: state.config.name,
        email: state.config.email || '',
        rows: state.config.rows,
        columns: state.config.columns,
        hideMatched: !!state.config.hideMatched,
        slots: getTotalCards(state.config),
        score: state.score,
        maxScore: state.maxScore,
        timeMs: state.timer.elapsedMs,
        moves: state.moves,
        ts: Date.now()
      }; saveResultRecord(rec); postResultToServer(rec); })();
    }
  }
  clearBoard();
  setStatusMessage("Use the wizard to begin.");
  DOM.restartButton.disabled = true;
  DOM.startError.textContent = "";

  state.score = 0;
  state.maxScore = 0;
  state.timePenaltyPerSecond = 0;
  state.moves = 0;
  resetTimer();
  updateScoreDisplay();
  updateMovesDisplay();
  populateWizardFields();

  setOverlayVisible(true);
  requestAnimationFrame(() => DOM.playerNameInput.focus());
}

function validateSelections(name, email, rows, columns) {
  if (!name) {
    return "Please enter a player name.";
  }
  if (!email) {
    return "Please enter an email address.";
  }
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return "Please enter a valid email address.";
  }
  if (!Number.isInteger(rows) || !Number.isInteger(columns)) {
    return "Rows and columns must be whole numbers.";
  }
  if (rows < 2 || rows > 5 || columns < 2 || columns > 5) {
    return "Rows and columns must be between 2 and 5.";
  }
  const cards = rows * columns;
  const pairsNeeded = Math.floor(cards / 2);
  if (pairsNeeded < 1) {
    return "Choose a grid with at least one pair.";
  }
  if (pairsNeeded > ICONS.length) {
    return "That board needs more unique cards than available. Please choose a smaller grid.";
  }
  return null;
}

function handleStart(event) {
  event.preventDefault();

  const formData = new FormData(DOM.startForm);
  const name = (formData.get("playerName") || "").toString().trim();
  const email = (formData.get("email") || "").toString().trim();
  const rows = Number(formData.get("rows"));
  const columns = Number(formData.get("columns"));
  const hideMatched = formData.get("hideMatched") === "on";

  const validationError = validateSelections(name, email, rows, columns);
  if (validationError) {
    DOM.startError.textContent = validationError;
    return;
  }

  state.config = { name, email, rows, columns, hideMatched };
  if (DOM.playerName) DOM.playerName.textContent = name;
  DOM.playerNameHighlight.textContent = name;

  // Reflect hide-matched mode as a body class to also gate CSS effects
  try { document.body.classList.toggle('hide-matched', !!hideMatched); } catch {}

  setOverlayVisible(false);
  DOM.restartButton.disabled = false;
  resetBoard();
}

DOM.startForm.addEventListener("submit", handleStart);
DOM.restartButton.addEventListener("click", openStartOverlay);
if (DOM.winRestartButton) {
  DOM.winRestartButton.addEventListener("click", openStartOverlay);
}
// Delegate in case markup changes or button is re-rendered
if (DOM.winOverlay) {
  DOM.winOverlay.addEventListener("click", (e) => {
    const target = e.target;
    if (target && target.closest && target.closest(".win-restart-btn")) {
      openStartOverlay();
    }
  });
}

window.addEventListener("resize", () => {
  if (state.config) {
    resizeBoard();
  }
});

// Derive and apply a global card aspect ratio from the reverse image
(function setGlobalCardAspectFromReverse(){
  try {
    const img = new Image();
    img.onload = function(){
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        const w = img.naturalWidth; const h = img.naturalHeight;
        const hw = h / w; // numeric height/width for JS sizing
        state.cardAspect = Math.max(0.5, Math.min(2.5, hw));
        if (DOM.board) {
          // Expose CSS ratio as width / height for aspect-ratio property
          DOM.board.style.setProperty('--card-aspect', `${w} / ${h}`);
          if (state.config) requestAnimationFrame(resizeBoard);
        }
      }
    };
    img.src = REVERSE_IMAGE_SRC;
  } catch {}
})();


// -------- Config (game-wide settings) --------
const CONFIG = { gameName: 'H2 Game', card: { radius: '0.75rem', durationMs: 600, dwellAtRibMs: 0, postFlipPauseMs: 0, mirrorBack: true, faceBg: '#000000', backBg: '#000000' } };

function applyGameConfig() {
  try {
    if (DOM.gameTitle && CONFIG.gameName) DOM.gameTitle.textContent = CONFIG.gameName;
    if (CONFIG.gameName) document.title = CONFIG.gameName;
    // Apply card visual variables globally
    if (CONFIG.card && Object.prototype.hasOwnProperty.call(CONFIG.card, 'radius')) {
      const val = CONFIG.card.radius;
      const css = typeof val === 'number' ? `${val}px` : String(val);
      document.documentElement.style.setProperty('--card-radius', css);
      try {
        if (CONFIG.debug && CONFIG.debug.cardRadius) {
          const rVar = getComputedStyle(document.documentElement).getPropertyValue('--card-radius');
          console.log('[Config][radius] set --card-radius to', css, 'raw:', val, 'computedVar:', rVar);
        }
      } catch {}
    }
    // Back image path (allows swapping to a square-corner asset)
    if (CONFIG.card && typeof CONFIG.card.backImage === 'string' && CONFIG.card.backImage.trim()) {
      REVERSE_IMAGE_SRC = CONFIG.card.backImage.trim();
    }
  } catch (_) {}
}

// Debug helper: dump card radii of current DOM
function __dumpCardRadii(note) {
  try {
    const cards = document.querySelectorAll('.card');
    const rVar = getComputedStyle(document.documentElement).getPropertyValue('--card-radius');
    console.log('[Dump][radius]', note || '', 'cssVar:', rVar, 'cards:', cards.length);
    let i = 0;
    cards.forEach((c) => {
      const inner = c.querySelector('.card__inner');
      const plane = c.querySelector('.card__plane');
      const rootR = getComputedStyle(c).borderRadius;
      const innerR = inner ? getComputedStyle(inner).borderRadius : 'n/a';
      const planeR = plane ? getComputedStyle(plane).borderRadius : 'n/a';
      console.log('[Card][radius]', i++, { rootR, innerR, planeR });
    });
  } catch (e) { console.warn('dump radius failed', e); }
}
try { window.__debugCardRadii = __dumpCardRadii; } catch {}

(function loadConfig(){
  // Prefer global JS config (works on file://)
  try {
    if (window.APP_CONFIG) {
      const cfg = window.APP_CONFIG;
      if (typeof cfg.gameName === 'string' && cfg.gameName.trim()) {
        CONFIG.gameName = cfg.gameName.trim();
      }
      if (cfg.card && typeof cfg.card === 'object') {
        CONFIG.card = { ...CONFIG.card, ...cfg.card };
      }
      applyGameConfig();
    }
  } catch (_) {}
try {
    if (typeof fetch !== 'function' || !/^https?:$/.test(location.protocol)) return;
    fetch('assets/data/config.json', { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('http'); return r.json(); })
      .then((data) => {
        if (data && typeof data.gameName === 'string' && data.gameName.trim()) {
          CONFIG.gameName = data.gameName.trim();
        }
        if (data && typeof data.card === 'object' && data.card) {
          CONFIG.card = { ...CONFIG.card, ...data.card };
        }
        applyGameConfig();
      })
      .catch(() => { /* rely on inline/defaults */ });
  } catch (_) {}
})();






