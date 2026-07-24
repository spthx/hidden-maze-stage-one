import assert from "node:assert/strict";
import test from "node:test";

import { MazeGame } from "../js/game.js";
import {
  cellKey,
  findShortestPath,
  revealWithinRadius,
} from "../js/pathfinding.js";
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
    start: { x: 0, y: 2 },
    boss: { id: "boss", x: 4, y: 4 },
    walls: [],
    monsters: [],
    chests: [],
    traps: [],
    torches: 1,
    lights: 1,
    ...overrides,
  };
}

test("three stages generate at 5x5, 6x6, and 8x8", () => {
  const sizes = STAGE_CONFIGS.map((config, index) => {
    const stage = generateStage(config, 1000 + index);
    assert.ok(findShortestPath(stage, stage.start, stage.boss));
    return stage.width;
  });
  assert.deepEqual(sizes, [5, 6, 8]);
});

test("every generated stage contains one weapon and no more than three threats", () => {
  for (const config of STAGE_CONFIGS) {
    for (let seed = 1; seed <= 30; seed += 1) {
      const stage = generateStage(config, seed);
      const weapons = stage.chests.filter(
        (chest) => chest.content.type === "weapon",
      );
      assert.equal(weapons.length, 1);
      assert.equal(stage.chests.length, config.chestContents.length);
      assert.ok(countStageThreats(stage) <= 3);
      assert.ok(findShortestPath(stage, stage.start, stage.boss));
    }
  }
});

test("the same seed creates the same dungeon", () => {
  const first = generateStage(STAGE_CONFIGS[2], 424242);
  const second = generateStage(STAGE_CONFIGS[2], 424242);
  assert.deepEqual(first, second);
});

test("weapon limits are sword 3, spear 2, bow 2", () => {
  assert.equal(WEAPONS.sword.uses, 3);
  assert.equal(WEAPONS.spear.uses, 2);
  assert.equal(WEAPONS.bow.uses, 2);
});

test("spear works at both adjacent and two-cell range", () => {
  const stage = createTestStage({
    monsters: [
      { id: "near", x: 1, y: 2 },
      { id: "far", x: 0, y: 0 },
    ],
  });
  const game = new MazeGame(stage);
  game.weapon = "spear";
  game.weaponUses = 2;
  game.mappedCells.add("1,2");
  game.mappedCells.add("0,0");

  const targets = new Set(game.getAttackableEnemies().map(cellKey));
  assert.equal(targets.has("1,2"), true);
  assert.equal(targets.has("0,0"), true);
});

test("bow cannot attack adjacent targets but reaches distant targets", () => {
  const stage = createTestStage({
    monsters: [
      { id: "near", x: 0, y: 1 },
      { id: "far", x: 3, y: 2 },
    ],
  });
  const game = new MazeGame(stage);
  game.weapon = "bow";
  game.weaponUses = 2;
  game.mappedCells.add("0,1");
  game.mappedCells.add("3,2");

  const targets = new Set(game.getAttackableEnemies().map(cellKey));
  assert.equal(targets.has("0,1"), false);
  assert.equal(targets.has("3,2"), true);
});

test("a first strike spends one use and prevents damage", () => {
  const stage = createTestStage({
    monsters: [{ id: "monster-1", x: 1, y: 2 }],
  });
  const game = new MazeGame(stage);
  game.weapon = "sword";
  game.weaponUses = 3;
  game.mappedCells.add("1,2");

  const event = game.attack("1,2");
  assert.equal(event.type, "weaponStrike");
  assert.equal(game.hp, 5);
  assert.equal(game.weaponUses, 2);
  assert.equal(game.defeatedMonsters.has("monster-1"), true);
});

test("walking into a monster defeats it but costs one HP", () => {
  const stage = createTestStage({
    monsters: [{ id: "monster-1", x: 1, y: 2 }],
  });
  const game = new MazeGame(stage);

  const event = game.move("right");
  assert.equal(event.type, "fistMonster");
  assert.equal(game.hp, 4);
  assert.equal(game.defeatedMonsters.has("monster-1"), true);
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

test("a companion identifies a mimic before opening the chest", () => {
  const stage = createTestStage({
    chests: [
      {
        id: "chest-1",
        x: 1,
        y: 2,
        content: { type: "mimic" },
      },
    ],
  });
  const game = new MazeGame(stage);
  game.companion = true;
  game.move("right");

  assert.equal(game.pendingChestId, "chest-1");
  assert.equal(game.getChestWarning(), true);
});
