import { GameState } from "./game.js";
import { cellKey, createWallSet } from "./pathfinding.js";
import { WEAPONS } from "./stages.js";

const EVENT_COPY = {
  start: ["暗闇の奥にボスの気配がある。武器を探せ。", "neutral"],
  move: ["慎重に一歩進んだ。", "neutral"],
  wall: ["石壁だ。ここから先は見通せない。", "danger"],
  fistMonster: ["素手で敵を倒した。反撃を受けてHP−1。", "danger"],
  fistBoss: ["ボスを強行突破した。激しい反撃でHP−2。", "danger"],
  weaponStrike: ["先制攻撃成功。反撃を受けずに敵を倒した。", "success"],
  bossStrike: ["先制攻撃がボスを捉えた。迷宮を制圧した。", "success"],
  trap: ["床の罠が作動した。HP−1。", "danger"],
  trapWarning: ["仲間が床の罠を見破った。別の道を選べる。", "success"],
  chestFound: ["宝箱を発見した。開けるか、置いていくか。", "attention"],
  chestLeft: ["宝箱には触れず、探索を続ける。", "neutral"],
  weaponFound: ["武器を入手した。射程内の敵へ先制攻撃できる。", "success"],
  companionFound: ["仲間が加わった。隣接する罠と怪しい宝箱が分かる。", "success"],
  herbFound: ["薬草でHPを回復した。", "success"],
  torchFound: ["松明を手に入れた。", "success"],
  lightFound: ["光魔法を使えるようになった。", "success"],
  mimic: ["宝箱モンスターだった。不意打ちでHP−1。", "danger"],
  torch: ["松明を掲げ、周囲を地図に記した。", "success"],
  light: ["魔法の光が広がった。壁の向こう側は見えない。", "success"],
  invalidTarget: ["その敵は射程外か、壁に遮られている。", "danger"],
  noTarget: ["現在の射程内に、発見済みの敵はいない。", "neutral"],
  gameOver: ["HPが尽きた。迷宮全体を開示する。", "danger"],
};

function getEventCopy(event) {
  const [text, tone] = EVENT_COPY[event.type] ?? EVENT_COPY.start;
  if (event.type === "weaponFound") {
    return {
      text: `${WEAPONS[event.weaponId].name}を入手。${WEAPONS[event.weaponId].description}。`,
      tone,
    };
  }
  if (event.depleted) {
    return { text: `${text} 武器を使い切り、素手になった。`, tone };
  }
  return { text, tone };
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
    this.stageTabs = [...document.querySelectorAll("[data-stage-index]")];
    this.hpValue = document.querySelector("#hp-value");
    this.hpHearts = document.querySelector("#hp-hearts");
    this.weaponName = document.querySelector("#weapon-name");
    this.weaponUses = document.querySelector("#weapon-uses");
    this.mapValue = document.querySelector("#map-value");
    this.companionStatus = document.querySelector("#companion-status");
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
    this.chestKicker = document.querySelector("#chest-kicker");
    this.chestTitle = document.querySelector("#chest-title");
    this.chestDescription = document.querySelector("#chest-description");
    this.resultPanel = document.querySelector("#result-panel");
    this.resultKicker = document.querySelector("#result-kicker");
    this.resultTitle = document.querySelector("#result-title");
    this.resultHp = document.querySelector("#result-hp");
    this.resultMoves = document.querySelector("#result-moves");
    this.resultAttacks = document.querySelector("#result-attacks");
    this.resultMap = document.querySelector("#result-map");
    this.nextStageButton = document.querySelector("#next-stage-button");
  }

  render(game, stageIndex, targeting = false) {
    this.renderHeader(game, stageIndex);
    this.renderStatus(game, targeting);
    this.renderBoard(game, targeting);
    this.renderMessage(game);
    this.renderPanels(game, stageIndex, targeting);
  }

  renderHeader(game, stageIndex) {
    this.stageName.textContent = game.stage.name;
    this.stageNumber.textContent = String(game.stage.id).padStart(2, "0");
    this.stageTabs.forEach((button, index) => {
      button.classList.toggle("active", index === stageIndex);
    });
  }

  renderStatus(game, targeting) {
    this.hpValue.textContent = `${game.hp} / ${game.maxHp}`;
    this.hpHearts.textContent =
      "♥".repeat(game.hp) + "♡".repeat(Math.max(0, game.maxHp - game.hp));
    this.documentCardDanger(".hp-card", game.hp <= 2);

    const weapon = game.activeWeapon;
    this.weaponName.textContent = weapon ? weapon.name : "素手";
    this.weaponUses.textContent = weapon
      ? `残り ${game.weaponUses} / ${weapon.uses}`
      : game.weapon
        ? "使い切った"
        : "武器を探せ";

    this.mapValue.textContent = `${game.mapPercentage}%`;
    this.companionStatus.textContent = game.companion ? "仲間同行" : "単独行";
    this.torchCount.textContent = String(game.torches);
    this.lightCount.textContent = String(game.lights);

    this.attackButton.disabled =
      !game.activeWeapon || game.isFinished || Boolean(game.pendingChest);
    this.attackButton.classList.toggle("active", targeting);
    this.attackCaption.textContent = weapon
      ? targeting
        ? "攻撃対象を選択"
        : `${weapon.name}・射程 ${weapon.rangeMin}〜${weapon.rangeMax}`
      : "武器なし";
    this.torchButton.disabled =
      game.torches <= 0 || game.isFinished || Boolean(game.pendingChest);
    this.lightButton.disabled =
      game.lights <= 0 || game.isFinished || Boolean(game.pendingChest);
  }

  documentCardDanger(selector, active) {
    document.querySelector(selector).classList.toggle("danger", active);
  }

  renderBoard(game, targeting) {
    const revealAll = game.isFinished;
    const wallSet = createWallSet(game.stage);
    const routeKeys = new Set(game.routeHistory.map(cellKey));
    const attackableKeys = new Set(
      targeting ? game.getAttackableEnemies().map(cellKey) : [],
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
        const chest = game.stage.chests.find(
          (item) => cellKey(item) === key && !game.openedChests.has(item.id),
        );
        const monster = game.stage.monsters.find(
          (item) => cellKey(item) === key && !game.defeatedMonsters.has(item.id),
        );
        const boss =
          cellKey(game.stage.boss) === key &&
          !game.defeatedMonsters.has(game.stage.boss.id)
            ? game.stage.boss
            : null;
        const trap = game.stage.traps.find(
          (item) =>
            cellKey(item) === key &&
            !game.disabledTraps.has(item.id) &&
            (revealAll || game.knownTraps.has(item.id)),
        );
        const targetable = attackableKeys.has(key);
        const cell = document.createElement(targetable ? "button" : "div");
        const classNames = ["cell"];

        if (!mapped) classNames.push("unknown");
        else if (wall) classNames.push("wall");
        else classNames.push("mapped");
        if (mapped && routeKeys.has(key)) classNames.push("visited");
        if (current) classNames.push("current");
        if (targetable) classNames.push("targetable");
        if (revealAll) classNames.push("revealed");

        cell.className = classNames.join(" ");
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-label", `${y + 1}行${x + 1}列`);
        if (targetable) {
          cell.type = "button";
          cell.dataset.targetKey = key;
          cell.setAttribute("aria-label", `${y + 1}行${x + 1}列の敵を攻撃`);
        }

        if (mapped && !wall) {
          if (chest) cell.append(createMarker("entity chest-marker", "▣"));
          if (monster) cell.append(createMarker("entity monster-marker", "M"));
          if (boss) cell.append(createMarker("entity boss-marker", "B"));
          if (trap) cell.append(createMarker("entity trap-marker", "△"));
        }
        if (current && game.state !== GameState.CLEAR) {
          cell.append(createMarker("player-marker", ""));
        }

        fragment.append(cell);
      }
    }

    this.board.replaceChildren(fragment);
  }

  renderMessage(game) {
    const copy = getEventCopy(game.lastEvent);
    this.eventMessage.textContent = copy.text;
    this.messagePanel.dataset.tone = copy.tone;
  }

  renderPanels(game, stageIndex, targeting) {
    const blocked =
      game.isFinished || Boolean(game.pendingChest) || targeting;
    this.moveButtons.forEach((button) => {
      button.disabled = blocked;
    });
    this.controls.hidden = game.isFinished || Boolean(game.pendingChest);

    this.chestPanel.hidden = !game.pendingChest;
    if (game.pendingChest) {
      const warning = game.getChestWarning();
      this.chestKicker.textContent = warning
        ? "COMPANION WARNING"
        : "TREASURE FOUND";
      this.chestTitle.textContent = warning
        ? "仲間が敵の気配を察知"
        : "宝箱を見つけた";
      this.chestDescription.textContent = warning
        ? "これは宝箱モンスターだ。開けずに立ち去れる。"
        : "中身は開けるまで分からない。危険でも開ける？";
      this.chestPanel.classList.toggle("warning", warning);
    }

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
        clear && stageIndex < 2 ? "次の迷宮へ" : "ステージ1から新しく挑戦";
    }
  }

  animate(event) {
    if (["wall", "fistMonster", "fistBoss", "trap", "mimic"].includes(event.type)) {
      this.boardFrame.classList.remove("hit");
      void this.boardFrame.offsetWidth;
      this.boardFrame.classList.add("hit");
    }
  }
}
