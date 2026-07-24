import assert from "node:assert/strict";
import test from "node:test";

import { MazeGame } from "../js/game.js";
import { cellKey, findShortestPath, revealWithinRadius } from "../js/pathfinding.js";
import {
  countStageThreats,
  generateStage,
  STAGE_CONFIGS,
  WEAPONS,
} from "../js/stages.js";

function createTestStage(overrides = {}) {
  return {
    id: 90,
    name: "test",
    seed: 1,
    width: 5,
    height: 5,
    hp: 5,
    start: { x: 0, y: 4 },
    boss: { id: "boss", x: 4, y: 4 },
    walls: [],
    monsters: [],
    adventurer: { id: "adventurer", x: 4, y: 0, loot: [] },
    chests: [],
    traps: [],
    warp: null,
    torches: 1,
    lights: 1,
    startRoll: 2,
    ...overrides,
  };
}

test("four stages generate at 5x5, 6x6, 7x7, and 8x8", () => {
  const sizes = STAGE_CONFIGS.map((config, index) => {
    const stage = generateStage(config, 1000 + index);
    assert.ok(findShortestPath(stage, stage.start, stage.boss));
    return stage.width;
  });
  assert.deepEqual(sizes, [5, 6, 7, 8]);
});

test("every stage has a weapon chest and at most three monsters including boss", () => {
  for (const config of STAGE_CONFIGS) {
    for (let seed = 1; seed <= 40; seed += 1) {
      const stage = generateStage(config, seed);
      assert.equal(
        stage.chests.some((chest) => chest.content.type === "weapon"),
        true,
      );
      assert.ok(countStageThreats(stage) <= 3);
      assert.ok(findShortestPath(stage, stage.start, stage.boss));
    }
  }
});

test("8x8 has a sealed four-cell room reached by a warp", () => {
  const stage = generateStage(STAGE_CONFIGS[3], 42);
  assert.equal(stage.warp.roomCells.length, 4);
  assert.ok(findShortestPath(stage, stage.start, stage.warp.entry));
  assert.equal(findShortestPath(stage, stage.start, stage.warp.exit), null);
  assert.ok(["treasure", "monsterHouse"].includes(stage.warp.type));
});

test("the same seed creates the same dungeon and die roll", () => {
  const first = generateStage(STAGE_CONFIGS[2], 424242);
  const second = generateStage(STAGE_CONFIGS[2], 424242);
  assert.deepEqual(first, second);
});

test("movement is locked until the die result is confirmed", () => {
  const game = new MazeGame(createTestStage());
  assert.equal(game.move("right").type, "ignored");
  assert.deepEqual(game.player, { x: 0, y: 4 });
  assert.equal(game.start().type, "startConfirmed");
  assert.equal(game.move("right").type !== "ignored", true);
});

test("weapon limits remain sword 3, spear 2, bow 2", () => {
  assert.equal(WEAPONS.sword.uses, 3);
  assert.equal(WEAPONS.spear.uses, 2);
  assert.equal(WEAPONS.bow.uses, 2);
});

test("adventurer walks toward treasure and takes it", () => {
  const stage = createTestStage({
    adventurer: { id: "adventurer", x: 2, y: 2, loot: [] },
    chests: [
      { id: "chest-1", x: 2, y: 1, content: { type: "weapon", weaponId: "sword" } },
    ],
  });
  const game = new MazeGame(stage);
  const event = game.advanceWorld();
  assert.equal(event.type, "rivalLooted");
  assert.equal(game.openedChests.has("chest-1"), true);
  assert.equal(game.rivalLootCount, 1);
});

test("monster chooses the adventurer as the nearer target and can defeat the decoy", () => {
  const stage = createTestStage({
    monsters: [{ id: "monster-1", x: 2, y: 1 }],
    adventurer: { id: "adventurer", x: 2, y: 0, loot: [] },
  });
  const game = new MazeGame(stage);
  const event = game.advanceWorld();
  assert.equal(event.type, "monsterCaughtRival");
  assert.equal(game.adventurerAlive, false);
  assert.deepEqual(
    { x: game.monsters[0].x, y: game.monsters[0].y },
    { x: 2, y: 0 },
  );
});

test("mapped distant figures stay unknown until the player is adjacent", () => {
  const stage = createTestStage({
    monsters: [{ id: "monster-1", x: 2, y: 4 }],
  });
  const game = new MazeGame(stage);
  const monster = game.livingMonsters[0];
  game.mappedCells.add(cellKey(monster));
  assert.equal(game.isIdentityKnown(monster), false);
  game.player = { x: 1, y: 4 };
  game.updateIdentityKnowledge();
  assert.equal(game.isIdentityKnown(monster), true);
});

test("a sword or silver sword must finish the boss from an adjacent cell", () => {
  const stage = createTestStage({
    start: { x: 3, y: 4 },
    adventurer: { id: "adventurer", x: 0, y: 0, loot: [] },
  });
  const game = new MazeGame(stage);
  game.start();
  game.hasSilverSword = true;
  game.mappedCells.add("4,4");
  assert.equal(game.getAttackableEnemies().some((item) => item.kind === "boss"), true);
  const event = game.attack("4,4");
  assert.equal(event.type, "bossStrike");
  assert.equal(game.state, "clear");
});

test("spear is adjacent-capable while bow is not", () => {
  const stage = createTestStage({
    start: { x: 0, y: 2 },
    monsters: [
      { id: "near", x: 1, y: 2 },
      { id: "far", x: 0, y: 0 },
    ],
  });
  const spearGame = new MazeGame(stage);
  spearGame.start();
  spearGame.weapon = "spear";
  spearGame.weaponUses = 2;
  spearGame.mappedCells.add("1,2");
  spearGame.mappedCells.add("0,0");
  assert.deepEqual(
    new Set(spearGame.getAttackableEnemies().map(cellKey)),
    new Set(["1,2", "0,0"]),
  );

  const bowGame = new MazeGame(stage);
  bowGame.start();
  bowGame.weapon = "bow";
  bowGame.weaponUses = 2;
  bowGame.mappedCells.add("1,2");
  bowGame.mappedCells.add("0,0");
  const targets = new Set(bowGame.getAttackableEnemies().map(cellKey));
  assert.equal(targets.has("1,2"), false);
  assert.equal(targets.has("0,0"), true);
});

test("light reveals a wall but not the cell behind it", () => {
  const stage = createTestStage({
    start: { x: 0, y: 2 },
    walls: [{ x: 1, y: 2 }],
  });
  const visible = revealWithinRadius(stage, stage.start, 2);
  assert.equal(visible.has("1,2"), true);
  assert.equal(visible.has("2,2"), false);
});
