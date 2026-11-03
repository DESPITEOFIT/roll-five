
"use strict";

// ============================================================
// YAHTZEE V1.5A.1 - PROFILE MANAGEMENT
// ============================================================

(() => {
  const STORAGE_KEY = "yahtzee-local-stats-v1.5a";
  const $ = (id) => document.getElementById(id);

  let database = {
    version: 1,
    profiles: [],
    matches: [],
  };

  // ==========================================================
  // 1. GENERAL HELPERS
  // ==========================================================

  function makeId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }

    return (
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2)
    );
  }

  function normalizeName(name) {
    return String(name)
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase();
  }

  function cleanName(name) {
    return String(name).trim().replace(/\s+/g, " ");
  }

  function element(tag, className = "", text = null) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== null) node.textContent = String(text);

    return node;
  }

  function saveDatabase() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(database),
      );
    } catch (error) {
      console.warn("Could not save statistics:", error);
    }
  }

  function findProfileByName(name) {
    const normalized = normalizeName(name);

    return database.profiles.find(
      (profile) => normalizeName(profile.name) === normalized,
    );
  }

  function getProfile(id) {
    return database.profiles.find(
      (profile) => profile.id === id,
    );
  }

  function getOrCreateProfile(name) {
    const cleaned = cleanName(name);
    const existing = findProfileByName(cleaned);

    if (existing) return existing;

    const profile = {
      id: makeId(),
      name: cleaned || "Player",
      createdAt: new Date().toISOString(),
    };

    database.profiles.push(profile);
    saveDatabase();

    return profile;
  }

  function getProfiles() {
    return [...database.profiles].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  // ==========================================================
  // 2. MERGE EXISTING DUPLICATE PROFILES
  // ==========================================================

  function mergeDuplicateProfiles() {
    const seen = new Map();
    const replacements = new Map();
    const uniqueProfiles = [];

    for (const profile of database.profiles) {
      const key = normalizeName(profile.name);

      if (!key) continue;

      if (seen.has(key)) {
        const survivor = seen.get(key);
        replacements.set(profile.id, survivor.id);
      } else {
        seen.set(key, profile);
        uniqueProfiles.push(profile);
      }
    }

    if (replacements.size === 0) return;

    // Redirect old profile IDs in match history.
    for (const match of database.matches) {
      for (const result of match.results) {
        const replacement = replacements.get(
          result.profileId,
        );

        if (replacement) {
          result.profileId = replacement;

          const survivor = uniqueProfiles.find(
            (profile) => profile.id === replacement,
          );

          if (survivor) result.name = survivor.name;
        }
      }

      match.winnerIds = [
        ...new Set(
          match.winnerIds.map(
            (id) => replacements.get(id) || id,
          ),
        ),
      ];
    }

    database.profiles = uniqueProfiles;
    saveDatabase();

    // Update IDs in the current saved game too.
    const updatePlayers = (list) => {
      if (!Array.isArray(list)) return;

      for (const player of list) {
        if (replacements.has(player.profileId)) {
          player.profileId = replacements.get(
            player.profileId,
          );
        }
      }
    };

    try {
      if (typeof players !== "undefined") {
        updatePlayers(players);
      }

      if (
        typeof undoSnapshot !== "undefined" &&
        undoSnapshot
      ) {
        updatePlayers(undoSnapshot.players);
      }

      if (
        typeof players !== "undefined" &&
        players.length &&
        typeof saveGame === "function"
      ) {
        saveGame();
      }
    } catch (error) {
      console.warn("Could not update current game:", error);
    }
  }

  function loadDatabase() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) return;

      const saved = JSON.parse(raw);

      if (
        saved?.version === 1 &&
        Array.isArray(saved.profiles) &&
        Array.isArray(saved.matches)
      ) {
        database = saved;
        mergeDuplicateProfiles();
      }
    } catch (error) {
      console.warn("Could not load statistics:", error);
    }
  }

  // ==========================================================
  // 3. PROFILE SELECTION
  // ==========================================================

  function showSetupError(message) {
    let error = $("profile-error");

    if (!error) {
      error = element("p", "profile-error");
      error.id = "profile-error";

      $("name-fields").insertAdjacentElement(
        "afterend",
        error,
      );
    }

    error.textContent = message;
  }

  function clearSetupError() {
    const error = $("profile-error");
    if (error) error.textContent = "";
  }

  function decorateSetup() {
    // Remove old selectors, including their delete buttons.
    document
      .querySelectorAll(".profile-picker")
      .forEach((picker) => picker.remove());

    const inputs = [
      ...document.querySelectorAll(".name-input"),
    ];

    inputs.forEach((input, index) => {
      input.readOnly = false;

      const wrapper = element("div", "profile-picker");

      const label = element(
        "label",
        "",
        "Player profile",
      );

      const selectId = `profile-select-${index}`;
      label.htmlFor = selectId;

      const controls = element(
        "div",
        "profile-picker-controls",
      );

      const select = element(
        "select",
        "profile-select",
      );

      select.id = selectId;

      const newOption = element(
        "option",
        "",
        "➕ Create new profile",
      );

      newOption.value = "";
      select.append(newOption);

      for (const profile of getProfiles()) {
        const option = element(
          "option",
          "",
          profile.name,
        );

        option.value = profile.id;
        select.append(option);
      }

      const deleteButton = element(
        "button",
        "profile-delete-button",
        "🗑️",
      );

      deleteButton.type = "button";
      deleteButton.title = "Delete selected profile";
      deleteButton.setAttribute(
        "aria-label",
        "Delete selected profile",
      );

      deleteButton.disabled = true;

      select.addEventListener("change", () => {
        clearSetupError();

        const profile = getProfile(select.value);

        if (profile) {
          input.value = profile.name;
          input.readOnly = true;
          deleteButton.disabled = false;
        } else {
          input.readOnly = false;
          input.value = `Player ${index + 1}`;
          deleteButton.disabled = true;
        }
      });

      deleteButton.addEventListener("click", () => {
        if (!select.value) return;

        requestProfileDeletion(select.value, false);
      });

      controls.append(select, deleteButton);
      wrapper.append(label, controls);

      input.insertAdjacentElement(
        "afterend",
        wrapper,
      );
    });

    clearSetupError();
  }

  // ==========================================================
  // 4. START GAME / REMATCH
  // ==========================================================

  function startMatch(gamePlayers) {
    clearSetupError();

    const selectors = [
      ...document.querySelectorAll(".profile-select"),
    ];

    const resolved = gamePlayers.map((player, index) => {
      const selected = selectors[index]?.value;

      return getProfile(selected) || findProfileByName(
        player.name,
      );
    });

    const names = gamePlayers.map((player, index) =>
      normalizeName(
        resolved[index]?.name || player.name,
      ),
    );

    // Two seats cannot share one player identity.
    if (new Set(names).size !== names.length) {
      showSetupError(
        "Each player must have a different profile. " +
        "Please choose different names.",
      );

      return false;
    }

    const matchId = makeId();

    gamePlayers.forEach((player, index) => {
      const profile =
        resolved[index] ||
        getOrCreateProfile(player.name);

      player.profileId = profile.id;
      player.name = profile.name;
      player.matchId = matchId;
      player.yahtzeesRolled = 0;
    });

    saveDatabase();
    return true;
  }

  function startRematch(gamePlayers) {
    const matchId = makeId();

    gamePlayers.forEach((player) => {
      const profile =
        getProfile(player.profileId) ||
        getOrCreateProfile(player.name);

      player.profileId = profile.id;
      player.name = profile.name;
      player.matchId = matchId;
      player.yahtzeesRolled = 0;
    });

    saveDatabase();
  }

  function prepareRecoveredGame(gamePlayers) {
    if (!gamePlayers.length) return;

    const matchId =
      gamePlayers[0].matchId || makeId();

    gamePlayers.forEach((player) => {
      const profile =
        getProfile(player.profileId) ||
        getOrCreateProfile(player.name);

      player.profileId = profile.id;
      player.name = profile.name;
      player.matchId = matchId;

      if (!Number.isInteger(player.yahtzeesRolled)) {
        player.yahtzeesRolled = 0;
      }
    });

    saveDatabase();

    if (typeof saveGame === "function") {
      saveGame();
    }
  }

  function trackYahtzee(player) {
    player.yahtzeesRolled =
      (player.yahtzeesRolled || 0) + 1;
  }

  // ==========================================================
  // 5. MATCH HISTORY
  // ==========================================================

  function calculatePlayerTotal(player) {
    const categoryTotal = Object.values(
      player.scores,
    ).reduce((sum, value) => sum + value, 0);

    const upperKeys = [
      "ones",
      "twos",
      "threes",
      "fours",
      "fives",
      "sixes",
    ];

    const upper = upperKeys.reduce(
      (sum, key) => sum + (player.scores[key] ?? 0),
      0,
    );

    return (
      categoryTotal +
      (upper >= 63 ? 35 : 0) +
      player.yahtzeeBonus
    );
  }

  function finishMatch(gamePlayers) {
    if (!gamePlayers.length) return;

    const matchId = gamePlayers[0].matchId;
    if (!matchId) return;

    if (
      database.matches.some(
        (match) => match.id === matchId,
      )
    ) {
      return;
    }

    const results = gamePlayers.map((player) => ({
      profileId: player.profileId,
      name: player.name,
      score: calculatePlayerTotal(player),
      yahtzees: player.yahtzeesRolled || 0,
    }));

    const highestScore = Math.max(
      ...results.map((result) => result.score),
    );

    const winnerIds = results
      .filter(
        (result) => result.score === highestScore,
      )
      .map((result) => result.profileId);

    database.matches.push({
      id: matchId,
      completedAt: new Date().toISOString(),
      results,
      winnerIds,
      highestScore,
    });

    saveDatabase();
  }

  function unfinishMatch(matchId) {
    if (!matchId) return;

    database.matches = database.matches.filter(
      (match) => match.id !== matchId,
    );

    saveDatabase();
  }

  // ==========================================================
  // 6. DELETE PROFILE
  // ==========================================================

  function requestProfileDeletion(profileId, fromStats) {
    const profile = getProfile(profileId);
    if (!profile) return;

    // Don't delete a player from an unfinished game.
    const isInCurrentGame =
      typeof players !== "undefined" &&
      players.length > 0 &&
      !finished &&
      players.some(
        (player) => player.profileId === profileId,
      );

    if (isInCurrentGame) {
      confirmAction({
        icon: "🔒",
        title: "Profile in use",
        message:
          `${profile.name} is playing in the current game. ` +
          "Finish the game or start a new game before " +
          "deleting this profile.",
        confirmText: "OK",
        onConfirm: () => {
          if (fromStats) {
            openStatistics();
          }
        },
      });

      return;
    }

    const affectedMatches = database.matches.filter(
      (match) =>
        match.results.some(
          (result) => result.profileId === profileId,
        ),
    ).length;

    confirmAction({
      icon: "🗑️",
      title: `Delete ${profile.name}?`,
      message:
        "This permanently removes the profile and " +
        `${affectedMatches} associated match record(s). ` +
        "Statistics of other players in those matches " +
        "will also change. This cannot be undone.",
      confirmText: "Delete profile",
      danger: true,

      onConfirm: () => {
        deleteProfile(profileId);

        if (fromStats) {
          openStatistics();
        }
      },
    });
  }

  function deleteProfile(profileId) {
    const exists = getProfile(profileId);
    if (!exists) return;

    database.profiles = database.profiles.filter(
      (profile) => profile.id !== profileId,
    );

    // Delete matches involving this player.
    database.matches = database.matches.filter(
      (match) =>
        !match.results.some(
          (result) => result.profileId === profileId,
        ),
    );

    saveDatabase();

    // Refresh setup dropdowns.
    decorateSetup();
  }

  // ==========================================================
  // 7. PLAYER STATISTICS
  // ==========================================================

  function calculateStats() {
    const standings = database.profiles.map(
      (profile) => {
        const matches = database.matches.filter(
          (match) =>
            match.results.some(
              (result) =>
                result.profileId === profile.id,
            ),
        );

        const results = matches.map((match) =>
          match.results.find(
            (result) =>
              result.profileId === profile.id,
          ),
        );

        const games = results.length;

        const wins = matches.filter(
          (match) =>
            match.winnerIds.includes(profile.id),
        ).length;

        const totalPoints = results.reduce(
          (sum, result) => sum + result.score,
          0,
        );

        const yahtzees = results.reduce(
          (sum, result) =>
            sum + (result.yahtzees || 0),
          0,
        );

        return {
          ...profile,
          games,
          wins,
          winRate: games
            ? (wins / games) * 100
            : 0,
          totalPoints,
          average: games
            ? totalPoints / games
            : 0,
          bestScore: games
            ? Math.max(
                ...results.map((result) =>
                  result.score,
                ),
              )
            : 0,
          yahtzees,
        };
      },
    );

    standings.sort(
      (a, b) =>
        b.wins - a.wins ||
        b.winRate - a.winRate ||
        b.average - a.average ||
        a.name.localeCompare(b.name),
    );

    return standings;
  }

  // ==========================================================
  // 8. STATISTICS UI
  // ==========================================================

  function makeStat(label, value) {
    const box = element("div", "stats-metric");

    box.append(
      element("small", "", label),
      element("strong", "", value),
    );

    return box;
  }

  function createHeading(title, subtitle) {
    const box = element("div", "stats-heading");

    box.append(
      element("h2", "", title),
      element("p", "", subtitle),
    );

    return box;
  }

  function showMatchDetails(matchId) {
    const match = database.matches.find(
      (item) => item.id === matchId,
    );

    if (!match) return;

    const content = $("modal-content");
    content.replaceChildren();

    const back = element(
      "button",
      "secondary stats-back",
      "← Back to statistics",
    );

    back.onclick = showStatistics;

    content.append(
      back,
      createHeading(
        "🎲 Match Results",
        new Date(
          match.completedAt,
        ).toLocaleString(),
      ),
    );

    const list = element("div", "stats-list");

    [...match.results]
      .sort((a, b) => b.score - a.score)
      .forEach((result) => {
        const winner = match.winnerIds.includes(
          result.profileId,
        );

        const row = element(
          "div",
          "stats-history-item",
        );

        const details = element("div");

        details.append(
          element(
            "strong",
            "",
            `${winner ? "👑 " : ""}${result.name}`,
          ),
          element(
            "small",
            "",
            `${result.yahtzees} Yahtzee(s)`,
          ),
        );

        row.append(
          details,
          element("strong", "", result.score),
        );

        list.append(row);
      });

    content.append(list);
  }

  function showStatistics() {
    const content = $("modal-content");
    content.replaceChildren();

    const standings = calculateStats();
    const matches = [...database.matches].reverse();

    content.append(
      createHeading(
        "🏆 Player Statistics",
        `${matches.length} completed matches`,
      ),
    );

    content.append(
      element(
        "h3",
        "stats-section-title",
        "Leaderboard & Profile Management",
      ),
    );

    const leaderboard = element(
      "div",
      "stats-list",
    );

    if (!standings.length) {
      leaderboard.append(
        element(
          "p",
          "stats-empty",
          "No profiles yet.",
        ),
      );
    }

    standings.forEach((player, index) => {
      const card = element(
        "div",
        "stats-player-card",
      );

      const heading = element(
        "div",
        "stats-player-heading",
      );

      const medal =
        ["🥇", "🥈", "🥉"][index] || "🎲";

      heading.append(
        element(
          "strong",
          "",
          `${medal} ${player.name}`,
        ),
        element(
          "span",
          "",
          `${player.wins} wins`,
        ),
      );

      const metrics = element(
        "div",
        "stats-metrics-grid",
      );

      metrics.append(
        makeStat("Played", player.games),
        makeStat(
          "Win rate",
          `${player.winRate.toFixed(1)}%`,
        ),
        makeStat(
          "Average",
          player.average.toFixed(1),
        ),
        makeStat("Best", player.bestScore),
        makeStat("Yahtzees", player.yahtzees),
        makeStat(
          "Total points",
          player.totalPoints,
        ),
      );

      // Delete button inside the statistics popup.
      const deleteButton = element(
        "button",
        "stats-delete-button",
        "🗑️ Delete profile",
      );

      deleteButton.type = "button";

      deleteButton.onclick = () => {
        requestProfileDeletion(player.id, true);
      };

      card.append(
        heading,
        metrics,
        deleteButton,
      );

      leaderboard.append(card);
    });

    content.append(leaderboard);

    content.append(
      element(
        "h3",
        "stats-section-title",
        "Recent Matches",
      ),
    );

    const history = element(
      "div",
      "stats-list",
    );

    if (!matches.length) {
      history.append(
        element(
          "p",
          "stats-empty",
          "No completed matches yet.",
        ),
      );
    }

    matches.slice(0, 20).forEach((match) => {
      const winners = match.results
        .filter((result) =>
          match.winnerIds.includes(
            result.profileId,
          ),
        )
        .map((result) => result.name);

      const button = element(
        "button",
        "stats-history-item stats-history-button",
      );

      const details = element("div");

      details.append(
        element(
          "strong",
          "",
          `🏆 ${winners.join(" & ")}`,
        ),
        element(
          "small",
          "",
          new Date(
            match.completedAt,
          ).toLocaleDateString(),
        ),
      );

      button.append(
        details,
        element(
          "strong",
          "",
          `${match.highestScore} pts`,
        ),
      );

      button.onclick = () =>
        showMatchDetails(match.id);

      history.append(button);
    });

    content.append(history);

    content.append(
      element(
        "p",
        "stats-footer",
        "Statistics are stored in this browser.",
      ),
    );
  }

  function openStatistics() {
    showStatistics();
    openModal();
  }

  // ==========================================================
  // 9. INITIALIZATION
  // ==========================================================

  function createStatisticsButton() {
    if ($("statistics-button")) return;

    const button = element(
      "button",
      "secondary",
      "🏆 Statistics",
    );

    button.id = "statistics-button";
    button.type = "button";
    button.onclick = openStatistics;

    const settingsButton = $("settings-button");

    if (settingsButton) {
      settingsButton.insertAdjacentElement(
        "beforebegin",
        button,
      );
    } else {
      document.querySelector("header")?.append(
        button,
      );
    }
  }

  // Load old data and merge duplicates.
  loadDatabase();

  createStatisticsButton();
  decorateSetup();

  // Recover existing game profiles.
  if (
    typeof players !== "undefined" &&
    players.length > 0
  ) {
    prepareRecoveredGame(players);
  }

  $("player-count").addEventListener(
    "change",
    decorateSetup,
  );

  // Functions exposed to game.js.
  window.YahtzeeStats = {
    startMatch,
    startRematch,
    prepareRecoveredGame,
    trackYahtzee,
    finishMatch,
    unfinishMatch,
    decorateSetup,
    openStatistics,
  };
})();
