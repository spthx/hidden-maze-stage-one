import assert from "node:assert/strict";
import test from "node:test";

import { GameState, MazeGame } from "../js/game.js";
import { findShortestPath, validateStage } from "../js/pathfinding.js";
import { prototypeStage } from "../js/stages.js";

test("prototype stage is reachable in 13 shortest moves", () => {
  assert.doesNotThrow(() => validateStage(prototypeStage));
  assert.equal(findShortestPath(prototypeStage).length - 1, 13);
});

test("hitting a wall consumes one move and discovers it", () => {
  const game = new MazeGame(prototypeStage);
  const event = game.move("up");

  assert.equal(event.type, "wall");
  assert.deepEqual(game.player, prototypeStage.start);
  assert.equal(game.remainingMoves, 19);
  assert.equal(game.wallHitCount, 1);
  assert.equal(game.discoveredWalls.has("0,4"), true);
});

test("the shortest route clears the stage with an S rank", () => {
  const game = new MazeGame(prototypeStage);
  const route = "RRUULLUUURRRR";
  const direction = { R: "right", U: "up", L: "left", D: "down" };

  for (const step of route) game.move(direction[step]);

  assert.equal(game.state, GameState.CLEAR);
  assert.equal(game.moveCount, 13);
  assert.equal(game.remainingMoves, 7);
  assert.equal(game.rank, "S");
});

test("reaching the exit on the last move takes priority over game over", () => {
  const lastMoveStage = {
    id: 99,
    width: 5,
    height: 2,
    moveLimit: 4,
    start: { x: 0, y: 0 },
    exit: { x: 4, y: 0 },
    walls: [],
  };
  const game = new MazeGame(lastMoveStage);

  game.move("right");
  game.move("right");
  game.move("right");
  const event = game.move("right");

  assert.equal(event.type, "clear");
  assert.equal(game.remainingMoves, 0);
  assert.equal(game.state, GameState.CLEAR);
});

test("running out of moves causes game over", () => {
  const shortLimitStage = {
    ...prototypeStage,
    moveLimit: 1,
  };
  const game = new MazeGame(shortLimitStage);

  const event = game.move("up");

  assert.equal(event.type, "gameOver");
  assert.equal(event.finalAction, "wall");
  assert.equal(game.state, GameState.GAME_OVER);
});
