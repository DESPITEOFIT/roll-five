
"use strict";

// ============================================================
// YAHTZEE V1.5B
// RIVALRIES, RECORDS, ACHIEVEMENTS & EXPORT
//
// Depends on game.js and stats.js.
// Reads the same database as V1.5A.1.
// ============================================================

(() => {
  // ==========================================================
  // 1. CONFIGURATION
  // ==========================================================

  const STORAGE_KEY = "yahtzee-local-stats-v1.5a";

  const $ = (id) => document.getElementById(id);

  const ACHIEVEMENTS = [
    [
      "🎲",
      "First Yahtzee",
      "Roll a Yahtzee in a completed match.",
    ],
    [
      "🔥",
      "Hat-Trick",
      "Win 3 consecutive matches you played.",
    ],
    [
      "💯",
      "300 Club",
      "Score at least 300 in one match.",
    ],
    [
      "👑",
      "Yahtzee Master",
      "Roll 3 Yahtzees in one match.",
    ],
  ];

  let selectedA = "";
  let selectedB = "";
  let selectedRecord = "";

  // ==========================================================
  // 2. READ SAVED STATISTICS
  // ==========================================================

  function readDatabase() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        return {
          version: 1,
          profiles: [],
          matches: [],
        };
      }

      const data = JSON.parse(raw);

      if (
        data?.version !== 1 ||
        !Array.isArray(data.profiles) ||
        !Array.isArray(data.matches)
      ) {
        throw new Error(
          "Unsupported statistics database format.",
        );
      }

      return data;
    } catch (error) {
      console.error(
        "Could not read statistics:",
        error,
      );

      return null;
    }
  }

  // Sort completed matches chronologically.
  function orderedMatches(data) {
    return data.matches
      .map((match, index) => ({
        match,
        index,
      }))
      .sort(
        (a, b) =>
          String(a.match.completedAt).localeCompare(
            String(b.match.completedAt),
          ) || a.index - b.index,
      )
      .map(({ match }) => match);
  }

  // Find a player's result in a match.
  function resultFor(match, profileId) {
    return match.results?.find(
      (result) => result.profileId === profileId,
    );
  }

  function nameFor(data, id) {
    return (
      data.profiles.find(
        (profile) => profile.id === id,
      )?.name || "Player"
    );
  }

  function matchesFor(data, id) {
    return orderedMatches(data).filter((match) =>
      resultFor(match, id),
    );
  }

  // ==========================================================
  // 3. HEAD-TO-HEAD CALCULATIONS
  // ==========================================================

  function comparePlayers(data, idA, idB) {
    // Only matches in which BOTH players participated.
    const shared = orderedMatches(data).filter(
      (match) =>
        resultFor(match, idA) &&
        resultFor(match, idB),
    );

    const comparison = {
      played: shared.length,
      winsA: 0,
      winsB: 0,
      ties: 0,
      averageA: 0,
      averageB: 0,
      biggestMarginA: 0,
      biggestMarginB: 0,
    };

    for (const match of shared) {
      const scoreA = resultFor(match, idA).score;
      const scoreB = resultFor(match, idB).score;

      comparison.averageA += scoreA;
      comparison.averageB += scoreB;

      if (scoreA > scoreB) {
        comparison.winsA++;

        comparison.biggestMarginA = Math.max(
          comparison.biggestMarginA,
          scoreA - scoreB,
        );
      } else if (scoreB > scoreA) {
        comparison.winsB++;

        comparison.biggestMarginB = Math.max(
          comparison.biggestMarginB,
          scoreB - scoreA,
        );
      } else {
        comparison.ties++;
      }
    }

    if (comparison.played) {
      comparison.averageA /= comparison.played;
      comparison.averageB /= comparison.played;
    }

    return comparison;
  }

  // ==========================================================
  // 4. PERSONAL RECORD CALCULATIONS
  // ==========================================================

  function playerRecords(data, id) {
    const matches = matchesFor(data, id);

    const records = {
      played: matches.length,
      wins: 0,
      totalPoints: 0,
      highestScore: 0,
      mostYahtzees: 0,
      biggestWin: 0,
      longestStreak: 0,
      currentStreak: 0,
      firstYahtzee: false,
      club300: false,
      master: false,
    };

    let streak = 0;

    for (const match of matches) {
      const result = resultFor(match, id);
      const count = Number(result.yahtzees) || 0;

      records.totalPoints += result.score;

      records.highestScore = Math.max(
        records.highestScore,
        result.score,
      );

      records.mostYahtzees = Math.max(
        records.mostYahtzees,
        count,
      );

      records.firstYahtzee ||= count >= 1;
      records.club300 ||= result.score >= 300;
      records.master ||= count >= 3;

      // A tied first place also counts as a win.
      if (match.winnerIds?.includes(id)) {
        records.wins++;
        streak++;

        records.longestStreak = Math.max(
          records.longestStreak,
          streak,
        );

        const opponents = match.results.filter(
          (r) => r.profileId !== id,
        );

        if (opponents.length) {
          const strongestOpponent = Math.max(
            ...opponents.map((r) => r.score),
          );

          records.biggestWin = Math.max(
            records.biggestWin,
            result.score - strongestOpponent,
          );
        }
      } else {
        streak = 0;
      }
    }

    records.currentStreak = streak;

    records.average = records.played
      ? records.totalPoints / records.played
      : 0;

    records.winRate = records.played
      ? (records.wins / records.played) * 100
      : 0;

    return records;
  }

  // ==========================================================
  // 5. REUSABLE HTML HELPERS
  // ==========================================================

  function el(tag, className = "", text = null) {
    const node = document.createElement(tag);

    if (className) {
      node.className = className;
    }

    if (text !== null) {
      node.textContent = String(text);
    }

    return node;
  }

  function metric(label, value) {
    const card = el("div", "plus-metric");

    card.append(
      el("small", "", label),
      el("strong", "", value),
    );

    return card;
  }

  function field(
    labelText,
    id,
    profiles,
    selected,
    onChange,
  ) {
    const wrapper = el("div", "plus-field");

    const label = el("label", "", labelText);
    label.htmlFor = id;

    const select = el("select", "plus-select");
    select.id = id;

    for (const profile of profiles) {
      const option = el(
        "option",
        "",
        profile.name,
      );

      option.value = profile.id;
      select.append(option);
    }

    select.value = selected;

    select.addEventListener("change", () => {
      onChange(select.value);
    });

    wrapper.append(label, select);
    return wrapper;
  }

  function section(title) {
    return el(
      "h3",
      "plus-section-title",
      title,
    );
  }

  function empty(text) {
    return el("p", "plus-empty", text);
  }

  // ==========================================================
  // 6. RENDER HEAD-TO-HEAD
  // ==========================================================

  function addHeadToHead(data, root) {
    root.append(
      section("⚔️ Head-to-head"),
    );

    const profiles = data.profiles;

    if (profiles.length < 2) {
      root.append(
        empty(
          "Create at least two profiles to compare players.",
        ),
      );

      return;
    }

    const ids = profiles.map(
      (profile) => profile.id,
    );

    if (!ids.includes(selectedA)) {
      selectedA = ids[0];
    }

    if (
      !ids.includes(selectedB) ||
      selectedA === selectedB
    ) {
      selectedB = ids.find(
        (id) => id !== selectedA,
      );
    }

    const selectors = el(
      "div",
      "plus-selectors",
    );

    selectors.append(
      field(
        "Player A",
        "plus-player-a",
        profiles,
        selectedA,
        (id) => {
          selectedA = id;

          if (selectedA === selectedB) {
            selectedB = ids.find(
              (other) => other !== id,
            );
          }

          renderDashboard("plus-player-a");
        },
      ),
      field(
        "Player B",
        "plus-player-b",
        profiles,
        selectedB,
        (id) => {
          selectedB = id;

          if (selectedA === selectedB) {
            selectedA = ids.find(
              (other) => other !== id,
            );
          }

          renderDashboard("plus-player-b");
        },
      ),
    );

    root.append(selectors);

    const stats = comparePlayers(
      data,
      selectedA,
      selectedB,
    );

    if (!stats.played) {
      root.append(
        empty(
          "These players have no completed matches together yet.",
        ),
      );

      return;
    }

    // Player win cards.
    const matchup = el(
      "div",
      "plus-h2h-grid",
    );

    for (const [id, wins] of [
      [selectedA, stats.winsA],
      [selectedB, stats.winsB],
    ]) {
      const card = el(
        "div",
        "plus-h2h-player",
      );

      card.append(
        el("span", "", nameFor(data, id)),
        el("strong", "", wins),
        el(
          "small",
          "",
          "Head-to-head wins",
        ),
      );

      matchup.append(card);
    }

    root.append(matchup);

    // A segmented bar showing wins and ties.
    const bar = el(
      "div",
      "plus-progress",
    );

    for (const [className, value] of [
      ["plus-progress-a", stats.winsA],
      ["plus-progress-ties", stats.ties],
      ["plus-progress-b", stats.winsB],
    ]) {
      const segment = el(
        "div",
        className,
      );

      segment.style.width =
        `${(value / stats.played) * 100}%`;

      bar.append(segment);
    }

    bar.setAttribute(
      "aria-label",
      `${stats.winsA} wins for player A, ` +
        `${stats.ties} ties, ` +
        `${stats.winsB} wins for player B`,
    );

    root.append(bar);

    // Head-to-head statistics.
    const grid = el(
      "div",
      "plus-metrics-grid",
    );

    grid.append(
      metric(
        "Played together",
        stats.played,
      ),
      metric(
        "Head-to-head ties",
        stats.ties,
      ),
      metric(
        "Average points (A / B)",
        `${stats.averageA.toFixed(1)} / ` +
          `${stats.averageB.toFixed(1)}`,
      ),
      metric(
        "Largest win margin (A / B)",
        `${stats.biggestMarginA} / ` +
          `${stats.biggestMarginB}`,
      ),
    );

    root.append(grid);

    root.append(
      el(
        "p",
        "plus-note",
        "Head-to-head compares scores in games " +
          "both players joined; a third player may " +
          "have won the overall match.",
      ),
    );
  }

  // ==========================================================
  // 7. PERSONAL RECORDS AND ACHIEVEMENTS
  // ==========================================================

  function addRecords(data, root) {
    root.append(
      section(
        "🏅 Achievements & personal records",
      ),
    );

    const profiles = data.profiles;

    if (!profiles.length) {
      root.append(
        empty(
          "Create a profile and finish a game " +
            "to unlock achievements.",
        ),
      );

      return;
    }

    if (
      !profiles.some(
        (profile) =>
          profile.id === selectedRecord,
      )
    ) {
      selectedRecord = profiles[0].id;
    }

    // Player selector.
    root.append(
      field(
        "View player",
        "plus-record-player",
        profiles,
        selectedRecord,
        (id) => {
          selectedRecord = id;
          renderDashboard(
            "plus-record-player",
          );
        },
      ),
    );

    const records = playerRecords(
      data,
      selectedRecord,
    );

    // Personal record cards.
    const grid = el(
      "div",
      "plus-metrics-grid",
    );

    grid.append(
      metric(
        "Matches",
        records.played,
      ),
      metric(
        "Wins",
        records.wins,
      ),
      metric(
        "Win rate",
        `${records.winRate.toFixed(1)}%`,
      ),
      metric(
        "Average score",
        records.average.toFixed(1),
      ),
      metric(
        "Highest score",
        records.highestScore,
      ),
      metric(
        "Most Yahtzees in a match",
        records.mostYahtzees,
      ),
      metric(
        "Biggest match win margin",
        records.biggestWin,
      ),
      metric(
        "Longest win streak",
        records.longestStreak,
      ),
      metric(
        "Current win streak",
        records.currentStreak,
      ),
      metric(
        "Career points",
        records.totalPoints,
      ),
    );

    root.append(grid);

    // Calculate unlocked achievements.
    const unlocked = [
      records.firstYahtzee,
      records.longestStreak >= 3,
      records.club300,
      records.master,
    ];

    const unlockedCount = unlocked.filter(
      Boolean,
    ).length;

    root.append(
      el(
        "p",
        "plus-achievement-count",
        `${unlockedCount} / ` +
          `${ACHIEVEMENTS.length} achievements unlocked`,
      ),
    );

    // Achievement cards.
    const awards = el(
      "div",
      "plus-achievements",
    );

    ACHIEVEMENTS.forEach(
      ([icon, name, description], i) => {
        const card = el(
          "div",
          `plus-achievement ${
            unlocked[i] ? "unlocked" : "locked"
          }`,
        );

        card.append(
          el(
            "div",
            "plus-achievement-icon",
            icon,
          ),
          el("strong", "", name),
          el("small", "", description),
          el(
            "span",
            "plus-achievement-status",
            unlocked[i]
              ? "Unlocked"
              : "Locked",
          ),
        );

        awards.append(card);
      },
    );

    root.append(awards);
  }

  // ==========================================================
  // 8. EXPORT STATISTICS AS JSON
  // ==========================================================

  function exportStats(status) {
    const data = readDatabase();

    if (!data) {
      status.textContent =
        "Could not read saved statistics.";
      return;
    }

    if (
      !data.profiles.length &&
      !data.matches.length
    ) {
      status.textContent =
        "Nothing to export yet.";
      return;
    }

    const file = new Blob(
      [JSON.stringify(data, null, 2)],
      {
        type: "application/json",
      },
    );

    const url = URL.createObjectURL(file);

    const link =
      document.createElement("a");

    link.href = url;

    link.download =
      `yahtzee-statistics-` +
      `${new Date().toISOString().slice(0, 10)}.json`;

    document.body.append(link);
    link.click();
    link.remove();

    setTimeout(
      () => URL.revokeObjectURL(url),
      1500,
    );

    status.textContent =
      "Statistics backup prepared.";
  }

  // ==========================================================
  // 9. DASHBOARD
  // ==========================================================

  function renderDashboard(focusId = "") {
    const data = readDatabase();
    const content = $("modal-content");

    content.replaceChildren();

    const heading = el(
      "div",
      "plus-heading",
    );

    heading.append(
      el(
        "h2",
        "",
        "⚔️ Rivalries & Achievements",
      ),
      el(
        "p",
        "",
        data
          ? `${data.matches.length} completed matches · V1.5B`
          : "Statistics are temporarily unavailable",
      ),
    );

    content.append(heading);

    if (!data) {
      content.append(
        empty(
          "Please check the browser console " +
            "for a storage error.",
        ),
      );

      return;
    }

    addHeadToHead(data, content);
    addRecords(data, content);

    // Export section.
    const footer = el(
      "div",
      "plus-footer",
    );

    const download = el(
      "button",
      "secondary",
      "⬇ Export statistics (JSON)",
    );

    download.type = "button";

    const status = el(
      "p",
      "plus-export-status",
    );

    status.setAttribute(
      "role",
      "status",
    );

    download.onclick = () =>
      exportStats(status);

    footer.append(
      download,
      status,
      el(
        "p",
        "plus-note",
        "Exports profiles and completed matches; " +
          "game-in-progress saves are separate.",
      ),
    );

    content.append(footer);

    // Restore focus after changing a player selector.
    if (focusId) {
      $(focusId)?.focus();
    }
  }

  function openDashboard() {
    renderDashboard();
    openModal();
  }

  // ==========================================================
  // 10. INITIALIZATION
  // ==========================================================

  function initialize() {
    if ($("rivalries-button")) {
      return;
    }

    const button = el(
      "button",
      "secondary",
      "⚔️ Rivalries",
    );

    button.id = "rivalries-button";
    button.type = "button";

    button.addEventListener(
      "click",
      openDashboard,
    );

    const statistics = $(
      "statistics-button",
    );

    if (statistics) {
      statistics.insertAdjacentElement(
        "afterend",
        button,
      );
    } else {
      document
        .querySelector("header")
        ?.append(button);
    }
  }

  initialize();
})();
