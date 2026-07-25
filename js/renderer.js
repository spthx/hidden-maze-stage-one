import { DIRECTIONS, GameState } from "./game.js";
import { cellKey, createWallSet } from "./pathfinding.js";
import { WEAPONS } from "./stages.js";

const EVENT_COPY = {
  diceReady: ["ダイス結果と効果を確認してから探索を開始。", "attention"],
  startConfirmed: ["探索開始。自分の後に冒険者、最後にモンスターが動く。", "success"],
  move: ["一歩進んだ。冒険者とモンスターも動く。", "neutral"],
  wall: ["石壁だ。ここから先は見通せない。", "danger"],
  fistMonster: ["素手でモンスターを倒した。反撃でHP−1。", "danger"],
  fistAdventurer: ["冒険者を倒した。奪った品はその場に残った。HP−1。", "danger"],
  bossRepels: ["ボスには通常攻撃が通じない。弾き飛ばされHP−2。", "danger"],
  weaponStrike: ["先制攻撃成功。反撃を受けずに倒した。", "success"],
  adventurerStrike: ["冒険者を攻撃した。奪った宝はその場に落ちた。", "danger"],
  bossStrike: ["決めの一撃がボスを貫いた。迷宮を制圧した。", "success"],
  bossResists: ["遠距離攻撃はボスに弾かれた。銀の剣で隣接攻撃が必要だ。", "danger"],
  chestFound: ["宝箱を発見。開ける間にも相手は動く。", "attention"],
  chestLeft: ["宝箱を残した。冒険者に奪われるかもしれない。", "neutral"],
  weaponFound: ["武器を入手した。射程内の気配へ先制できる。", "success"],
  silverSwordFound: ["銀の剣を入手。隣接すればボスを倒せる。", "success"],
  herbFound: ["薬草でHPを回復した。", "success"],
  torchFound: ["松明を手に入れた。", "success"],
  lightFound: ["光魔法を手に入れた。", "success"],
  chestEmpty: ["宝箱は空だった。", "neutral"],
  torch: ["松明で周囲を照らした。壁の向こうは見えない。", "success"],
  light: ["魔法の光が広がった。壁の向こうは見えない。", "success"],
  invalidTarget: ["射程外か、壁か別の気配に遮られている。", "danger"],
  noTarget: ["現在の射程内に気配はない。", "neutral"],
  rivalLooted: ["他の冒険者が宝箱を奪った。倒せば取り戻せる。", "attention"],
  contactWarning: ["気配が行く手を塞いでいる。もう一度進むと素手で接触する。", "danger"],
  monsterCaughtRival: ["モンスターが冒険者を倒した。今が逃げる好機だ。", "success"],
  monsterHitPlayer: ["モンスターに追いつかれた。HP−1。", "danger"],
  warpIn: ["転移床が作動。隔離された隠し部屋へ飛ばされた。", "attention"],
  warpOut: ["転移床から元の迷宮へ戻った。", "success"],
  gameOver: ["HPが尽きた。迷宮全体を開示する。", "danger"],
};

function containsBossWeapon(content) {
  if (!content) return false;
  if (content.type === "silverSword") return true;
  if (content.type === "weapon" && content.weaponId === "sword") return true;
  return (
    content.type === "bundle" &&
    Array.isArray(content.items) &&
    content.items.some(containsBossWeapon)
  );
}

function getEventCopy(event) {
  const [baseText, tone] = EVENT_COPY[event?.type] ?? EVENT_COPY.diceReady;
  let text = baseText;
  if (event?.type === "weaponFound") {
    const weapon = WEAPONS[event.weaponId];
    text = weapon
      ? `${weapon.name}を入手。${weapon.description}。`
      : "武器を入手した。";
  }
  if (event?.type === "warpIn") {
    text =
      event.roomType === "treasure"
        ? "転移先は宝物庫らしい。帰り道も同じ転移床だ。"
        : "転移先はモンスターハウスだ。帰り道を確保しろ。";
  }
  if (
    event?.type === "rivalLooted" &&
    (
      event.bossWeapon ||
      event.itemType === "silverSword" ||
      event.weaponId === "sword" ||
      containsBossWeapon(event.content) ||
      containsBossWeapon(event.item)
    )
  ) {
    text = "警告：他の冒険者が対ボス武器を奪った。追って取り戻せ。";
  }
  if (event?.type === "contactWarning") {
    if (event.kind === "boss") {
      text = "対ボス武器がない。接触するとHP−2。もう一度で決行。";
    } else if (event.attackable) {
      text = "接触すると素手でHP−1。武器は攻撃ボタンから使える。もう一度で決行。";
    }
  }
  if (event?.depleted) text += " 武器を使い切り、素手になった。";
  return { text, tone };
}

function getWorldEvents(event) {
  return Array.isArray(event?.worldEvents) ? event.worldEvents : [];
}

function trailDirection({ from, to }) {
  if (!from || !to) return { name: "unknown", arrow: "•" };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? { name: "right", arrow: "→" }
      : { name: "left", arrow: "←" };
  }
  return dy > 0
    ? { name: "down", arrow: "↓" }
    : { name: "up", arrow: "↑" };
}

function createMarker(className, text) {
  const marker = document.createElement("span");
  marker.className = className;
  marker.textContent = text;
  marker.setAttribute("aria-hidden", "true");
  return marker;
}

export class Renderer {
  constructor() {
    this.stageName = document.querySelector("#stage-name");
    this.stageNumber = document.querySelector("#stage-number");
    this.stageTotal = document.querySelector("#stage-total");
    this.stageTabs = [...document.querySelectorAll("[data-stage-index]")];
    this.hpValue = document.querySelector("#hp-value");
    this.hpHearts = document.querySelector("#hp-hearts");
    this.hpCard = document.querySelector(".hp-card");
    this.weaponName = document.querySelector("#weapon-name");
    this.weaponUses = document.querySelector("#weapon-uses");
    this.mapValue = document.querySelector("#map-value");
    this.rivalStatus = document.querySelector("#rival-status");
    this.dieValue = document.querySelector("#die-value");
    this.dieEffect = document.querySelector("#die-effect");
    this.dieStrip = document.querySelector(".die-strip");
    this.objectiveStrip = document.querySelector(".objective-strip");
    this.bossWeaponStatus = document.querySelector("#boss-weapon-status");
    this.turnCount = document.querySelector("#turn-count");
    this.startButton = document.querySelector("#start-button");
    this.board = document.querySelector("#maze-grid");
    this.boardFrame = document.querySelector("#board-frame");
    this.eventMessage = document.querySelector("#event-message");
    this.messagePanel = document.querySelector("#message-panel");
    this.attackButton = document.querySelector("#attack-button");
    this.attackCaption = document.querySelector("#attack-caption");
    this.torchButton = document.querySelector("#torch-button");
    this.lightButton = document.querySelector("#light-button");
    this.torchCount = document.querySelector("#torch-count");
    this.lightCount = document.querySelector("#light-count");
    this.controls = document.querySelector(".controls");
    this.moveButtons = [...document.querySelectorAll(".move-button")];
    this.chestPanel = document.querySelector("#chest-panel");
    this.resultPanel = document.querySelector("#result-panel");
    this.resultKicker = document.querySelector("#result-kicker");
    this.resultTitle = document.querySelector("#result-title");
    this.resultHp = document.querySelector("#result-hp");
    this.resultMoves = document.querySelector("#result-moves");
    this.resultAttacks = document.querySelector("#result-attacks");
    this.resultMap = document.querySelector("#result-map");
    this.nextStageButton = document.querySelector("#next-stage-button");
    this.lastPlayerAnimationEvent = null;
  }

  render(game, stageIndex, targeting = false) {
    const animatePlayer =
      game.lastEvent !== this.lastPlayerAnimationEvent &&
      Boolean(game.lastEvent?.playerMoved);
    this.renderHeader(game, stageIndex);
    this.renderStatus(game, targeting);
    this.renderBoard(game, targeting, animatePlayer);
    this.renderMessage(game);
    this.renderPanels(game, stageIndex, targeting);
    if (animatePlayer) this.lastPlayerAnimationEvent = game.lastEvent;
  }

  renderHeader(game, stageIndex) {
    this.stageName.textContent = game.stage.name;
    this.stageNumber.textContent = String(game.stage.id).padStart(2, "0");
    this.stageTotal.textContent = `/ ${this.stageTabs.length}`;
    this.stageTabs.forEach((button, index) => {
      button.classList.toggle("active", index === stageIndex);
      button.disabled = game.started;
      button.setAttribute("aria-disabled", String(game.started));
    });
  }

  renderStatus(game, targeting) {
    this.hpValue.textContent = `${game.hp} / ${game.maxHp}`;
    this.hpHearts.textContent =
      "♥".repeat(game.hp) + "♡".repeat(Math.max(0, game.maxHp - game.hp));
    const hpRatio = game.maxHp > 0 ? (game.hp / game.maxHp) * 100 : 0;
    this.hpCard.style.setProperty(
      "--hp-ratio",
      `${Math.max(0, Math.min(100, hpRatio))}%`,
    );
    this.hpCard.classList.toggle("danger", game.hp <= 2);

    const weapon = game.activeWeapon;
    this.weaponName.textContent = [
      weapon?.name ?? "素手",
      game.hasSilverSword ? "銀の剣" : "",
    ].filter(Boolean).join("＋");
    this.weaponUses.textContent = weapon
      ? `残り ${game.weaponUses} / ${weapon.uses}`
      : game.weapon
        ? "通常武器は使用済み"
        : "武器を探せ";

    this.mapValue.textContent = `${game.mapPercentage}%`;
    this.rivalStatus.textContent = game.adventurerAlive
      ? `冒険者の宝 ${game.rivalLootCount}`
      : "冒険者は脱落";
    this.dieValue.textContent = String(game.dieEffect.roll);
    this.dieEffect.textContent = `${game.dieEffect.name}：${game.dieEffect.description}`;
    this.dieStrip.dataset.fortune = game.dieEffect.roll % 2 === 0 ? "good" : "bad";
    this.dieStrip.classList.toggle("awaiting-start", !game.started);
    this.startButton.hidden = game.started;
    this.boardFrame.classList.toggle("waiting", !game.started);
    this.torchCount.textContent = String(game.torches);
    this.lightCount.textContent = String(game.lights);
    this.turnCount.textContent = `TURN ${game.moveCount}`;

    const bossDefeated = game.defeatedMonsters.has(game.stage.boss.id);
    const rivalHasBossWeapon =
      game.adventurerAlive &&
      game.adventurer.loot.some(containsBossWeapon);
    const bossWeaponStillAvailable = game.allChests.some(
      (chest) =>
        !game.openedChests.has(chest.id) &&
        containsBossWeapon(chest.content),
    );
    let objectiveState = "search";
    let objectiveCopy = "未発見 — 宝箱を探せ";
    if (bossDefeated) {
      objectiveState = "done";
      objectiveCopy = "討伐済み — 迷宮制圧";
    } else if (game.canDefeatBoss) {
      objectiveState = "ready";
      objectiveCopy = "準備完了 — ボスへ接触せよ";
    } else if (rivalHasBossWeapon) {
      objectiveState = "rival";
      objectiveCopy = "冒険者が所持 — 追って奪い返せ";
    } else if (!bossWeaponStillAvailable) {
      objectiveState = "lost";
      objectiveCopy = "喪失 — この探索では討伐不能";
    }
    this.objectiveStrip.dataset.state = objectiveState;
    this.bossWeaponStatus.textContent = objectiveCopy;

    const targets = game.getAttackableEnemies();
    this.attackButton.disabled =
      !game.started ||
      targets.length === 0 ||
      game.isFinished ||
      Boolean(game.pendingChest);
    this.attackButton.classList.toggle("active", targeting);
    this.attackCaption.textContent = targeting
      ? "盤面の気配を選択"
      : targets.length > 0
        ? `攻撃可能 ${targets.length}体`
        : "射程内に対象なし";
    this.torchButton.disabled =
      !game.started ||
      game.torches <= 0 ||
      game.isFinished ||
      Boolean(game.pendingChest);
    this.lightButton.disabled =
      !game.started ||
      game.lights <= 0 ||
      game.isFinished ||
      Boolean(game.pendingChest);
  }

  renderBoard(game, targeting, animatePlayer = false) {
    const revealAll = game.isFinished;
    const wallSet = createWallSet(game.stage);
    const routeKeys = new Set(game.routeHistory.map(cellKey));
    const attackableKeys = new Set(
      targeting ? game.getAttackableEnemies().map(cellKey) : [],
    );
    const canMoveDirectly =
      game.started &&
      !game.isFinished &&
      !game.pendingChest &&
      !targeting;
    const trailEvents = [
      ...(game.lastEvent?.type === "rivalMove" ||
      game.lastEvent?.type === "monsterMove"
        ? [game.lastEvent]
        : []),
      ...getWorldEvents(game.lastEvent),
    ].filter(
      (event) =>
        (event.type === "rivalMove" || event.type === "monsterMove") &&
        event.from &&
        event.to,
    );
    const fragment = document.createDocumentFragment();
    this.board.style.setProperty("--grid-size", game.stage.width);
    this.board.dataset.size = String(game.stage.width);

    for (let y = 0; y < game.stage.height; y += 1) {
      for (let x = 0; x < game.stage.width; x += 1) {
        const position = { x, y };
        const key = cellKey(position);
        const mapped = revealAll || game.mappedCells.has(key);
        const wall = wallSet.has(key);
        const current = cellKey(game.player) === key;
        const chest = game.allChests.find(
          (item) => cellKey(item) === key && !game.openedChests.has(item.id),
        );
        const entity = game.livingEntities.find((item) => cellKey(item) === key);
        const identityKnown =
          entity && (revealAll || game.isIdentityKnown(entity));
        const warp =
          game.stage.warp &&
          (
            cellKey(game.stage.warp.entry) === key ||
            cellKey(game.stage.warp.exit) === key
          );
        const targetable = attackableKeys.has(key);
        const contactWarning =
          game.lastEvent?.type === "contactWarning" &&
          game.lastEvent.contactKey === key;
        const moveDirection = canMoveDirectly
          ? Object.entries(DIRECTIONS).find(
              ([, direction]) =>
                game.player.x + direction.x === x &&
                game.player.y + direction.y === y,
            )?.[0] ?? null
          : null;
        const cell = document.createElement(
          targetable || moveDirection ? "button" : "div",
        );
        const classes = ["cell"];

        if (!mapped) classes.push("unknown");
        else if (wall) classes.push("wall");
        else classes.push("mapped");
        if (mapped && routeKeys.has(key)) classes.push("visited");
        if (current) classes.push("current");
        if (targetable) classes.push("targetable");
        if (moveDirection) classes.push("movable");
        if (contactWarning) classes.push("contact-warning");
        if (revealAll) classes.push("revealed");
        cell.className = classes.join(" ");
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-label", `${y + 1}行${x + 1}列`);
        if (targetable) {
          cell.type = "button";
          cell.dataset.targetKey = key;
          cell.setAttribute("aria-label", `${y + 1}行${x + 1}列の気配を攻撃`);
        } else if (moveDirection) {
          cell.type = "button";
          cell.dataset.moveDirection = moveDirection;
          cell.setAttribute(
            "aria-label",
            contactWarning
              ? `${y + 1}行${x + 1}列の気配へ接触。もう一度押して確定`
              : `${y + 1}行${x + 1}列へ移動`,
          );
        }

        if (mapped && !wall) {
          for (const trailEvent of trailEvents) {
            if (cellKey(trailEvent.to) !== key) continue;
            const direction = trailDirection(trailEvent);
            const kind =
              trailEvent.type === "rivalMove" ? "rival" : "monster";
            const trail = createMarker(
              `entity world-trail ${kind}-trail trail-${direction.name}`,
              direction.arrow,
            );
            trail.dataset.direction = direction.name;
            cell.append(trail);
          }
          if (warp) cell.append(createMarker("entity warp-marker", ""));
          if (chest) cell.append(createMarker("entity chest-marker", ""));
          if (entity && !identityKnown) {
            cell.append(createMarker("entity presence-marker", ""));
          } else if (entity?.kind === "monster") {
            cell.append(createMarker("entity monster-marker", ""));
          } else if (entity?.kind === "boss") {
            cell.append(createMarker("entity boss-marker", ""));
          } else if (entity?.kind === "adventurer") {
            cell.append(createMarker("entity adventurer-marker", ""));
          }
        }
        if (current && game.state !== GameState.CLEAR) {
          const playerMarker = createMarker(
            `player-marker facing-${game.facing}${animatePlayer ? " walking" : ""}`,
            "",
          );
          cell.append(playerMarker);
        }
        fragment.append(cell);
      }
    }
    this.board.replaceChildren(fragment);
  }

  renderMessage(game) {
    const copy = getEventCopy(game.lastEvent);
    const importantWorldEvents = getWorldEvents(game.lastEvent).filter(
      (event) => event.type !== "rivalMove" && event.type !== "monsterMove",
    );
    const additions = importantWorldEvents.map((event) => getEventCopy(event));
    this.eventMessage.textContent = [
      copy.text,
      ...additions.map((item) => item.text),
    ].filter(Boolean).join(" ／ ");
    this.messagePanel.dataset.tone =
      additions.find((item) => item.tone === "danger")?.tone ??
      additions.find((item) => item.tone === "attention")?.tone ??
      copy.tone;
  }

  renderPanels(game, stageIndex, targeting) {
    const blocked =
      !game.started || game.isFinished || Boolean(game.pendingChest) || targeting;
    this.moveButtons.forEach((button) => {
      button.disabled = blocked;
    });
    this.controls.hidden = game.isFinished || Boolean(game.pendingChest);
    this.chestPanel.hidden = !game.pendingChest;

    this.resultPanel.hidden = !game.isFinished;
    if (game.isFinished) {
      const clear = game.state === GameState.CLEAR;
      this.resultKicker.textContent = clear
        ? "DUNGEON COMPLETE"
        : "EXPEDITION FAILED";
      this.resultTitle.textContent = clear ? "BOSS DEFEATED" : "YOU FELL";
      this.resultHp.textContent = String(game.hp);
      this.resultMoves.textContent = String(game.moveCount);
      this.resultAttacks.textContent = String(game.attackCount);
      this.resultMap.textContent = `${game.mapPercentage}%`;
      this.nextStageButton.textContent =
        clear && stageIndex < this.stageTabs.length - 1
          ? "次の迷宮へ"
          : "5×5から新しく挑戦";
    }
  }

  animate(event) {
    if (
      [
        "wall",
        "fistMonster",
        "fistAdventurer",
        "bossRepels",
        "monsterHitPlayer",
        "gameOver",
      ].includes(event.type)
    ) {
      this.boardFrame.classList.remove("hit");
      void this.boardFrame.offsetWidth;
      this.boardFrame.classList.add("hit");
    }
  }
}
