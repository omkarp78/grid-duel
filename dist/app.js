(() => {
  const $ = (id) => document.getElementById(id);
  const G = window.GridDuel;
  let match = G.createMatch(),
    selectedBid = 0,
    busy = false,
    gameMode = "quick",
    friendBidResolve = null,
    friendBid = 0,
    soundOn = localStorage.getItem("grid-duel-sound") === "on",
    audioContext;
  const PROFILE_KEY = "grid-duel-profile",
    MATCHES_KEY = "grid-duel-match-records";
  const SUPABASE_URL = "https://xsrivyugohmiilcudamq.supabase.co",
    SUPABASE_KEY = "sb_publishable_hFqjrbuicIk3a5VyG9v0Ww_5IWPK-JS";
  let roomPoll = null;
  let onlineCode = "",
    onlineToken = "",
    onlineRole = "";
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const newToken = () => crypto.randomUUID();
  async function roomRpc(name, body) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("Room request failed");
    return response.json();
  }
  const TOUR_KEY = "grid-duel-tour-complete";
  let tourIndex = 0;
  const tourSteps = [
    {
      target: "arena",
      title: "The grid",
      text: "Each battle captures one territory. First to 3 wins the match.",
    },
    {
      target: "rivalPieces",
      title: "Rival army",
      text: "The rival has the same pieces as you, but their choice stays secret.",
    },
    {
      target: "playerPieces",
      title: "Choose your army",
      text: "Tap a pawn to choose how many pieces you want to send.",
    },
    {
      target: "lockButton",
      title: "Send to battle",
      text: "Press SEND. The higher number captures the territory, so save power wisely.",
    },
  ];
  function haptic(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }
  function tone(kind) {
    if (!soundOn) return;
    try {
      audioContext ??= new AudioContext();
      const oscillator = audioContext.createOscillator(),
        gain = audioContext.createGain(),
        tones = {
          select: [480, 0.05],
          send: [320, 0.1],
          win: [660, 0.18],
          lose: [180, 0.22],
          draw: [390, 0.12],
        };
      const [frequency, duration] = tones[kind] || tones.select;
      oscillator.frequency.value = frequency;
      oscillator.type = kind === "lose" ? "sawtooth" : "sine";
      gain.gain.setValueAtTime(0.055, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audioContext.currentTime + duration,
      );
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch {}
  }
  function syncSound() {
    const button = $("soundButton");
    button.setAttribute("aria-pressed", String(soundOn));
    button.setAttribute(
      "aria-label",
      soundOn ? "Turn sound off" : "Turn sound on",
    );
    button.textContent = soundOn ? "♬" : "♩";
  }
  function endTour() {
    localStorage.setItem(TOUR_KEY, "true");
    $("tourOverlay").hidden = true;
    document.body.classList.remove("is-touring");
  }
  function renderTour() {
    const step = tourSteps[tourIndex],
      target = $(step.target),
      rect = target.getBoundingClientRect(),
      highlight = $("tourHighlight"),
      card = $("tourCard");
    $("tourStep").textContent = `${tourIndex + 1} / ${tourSteps.length}`;
    $("tourTitle").textContent = step.title;
    $("tourText").textContent = step.text;
    $("nextTourButton").textContent =
      tourIndex === tourSteps.length - 1 ? "GOT IT" : "NEXT";
    highlight.style.cssText = `left:${Math.max(10, rect.left - 7)}px;top:${Math.max(10, rect.top - 7)}px;width:${rect.width + 14}px;height:${rect.height + 14}px`;
    const top =
      rect.bottom + 18 + card.offsetHeight < window.innerHeight
        ? rect.bottom + 18
        : Math.max(16, rect.top - card.offsetHeight - 18);
    card.style.top = `${top}px`;
  }
  function startTour() {
    if (!$("helpDialog").hidden) $("helpDialog").hidden = true;
    tourIndex = 0;
    $("tourOverlay").hidden = false;
    document.body.classList.add("is-touring");
    requestAnimationFrame(renderTour);
  }
  function renderPieces() {
    $("rivalPieces").innerHTML = Array.from(
      { length: match.rivalEnergy },
      () => '<i class="power-piece power-piece--rival">♟</i>',
    ).join("");
    $("playerPieces").innerHTML = Array.from(
      { length: match.playerEnergy },
      (_, i) =>
        `<button class="power-piece ${i < selectedBid ? "power-piece--selected" : ""}" type="button" data-piece="${i + 1}" aria-label="Send ${i + 1} power">♟</button>`,
    ).join("");
    $("playerPieces")
      .querySelectorAll("[data-piece]")
      .forEach((piece) =>
        piece.addEventListener("click", () =>
          setBid(
            +piece.dataset.piece === selectedBid ? 0 : +piece.dataset.piece,
          ),
        ),
      );
  }
  function renderTerritories() {
    $("territories").innerHTML = match.territories
      .map((owner, index) => {
        const active = match.status === "playing" && index === match.round;
        const label =
          owner === "player"
            ? "YOURS"
            : owner === "rival"
              ? "RIVAL"
              : owner === "draw"
                ? "DRAW"
                : active
                  ? "ACTIVE"
                  : "OPEN";
        const icon =
          owner === "player" || owner === "rival"
            ? "◆"
            : owner === "draw"
              ? "—"
              : active
                ? "◎"
                : "◇";
        return `<div class="territory ${active ? "territory--active" : ""} ${owner ? `territory--${owner}` : ""}" data-territory="${index}"><strong>${icon}</strong><span>${label}</span></div>`;
      })
      .join("");
  }
  function renderHistory() {
    const visible = match.history.length > 0;
    $("historySection").hidden = !visible;
    if (!visible) return;
    $("historyList").innerHTML = [...match.history]
      .reverse()
      .map((item) => {
        const text =
          item.winner === "player"
            ? "YOU WON"
            : item.winner === "rival"
              ? "RIVAL WON"
              : "DRAW";
        return `<article class="history-row history-row--${item.winner}"><div class="history-label"><i>${item.winner === "draw" ? "—" : "◆"}</i><div><strong>Territory ${item.round}</strong><span>${text}</span></div></div><div class="history-bids"><b>${item.playerBid}</b> ♟ <i>vs</i> <b>${item.rivalBid}</b> ♟</div></article>`;
      })
      .join("");
  }
  function render() {
    $("playerEnergy").textContent = match.playerEnergy;
    $("rivalEnergy").textContent = match.rivalEnergy;
    $("playerScore").textContent = match.playerScore;
    $("rivalScore").textContent = match.rivalScore;
    const tiebreakRound = match.round - G.TOTAL_TERRITORIES + 1;
    $("roundLabel").textContent =
      match.status === "playing"
        ? match.tiebreak
          ? `TIEBREAK ${tiebreakRound} / ${G.TIEBREAK_TERRITORIES}`
          : `ROUND ${match.round + 1} / ${G.TOTAL_TERRITORIES}`
        : "MATCH OVER";
    $("activeTerritoryNumber").textContent =
      match.status === "playing"
        ? match.tiebreak
          ? `TIEBREAK ${tiebreakRound}`
          : `TERRITORY ${match.round + 1}`
        : "BATTLE COMPLETE";
    renderPieces();
    renderTerritories();
    renderHistory();
    updateSelection();
  }
  function updateSelection() {
    $("bidValue").textContent = `${selectedBid} selected`;
    $("lockButton").textContent = selectedBid
      ? `SEND ${selectedBid} ${selectedBid === 1 ? "PIECE" : "PIECES"} ↑`
      : "SEND 0 · SAVE POWER";
  }
  function announce(title, text) {
    $("announcementTitle").textContent = title;
    $("announcementText").textContent = text;
  }
  function setBid(value) {
    if (busy) return;
    selectedBid = Math.min(match.playerEnergy, Math.max(0, value));
    tone("select");
    haptic(8);
    renderPieces();
    updateSelection();
  }
  function clearMarch() {
    $("playerMarch").innerHTML = "";
    $("rivalMarch").innerHTML = "";
    $("battleResult").textContent = "VS";
    $("battleResult").className = "";
  }
  function marchTokens(id, count) {
    $(id).innerHTML = Array.from(
      { length: count },
      (_, i) =>
        `<i class="march-token" style="animation-delay:${i * 0.045}s">♟</i>`,
    ).join("");
  }
  function battleImpact(winner) {
    const board = $("battleBoard"),
      flash = $("screenFlash");
    board.classList.remove(
      "battle-board--player",
      "battle-board--rival",
      "battle-board--draw",
    );
    void board.offsetWidth;
    board.classList.add(`battle-board--${winner}`);
    flash.className = `screen-flash screen-flash--${winner}`;
    for (let i = 0; i < 12; i++) {
      const spark = document.createElement("i"),
        angle = (Math.PI * 2 * i) / 12,
        distance = 35 + Math.random() * 65;
      spark.className = `impact-spark impact-spark--${winner}`;
      spark.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
      spark.style.setProperty("--y", `${Math.sin(angle) * distance}px`);
      $("marchZone").appendChild(spark);
      setTimeout(() => spark.remove(), 650);
    }
    setTimeout(() => {
      board.classList.remove(
        "battle-board--player",
        "battle-board--rival",
        "battle-board--draw",
      );
      flash.className = "screen-flash";
    }, 700);
  }
  function profile() {
    return JSON.parse(
      localStorage.getItem(PROFILE_KEY) || '{"name":"Grid Commander"}',
    );
  }
  function records() {
    return JSON.parse(localStorage.getItem(MATCHES_KEY) || "[]");
  }
  function renderDashboard() {
    const p = profile(),
      games = records(),
      wins = games.filter((game) => game.result === "won").length;
    $("playerName").textContent = p.name;
    $("playerAvatar").textContent =
      p.name.trim().charAt(0).toUpperCase() || "G";
    $("profileStats").textContent =
      `${wins} win${wins === 1 ? "" : "s"} · ${games.length} match${games.length === 1 ? "" : "es"}`;
    $("dashboardHistory").hidden = !games.length;
    $("dashboardHistoryList").innerHTML = games
      .slice(0, 4)
      .map(
        (game) =>
          `<article class="history-row history-row--${game.result}"><div class="history-label"><i>${game.result === "won" ? "◆" : game.result === "lost" ? "◆" : "—"}</i><div><strong>${game.result === "won" ? "Victory" : game.result === "lost" ? "Defeat" : "Draw"}</strong><span>${game.score}</span></div></div><div class="history-bids">${game.when}</div></article>`,
      )
      .join("");
  }
  function showDashboard() {
    if ($("outcomeDialog").open) $("outcomeDialog").close();
    $("dashboard").hidden = false;
    $("gameView").hidden = true;
    $("pageTitle").textContent = "Command center";
    renderDashboard();
  }
  function openDashboard() {
    clearInterval(roomPoll);
    history.pushState({ view: "dashboard" }, "", location.pathname);
    showDashboard();
  }
  function showRoomError(message) {
    $("roomHelp").textContent = message;
    $("roomHelp").classList.add("field-help--error");
  }
  function openLobby(code, token, role) {
    $("onlineDialog").close();
    $("roomCodeDisplay").textContent = code;
    $("roomStatus").textContent =
      role === "host" ? "Waiting for Player 2…" : "Connected to Player 1";
    $("roomLobbyDialog").showModal();
    clearInterval(roomPoll);
    roomPoll = setInterval(async () => {
      try {
        const rows = await roomRpc("get_room", {
          p_code: code,
          p_token: token,
        });
        if (rows[0]?.state?.status === "playing") {
          clearInterval(roomPoll);
          $("roomStatus").textContent = "Both players connected!";
          $("roomStatus").classList.add("room-status--ready");
          const url = `?play=online&room=${code}&token=${token}&role=${role}`;
          setTimeout(() => {
            $("roomLobbyDialog").close();
            history.pushState({ view: "online" }, "", url);
            startGame();
          }, 700);
        }
      } catch {
        $("roomStatus").textContent = "Connection lost. Retrying…";
      }
    }, 1200);
  }
  function startGame() {
    const params = new URLSearchParams(location.search);
    gameMode = params.get("play") || "quick";
    onlineCode = params.get("room") || "";
    onlineToken = params.get("token") || "";
    onlineRole = params.get("role") || "";
    $("dashboard").hidden = true;
    $("gameView").hidden = false;
    $("pageTitle").textContent = "Battle for the grid";
    reset();
    if (!localStorage.getItem(TOUR_KEY)) setTimeout(startTour, 300);
  }
  function openGame(mode) {
    history.pushState({ view: mode }, "", `?play=${mode}`);
    startGame();
  }
  function getFriendBid() {
    friendBid = 0;
    $("friendPassStep").hidden = false;
    $("friendChooseStep").hidden = true;
    $("friendTurnDialog").showModal();
    return new Promise((resolve) => (friendBidResolve = resolve));
  }
  function renderFriendPieces() {
    $("friendPieces").innerHTML = Array.from(
      { length: match.rivalEnergy },
      (_, i) =>
        `<button class="friend-piece ${i < friendBid ? "friend-piece--selected" : ""}" type="button" data-friend-piece="${i + 1}">♟</button>`,
    ).join("");
    $("friendPieces")
      .querySelectorAll("[data-friend-piece]")
      .forEach((piece) =>
        piece.addEventListener("click", () => {
          const value = +piece.dataset.friendPiece;
          friendBid = value === friendBid ? 0 : value;
          $("friendBidValue").textContent = `${friendBid} selected`;
          $("friendSendButton").textContent = friendBid
            ? `SEND ${friendBid} ${friendBid === 1 ? "PIECE" : "PIECES"} ↓`
            : "SEND 0 · SAVE POWER";
          renderFriendPieces();
        }),
      );
  }
  function reset() {
    if ($("outcomeDialog").open) $("outcomeDialog").close();
    match = G.createMatch();
    selectedBid = 0;
    busy = false;
    $("arena").hidden = false;
    $("battleBoard").hidden = false;
    $("announcement").hidden = false;
    $("controlPanel").hidden = false;
    $("resultPanel").hidden = true;
    $("lockButton").disabled = false;
    clearMarch();
    announce(
      "Choose your army",
      "Tap a piece to select how many you will send.",
    );
    render();
  }
  async function playOnlineRound(localBid) {
    await roomRpc("submit_room_bid", {
      p_code: onlineCode,
      p_token: onlineToken,
      p_bid: localBid,
    });
    const previousRounds = match.history.length;
    for (let tries = 0; tries < 80; tries += 1) {
      const rows = await roomRpc("get_room", {
        p_code: onlineCode,
        p_token: onlineToken,
      });
      const state = rows[0]?.state;
      if (!state) throw new Error("Room closed");
      if (state.match?.history?.length > previousRounds)
        return {
          hostBid: state.lastHostBid,
          guestBid: state.lastGuestBid,
          next: state.match,
        };
      if (
        onlineRole === "host" &&
        state.hostBid !== null &&
        state.guestBid !== null
      ) {
        const next = G.resolveBattle(match, state.hostBid, state.guestBid);
        const nextState = {
          status: "playing",
          hostBid: null,
          guestBid: null,
          lastHostBid: state.hostBid,
          lastGuestBid: state.guestBid,
          match: next,
        };
        await roomRpc("update_room_state", {
          p_code: onlineCode,
          p_host_token: onlineToken,
          p_state: nextState,
        });
        return { hostBid: state.hostBid, guestBid: state.guestBid, next };
      }
      await wait(700);
    }
    throw new Error("Opponent did not respond");
  }
  async function playRound() {
    if (busy || match.status !== "playing") return;
    busy = true;
    $("lockButton").disabled = true;
    const playerBid = selectedBid;
    let rivalBid, onlineResult;
    if (gameMode === "online") {
      announce("Move locked", "Waiting for the other player…");
      try {
        onlineResult = await playOnlineRound(playerBid);
      } catch {
        announce("Connection problem", "Could not sync this move. Try again.");
        busy = false;
        $("lockButton").disabled = false;
        return;
      }
      rivalBid =
        onlineRole === "host" ? onlineResult.guestBid : onlineResult.hostBid;
    } else
      rivalBid =
        gameMode === "friend" ? await getFriendBid() : G.chooseBotBid(match);
    tone("send");
    haptic(14);
    announce(
      "Army sent",
      gameMode === "friend"
        ? "Player 2 is moving too…"
        : "The rival is moving too…",
    );
    marchTokens("playerMarch", playerBid);
    await wait(280);
    marchTokens("rivalMarch", rivalBid);
    await wait(600);
    match =
      gameMode === "online"
        ? onlineResult.next
        : G.resolveBattle(match, playerBid, rivalBid);
    const last = match.history.at(-1),
      startedTiebreak = match.tiebreak && match.round === G.TOTAL_TERRITORIES;
    $("battleResult").className = `battle-result--${last.winner}`;
    if (last.winner === "player") {
      tone("win");
      haptic([15, 40, 25]);
      $("battleResult").textContent = "YOU WIN";
      announce("Territory captured", `${playerBid} pieces beat ${rivalBid}.`);
    } else if (last.winner === "rival") {
      tone("lose");
      haptic([30, 45, 30]);
      $("battleResult").textContent = "RIVAL WINS";
      announce("Rival captured it", `${rivalBid} pieces beat ${playerBid}.`);
    } else {
      tone("draw");
      haptic(20);
      $("battleResult").textContent = "DRAW";
      announce("Deadlock", `Both armies sent ${playerBid}.`);
    }
    battleImpact(last.winner);
    selectedBid = 0;
    render();
    const cell = document.querySelector(`[data-territory="${last.round - 1}"]`);
    cell?.classList.add("territory--captured");
    await wait(900);
    if (match.status !== "playing") {
      finish();
      return;
    }
    if (startedTiebreak) {
      showOutcome(
        "draw",
        "TIEBREAK",
        "3 MORE TERRITORIES",
        `The grid is tied ${match.playerScore} — ${match.rivalScore}.`,
      );
      await wait(1550);
      if ($("outcomeDialog").open) $("outcomeDialog").close();
    }
    clearMarch();
    announce(
      startedTiebreak ? "Tiebreak begins" : "Choose your next army",
      startedTiebreak
        ? "Win the next 3 territories to break the tie."
        : "Tap a piece, then send it toward the grid.",
    );
    busy = false;
    $("lockButton").disabled = false;
    render();
  }
  function showOutcome(type, kicker, title, summary) {
    const dialog = $("outcomeDialog");
    dialog.dataset.outcome = type;
    $("outcomeKicker").textContent = kicker;
    $("outcomeTitle").textContent = title;
    $("outcomeScore").textContent = summary;
    $("outcomeIcon").textContent =
      type === "won" ? "↑" : type === "lost" ? "↘" : "=";
    if (!dialog.open) dialog.showModal();
  }
  function finish() {
    busy = false;
    $("arena").hidden = true;
    $("battleBoard").hidden = true;
    $("announcement").hidden = true;
    $("controlPanel").hidden = true;
    $("resultPanel").hidden = false;
    render();
    const details = `Final score: You ${match.playerScore} — ${match.rivalScore} Rival`;
    const history = records();
    history.unshift({ result: match.status, score: details, when: "Just now" });
    localStorage.setItem(MATCHES_KEY, JSON.stringify(history.slice(0, 12)));
    if (match.status === "won")
      showOutcome("won", "VICTORY", "YOU WIN", details);
    else if (match.status === "lost")
      showOutcome("lost", "DEFEAT", "YOU LOST", details);
    else showOutcome("draw", "DRAW", "GRID DEADLOCK", details);
  }
  $("lockButton").addEventListener("click", playRound);
  $("playAgainButton").addEventListener("click", reset);
  $("outcomeClose").addEventListener("click", () => $("outcomeDialog").close());
  $("helpButton").addEventListener(
    "click",
    () => ($("helpDialog").hidden = false),
  );
  $("helpClose").addEventListener(
    "click",
    () => ($("helpDialog").hidden = true),
  );
  $("startTourButton").addEventListener("click", startTour);
  $("skipTourButton").addEventListener("click", endTour);
  $("nextTourButton").addEventListener("click", () => {
    if (tourIndex === tourSteps.length - 1) endTour();
    else {
      tourIndex += 1;
      renderTour();
    }
  });
  window.addEventListener("resize", () => {
    if (!$("tourOverlay").hidden) renderTour();
  });
  $("soundButton").addEventListener("click", () => {
    soundOn = !soundOn;
    localStorage.setItem("grid-duel-sound", soundOn ? "on" : "off");
    syncSound();
    if (soundOn) tone("select");
  });
  $("restartButton").addEventListener("click", () => {
    if (match.history.length && match.status === "playing")
      $("restartDialog").showModal();
    else reset();
  });
  $("restartDialog").addEventListener("close", () => {
    if ($("restartDialog").returnValue === "confirm") reset();
  });
  $("dashboardButton").addEventListener("click", openDashboard);
  $("quickBattleButton").addEventListener("click", () => openGame("quick"));
  $("friendBattleButton").addEventListener("click", () =>
    $("friendDialog").showModal(),
  );
  $("onlineBattleButton").addEventListener("click", () =>
    $("onlineDialog").showModal(),
  );
  $("onlineClose").addEventListener("click", () => $("onlineDialog").close());
  $("createRoomButton").addEventListener("click", async () => {
    $("createRoomButton").disabled = true;
    try {
      const token = newToken();
      const rows = await roomRpc("create_room", { p_host_token: token });
      if (!rows[0]) throw new Error();
      openLobby(rows[0].code, token, "host");
    } catch {
      showRoomError("Could not create a room. Please try again.");
    }
    $("createRoomButton").disabled = false;
  });
  $("onlineRoomForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = $("roomCodeInput").value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code))
      return showRoomError("Enter a valid 6-character room code.");
    try {
      const token = newToken();
      const rows = await roomRpc("join_room", {
        p_code: code,
        p_guest_token: token,
      });
      if (!rows[0]) return showRoomError("Room not found, full, or expired.");
      openLobby(code, token, "guest");
    } catch {
      showRoomError("Could not join the room. Check your connection.");
    }
  });
  const copyRoomCode = async () => {
    await navigator.clipboard.writeText($("roomCodeDisplay").textContent);
    $("copyRoomButton").textContent = "COPIED!";
  };
  $("copyRoomButton").addEventListener("click", copyRoomCode);
  $("roomCodeDisplay").addEventListener("click", copyRoomCode);
  $("leaveRoomButton").addEventListener("click", () => {
    clearInterval(roomPoll);
    $("roomLobbyDialog").close();
  });
  $("historyDashboardButton").addEventListener("click", () => {
    $("dashboardHistory").hidden = false;
    $("dashboardHistory").scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  });
  $("editNameButton").addEventListener("click", () => {
    $("playerNameInput").value = profile().name;
    $("playerNameInput").setAttribute("aria-invalid", "false");
    $("nameHelp").textContent = "Use 2–20 letters, numbers, or spaces.";
    $("nameHelp").classList.remove("field-help--error");
    $("profileDialog").showModal();
    requestAnimationFrame(() => $("playerNameInput").select());
  });
  $("profileClose").addEventListener("click", () => $("profileDialog").close());
  $("profileForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("playerNameInput").value.trim().replace(/\s+/g, " ");
    const valid = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,18}[\p{L}\p{N}]$/u.test(name);
    if (!valid) {
      $("playerNameInput").setAttribute("aria-invalid", "true");
      $("nameHelp").textContent =
        "Enter 2–20 characters. Start and end with a letter or number.";
      $("nameHelp").classList.add("field-help--error");
      $("playerNameInput").focus();
      return;
    }
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ name }));
    $("profileDialog").close();
    renderDashboard();
  });
  $("friendDialog").addEventListener("close", () => {
    if ($("friendDialog").returnValue === "confirm") openGame("friend");
  });
  $("friendReadyButton").addEventListener("click", () => {
    $("friendPassStep").hidden = true;
    $("friendChooseStep").hidden = false;
    $("friendBidValue").textContent = "0 selected";
    $("friendSendButton").textContent = "SEND 0 · SAVE POWER";
    renderFriendPieces();
  });
  $("friendSendButton").addEventListener("click", () => {
    $("friendTurnDialog").close();
    const resolve = friendBidResolve;
    friendBidResolve = null;
    resolve?.(friendBid);
  });
  $("friendTurnDialog").addEventListener("cancel", (event) =>
    event.preventDefault(),
  );
  syncSound();
  window.addEventListener("popstate", () =>
    new URLSearchParams(location.search).has("play")
      ? startGame()
      : showDashboard(),
  );
  new URLSearchParams(location.search).has("play")
    ? startGame()
    : showDashboard();
})();
