
"use strict";

// ============================================================
// YAHTZEE LOCAL V1.6 - FINAL RELEASE UI
// Home screen, themes, sounds, and JSON statistics import.
// Load AFTER game.js, stats.js, and stats-plus.js.
// ============================================================

(() => {
  const $ = (id) => document.getElementById(id);
  const OPTIONS_KEY = "yahtzee-local-v1.6-options";
  const STATS_KEY = "yahtzee-local-stats-v1.5a";
  const GAME_KEY = "yahtzee-local-v1.4";
  const THEMES = ["midnight", "casino", "arcade"];
  const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

  const options = { theme: "midnight", sound: true };
  let audioContext = null;

  // ------------------------------------------------------------
  // 1. SAVE AND APPLY OPTIONS
  // ------------------------------------------------------------

  function readOptions() {
    try {
      const saved = JSON.parse(localStorage.getItem(OPTIONS_KEY) || "{}");

      if (THEMES.includes(saved.theme)) options.theme = saved.theme;
      if (typeof saved.sound === "boolean") options.sound = saved.sound;
    } catch (error) {
      console.warn("V1.6 options could not be loaded:", error);
    }
  }

  function saveOptions() {
    try {
      localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
    } catch (error) {
      console.warn("V1.6 options could not be saved:", error);
    }
  }

  function applyTheme() {
    document.body.classList.remove(
      ...THEMES.map((name) => `theme-${name}`),
    );

    document.body.classList.add(`theme-${options.theme}`);
  }

  function setTheme(theme) {
    if (!THEMES.includes(theme)) return;

    options.theme = theme;
    saveOptions();
    applyTheme();

    document.querySelectorAll("[data-v16-theme]").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.v16Theme === theme),
      );
    });
  }

  // ------------------------------------------------------------
  // 2. SOUND EFFECTS USING WEB AUDIO
  // ------------------------------------------------------------

  
    function getAudioContext() {
        const AudioContextType =
            window.AudioContext || window.webkitAudioContext;

        if (!AudioContextType) {
            console.warn("Web Audio API not supported.");
            return null;
        }

        if (!audioContext) {
            audioContext = new AudioContextType();
        }

        // Browsers may suspend audio until a user clicks.
        if (audioContext.state === "suspended") {
            audioContext.resume().catch((error) => {
            console.warn("Audio could not start:", error);
            });
        }

        return audioContext;
        }


  function note(
    context,
    frequency,
    start,
    duration,
    volume = 0.025,
    shape = "sine",
  ) {
    const osc = context.createOscillator();
    const gain = context.createGain();

    osc.type = shape;
    osc.frequency.setValueAtTime(frequency, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(context.destination);

    osc.start(start);
    osc.stop(start + duration + 0.01);
  }

  
// ============================================================
// REALISTIC DICE ROLLING SOUND - V1.6.2
// ============================================================

function playDiceRattle(context, startTime) {
  const duration = 0.9;
  const sampleRate = context.sampleRate;

  // Create a noise buffer to simulate rattling dice.
  const buffer = context.createBuffer(
    1,
    Math.ceil(sampleRate * duration),
    sampleRate,
  );

  const data = buffer.getChannelData(0);

  // Generate random noise.
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  // Audio source.
  const source = context.createBufferSource();
  source.buffer = buffer;

  // Filter noise to make it sound less harsh.
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1100;
  filter.Q.value = 0.75;

  // Volume control.
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);

  // Simulate dice hitting the table repeatedly.
  const impacts = [
    0.00,
    0.08,
    0.17,
    0.27,
    0.38,
    0.50,
    0.63,
    0.75,
  ];

  impacts.forEach((offset, index) => {
    const time = startTime + offset;

    // Each impact gets softer as the dice settle.
    const strength =
      0.19 * (1 - index / impacts.length) + 0.025;

    gain.gain.setValueAtTime(0.0001, time);

    gain.gain.linearRampToValueAtTime(
      strength,
      time + 0.008,
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      time + 0.055,
    );
  });

  // Connect the audio nodes.
  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);

  // Play and stop.
  source.start(startTime);
  source.stop(startTime + duration);
}



// ============================================================
// WINNER APPLAUSE SOUND - V1.6.3
// ============================================================

function playApplause(context, startTime) {
  const duration = 2.8;
  const sampleRate = context.sampleRate;

  // Create a short noise sample for individual claps.
  const buffer = context.createBuffer(
    1,
    Math.ceil(sampleRate * 0.13),
    sampleRate,
  );

  const data = buffer.getChannelData(0);

  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  // Multiple overlapping claps simulate a crowd.
  const numberOfClaps = 75;

  for (let i = 0; i < numberOfClaps; i++) {
    const offset = Math.random() * duration;
    const time = startTime + offset;

    const source = context.createBufferSource();
    source.buffer = buffer;

    // Different frequencies simulate different claps.
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1000 + Math.random() * 1400;
    filter.Q.value = 0.7;

    const gain = context.createGain();

    const volume = 0.012 + Math.random() * 0.018;

    // A clap consists of several rapid noise bursts.
    [0, 0.03, 0.065].forEach((delay) => {
      const hitTime = time + delay;

      gain.gain.setValueAtTime(0.0001, hitTime);

      gain.gain.linearRampToValueAtTime(
        volume,
        hitTime + 0.004,
      );

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        hitTime + 0.025,
      );
    });

    source.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);

    source.start(time);
    source.stop(time + 0.13);
  }
}



  function play(type) {
    if (!options.sound) return;

    try {
      const context = getAudioContext();
      if (!context) return;

      const now = context.currentTime + 0.01;

      
        if (type === "roll") {
            playDiceRattle(context, now);


      } else if (type === "hold") {
        note(context, 520, now, 0.075, 0.018, "triangle");
      } else if (type === "score") {
        note(context, 540, now, 0.12, 0.023);
        note(context, 720, now + 0.09, 0.19, 0.019);
      } else if (type === "yahtzee") {
        [523, 659, 784, 1047].forEach((freq, i) => {
          note(context, freq, now + i * 0.15, 0.28, 0.035);
        });
      } else if (type === "win") {
            playApplause(context, now);
      }

    } catch (error) {
      console.warn("Audio unavailable:", error);
    }
  }

  // Play roll and hold sounds directly from clicks.
  document.addEventListener(
    "click",
    (event) => {
      const rollButton = event.target.closest("#roll");

      if (rollButton && !rollButton.disabled) {
        play("roll");
      }

      const dieButton = event.target.closest("#dice .die");

      if (dieButton && !dieButton.disabled) {
        play("hold");
      }
    },
    true,
  );

  // ------------------------------------------------------------
  // 3. HOME SCREEN
  // ------------------------------------------------------------

  function createHomeScreen() {
    const home = document.createElement("section");

    home.id = "home-screen";
    home.hidden = true;
    home.setAttribute("aria-label", "Yahtzee home screen");

    home.innerHTML = `
      <div class="home-shell">
        <p class="home-eyebrow">
          PASS & PLAY · 2–3 PLAYERS · OFFLINE
        </p>

        <h1>🎲 ROLL <span>FIVE</span></h1>

        <p class="home-tagline">
          Roll the dice. Chase the bonus. Become the champion.
        </p>

        <div class="home-actions">
          <button id="home-play" type="button">
            ▶ Play
          </button>

          <button
            id="home-new"
            type="button"
            class="secondary"
          >
            ＋ New match
          </button>
        </div>

        <div class="home-menu">
          <button
            id="home-statistics"
            type="button"
            class="secondary"
          >
            🏆 Statistics
          </button>

          <button
            id="home-rivalries"
            type="button"
            class="secondary"
          >
            ⚔️ Rivalries & achievements
          </button>

          <button
            id="home-settings"
            type="button"
            class="secondary"
          >
            ⚙️ Settings
          </button>

          <button
            id="home-import"
            type="button"
            class="secondary"
          >
            📂 Import statistics
          </button>
        </div>

        <input
          id="home-import-file"
          type="file"
          accept=".json,application/json"
          hidden
        />

        <p
          id="home-notice"
          class="home-notice"
          role="status"
        ></p>

        <p class="home-footnote">
          Your progress is saved in this browser.
          No account required.
        </p>
      </div>
    `;

    document.body.insertBefore(
      home,
      document.querySelector(".app"),
    );

    // Add a Home button to the existing game header.
    const homeButton = document.createElement("button");

    homeButton.id = "home-button";
    homeButton.type = "button";
    homeButton.className = "secondary";
    homeButton.textContent = "⌂ Home";

    document.querySelector("header").append(homeButton);

    homeButton.addEventListener("click", showHome);

    $("home-play").addEventListener("click", () => {
      showApp();

      if (typeof finished !== "undefined" && finished) {
        showWinnerPopup();
      }
    });

    $("home-new").addEventListener("click", openNewMatch);

    $("home-statistics").addEventListener("click", () => {
      window.YahtzeeStats?.openStatistics();
    });

    $("home-rivalries").addEventListener("click", () => {
      $("rivalries-button")?.click();
    });

    $("home-settings").addEventListener(
      "click",
      showEnhancedSettings,
    );

    $("home-import").addEventListener("click", () => {
      $("home-import-file").click();
    });

    $("home-import-file").addEventListener(
      "change",
      importStatistics,
    );
  }

  function showHome() {
    if (typeof modalOpen !== "undefined" && modalOpen) {
      closeModal();
    }

    if (typeof clearCelebration === "function") {
      clearCelebration();
    }

    $("home-screen").hidden = false;
    document.querySelector(".app").hidden = true;

    const hasGame =
      typeof players !== "undefined" && players.length > 0;

    $("home-play").textContent = !hasGame
      ? "▶ Play Yahtzee"
      : finished
        ? "🏆 View last results"
        : "▶ Resume match";

    $("home-notice").textContent = "";
  }

  function showApp() {
    $("home-screen").hidden = true;
    document.querySelector(".app").hidden = false;
  }

  function openNewMatch() {
    if (typeof isRolling !== "undefined" && isRolling) {
      $("home-notice").textContent =
        "Finish the dice animation before starting a new match.";
      return;
    }

    const start = () => {
      performNewGame();
      showApp();
    };

    if (typeof players !== "undefined" && players.length) {
      confirmAction({
        icon: "🎲",
        title: "Start a new match?",
        message:
          "This clears the current game, but keeps your " +
          "saved player profiles and match history.",
        confirmText: "New match",
        danger: true,
        onConfirm: start,
      });
    } else {
      start();
    }
  }

  // ------------------------------------------------------------
  // 4. EXTEND THE EXISTING SETTINGS POPUP
  // ------------------------------------------------------------

  function showEnhancedSettings() {
    showSettings();

    const content = $("modal-content");
    const actions = content.querySelector(".modal-actions");

    const group = document.createElement("div");
    group.className = "v16-settings";

    group.innerHTML = `
      <label class="setting-row">
        <span>
          <strong>Game sounds</strong>
          <small>Dice, scores and celebrations</small>
        </span>
        <input id="v16-sound" type="checkbox" />
      </label>

      <div class="v16-theme-setting">
        <strong>Color theme</strong>

        <div
          class="v16-theme-picker"
          role="group"
          aria-label="Choose color theme"
        >
          <button
            type="button"
            data-v16-theme="midnight"
          >
            🌙 Midnight
          </button>

          <button
            type="button"
            data-v16-theme="casino"
          >
            ♠ Casino
          </button>

          <button
            type="button"
            data-v16-theme="arcade"
          >
            🌈 Arcade
          </button>
        </div>
      </div>
    `;

    if (actions) {
      content.insertBefore(group, actions);
    } else {
      content.append(group);
    }

    $("v16-sound").checked = options.sound;

    $("v16-sound").addEventListener("change", (event) => {
      options.sound = event.target.checked;
      saveOptions();

      if (options.sound) {
        play("score");
      }
    });

    group.querySelectorAll("[data-v16-theme]").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.v16Theme === options.theme),
      );

      button.addEventListener("click", () => {
        setTheme(button.dataset.v16Theme);
      });
    });
  }

  // ------------------------------------------------------------
  // 5. VALIDATE STATISTICS IMPORT
  // ------------------------------------------------------------

  function validateImport(data) {
    if (
      !data ||
      data.version !== 1 ||
      !Array.isArray(data.profiles) ||
      !Array.isArray(data.matches)
    ) {
      throw new Error(
        "This is not a compatible Yahtzee statistics backup.",
      );
    }

    if (data.profiles.length > 500 || data.matches.length > 5000) {
      throw new Error(
        "The backup contains too many profiles or matches.",
      );
    }

    const profileIds = new Set();
    const normalizedNames = new Set();

    for (const profile of data.profiles) {
      if (
        !profile ||
        typeof profile.id !== "string" ||
        !profile.id.trim() ||
        typeof profile.name !== "string" ||
        !profile.name.trim() ||
        profile.name.length > 80
      ) {
        throw new Error(
          "A player profile is incomplete or invalid.",
        );
      }

      const nameKey = profile.name
        .trim()
        .replace(/\s+/g, " ")
        .toLocaleLowerCase();

      if (
        profileIds.has(profile.id) ||
        normalizedNames.has(nameKey)
      ) {
        throw new Error(
          "The backup contains duplicate profile IDs or names.",
        );
      }

      profileIds.add(profile.id);
      normalizedNames.add(nameKey);
    }

    const matchIds = new Set();

    for (const match of data.matches) {
      if (
        !match ||
        typeof match.id !== "string" ||
        !match.id.trim() ||
        matchIds.has(match.id) ||
        typeof match.completedAt !== "string" ||
        !Number.isFinite(Date.parse(match.completedAt)) ||
        !Array.isArray(match.results) ||
        match.results.length < 2 ||
        match.results.length > 3 ||
        !Array.isArray(match.winnerIds) ||
        !match.winnerIds.length
      ) {
        throw new Error(
          "A match record is incomplete or invalid.",
        );
      }

      matchIds.add(match.id);

      const participants = new Set();

      for (const result of match.results) {
        if (
          !result ||
          !profileIds.has(result.profileId) ||
          participants.has(result.profileId) ||
          typeof result.name !== "string" ||
          !Number.isSafeInteger(result.score) ||
          result.score < 0 ||
          !Number.isSafeInteger(result.yahtzees) ||
          result.yahtzees < 0
        ) {
          throw new Error(
            "A match contains an invalid score or player.",
          );
        }

        participants.add(result.profileId);
      }

      const topScore = Math.max(
        ...match.results.map((result) => result.score),
      );

      const expectedWinners = match.results
        .filter((result) => result.score === topScore)
        .map((result) => result.profileId);

      if (
        match.highestScore !== topScore ||
        match.winnerIds.length !== expectedWinners.length ||
        !match.winnerIds.every((id) => expectedWinners.includes(id))
      ) {
        throw new Error(
          "A match has inconsistent winner information.",
        );
      }
    }

    return {
      version: 1,
      profiles: data.profiles,
      matches: data.matches,
    };
  }

  // ------------------------------------------------------------
  // 6. IMPORT AND RESTORE SAVED STATISTICS
  // ------------------------------------------------------------

  async function importStatistics(event) {
    const file = event.target.files?.[0];

    // Allows selecting the same file again.
    event.target.value = "";

    if (!file) return;

    const notice = $("home-notice");

    if (file.size > MAX_IMPORT_BYTES) {
      notice.textContent =
        "File is too large. Choose a JSON backup under 2 MB.";
      return;
    }

    let incoming;

    try {
      incoming = validateImport(
        JSON.parse(await file.text()),
      );
    } catch (error) {
      notice.textContent = `Import rejected: ${error.message}`;
      return;
    }

    confirmAction({
      icon: "📂",
      title: "Restore statistics backup?",
      message:
        `Import ${incoming.profiles.length} profiles and ` +
        `${incoming.matches.length} matches? ` +
        "This REPLACES existing profiles and match history, " +
        "and clears the current game. " +
        "Export your existing statistics first if you need a backup.",
      confirmText: "Replace statistics",
      danger: true,

      onConfirm: () => {
        try {
          localStorage.setItem(
            STATS_KEY,
            JSON.stringify(incoming),
          );

          localStorage.removeItem(GAME_KEY);

          // stats.js caches its database in memory.
          // Reloading synchronizes every dashboard.
          window.location.reload();
        } catch (error) {
          notice.textContent = `Import failed: ${error.message}`;
        }
      },
    });
  }


  // ============================================================
  // 7. ORGANIZE HEADER NAVIGATION
  // ============================================================

  function organizeGameHeader() {
    const nav = document.querySelector(".header-actions");

    if (!nav) return;

    const buttonIds = [
      "new-game",
      "statistics-button",
      "rivalries-button",
      "settings-button",
      "home-button",
    ];

    buttonIds.forEach((id) => {
      const button = $(id);

      if (button) {
        nav.append(button);
      }
    });
  }



  // ------------------------------------------------------------
  // 8. INITIALIZATION
  // ------------------------------------------------------------

  readOptions();
  applyTheme();
  createHomeScreen();
  organizeGameHeader();

  const settingsButton = $("settings-button");

  if (settingsButton) {
    settingsButton.onclick = showEnhancedSettings;
  }

  // Small public interface for game.js sound hooks.
  window.YahtzeeV16 = {
    play,
    showHome,
  };

  showHome();
})();
