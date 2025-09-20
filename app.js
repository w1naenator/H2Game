/*
  H2Game — Card Flip Memory Game
  License: MIT. You may use, copy, modify, and distribute this code freely,
  provided you keep the copyright and permission notice. See LICENSE.
*/
// Build a palette of inline SVG images so every card has an image without external assets
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

const IMAGE_NAMES = [
  "Aurora", "Blossom", "Comet", "Dawn", "Echo", "Flame", "Glacier", "Harbor",
  "Indigo", "Jade", "Koi", "Lotus", "Mango", "Nebula", "Orchid", "Pearl",
  "Quartz", "Raven", "Saffron", "Topaz", "Umber", "Violet", "Wave", "Xenon",
  "Yarrow", "Zephyr"
];

const COLORS = [
  "#ef4444", "#f59e0b", "#10b981", "#22c55e", "#06b6d4", "#3b82f6",
  "#6366f1", "#8b5cf6", "#d946ef", "#ec4899", "#f43f5e", "#84cc16",
  "#f97316", "#22d3ee", "#14b8a6", "#a3e635", "#eab308", "#fb7185",
  "#60a5fa", "#34d399", "#fcd34d", "#a78bfa", "#f472b6", "#38bdf8",
  "#f43f5e", "#4ade80"
];

/* Switch deck to emoji pairs */
const EMOJI_CONFIGS = [
  { glyph: "🐶", label: "Dog" },
  { glyph: "🐱", label: "Cat" },
  { glyph: "🐭", label: "Mouse" },
  { glyph: "🐰", label: "Bunny" },
  { glyph: "🐼", label: "Panda" },
  { glyph: "🐸", label: "Frog" },
  { glyph: "🐵", label: "Monkey" },
  { glyph: "🐔", label: "Rooster" },
  { glyph: "🐤", label: "Chick" },
  { glyph: "🐙", label: "Octopus" },
  { glyph: "🐠", label: "Fish" },
  { glyph: "🐟", label: "Tropical Fish" },
  { glyph: "🐬", label: "Dolphin" },
  { glyph: "🐳", label: "Whale" },
  { glyph: "🌸", label: "Blossom" },
  { glyph: "🌻", label: "Sunflower" },
  { glyph: "🍓", label: "Strawberry" },
  { glyph: "🍉", label: "Watermelon" }
];

const ICONS = EMOJI_CONFIGS.map((config, index) => ({
  id: `emoji-${index + 1}`,
  label: config.label,
  glyph: config.glyph
}));

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
  rowsSelect: document.querySelector("#rows"),
  columnsSelect: document.querySelector("#columns"),
  hideMatchedInput: document.querySelector("#hideMatched"),
  scoreValue: document.querySelector(".score-value"),
  movesValue: document.querySelector(".moves-value"),
  timeValue: document.querySelector(".time-value"),
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
  timer: {
    intervalId: null,
    running: false,
    startTimestamp: null,
    elapsedMs: 0
  }
};

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
}

function updateScoreDisplay() {
  DOM.scoreValue.textContent = `${state.score} / ${state.maxScore}`;
}

function updateMovesDisplay() {
  DOM.movesValue.textContent = String(state.moves);
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
}

function resizeBoard() {
  if (!state.config) {
    return;
  }

  const { columns, rows } = state.config;
  const ratio = 1.2;
  const boardStyles = getComputedStyle(DOM.board);
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
  // Build a data-URI image for the emoji so a real <img> appears on flip
  const idNum = Number((icon.id || "").split("-")[1]) || 1;
  const bgColor = COLORS[(idNum - 1) % COLORS.length] || "#6366f1";
  const imageSrc = svgDataUri(bgColor, icon.glyph);
  button.innerHTML = `
    <span class="card-inner">
      <span class="card-face card-front" aria-hidden="true">?</span>
      <span class="card-face card-back"><img class="card-image" src="${imageSrc}" alt="${icon.label}"></span>
    </span>
  `;
  button.addEventListener("click", handleCardClick);
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
  if (state.busy) {
    return;
  }

  const card = event.currentTarget;
  if (card.classList.contains("is-flipped") || card.classList.contains("matched")) {
    return;
  }

  ensureTimerRunning();
  flipCard(card);
  state.cardsInPlay.push(card);

  if (state.cardsInPlay.length === 2) {
    state.busy = true;
    checkForMatch();
  }
}

function flipCard(card) {
  const label = card.dataset.label || "card";
  card.classList.add("is-flipped");
  card.setAttribute("aria-label", "Revealed card showing " + label);
}

function hideCard(card) {
  card.classList.remove("is-flipped");
  card.setAttribute("aria-label", "Hidden card");
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

  if (firstCard.dataset.value === secondCard.dataset.value) {
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
      const delay = state.config && state.config.hideMatched ? 1000 : 650;
      setTimeout(showWinAnimation, delay);
    }
  } else {
    setStatusMessage(buildTryAgainMessage(state.config.name));
    setTimeout(() => {
      hideCard(firstCard);
      hideCard(secondCard);
      clearFlippedCards();
    }, 800);
  }
}

function populateWizardFields() {
  if (!state.config) {
    // Default values when no prior config
    if (DOM.hideMatchedInput) DOM.hideMatchedInput.checked = true;
    return;
  }
  DOM.playerNameInput.value = state.config.name;
  DOM.rowsSelect.value = String(state.config.rows);
  DOM.columnsSelect.value = String(state.config.columns);
  if (DOM.hideMatchedInput) DOM.hideMatchedInput.checked = Boolean(state.config.hideMatched);
}

function openStartOverlay() {
  resetGameState();
  hideWinAnimation();
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

function validateSelections(name, rows, columns) {
  if (!name) {
    return "Please enter a player name.";
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
  const rows = Number(formData.get("rows"));
  const columns = Number(formData.get("columns"));
  const hideMatched = formData.get("hideMatched") === "on";

  const validationError = validateSelections(name, rows, columns);
  if (validationError) {
    DOM.startError.textContent = validationError;
    return;
  }

  state.config = { name, rows, columns, hideMatched };
  DOM.playerName.textContent = name;
  DOM.playerNameHighlight.textContent = name;

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


