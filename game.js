
'use strict';

// ============================================================
// YAHTZEE LOCAL - VERSION 1.4.1
// Celebrations, custom dialogs, settings and autosave
// ============================================================


// ============================================================
// 1. CONFIGURATION
// ============================================================

const CATEGORIES = [
  ['ones', 'Ones'],
  ['twos', 'Twos'],
  ['threes', 'Threes'],
  ['fours', 'Fours'],
  ['fives', 'Fives'],
  ['sixes', 'Sixes'],
  ['threeKind', 'Three of a kind'],
  ['fourKind', 'Four of a kind'],
  ['fullHouse', 'Full house'],
  ['smallStraight', 'Small straight'],
  ['largeStraight', 'Large straight'],
  ['yahtzee', 'Yahtzee'],
  ['chance', 'Chance']
];

const CATEGORY_ICONS = {
  ones: '⚀',
  twos: '⚁',
  threes: '⚂',
  fours: '⚃',
  fives: '⚄',
  sixes: '⚅',
  threeKind: '🎯',
  fourKind: '💎',
  fullHouse: '🏠',
  smallStraight: '📈',
  largeStraight: '🚀',
  yahtzee: '👑',
  chance: '🍀'
};

const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

const SAVE_KEY = 'yahtzee-local-v1.4';
const SETTINGS_KEY = 'yahtzee-local-settings';
const ROLL_DURATION = 900;

const $ = id => document.getElementById(id);

const categoryLabel = (key, label) =>
  `${CATEGORY_ICONS[key] || '🎲'} ${label}`;

const clone = value => JSON.parse(JSON.stringify(value));


// ============================================================
// 2. GAME STATE AND SETTINGS
// ============================================================

let players = [];
let active = 0;
let dice = [1, 1, 1, 1, 1];
let held = [false, false, false, false, false];
let rolls = 0;
let finished = false;
let isRolling = false;

let celebratedThisTurn = false;
let undoSnapshot = null;

let rollInterval = null;
let rollTimeout = null;
let bannerTimeout = null;
let celebrationTimeout = null;

let modalOpen = false;
let lastFocusedElement = null;

let settings = {
  confirmZero: true,
  showBest: true
};


// ============================================================
// 3. SCORING FUNCTIONS
// ============================================================

function countsOf(values) {
  const counts = Array(7).fill(0);
  values.forEach(value => counts[value]++);
  return counts;
}

function score(category, values) {
  const counts = countsOf(values);
  const sum = values.reduce((a, b) => a + b, 0);
  const unique = [...new Set(values)];

  const upperKeys = CATEGORIES.slice(0, 6)
    .map(([key]) => key);

  if (upperKeys.includes(category)) {
    const face = upperKeys.indexOf(category) + 1;
    return counts[face] * face;
  }

  switch (category) {
    case 'threeKind':
      return counts.some(n => n >= 3) ? sum : 0;

    case 'fourKind':
      return counts.some(n => n >= 4) ? sum : 0;

    case 'fullHouse':
      return counts.includes(3) && counts.includes(2)
        ? 25 : 0;

    case 'smallStraight':
      return [
        [1, 2, 3, 4],
        [2, 3, 4, 5],
        [3, 4, 5, 6]
      ].some(seq =>
        seq.every(n => unique.includes(n))
      ) ? 30 : 0;

    case 'largeStraight':
      return [
        [1, 2, 3, 4, 5],
        [2, 3, 4, 5, 6]
      ].some(seq =>
        seq.every(n => unique.includes(n))
      ) ? 40 : 0;

    case 'yahtzee':
      return counts.includes(5) ? 50 : 0;

    case 'chance':
      return sum;

    default:
      return 0;
  }
}

function upperTotal(player) {
  return CATEGORIES.slice(0, 6).reduce(
    (sum, [key]) => sum + (player.scores[key] ?? 0),
    0
  );
}

function bonus(player) {
  return upperTotal(player) >= 63 ? 35 : 0;
}

function total(player) {
  return Object.values(player.scores)
    .reduce((a, b) => a + b, 0)
    + bonus(player)
    + player.yahtzeeBonus;
}

function allFilled(player) {
  return CATEGORIES.every(
    ([key]) => player.scores[key] !== undefined
  );
}

function isYahtzeeRoll() {
  return rolls > 0 && countsOf(dice).includes(5);
}


// ============================================================
// 4. EXTRA YAHTZEE / JOKER RULES
// ============================================================

function jokerInfo(player) {
  const extra = isYahtzeeRoll()
    && player.scores.yahtzee === 50;

  const faceKey = CATEGORIES[dice[0] - 1][0];
  const upperFilled =
    player.scores[faceKey] !== undefined;

  const forced = extra && !upperFilled
    ? faceKey : null;

  return { extra, forced, upperFilled };
}

function availableScore(player, key) {
  const joker = jokerInfo(player);

  if (joker.forced && key !== joker.forced) {
    return null;
  }

  if (joker.extra && joker.upperFilled) {
    const lowerOpen = CATEGORIES.slice(6).some(
      ([k]) => player.scores[k] === undefined
    );

    if (
      lowerOpen &&
      CATEGORIES.slice(0, 6).some(([k]) => k === key)
    ) {
      return null;
    }

    if (key === 'fullHouse') return 25;
    if (key === 'smallStraight') return 30;
    if (key === 'largeStraight') return 40;
  }

  return score(key, dice);
}


// ============================================================
// 5. STORAGE
// ============================================================

function captureState() {
  return {
    players: clone(players),
    active,
    dice: [...dice],
    held: [...held],
    rolls,
    finished,
    celebratedThisTurn
  };
}

function validState(state) {
  if (!state || typeof state !== 'object') return false;

  if (
    !Array.isArray(state.players) ||
    state.players.length < 2 ||
    state.players.length > 3
  ) return false;

  if (
    !Number.isInteger(state.active) ||
    state.active < 0 ||
    state.active >= state.players.length
  ) return false;

  if (
    !Array.isArray(state.dice) ||
    state.dice.length !== 5 ||
    !state.dice.every(n =>
      Number.isInteger(n) && n >= 1 && n <= 6
    )
  ) return false;

  if (
    !Array.isArray(state.held) ||
    state.held.length !== 5 ||
    !state.held.every(n => typeof n === 'boolean')
  ) return false;

  if (
    !Number.isInteger(state.rolls) ||
    state.rolls < 0 ||
    state.rolls > 3 ||
    typeof state.finished !== 'boolean'
  ) return false;

  return state.players.every(player =>
    player &&
    typeof player.name === 'string' &&
    player.scores &&
    typeof player.scores === 'object' &&
    !Array.isArray(player.scores) &&
    Number.isInteger(player.yahtzeeBonus) &&
    player.yahtzeeBonus >= 0 &&
    Object.entries(player.scores).every(([key, value]) =>
      CATEGORIES.some(([k]) => k === key) &&
      Number.isInteger(value) &&
      value >= 0
    )
  );
}

function restoreState(state) {
  players = clone(state.players);
  active = state.active;
  dice = [...state.dice];
  held = [...state.held];
  rolls = state.rolls;
  finished = state.finished;
  celebratedThisTurn = !!state.celebratedThisTurn;
  isRolling = false;
}

function saveGame() {
  if (!players.length) return;

  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      version: 1,
      state: captureState(),
      undoSnapshot
    }));
  } catch (error) {
    console.warn('Game could not be saved:', error);
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;

    const saved = JSON.parse(raw);

    if (saved.version !== 1 || !validState(saved.state)) {
      return false;
    }

    restoreState(saved.state);

    undoSnapshot = validState(saved.undoSnapshot)
      ? saved.undoSnapshot
      : null;

    $('setup').hidden = true;
    $('game').hidden = false;

    render();
    return true;
  } catch (error) {
    console.warn('Game could not be loaded:', error);
    return false;
  }
}

function clearSavedGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (error) {
    console.warn('Could not clear saved game:', error);
  }
}

function loadSettings() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(SETTINGS_KEY) || '{}'
    );

    if (typeof saved.confirmZero === 'boolean') {
      settings.confirmZero = saved.confirmZero;
    }

    if (typeof saved.showBest === 'boolean') {
      settings.showBest = saved.showBest;
    }
  } catch (error) {
    console.warn('Could not load settings:', error);
  }
}

function saveSettings() {
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify(settings)
    );
  } catch (error) {
    console.warn('Could not save settings:', error);
  }
}


// ============================================================
// 6. CUSTOM MODAL SYSTEM
// ============================================================

function createModal() {
  const overlay = document.createElement('div');

  overlay.id = 'game-modal';
  overlay.className = 'game-modal';
  overlay.hidden = true;

  overlay.innerHTML = `
    <div class="modal-panel"
         role="dialog"
         aria-modal="true"
         aria-labelledby="modal-title">

      <button id="modal-close"
              class="modal-close"
              aria-label="Close popup">✕</button>

      <div id="modal-content"></div>
    </div>
  `;

  document.body.append(overlay);

  $('modal-close').onclick = closeModal;

  // Escape closes ordinary popups.
  // Tab stays inside the open dialog.
  document.addEventListener('keydown', event => {
    if (!modalOpen) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
    }

    if (event.key === 'Tab') {
      const controls = [...overlay.querySelectorAll(
        'button:not(:disabled), input:not(:disabled)'
      )];

      if (!controls.length) return;

      const first = controls[0];
      const last = controls[controls.length - 1];

      if (event.shiftKey &&
          document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault();
        first.focus();
      }
    }
  });
}

function openModal() {
  // Closing a previous modal does not trigger actions.
  lastFocusedElement = document.activeElement;
  modalOpen = true;

  $('game-modal').hidden = false;
  document.body.classList.add('modal-open');
  $('modal-close').focus();
}

function closeModal() {
  modalOpen = false;

  $('game-modal').hidden = true;
  document.body.classList.remove('modal-open');

  if (
    lastFocusedElement &&
    lastFocusedElement.isConnected
  ) {
    lastFocusedElement.focus();
  }
}

// Reusable in-game confirmation popup.
function confirmAction({
  icon = '⚠️',
  title,
  message,
  confirmText = 'Confirm',
  onConfirm,
  danger = false
}) {
  const content = $('modal-content');
  content.replaceChildren();

  const symbol = document.createElement('div');
  symbol.className = 'modal-icon';
  symbol.textContent = icon;

  const heading = document.createElement('h2');
  heading.id = 'modal-title';
  heading.textContent = title;

  const description = document.createElement('p');
  description.className = 'modal-description';
  description.textContent = message;

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const cancel = document.createElement('button');
  cancel.className = 'secondary';
  cancel.textContent = 'Cancel';
  cancel.onclick = closeModal;

  const confirmButton = document.createElement('button');
  confirmButton.textContent = confirmText;

  if (danger) {
    confirmButton.classList.add('danger-button');
  }

  confirmButton.onclick = () => {
    closeModal();
    onConfirm();
  };

  actions.append(cancel, confirmButton);
  content.append(symbol, heading, description, actions);

  openModal();
}


// ============================================================
// 7. SETTINGS POPUP
// ============================================================

function showSettings() {
  const content = $('modal-content');

  content.innerHTML = `
    <div class="modal-icon">⚙️</div>
    <h2 id="modal-title">Game Settings</h2>
    <p class="modal-description">
      Customize your Yahtzee experience.
    </p>

    <label class="setting-row">
      <span>
        <strong>Confirm zero scores</strong>
        <small>Ask before recording 0 points</small>
      </span>
      <input type="checkbox" id="setting-zero">
    </label>

    <label class="setting-row">
      <span>
        <strong>Highlight best score</strong>
        <small>Mark the highest immediate score</small>
      </span>
      <input type="checkbox" id="setting-best">
    </label>

    <div class="modal-actions">
      <button id="settings-done">Done</button>
    </div>
  `;

  $('setting-zero').checked = settings.confirmZero;
  $('setting-best').checked = settings.showBest;

  $('setting-zero').onchange = event => {
    settings.confirmZero = event.target.checked;
    saveSettings();
    renderScoreTable();
  };

  $('setting-best').onchange = event => {
    settings.showBest = event.target.checked;
    saveSettings();
    renderScoreTable();
  };

  $('settings-done').onclick = closeModal;

  openModal();
}


// ============================================================
// 8. CONFETTI AND YAHTZEE CELEBRATION
// ============================================================

function clearCelebration() {
  clearTimeout(celebrationTimeout);

  const layer = $('celebration-layer');
  if (layer) layer.replaceChildren();
}

function launchConfetti(amount = 90) {
  const layer = $('celebration-layer');

  layer.replaceChildren();

  if (window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches) {
    return;
  }

  const colors = [
    '#ffd166',
    '#ef476f',
    '#06d6a0',
    '#118ab2',
    '#a78bfa',
    '#ffffff'
  ];

  for (let i = 0; i < amount; i++) {
    const piece = document.createElement('span');

    piece.className = 'confetti-piece';

    piece.style.left = `${Math.random() * 100}%`;

    piece.style.backgroundColor =
      colors[Math.floor(Math.random() * colors.length)];

    piece.style.setProperty(
      '--drift',
      `${Math.random() * 240 - 120}px`
    );

    piece.style.animationDelay =
      `${Math.random() * 0.45}s`;

    piece.style.animationDuration =
      `${2.3 + Math.random() * 1.5}s`;

    piece.style.width =
      `${6 + Math.random() * 7}px`;

    layer.append(piece);
  }
}

function celebrateYahtzee() {
  clearCelebration();
  window.YahtzeeV16?.play("yahtzee");
  launchConfetti(110);

  const layer = $('celebration-layer');

  const message = document.createElement('div');
  message.className = 'yahtzee-celebration';

  const title = document.createElement('strong');
  title.textContent = '🎉 YAHTZEE! 🎉';

  const subtitle = document.createElement('span');
  subtitle.textContent = 'FIVE OF A KIND!';

  message.append(title, subtitle);
  layer.append(message);

  celebrationTimeout = setTimeout(() => {
    clearCelebration();
  }, 3000);
}


// ============================================================
// 9. GAME SETUP AND TURN ACTIONS
// ============================================================


function showNames() {
  const count = Number($("player-count").value);
  const container = $("name-fields");

  container.replaceChildren();
  container.dataset.players = String(count);

  for (let i = 0; i < count; i++) {
    const playerNumber = i + 1;

    // Create player card.
    const card = document.createElement("div");
    card.className = "player-card";

    // Card heading.
    const heading = document.createElement("div");
    heading.className = "player-card-heading";

    const avatar = document.createElement("span");
    avatar.className = "player-avatar";
    avatar.textContent = "👤";

    const title = document.createElement("h3");
    title.textContent = `Player ${playerNumber}`;

    heading.append(avatar, title);

    // Display name label.
    const label = document.createElement("label");
    label.htmlFor = `player-name-${playerNumber}`;
    label.textContent = "Display name";

    // Name input.
    const input = document.createElement("input");

    input.id = `player-name-${playerNumber}`;
    input.type = "text";
    input.className = "name-input";
    input.maxLength = 24;
    input.value = `Player ${playerNumber}`;

    input.setAttribute(
      "aria-label",
      `Player ${playerNumber} name`,
    );

    // Profile dropdown is inserted after this
    // input by stats.js.
    card.append(heading, label, input);
    container.append(card);
  }
}


function resetTurn() {
  dice = [1, 1, 1, 1, 1];
  held = [false, false, false, false, false];

  rolls = 0;
  isRolling = false;
  celebratedThisTurn = false;
}

function stopAnimation() {
  clearInterval(rollInterval);
  clearTimeout(rollTimeout);

  rollInterval = null;
  rollTimeout = null;
  isRolling = false;
}

function startGame() {
  stopAnimation();
  clearCelebration();
  hideTurnBanner();

  players = [
    ...document.querySelectorAll('.name-input')
  ].map((input, index) => ({
    name: input.value.trim() || `Player ${index + 1}`,
    scores: {},
    yahtzeeBonus: 0
  }));
  
  
  if (!YahtzeeStats.startMatch(players)) {
    return;
  }


  active = 0;
  finished = false;
  undoSnapshot = null;

  resetTurn();

  $('setup').hidden = true;
  $('game').hidden = false;

  saveGame();
  render();
}


// ============================================================
// 10. DICE ROLLING
// ============================================================

function rollDice() {
  if (
    finished ||
    rolls >= 3 ||
    isRolling ||
    modalOpen
  ) return;

  undoSnapshot = null;

  // Generate the final values before animating.
  dice = dice.map((value, index) =>
    held[index]
      ? value
      : Math.floor(Math.random() * 6) + 1
  );

  rolls++;
  isRolling = true;

  saveGame();
  render();

  const rollingFaces = document.querySelectorAll(
    '#dice .rolling-die .die-face'
  );

  // Rapidly cycle the visible faces.
  rollInterval = setInterval(() => {
    rollingFaces.forEach(element => {
      const n = Math.floor(Math.random() * 6) + 1;
      element.textContent = DICE_FACES[n];
    });
  }, 65);

  rollTimeout = setTimeout(() => {
    stopAnimation();
    render();
    saveGame();

    // Celebrate once per turn, after the dice land.
    
  if (
    isYahtzeeRoll() &&
    !celebratedThisTurn
  ) {
    celebratedThisTurn = true;

    // Track the actual Yahtzee roll.
    YahtzeeStats.trackYahtzee(players[active]);

    saveGame();
    celebrateYahtzee();
  }

    }, ROLL_DURATION);
  }

function toggleHold(index) {
  if (
    finished ||
    rolls === 0 ||
    rolls === 3 ||
    isRolling ||
    modalOpen
  ) return;

  held[index] = !held[index];

  saveGame();
  renderDice();
}


// ============================================================
// RELEASE ALL HELD DICE
// ============================================================

function releaseAllDice() {
  // Only allow releasing dice during an active turn.
  if (
    finished ||
    rolls === 0 ||
    rolls >= 3 ||
    isRolling ||
    modalOpen
  ) {
    return;
  }

  // Unhold all five dice.
  held.fill(false);

  // Save the updated game state.
  saveGame();

  // Refresh dice and button appearance.
  renderDice();
}



// ============================================================
// 11. SCORE RECORDING
// ============================================================

function commit(key) {
  if (
    finished ||
    rolls === 0 ||
    isRolling ||
    modalOpen
  ) return;

  const player = players[active];

  if (player.scores[key] !== undefined) return;

  const points = availableScore(player, key);
  if (points === null) return;

  // Optional zero-score confirmation.
  if (points === 0 && settings.confirmZero) {
    const label = CATEGORIES.find(
      ([k]) => k === key
    )?.[1] || key;

    confirmAction({
      icon: '⚠️',
      title: 'Record zero points?',
      message:
        `You are about to score 0 in ${label}. ` +
        'This category cannot be used again.',
      confirmText: 'Confirm score',
      danger: true,
      onConfirm: () => recordScore(key)
    });

    return;
  }

  recordScore(key);
}

function recordScore(key) {
  if (finished || isRolling || rolls === 0) return;

  const player = players[active];

  if (player.scores[key] !== undefined) return;

  const points = availableScore(player, key);
  if (points === null) return;

  // Save previous state for Undo.
  undoSnapshot = captureState();

  if (jokerInfo(player).extra) {
    player.yahtzeeBonus += 100;
  }

  player.scores[key] = points;
  
  window.YahtzeeV16?.play("score");


  clearCelebration();

  
  
  if (players.every(allFilled)) {
    finished = true;

    // Keep the V1.5 match history integration.
    YahtzeeStats.finishMatch(players);

    saveGame();
    render();

    // Play applause once when the match ends.
    window.YahtzeeV16?.play("win");

    // Display winner and final scores.
    showWinnerPopup();

    return;
  }



  active = (active + 1) % players.length;

  resetTurn();
  saveGame();
  render();

  showTurnBanner(
    `🎲 ${players[active].name}'s turn!`
  );
}


// ============================================================
// 12. UNDO, REMATCH AND NEW GAME
// ============================================================

function undoLastScore() {
  if (
    !undoSnapshot ||
    isRolling ||
    modalOpen
  ) return;

  confirmAction({
    icon: '↶',
    title: 'Undo last score?',
    message:
      'Restore the previous player’s dice and ' +
      'remove their most recently recorded score.',
    confirmText: 'Undo score',
    onConfirm: () => {
      hideTurnBanner();
      clearCelebration();

    if (finished) {
      YahtzeeStats.unfinishMatch(players[0].matchId);
    }

      restoreState(undoSnapshot);
      undoSnapshot = null;

      saveGame();
      render();
    }
  });
}

function performRematch() {
  stopAnimation();
  clearCelebration();
  hideTurnBanner();

  players = players.map(player => ({
    name: player.name,
    profileId: player.profileId,
    scores: {},
    yahtzeeBonus: 0,
    yahtzeesRolled: 0
  }));
  
  YahtzeeStats.startRematch(players);

  active = 0;
  finished = false;
  undoSnapshot = null;

  resetTurn();

  $('setup').hidden = true;
  $('game').hidden = false;

  saveGame();
  render();

  showTurnBanner(
    `🎲 Rematch! ${players[0].name} starts.`
  );
}

function rematch() {
  if (
    !players.length ||
    isRolling ||
    modalOpen
  ) return;

  confirmAction({
    icon: '🔄',
    title: 'Start a rematch?',
    message:
      'Keep the same players and reset all scores.',
    confirmText: 'Start rematch',
    onConfirm: performRematch
  });
}

function performNewGame() {
  stopAnimation();
  clearCelebration();
  hideTurnBanner();

  clearSavedGame();

  players = [];
  active = 0;
  finished = false;
  undoSnapshot = null;

  resetTurn();

  $('game').hidden = true;
  $('setup').hidden = false;
  
  YahtzeeStats.decorateSetup();

}

function newGame() {
  if (modalOpen || isRolling) return;

  if (!$('game').hidden) {
    confirmAction({
      icon: '🎲',
      title: 'Start a new game?',
      message:
        'Current scores will be discarded. ' +
        'You can choose new players.',
      confirmText: 'New game',
      danger: true,
      onConfirm: performNewGame
    });
  } else {
    performNewGame();
  }
}


// ============================================================
// 13. TURN ANNOUNCEMENT
// ============================================================

function showTurnBanner(message) {
  clearTimeout(bannerTimeout);

  const banner = $('turn-banner');

  banner.textContent = message;
  banner.hidden = false;

  banner.classList.remove('show');
  void banner.offsetWidth;
  banner.classList.add('show');

  bannerTimeout = setTimeout(
    hideTurnBanner,
    1800
  );
}

function hideTurnBanner() {
  clearTimeout(bannerTimeout);

  const banner = $('turn-banner');
  if (!banner) return;

  banner.classList.remove('show');
  banner.hidden = true;
}


// ============================================================
// 14. WINNER POPUP
// ============================================================

function showWinnerPopup() {
  if (!finished) return;

  
  clearCelebration();

  const sorted = [...players].sort(
    (a, b) => total(b) - total(a)
  );

  const winningScore = total(sorted[0]);

  const winners = sorted.filter(
    player => total(player) === winningScore
  );

  const content = $('modal-content');
  content.replaceChildren();

  const icon = document.createElement('div');
  icon.className = 'modal-icon';
  icon.textContent = '🏆';

  const heading = document.createElement('h2');
  heading.id = 'modal-title';
  heading.className = 'winner-title';
  heading.textContent = winners.length === 1
    ? 'VICTORY!'
    : "IT'S A TIE!";

  const winnerName = document.createElement('h3');
  winnerName.className = 'winner-name';
  winnerName.textContent = winners.length === 1
    ? `${winners[0].name} Wins!`
    : winners.map(p => p.name).join(' & ');

  const scoreHeading = document.createElement('p');
  scoreHeading.className = 'modal-description';
  scoreHeading.textContent = 'Final scoreboard';

  const scoreboard = document.createElement('div');
  scoreboard.className = 'winner-scores';

  sorted.forEach(player => {
    const row = document.createElement('div');
    row.className = 'winner-score-row';

    if (total(player) === winningScore) {
      row.classList.add('winning-player');
    }

    const name = document.createElement('span');
    name.textContent =
      (total(player) === winningScore ? '👑 ' : '') +
      player.name;

    const points = document.createElement('strong');
    points.textContent = total(player);

    row.append(name, points);
    scoreboard.append(row);
  });

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const rematchButton = document.createElement('button');
  rematchButton.textContent = '🔄 Rematch';
  rematchButton.onclick = () => {
    closeModal();
    performRematch();
  };

  const newGameButton = document.createElement('button');
  newGameButton.className = 'secondary';
  newGameButton.textContent = '🎲 New game';
  newGameButton.onclick = () => {
    closeModal();
    performNewGame();
  };

  actions.append(rematchButton, newGameButton);

  content.append(
    icon,
    heading,
    winnerName,
    scoreHeading,
    scoreboard,
    actions
  );

  openModal();
  launchConfetti(150);
}


// ============================================================
// 15. INTERFACE RENDERING
// ============================================================

function renderTurnInfo() {
  $('turn-label').textContent = finished
    ? 'Game over'
    : `${players[active].name}'s turn`;

  $('roll-label').textContent = finished
    ? 'Final scores'
    : `Roll ${rolls} / 3`;
}


function renderDice() {
  const container = $("dice");

  container.replaceChildren();

  // Create the five dice.
  dice.forEach((value, index) => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "die";

    if (held[index]) {
      button.classList.add("held");
    }

    if (isRolling && !held[index]) {
      button.classList.add("rolling-die");
    }

    button.innerHTML = `
      <span class="die-face">
        ${rolls ? DICE_FACES[value] : "?"}
      </span>

      <span class="die-status ${
        held[index] ? "visible" : ""
      }">
        ${held[index] ? "HELD" : ""}
      </span>
    `;

    button.disabled =
      rolls === 0 ||
      rolls === 3 ||
      finished ||
      isRolling;

    button.setAttribute(
      "aria-label",
      `Die ${index + 1}: ${
        rolls ? value : "not rolled"
      }${held[index] ? ", held" : ""}`,
    );

    button.setAttribute(
      "aria-pressed",
      String(held[index]),
    );

    button.onclick = () => toggleHold(index);

    container.append(button);
  });

  // ==========================================================
  // RELEASE ALL BUTTON
  // ==========================================================

  const releaseButton = document.createElement("button");

  releaseButton.id = "release-all";
  releaseButton.type = "button";
  releaseButton.className = "release-all-btn";

  releaseButton.innerHTML = `
    <span aria-hidden="true">🔓</span>
    <span>Release All</span>
  `;

  releaseButton.setAttribute(
    "aria-label",
    "Release all held dice",
  );

  // Enable only when there is at least one held die.
  const anyHeld = held.some((value) => value);

  releaseButton.disabled =
    !anyHeld ||
    finished ||
    rolls === 0 ||
    rolls >= 3 ||
    isRolling;

  releaseButton.onclick = releaseAllDice;

  // This places it immediately after the fifth die.
  container.append(releaseButton);
}


function renderControls() {
  const button = $('roll');

  button.disabled =
    finished || rolls >= 3 || isRolling;

  button.textContent = isRolling
    ? 'Rolling...'
    : rolls === 0
      ? 'Roll dice'
      : `Roll again (${3 - rolls} left)`;

  $('hint').textContent = finished
    ? 'All 13 rounds completed.'
    : isRolling
      ? '🎲 Rolling the dice...'
      : rolls === 0
        ? 'Roll to begin your turn.'
        : rolls === 3
          ? 'Choose a scoring category below.'
          : 'Click dice to hold them, roll again, ' +
            'or choose a score now.';

  $('undo-score').disabled =
    !undoSnapshot || isRolling;

  $('rematch').disabled = isRolling;
}

function bestAvailableScores() {
  if (
    !settings.showBest ||
    finished ||
    rolls === 0 ||
    isRolling
  ) return {};

  const player = players[active];
  const values = {};

  CATEGORIES.forEach(([key]) => {
    if (player.scores[key] !== undefined) return;

    const points = availableScore(player, key);

    if (points !== null) {
      values[key] = points;
    }
  });

  const scores = Object.values(values);
  if (!scores.length) return {};

  const maximum = Math.max(...scores);
  const best = {};

  Object.entries(values).forEach(([key, points]) => {
    best[key] = points === maximum;
  });

  return best;
}

function renderScoreHeader(head) {
  const row = document.createElement('tr');

  ['Category', ...players.map(p => p.name)]
    .forEach((name, index) => {
      const th = document.createElement('th');
      th.textContent = name;

      if (index === active + 1 && !finished) {
        th.classList.add('active', 'active-col');
        th.setAttribute('aria-current', 'true');
      }

      row.append(th);
    });

  head.append(row);
}

function addRow(body, label, values, options = {}) {
  const row = document.createElement('tr');

  if (options.summary) row.classList.add('summary');
  if (options.grandTotal) row.classList.add('grand-total');
  if (options.sectionStart) row.classList.add('section-start');

  const labelCell = document.createElement('td');
  labelCell.textContent = label;
  labelCell.className = 'category-cell';

  row.append(labelCell);

  values.forEach((value, index) => {
    const cell = document.createElement('td');

    if (index === active && !finished) {
      cell.classList.add('active-col');
    }

    if (value instanceof Node) {
      cell.append(value);
    } else {
      cell.textContent = String(value);
    }

    row.append(cell);
  });

  body.append(row);
}

function renderCategory(body, key, label, bestMap) {
  const cells = players.map((player, index) => {
    if (player.scores[key] !== undefined) {
      return player.scores[key];
    }

    if (
      index !== active ||
      rolls === 0 ||
      finished
    ) return '—';

    const points = availableScore(player, key);
    if (points === null) return '—';

    const button = document.createElement('button');

    button.className = 'score-btn';
    button.textContent = `Score ${points}`;
    button.disabled = isRolling;

    button.title =
      `Record ${points} points for ${label}`;

    if (bestMap[key]) {
      button.classList.add('best-option');
    }

    button.onclick = () => commit(key);

    return button;
  });

  addRow(body, categoryLabel(key, label), cells);
}

function renderUpperSection(body, bestMap) {
  CATEGORIES.slice(0, 6).forEach(([key, label]) =>
    renderCategory(body, key, label, bestMap)
  );

  // Immediately below Sixes.
  addRow(
    body,
    '🧮 Upper subtotal',
    players.map(p => `${upperTotal(p)} / 63`),
    { summary: true, sectionStart: true }
  );

  addRow(
    body,
    '⭐ Upper bonus (63 → +35)',
    players.map(bonus),
    { summary: true }
  );
}

function renderLowerSection(body, bestMap) {
  const heading = document.createElement('tr');
  heading.className = 'section-heading';

  const cell = document.createElement('th');
  cell.colSpan = players.length + 1;
  cell.scope = 'rowgroup';
  cell.textContent = 'LOWER SECTION';

  heading.append(cell);
  body.append(heading);

  CATEGORIES.slice(6).forEach(([key, label]) =>
    renderCategory(body, key, label, bestMap)
  );
}

function renderFinalTotals(body) {
  addRow(
    body,
    '👑 Extra Yahtzee bonuses',
    players.map(p => p.yahtzeeBonus),
    { summary: true, sectionStart: true }
  );

  addRow(
    body,
    '🏆 GRAND TOTAL',
    players.map(total),
    { grandTotal: true }
  );
}

function renderScoreTable() {
  if (!players.length) return;

  const table = $('score-table');
  const head = table.querySelector('thead');
  const body = table.querySelector('tbody');

  head.replaceChildren();
  body.replaceChildren();

  const bestMap = bestAvailableScores();

  renderScoreHeader(head);
  renderUpperSection(body, bestMap);
  renderLowerSection(body, bestMap);
  renderFinalTotals(body);
}

function renderStatus() {
  if (!finished) {
    $('status').textContent = '';
    return;
  }

  const best = Math.max(...players.map(total));
  const winners = players.filter(
    p => total(p) === best
  );

  $('status').textContent =
    winners.length === 1
      ? `🏆 ${winners[0].name} wins with ${best} points!`
      : `🏆 Tie: ${winners.map(p => p.name).join(' & ')} ` +
        `(${best} points)`;
}

function render() {
  if (!players.length) return;

  renderTurnInfo();
  renderDice();
  renderControls();
  renderScoreTable();
  renderStatus();
}


// ============================================================
// 16. CREATE EXTRA UI ELEMENTS
// ============================================================

function createExtraControls() {
  // Existing game buttons.
  
  const actions = document.querySelector("#game .actions");


  // Undo.
  const undoButton = document.createElement('button');
  undoButton.id = 'undo-score';
  undoButton.className = 'secondary';
  undoButton.textContent = '↶ Undo last score';
  undoButton.onclick = undoLastScore;

  // Rematch.
  const rematchButton = document.createElement('button');
  rematchButton.id = 'rematch';
  rematchButton.className = 'secondary';
  rematchButton.textContent = '🔄 Rematch';
  rematchButton.onclick = rematch;

  actions.append(undoButton, rematchButton);

  // Settings button in the header.
  const settingsButton = document.createElement('button');

  settingsButton.id = 'settings-button';
  settingsButton.className = 'secondary';
  settingsButton.textContent = '⚙️ Settings';
  settingsButton.onclick = showSettings;

  const header = document.querySelector('header');

  if (header) {
    header.append(settingsButton);
  }

  // Turn banner.
  const turnbar = document.querySelector('.turnbar');

  const banner = document.createElement('div');

  banner.id = 'turn-banner';
  banner.className = 'turn-banner';
  banner.hidden = true;
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');

  turnbar.insertAdjacentElement('afterend', banner);

  // Confetti layer.
  const confettiLayer = document.createElement('div');

  confettiLayer.id = 'celebration-layer';
  confettiLayer.setAttribute('aria-hidden', 'true');

  document.body.append(confettiLayer);

  // Modal.
  createModal();
}


// ============================================================
// 17. INITIALIZATION
// ============================================================

loadSettings();
createExtraControls();

$('player-count').addEventListener(
  'change', showNames
);

$('start').addEventListener(
  'click', startGame
);

$('roll').addEventListener(
  'click', rollDice
);

$('new-game').addEventListener(
  'click', newGame
);

showNames();

if (loadGame()) {
  console.log('Saved Yahtzee game restored.');

  if (finished) {
    showWinnerPopup();
  }
} else {
  console.log('Ready for a new game.');
}
