import { GameState } from "./game.js";
import { cellKey } from "./pathfinding.js";

function eventCopy(event) {
  switch (event.type) {
    case "wall":
      return { text: "鈍い衝撃。暗闇の中に石壁が浮かび上がった。", tone: "danger" };
    case "boundary":
      return { text: "迷宮の外壁だ。これ以上は進めない。", tone: "danger" };
    case "clear":
      return { text: "出口を発見。迷宮の全記録を開示する。", tone: "success" };
    case "gameOver":
      return { text: "探索限界に到達。迷宮の全記録を開示する。", tone: "danger" };
    case "move":
      if (event.distanceDelta < 0) {
        return { text: "出口反応が強くなった。近づいている。", tone: "success" };
      }
      if (event.distanceDelta > 0) {
        return { text: "出口反応が弱くなった。だが迂回路かもしれない。", tone: "danger" };
      }
      return { text: "出口反応に変化はない。", tone: "neutral" };
    default:
      return { text: "現在地以外は闇に包まれている。", tone: "neutral" };
  }
}

function cellDescription(x, y, classNames, isExit, isCurrent) {
  const row = y + 1;
  const column = x + 1;
  if (isCurrent && isExit) return `${row}行${column}列、現在地、出口`;
  if (isCurrent) return `${row}行${column}列、現在地`;
  if (classNames.includes("wall")) return `${row}行${column}列、壁`;
  if (isExit) return `${row}行${column}列、出口`;
  if (classNames.includes("visited")) return `${row}行${column}列、通過済み`;
  return `${row}行${column}列、未探索`;
}

export class Renderer {
  constructor() {
    this.board = document.querySelector("#maze-grid");
    this.boardFrame = document.querySelector("#board-frame");
    this.movesLeft = document.querySelector("#moves-left");
    this.movesUsed = document.querySelector("#moves-used");
    this.movesMeter = document.querySelector("#moves-meter-fill");
    this.movesCard = document.querySelector(".moves-card");
    this.exitDistance = document.querySelector("#exit-distance");
    this.signalTrend = document.querySelector("#signal-trend");
    this.signalCard = document.querySelector("#signal-card");
    this.messagePanel = document.querySelector("#message-panel");
    this.eventMessage = document.querySelector("#event-message");
    this.controls = document.querySelector(".controls");
    this.moveButtons = [...document.querySelectorAll(".move-button")];
    this.resultPanel = document.querySelector("#result-panel");
    this.resultKicker = document.querySelector("#result-kicker");
    this.resultTitle = document.querySelector("#result-title");
    this.resultMoves = document.querySelector("#result-moves");
    this.resultShortest = document.querySelector("#result-shortest");
    this.resultHits = document.querySelector("#result-hits");
    this.resultRank = document.querySelector("#result-rank");
  }

  render(game) {
    this.renderStatus(game);
    this.renderBoard(game);
    this.renderMessage(game);
    this.renderResult(game);
  }

  renderStatus(game) {
    const ratio = (game.remainingMoves / game.stage.moveLimit) * 100;
    this.movesLeft.textContent = String(game.remainingMoves).padStart(2, "0");
    this.movesUsed.textContent = `${game.moveCount} / ${game.stage.moveLimit}`;
    this.movesMeter.style.width = `${ratio}%`;
    this.movesCard.classList.toggle("danger", ratio <= 25);
    this.exitDistance.textContent = String(game.distance).padStart(2, "0");

    this.signalCard.classList.remove("closer", "farther");
    if (game.lastEvent.type === "start") {
      this.signalTrend.textContent = "観測開始";
    } else if (game.lastEvent.distanceDelta < 0) {
      this.signalTrend.textContent = "▲ 近づいた";
      this.signalCard.classList.add("closer");
    } else if (game.lastEvent.distanceDelta > 0) {
      this.signalTrend.textContent = "▼ 遠ざかった";
      this.signalCard.classList.add("farther");
    } else {
      this.signalTrend.textContent =
        game.lastEvent.type === "wall" || game.lastEvent.type === "boundary"
          ? "壁を検知"
          : "変化なし";
    }
  }

  renderBoard(game) {
    const revealAll = game.isFinished;
    const shortestKeys = new Set(game.shortestPath.map(cellKey));
    const actualKeys = new Set(game.routeHistory.map(cellKey));
    const fragment = document.createDocumentFragment();

    for (let y = 0; y < game.stage.height; y += 1) {
      for (let x = 0; x < game.stage.width; x += 1) {
        const position = { x, y };
        const key = cellKey(position);
        const isWall = game.wallSet.has(key);
        const isCurrent = cellKey(game.player) === key;
        const isExit = cellKey(game.stage.exit) === key;
        const isStart = cellKey(game.stage.start) === key;
        const isVisited = game.visitedCells.has(key);
        const isDiscoveredWall = game.discoveredWalls.has(key);
        const classNames = ["cell"];

        if (revealAll) {
          classNames.push("revealed", isWall ? "wall" : "floor");
          if (!isWall && shortestKeys.has(key)) classNames.push("shortest");
          if (!isWall && actualKeys.has(key)) classNames.push("actual");
        } else if (isDiscoveredWall) {
          classNames.push("wall");
        } else if (isVisited || isCurrent) {
          classNames.push("visited");
        } else {
          classNames.push("unknown");
        }

        if (isCurrent) classNames.push("current");
        if (revealAll && isExit) classNames.push("exit");

        const cell = document.createElement("div");
        cell.className = classNames.join(" ");
        cell.setAttribute("role", "gridcell");
        cell.setAttribute(
          "aria-label",
          cellDescription(x, y, classNames, revealAll && isExit, isCurrent),
        );

        if (isStart && (revealAll || !isCurrent)) {
          const startLabel = document.createElement("span");
          startLabel.className = "start-label";
          startLabel.textContent = "S";
          cell.append(startLabel);
        }

        if (isExit && revealAll) {
          const exitMarker = document.createElement("span");
          exitMarker.className = "exit-marker";
          exitMarker.textContent = "EXIT";
          exitMarker.setAttribute("aria-hidden", "true");
          cell.append(exitMarker);
        }

        if (isCurrent && game.state !== GameState.CLEAR) {
          const playerMarker = document.createElement("span");
          playerMarker.className = "player-marker";
          playerMarker.setAttribute("aria-hidden", "true");
          cell.append(playerMarker);
        }

        fragment.append(cell);
      }
    }

    this.board.replaceChildren(fragment);
    this.board.dataset.state = game.state;
  }

  renderMessage(game) {
    const copy = eventCopy(game.lastEvent);
    this.eventMessage.textContent = copy.text;
    this.messagePanel.dataset.tone = copy.tone;
  }

  renderResult(game) {
    const finished = game.isFinished;
    this.moveButtons.forEach((button) => {
      button.disabled = finished;
    });
    this.controls.hidden = finished;
    this.resultPanel.hidden = !finished;

    if (!finished) return;

    const isClear = game.state === GameState.CLEAR;
    this.resultKicker.textContent = isClear
      ? "EXPEDITION COMPLETE"
      : "EXPEDITION ABORTED";
    this.resultTitle.textContent = isClear ? "STAGE CLEAR" : "MOVE LIMIT";
    this.resultMoves.textContent = String(game.moveCount);
    this.resultShortest.textContent = String(game.shortestMoves);
    this.resultHits.textContent = String(game.wallHitCount);
    this.resultRank.textContent = game.rank;
  }

  animate(event) {
    if (["wall", "boundary"].includes(event.type) || event.finalAction === "wall") {
      this.boardFrame.classList.remove("hit");
      void this.boardFrame.offsetWidth;
      this.boardFrame.classList.add("hit");
    }
  }
}
