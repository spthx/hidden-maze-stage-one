import {
  cellKey,
  createWallSet,
  findShortestPath,
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

const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export class MazeGame {
  constructor(stage) {
    this.stage = stage;
    this.wallSet = createWallSet(stage);
    this.state = GameState.PLAYING;
    this.started = false;
    this.facing = "up";
    this.player = { ...stage.start };
    this.maxHp = stage.hp;
    this.hp = stage.hp;
    this.weapon = null;
    this.weaponUses = 0;
    this.hasSilverSword = false;
    this.torches = stage.torches;
    this.lights = stage.lights;
    this.moveCount = 0;
    this.attackCount = 0;
    this.defeatedMonsters = new Set();
    this.openedChests = new Set();
    this.mappedCells = new Set();
    this.knownIdentities = new Set();
    this.routeHistory = [{ ...this.player }];
    this.pendingChestId = null;
    this.monsters = stage.monsters.map((monster) => ({ ...monster }));
    this.adventurer = { ...stage.adventurer, loot: [] };
    this.adventurerAlive = true;
    this.droppedChests = [];
    this.lastWorldEvents = [];
    this.lastEvent = { type: "diceReady" };
    this.applyStartRoll();
    this.revealBaseArea();
  }

  get isFinished() {
    return this.state !== GameState.PLAYING;
  }

  get activeWeapon() {
    return this.weapon && this.weaponUses > 0 ? WEAPONS[this.weapon] : null;
  }

  get canDefeatBoss() {
    return (
      this.hasSilverSword ||
      (this.weapon === "sword" && this.weaponUses > 0)
    );
  }

  defeatBoss() {
    if (!this.canDefeatBoss) return false;
    if (this.hasSilverSword) this.hasSilverSword = false;
    else this.weaponUses -= 1;
    this.defeatedMonsters.add(this.stage.boss.id);
    this.attackCount += 1;
    this.state = GameState.CLEAR;
    return true;
  }

  get mapPercentage() {
    return Math.round((this.mappedCells.size / (this.stage.width * this.stage.height)) * 100);
  }

  get allChests() {
    return [...this.stage.chests, ...this.droppedChests];
  }

  get pendingChest() {
    return this.allChests.find((chest) => chest.id === this.pendingChestId) ?? null;
  }

  get livingMonsters() {
    return this.monsters
      .filter((monster) => !this.defeatedMonsters.has(monster.id))
      .map((monster) => ({ ...monster, kind: "monster" }));
  }

  get livingEntities() {
    const entities = [...this.livingMonsters];
    if (!this.defeatedMonsters.has(this.stage.boss.id)) {
      entities.push({ ...this.stage.boss, kind: "boss" });
    }
    if (this.adventurerAlive) {
      entities.push({ ...this.adventurer, kind: "adventurer" });
    }
    return entities;
  }

  get rivalLootCount() {
    return this.adventurerAlive ? this.adventurer.loot.length : 0;
  }

  applyStartRoll() {
    const roll = this.stage.startRoll;
    const effects = {
      1: ["深い闇", "松明を1つ失った"],
      2: ["旅人の地図", "宝箱を1つ発見"],
      3: ["魔物活性", "毎ターン、モンスターが2歩動く"],
      4: ["追い風", "松明を1つ獲得"],
      5: ["先行者", "毎ターン、冒険者が2歩動く"],
      6: ["銀の導き", "銀の剣の場所を発見"],
    };
    const [name, description] = effects[roll];
    this.dieEffect = { roll, name, description };
    if (roll === 1) this.torches = Math.max(0, this.torches - 1);
    if (roll === 4) this.torches += 1;
    if (roll === 2 && this.stage.chests[0]) {
      this.mappedCells.add(cellKey(this.stage.chests[0]));
    }
    if (roll === 6) {
      const silver = this.stage.chests.find((chest) => chest.content.type === "silverSword");
      if (silver) this.mappedCells.add(cellKey(silver));
    }
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
    this.updateIdentityKnowledge();
  }

  updateIdentityKnowledge() {
    for (const entity of this.livingEntities) {
      if (distance(entity, this.player) <= 1) this.knownIdentities.add(entity.id);
    }
  }

  isIdentityKnown(entity) {
    return this.knownIdentities.has(entity.id) || distance(entity, this.player) <= 1;
  }

  start() {
    if (this.started || this.state !== GameState.PLAYING) return { type: "ignored" };
    this.started = true;
    return this.remember({ type: "startConfirmed" });
  }

  finishIfDead(event) {
    if (this.hp > 0) return event;
    this.hp = 0;
    this.state = GameState.GAME_OVER;
    return { ...event, finalAction: event.type, type: "gameOver" };
  }

  move(directionName) {
    if (
      !this.started ||
      this.state !== GameState.PLAYING ||
      this.pendingChestId ||
      !DIRECTIONS[directionName]
    ) {
      return { type: "ignored" };
    }

    const direction = DIRECTIONS[directionName];
    this.facing = directionName;
    const target = {
      x: this.player.x + direction.x,
      y: this.player.y + direction.y,
    };
    if (!isInside(this.stage, target) || this.wallSet.has(cellKey(target))) {
      if (isInside(this.stage, target)) this.mappedCells.add(cellKey(target));
      return this.remember({ type: "wall" });
    }

    const targetEntity = this.livingEntities.find(
      (entity) => cellKey(entity) === cellKey(target),
    );
    if (targetEntity?.kind === "boss") {
      this.knownIdentities.add(targetEntity.id);
      this.moveCount += 1;
      if (this.defeatBoss()) {
        return this.remember({
          type: "bossStrike",
          contactAttack: true,
          worldEvents: [],
        });
      }
      this.hp -= 2;
      const event = this.finishIfDead({ type: "bossRepels", damage: 2 });
      if (!this.isFinished) {
        this.advanceWorld();
      } else {
        this.lastWorldEvents = [];
      }
      return this.remember({
        ...event,
        worldEvents: [...this.lastWorldEvents],
      });
    }

    this.player = target;
    this.moveCount += 1;
    this.routeHistory.push({ ...this.player });
    let event = { type: "move" };
    let worldEvents = [];

    if (targetEntity?.kind === "monster") {
      this.defeatedMonsters.add(targetEntity.id);
      this.hp -= 1;
      event = this.finishIfDead({ type: "fistMonster", damage: 1 });
    } else if (targetEntity?.kind === "adventurer") {
      this.defeatAdventurer();
      this.hp -= 1;
      event = this.finishIfDead({ type: "fistAdventurer", damage: 1 });
    }

    if (!this.isFinished) {
      event = this.applyWarp(event);
      this.revealBaseArea();
      const chest = this.findUnopenedChestAt(this.player);
      if (chest) {
        this.pendingChestId = chest.id;
        event = { type: "chestFound", chestId: chest.id };
      } else {
        this.advanceWorld();
        worldEvents = [...this.lastWorldEvents];
      }
    }
    return this.remember({ ...event, playerMoved: true, worldEvents });
  }

  applyWarp(event) {
    const warp = this.stage.warp;
    if (!warp) return event;
    if (cellKey(this.player) === cellKey(warp.entry)) {
      this.player = { ...warp.exit };
      warp.roomCells.forEach((cell) => this.mappedCells.add(cellKey(cell)));
      this.routeHistory.push({ ...this.player });
      return { type: "warpIn", roomType: warp.type };
    }
    if (cellKey(this.player) === cellKey(warp.exit) && this.routeHistory.length > 1) {
      const previous = this.routeHistory[this.routeHistory.length - 2];
      const cameFromWarp = cellKey(previous) === cellKey(warp.entry);
      if (!cameFromWarp) {
        this.player = { ...warp.entry };
        this.routeHistory.push({ ...this.player });
        return { type: "warpOut" };
      }
    }
    return event;
  }

  findUnopenedChestAt(position) {
    return this.allChests.find(
      (chest) =>
        cellKey(chest) === cellKey(position) &&
        !this.openedChests.has(chest.id),
    );
  }

  remember(event) {
    this.lastEvent = event;
    return event;
  }

  getAttackableEnemies() {
    if (!this.started || this.state !== GameState.PLAYING) return [];
    const weapon = this.activeWeapon;
    const livingKeys = new Set(this.livingEntities.map(cellKey));
    return this.livingEntities.filter((enemy) => {
      if (!this.mappedCells.has(cellKey(enemy))) return false;
      const enemyDistance = distance(enemy, this.player);
      if (
        enemy.kind === "boss" &&
        enemyDistance === 1 &&
        this.canDefeatBoss
      ) {
        return true;
      }
      if (!weapon || enemyDistance < weapon.rangeMin || enemyDistance > weapon.rangeMax) {
        return false;
      }
      const blockers = new Set(livingKeys);
      blockers.delete(cellKey(enemy));
      return hasClearOrthogonalLine(this.stage, this.player, enemy, blockers);
    });
  }

  attack(targetKey) {
    const target = this.getAttackableEnemies().find(
      (enemy) => cellKey(enemy) === targetKey,
    );
    if (!target) return this.remember({ type: "invalidTarget" });

    const bossFinisher =
      target.kind === "boss" &&
      distance(target, this.player) === 1 &&
      this.canDefeatBoss;

    if (bossFinisher) {
      this.defeatBoss();
      return this.remember({ type: "bossStrike", worldEvents: [] });
    }

    this.attackCount += 1;
    this.weaponUses -= 1;
    if (target.kind === "boss") {
      const event = {
        type: "bossResists",
        depleted: this.weaponUses === 0,
      };
      this.advanceWorld();
      return this.remember({
        ...event,
        worldEvents: [...this.lastWorldEvents],
      });
    }

    if (target.kind === "adventurer") {
      this.defeatAdventurer();
      const event = {
        type: "adventurerStrike",
        depleted: this.weaponUses === 0,
      };
      this.advanceWorld();
      return this.remember({
        ...event,
        worldEvents: [...this.lastWorldEvents],
      });
    }

    this.defeatedMonsters.add(target.id);
    const event = {
      type: "weaponStrike",
      depleted: this.weaponUses === 0,
    };
    this.advanceWorld();
    return this.remember({
      ...event,
      worldEvents: [...this.lastWorldEvents],
    });
  }

  defeatAdventurer() {
    if (!this.adventurerAlive) return;
    this.adventurerAlive = false;
    if (this.adventurer.loot.length > 0) {
      this.droppedChests.push({
        id: "rival-drop",
        x: this.adventurer.x,
        y: this.adventurer.y,
        content: { type: "bundle", items: [...this.adventurer.loot] },
      });
    }
  }

  advanceWorld() {
    this.lastWorldEvents = [];
    if (this.isFinished) return null;
    let event = null;
    const rivalSteps = this.stage.startRoll === 5 ? 2 : 1;
    for (let step = 0; step < rivalSteps; step += 1) {
      const rivalEvent = this.moveAdventurer();
      if (rivalEvent) event = rivalEvent;
    }

    const monsterSteps = this.stage.startRoll === 3 ? 2 : 1;
    for (let step = 0; step < monsterSteps; step += 1) {
      const monsterEvent = this.moveMonsters();
      if (monsterEvent) event = monsterEvent;
      if (this.isFinished) break;
    }
    this.updateIdentityKnowledge();
    return event;
  }

  moveAdventurer() {
    if (!this.adventurerAlive) return null;
    const candidates = this.allChests
      .filter(
        (chest) =>
          !this.openedChests.has(chest.id) &&
          chest.id !== this.pendingChestId &&
          !chest.hiddenRoom,
      )
      .map((chest) => ({
        chest,
        path: findShortestPath(this.stage, this.adventurer, chest),
      }))
      .filter((candidate) => candidate.path?.length > 1)
      .sort((a, b) => a.path.length - b.path.length);
    if (candidates.length === 0) return null;

    const next = candidates[0].path[1];
    const from = { x: this.adventurer.x, y: this.adventurer.y };
    const occupied = new Set([
      cellKey(this.player),
      cellKey(this.stage.boss),
      ...this.livingMonsters.map(cellKey),
    ]);
    if (!occupied.has(cellKey(next))) {
      this.adventurer.x = next.x;
      this.adventurer.y = next.y;
      this.lastWorldEvents.push({
        type: "rivalMove",
        from,
        to: { x: next.x, y: next.y },
      });
    }

    const chest = this.findUnopenedChestAt(this.adventurer);
    if (!chest || chest.id === this.pendingChestId) return null;
    this.openedChests.add(chest.id);
    this.adventurer.loot.push(chest.content);
    const event = {
      type: "rivalLooted",
      lootCount: this.adventurer.loot.length,
      itemType: chest.content.type,
      weaponId: chest.content.weaponId ?? null,
      bossWeapon:
        chest.content.type === "silverSword" ||
        (chest.content.type === "weapon" &&
          chest.content.weaponId === "sword"),
    };
    this.lastWorldEvents.push(event);
    return event;
  }

  moveMonsters() {
    let event = null;
    const occupiedMonsters = new Set(this.livingMonsters.map(cellKey));
    for (const monster of this.monsters) {
      if (this.defeatedMonsters.has(monster.id)) continue;
      const from = { x: monster.x, y: monster.y };
      const inHiddenRoom = Boolean(monster.hiddenRoom);
      const targets = [];
      const playerInRoom = this.stage.warp?.roomCells.some(
        (cell) => cellKey(cell) === cellKey(this.player),
      );
      if (inHiddenRoom && playerInRoom) targets.push({ kind: "player", ...this.player });
      if (!inHiddenRoom && !playerInRoom) targets.push({ kind: "player", ...this.player });
      if (!inHiddenRoom && this.adventurerAlive) {
        targets.push({ kind: "adventurer", ...this.adventurer });
      }
      const routes = targets
        .map((target) => ({
          target,
          path: findShortestPath(this.stage, monster, target),
        }))
        .filter((candidate) => candidate.path?.length > 1)
        .sort((a, b) => a.path.length - b.path.length);
      if (routes.length === 0) continue;

      const { target, path } = routes[0];
      const next = path[1];
      occupiedMonsters.delete(cellKey(monster));
      if (cellKey(next) === cellKey(this.player)) {
        this.hp -= 1;
        event = this.finishIfDead({ type: "monsterHitPlayer", damage: 1 });
        this.lastWorldEvents.push(event);
      } else if (
        target.kind === "adventurer" &&
        this.adventurerAlive &&
        cellKey(next) === cellKey(this.adventurer)
      ) {
        monster.x = next.x;
        monster.y = next.y;
        this.lastWorldEvents.push({
          type: "monsterMove",
          monsterId: monster.id,
          from,
          to: { x: next.x, y: next.y },
        });
        this.defeatAdventurer();
        event = { type: "monsterCaughtRival" };
        this.lastWorldEvents.push(event);
      } else if (
        !occupiedMonsters.has(cellKey(next)) &&
        cellKey(next) !== cellKey(this.stage.boss)
      ) {
        monster.x = next.x;
        monster.y = next.y;
        this.lastWorldEvents.push({
          type: "monsterMove",
          monsterId: monster.id,
          from,
          to: { x: next.x, y: next.y },
        });
      }
      occupiedMonsters.add(cellKey(monster));
      if (this.isFinished) break;
    }
    return event;
  }

  useTorch() {
    if (!this.started || this.torches <= 0 || this.state !== GameState.PLAYING) {
      return { type: "ignored" };
    }
    this.torches -= 1;
    for (const key of revealWithinRadius(this.stage, this.player, 1)) {
      this.mappedCells.add(key);
    }
    this.updateIdentityKnowledge();
    this.advanceWorld();
    return this.remember({
      type: "torch",
      worldEvents: [...this.lastWorldEvents],
    });
  }

  useLight() {
    if (!this.started || this.lights <= 0 || this.state !== GameState.PLAYING) {
      return { type: "ignored" };
    }
    this.lights -= 1;
    for (const key of revealWithinRadius(this.stage, this.player, 2)) {
      this.mappedCells.add(key);
    }
    this.updateIdentityKnowledge();
    this.advanceWorld();
    return this.remember({
      type: "light",
      worldEvents: [...this.lastWorldEvents],
    });
  }

  applyChestItem(content) {
    if (content.type === "weapon") {
      this.weapon = content.weaponId;
      this.weaponUses = WEAPONS[content.weaponId].uses;
      return { type: "weaponFound", weaponId: content.weaponId };
    }
    if (content.type === "silverSword") {
      this.hasSilverSword = true;
      return { type: "silverSwordFound" };
    }
    if (content.type === "herb") {
      const recovered = Math.min(2, this.maxHp - this.hp);
      this.hp += recovered;
      return { type: "herbFound", recovered };
    }
    if (content.type === "torch") {
      this.torches += 1;
      return { type: "torchFound" };
    }
    if (content.type === "light") {
      this.lights += 1;
      return { type: "lightFound" };
    }
    return { type: "chestEmpty" };
  }

  openChest() {
    const chest = this.pendingChest;
    if (!chest || this.state !== GameState.PLAYING) return { type: "ignored" };
    this.openedChests.add(chest.id);
    this.pendingChestId = null;
    const items = chest.content.type === "bundle" ? chest.content.items : [chest.content];
    let event = { type: "chestEmpty" };
    for (const item of items) event = this.applyChestItem(item);
    this.advanceWorld();
    return this.remember({
      ...event,
      worldEvents: [...this.lastWorldEvents],
    });
  }

  leaveChest() {
    if (!this.pendingChest) return { type: "ignored" };
    this.pendingChestId = null;
    this.advanceWorld();
    return this.remember({
      type: "chestLeft",
      worldEvents: [...this.lastWorldEvents],
    });
  }
}
