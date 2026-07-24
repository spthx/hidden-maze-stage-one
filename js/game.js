import {
  cellKey,
  createWallSet,
  isInside,
  validateStage,
} from "./pathfinding.js";

export const GameState = Object.freeze({
  PLAYING: "playing",
  CLEAR: "clear",
  GAME_OVER: "gameOver",
});

export const DIRECTIONS = Object.freeze({
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
});

function manhattanDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export class MazeGame {
  constructor(stage) {
    this.stage = stage;
    this.shortestPath = validateStage(stage);
    this.shortestMoves = this.shortestPath.length - 1;
    this.wallSet = createWallSet(stage);
    this.reset();
  }

  reset() {
    this.state = GameState.PLAYING;
    this.player = { ...this.stage.start };
    this.remainingMoves = this.stage.moveLimit;
    this.moveCount = 0;
    this.wallHitCount = 0;
    this.distance = manhattanDistance(this.player, this.stage.exit);
    this.discoveredWalls = new Set();
    this.visitedCells = new Set([cellKey(this.player)]);
    this.routeHistory = [{ ...this.player }];
    this.lastEvent = { type: "start", distanceDelta: 0 };
  }

  move(directionName) {
    if (this.state !== GameState.PLAYING) {
      return { type: "ignored", distanceDelta: 0 };
    }

    const direction = DIRECTIONS[directionName];
    if (!direction) {
      throw new Error(`不明な移動方向です: ${directionName}`);
    }

    const target = {
      x: this.player.x + direction.x,
      y: this.player.y + direction.y,
    };

    this.moveCount += 1;
    this.remainingMoves = Math.max(0, this.stage.moveLimit - this.moveCount);

    let event;

    if (!isInside(this.stage, target)) {
      this.wallHitCount += 1;
      event = { type: "boundary", distanceDelta: 0 };
    } else if (this.wallSet.has(cellKey(target))) {
      this.wallHitCount += 1;
      this.discoveredWalls.add(cellKey(target));
      event = {
        type: "wall",
        target: { ...target },
        distanceDelta: 0,
      };
    } else {
      const previousDistance = this.distance;
      this.player = target;
      this.distance = manhattanDistance(this.player, this.stage.exit);
      this.visitedCells.add(cellKey(this.player));
      this.routeHistory.push({ ...this.player });

      event = {
        type: "move",
        target: { ...target },
        distanceDelta: this.distance - previousDistance,
      };

      if (cellKey(this.player) === cellKey(this.stage.exit)) {
        this.state = GameState.CLEAR;
        event.type = "clear";
      }
    }

    // 最後の一手で出口へ着いた場合は、ゲームオーバーよりクリアを優先する。
    if (this.state !== GameState.CLEAR && this.remainingMoves === 0) {
      this.state = GameState.GAME_OVER;
      event = {
        ...event,
        finalAction: event.type,
        type: "gameOver",
      };
    }

    this.lastEvent = event;
    return event;
  }

  get isFinished() {
    return this.state !== GameState.PLAYING;
  }

  get rank() {
    if (this.state !== GameState.CLEAR) {
      return "—";
    }

    const excessMoves = Math.max(0, this.moveCount - this.shortestMoves);
    if (excessMoves <= 2) return "S";
    if (excessMoves <= 5) return "A";
    if (excessMoves <= 9) return "B";
    return "C";
  }
}
