import {
  cellKey,
  createWallSet,
  hasClearOrthogonalLine,
  isInside,
  revealWithinRadius,
} from "./pathfinding.js";
import { WEAPONS } from "./stages.js";

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

export class MazeGame {
  constructor(stage) {
    this.stage = stage;
    this.wallSet = createWallSet(stage);
    this.state = GameState.PLAYING;
    this.player = { ...stage.start };
    this.maxHp = stage.hp;
    this.hp = stage.hp;
    this.weapon = null;
    this.weaponUses = 0;
    this.companion = false;
    this.torches = stage.torches;
    this.lights = stage.lights;
    this.moveCount = 0;
    this.attackCount = 0;
    this.defeatedMonsters = new Set();
    this.openedChests = new Set();
    this.disabledTraps = new Set();
    this.knownTraps = new Set();
    this.mappedCells = new Set();
    this.routeHistory = [{ ...this.player }];
    this.pendingChestId = null;
    this.lastEvent = { type: "start" };
    this.revealBaseArea();
  }

  get isFinished() {
    return this.state !== GameState.PLAYING;
  }

  get activeWeapon() {
    return this.weapon && this.weaponUses > 0 ? WEAPONS[this.weapon] : null;
  }

  get defeatedCount() {
    return this.defeatedMonsters.size;
  }

  get mapPercentage() {
    return Math.round((this.mappedCells.size / (this.stage.width * this.stage.height)) * 100);
  }

  get pendingChest() {
    return this.stage.chests.find((chest) => chest.id === this.pendingChestId) ?? null;
  }

  get livingMonsters() {
    const regular = this.stage.monsters
      .filter((monster) => !this.defeatedMonsters.has(monster.id))
      .map((monster) => ({ ...monster, kind: "monster" }));
    if (!this.defeatedMonsters.has(this.stage.boss.id)) {
      regular.push({ ...this.stage.boss, kind: "boss" });
    }
    return regular;
  }

  revealBaseArea() {
    this.mappedCells.add(cellKey(this.player));
    for (const direction of Object.values(DIRECTIONS)) {
      const next = {
        x: this.player.x + direction.x,
        y: this.player.y + direction.y,
      };
      if (isInside(this.stage, next)) this.mappedCells.add(cellKey(next));
    }
    this.updateCompanionKnowledge();
  }

  updateCompanionKnowledge() {
    if (!this.companion) return;
    for (const trap of this.stage.traps) {
      const distance =
        Math.abs(trap.x - this.player.x) + Math.abs(trap.y - this.player.y);
      if (distance <= 1 && !this.disabledTraps.has(trap.id)) {
        this.knownTraps.add(trap.id);
        this.mappedCells.add(cellKey(trap));
      }
    }
  }

  finishIfDead(event) {
    if (this.hp > 0) return event;
    this.hp = 0;
    this.state = GameState.GAME_OVER;
    return { ...event, finalAction: event.type, type: "gameOver" };
  }

  move(directionName) {
    if (
      this.state !== GameState.PLAYING ||
      this.pendingChestId ||
      !DIRECTIONS[directionName]
    ) {
      return { type: "ignored" };
    }

    const direction = DIRECTIONS[directionName];
    const target = {
      x: this.player.x + direction.x,
      y: this.player.y + direction.y,
    };

    if (!isInside(this.stage, target) || this.wallSet.has(cellKey(target))) {
      if (isInside(this.stage, target)) this.mappedCells.add(cellKey(target));
      this.lastEvent = { type: "wall" };
      return this.lastEvent;
    }

    const trap = this.stage.traps.find(
      (candidate) =>
        cellKey(candidate) === cellKey(target) &&
        !this.disabledTraps.has(candidate.id),
    );

    if (trap && this.companion) {
      this.knownTraps.add(trap.id);
      this.mappedCells.add(cellKey(trap));
      this.lastEvent = { type: "trapWarning" };
      return this.lastEvent;
    }

    const monster = this.stage.monsters.find(
      (candidate) =>
        cellKey(candidate) === cellKey(target) &&
        !this.defeatedMonsters.has(candidate.id),
    );
    const isBoss =
      cellKey(this.stage.boss) === cellKey(target) &&
      !this.defeatedMonsters.has(this.stage.boss.id);

    this.player = target;
    this.moveCount += 1;
    this.routeHistory.push({ ...this.player });
    this.revealBaseArea();

    let event = { type: "move" };

    if (monster) {
      this.defeatedMonsters.add(monster.id);
      this.hp -= 1;
      event = { type: "fistMonster", damage: 1 };
    } else if (isBoss) {
      this.defeatedMonsters.add(this.stage.boss.id);
      this.hp -= 2;
      event = { type: "fistBoss", damage: 2 };
      if (this.hp > 0) this.state = GameState.CLEAR;
    } else if (trap) {
      this.disabledTraps.add(trap.id);
      this.knownTraps.add(trap.id);
      this.hp -= 1;
      event = { type: "trap", damage: 1 };
    }

    event = this.finishIfDead(event);
    if (this.state === GameState.PLAYING) {
      const chest = this.stage.chests.find(
        (candidate) =>
          cellKey(candidate) === cellKey(this.player) &&
          !this.openedChests.has(candidate.id),
      );
      if (chest) {
        this.pendingChestId = chest.id;
        event = { type: "chestFound", chestId: chest.id };
      }
    }

    this.lastEvent = event;
    return event;
  }

  getAttackableEnemies() {
    const weapon = this.activeWeapon;
    if (!weapon || this.state !== GameState.PLAYING) return [];

    const livingKeys = new Set(this.livingMonsters.map(cellKey));
    return this.livingMonsters.filter((enemy) => {
      if (!this.mappedCells.has(cellKey(enemy))) return false;
      const distance =
        Math.abs(enemy.x - this.player.x) + Math.abs(enemy.y - this.player.y);
      if (distance < weapon.rangeMin || distance > weapon.rangeMax) return false;
      const blockers = new Set(livingKeys);
      blockers.delete(cellKey(enemy));
      return hasClearOrthogonalLine(
        this.stage,
        this.player,
        enemy,
        blockers,
      );
    });
  }

  attack(targetKey) {
    const target = this.getAttackableEnemies().find(
      (enemy) => cellKey(enemy) === targetKey,
    );
    if (!target) {
      this.lastEvent = { type: "invalidTarget" };
      return this.lastEvent;
    }

    this.weaponUses -= 1;
    this.attackCount += 1;
    this.defeatedMonsters.add(target.id);
    if (target.kind === "boss") {
      this.state = GameState.CLEAR;
      this.lastEvent = {
        type: "bossStrike",
        weaponId: this.weapon,
        depleted: this.weaponUses === 0,
      };
    } else {
      this.lastEvent = {
        type: "weaponStrike",
        weaponId: this.weapon,
        depleted: this.weaponUses === 0,
      };
    }
    return this.lastEvent;
  }

  useTorch() {
    if (this.torches <= 0 || this.state !== GameState.PLAYING) {
      return { type: "ignored" };
    }
    this.torches -= 1;
    for (const key of revealWithinRadius(this.stage, this.player, 1)) {
      this.mappedCells.add(key);
    }
    this.updateCompanionKnowledge();
    this.lastEvent = { type: "torch" };
    return this.lastEvent;
  }

  useLight() {
    if (this.lights <= 0 || this.state !== GameState.PLAYING) {
      return { type: "ignored" };
    }
    this.lights -= 1;
    for (const key of revealWithinRadius(this.stage, this.player, 2)) {
      this.mappedCells.add(key);
    }
    this.updateCompanionKnowledge();
    this.lastEvent = { type: "light" };
    return this.lastEvent;
  }

  openChest() {
    const chest = this.pendingChest;
    if (!chest || this.state !== GameState.PLAYING) return { type: "ignored" };

    this.openedChests.add(chest.id);
    this.pendingChestId = null;
    const content = chest.content;
    let event;

    if (content.type === "weapon") {
      this.weapon = content.weaponId;
      this.weaponUses = WEAPONS[content.weaponId].uses;
      event = { type: "weaponFound", weaponId: content.weaponId };
    } else if (content.type === "companion") {
      this.companion = true;
      this.updateCompanionKnowledge();
      event = { type: "companionFound" };
    } else if (content.type === "herb") {
      const recovered = Math.min(2, this.maxHp - this.hp);
      this.hp += recovered;
      event = { type: "herbFound", recovered };
    } else if (content.type === "torch") {
      this.torches += 1;
      event = { type: "torchFound" };
    } else if (content.type === "light") {
      this.lights += 1;
      event = { type: "lightFound" };
    } else {
      this.hp -= 1;
      this.defeatedMonsters.add(`mimic-${chest.id}`);
      event = this.finishIfDead({ type: "mimic", damage: 1 });
    }

    this.lastEvent = event;
    return event;
  }

  leaveChest() {
    if (!this.pendingChest) return { type: "ignored" };
    this.pendingChestId = null;
    this.lastEvent = { type: "chestLeft" };
    return this.lastEvent;
  }

  getChestWarning() {
    const chest = this.pendingChest;
    return Boolean(
      chest && this.companion && chest.content.type === "mimic",
    );
  }
}
