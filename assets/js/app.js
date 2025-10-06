/*
  Flip to Match Game
  License: MIT. You may use, copy, modify, and distribute this code freely,
  provided you keep the copyright and permission notice. See LICENSE.
*/
// Build a fallback inline SVG image used if a PNG fails to load
function svgDataUri(bg, text) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
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
const REVERSE_IMAGE_SRC = 'assets/img/cards/r.png';

// Pause between revealing two cards and taking next action (match or flip back)
const RESULT_PAUSE_MS = 800;

const DOM = {
  board: document.querySelector(".game-board"),
  status: document.querySelector(".status-message"),
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

function buildIntroMessage(config, name) {
  return `${name}, find all the matching pairs!`;
}

function buildProgressMessage(name, found, total) {
  return `Great work, ${name}! ${found} / ${total} pairs found.`;
}

function buildTryAgainMessage(name) {
  return `Try again, ${name}!`;
}

function buildWinMessage(name) {
  return `✨ Incredible, ${name}! You matched them all. Hit restart to play again.`;
}

function setStatusMessage(message) {
  DOM.status.textContent = message;
}

function clearBoard() {
  DOM.board.replaceChildren();
  state.cardsInPlay = [];
}

function setOverlayVisible(isVisible) {
  DOM.startOverlay.classList.toggle("is-hidden", !isVisible);
  DOM.startOverlay.setAttribute("aria-hidden", String(!isVisible));
  // Also toggle a body flag so CSS can reliably hide the game UI behind the wizard
  document.body.classList.toggle("wizard-open", !!isVisible);
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
    duration: 600, // matches previous 2 x 300ms halves
    dwellAtRibMs: 0,
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
  DOM.playerNameHighlight.textContent = state.config.name;
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
  setStatusMessage(isMatch ? buildProgressMessage(state.config.name, state.matchesFound + 1, getTotalPairs(state.config))
                           : buildTryAgainMessage(state.config.name));

  setTimeout(() => {
    if (isMatch) {
      // Remove highlights after the pause
      try { firstCard._flipCard && firstCard._flipCard.hideHighlight(); } catch {}
      try { secondCard._flipCard && secondCard._flipCard.hideHighlight(); } catch {}

      const totalPairs = getTotalPairs(state.config);
      markAsMatched(firstCard);
      markAsMatched(secondCard);
      state.matchesFound += 1;

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
  DOM.playerName.textContent = name;
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


