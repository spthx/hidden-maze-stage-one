export const WEAPONS = Object.freeze({
  sword: {
    id: "sword",
    name: "剣",
    rangeMin: 1,
    rangeMax: 1,
    uses: 3,
    description: "隣接する相手へ先制攻撃",
  },
  spear: {
    id: "spear",
    name: "ヤリ",
    rangeMin: 1,
    rangeMax: 2,
    uses: 2,
    description: "直線2マスまで先制攻撃",
  },
  bow: {
    id: "bow",
    name: "弓",
    rangeMin: 2,
    rangeMax: 4,
    uses: 2,
    description: "隣接不可・直線4マスまで先制攻撃",
  },
});

export const STAGE_CONFIGS = Object.freeze([
  {
    id: 1,
    name: "石壁の入口",
    size: 5,
    hp: 5,
    wallDensity: 0.1,
    minimumBossDistance: 6,
    weaponId: "sword",
    extraChests: [],
    torches: 1,
    lights: 0,
  },
  {
    id: 2,
    name: "競争者の回廊",
    size: 6,
    hp: 5,
    wallDensity: 0.13,
    minimumBossDistance: 8,
    weaponId: "spear",
    extraChests: [{ type: "silverSword" }],
    torches: 1,
    lights: 1,
  },
  {
    id: 3,
    name: "追跡者の迷宮",
    size: 7,
    hp: 6,
    wallDensity: 0.16,
    minimumBossDistance: 10,
    weaponId: "bow",
    extraChests: [{ type: "silverSword" }, { type: "herb" }],
    torches: 1,
    lights: 1,
  },
  {
    id: 4,
    name: "転移の深層",
    size: 8,
    hp: 6,
    wallDensity: 0.18,
    minimumBossDistance: 11,
    weaponId: "bow",
    extraChests: [{ type: "silverSword" }, { type: "torch" }],
    torches: 1,
    lights: 1,
    hiddenRoom: true,
  },
]);

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function key(position) {
  return `${position.x},${position.y}`;
}

function shuffle(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function roomGeometry(size) {
  return {
    roomCells: [
      { x: size - 2, y: 0 },
      { x: size - 1, y: 0 },
      { x: size - 2, y: 1 },
      { x: size - 1, y: 1 },
    ],
    sealWalls: [
      { x: size - 3, y: 0 },
      { x: size - 3, y: 1 },
      { x: size - 2, y: 2 },
      { x: size - 1, y: 2 },
    ],
  };
}

function getReachable(size, walls, start) {
  const wallKeys = new Set(walls.map(key));
  const queue = [{ ...start }];
  const distance = new Map([[key(start), 0]]);
  const positions = new Map([[key(start), { ...start }]]);
  const offsets = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    const currentDistance = distance.get(key(current));
    for (const offset of offsets) {
      const next = { x: current.x + offset.x, y: current.y + offset.y };
      const nextKey = key(next);
      if (
        next.x < 0 ||
        next.y < 0 ||
        next.x >= size ||
        next.y >= size ||
        wallKeys.has(nextKey) ||
        distance.has(nextKey)
      ) {
        continue;
      }
      distance.set(nextKey, currentDistance + 1);
      positions.set(nextKey, next);
      queue.push(next);
    }
  }
  return { distance, positions };
}

function pickGeneratedLayout(config, random) {
  const size = config.size;
  const start = { x: 0, y: size - 1 };
  const hidden = config.hiddenRoom ? roomGeometry(size) : null;
  const fixedWalls = hidden?.sealWalls ?? [];
  const forbiddenKeys = new Set([
    key(start),
    key({ x: 1, y: size - 1 }),
    key({ x: 0, y: size - 2 }),
    ...fixedWalls.map(key),
    ...(hidden?.roomCells ?? []).map(key),
  ]);

  for (let attempt = 0; attempt < 500; attempt += 1) {
    const walls = [...fixedWalls];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const position = { x, y };
        if (!forbiddenKeys.has(key(position)) && random() < config.wallDensity) {
          walls.push(position);
        }
      }
    }

    const reachable = getReachable(size, walls, start);
    const playableCells = size * size - (hidden ? 8 : 0);
    if (reachable.positions.size < Math.floor(playableCells * 0.68)) continue;

    const farCells = [...reachable.positions.entries()]
      .filter(([positionKey]) => positionKey !== key(start))
      .map(([positionKey, position]) => ({
        ...position,
        distance: reachable.distance.get(positionKey),
      }))
      .filter((position) => position.distance >= config.minimumBossDistance)
      .sort((a, b) => b.distance - a.distance);
    if (farCells.length === 0) continue;

    const bossPoolSize = Math.max(1, Math.ceil(farCells.length / 3));
    const boss = farCells[Math.floor(random() * bossPoolSize)];
    const available = shuffle(
      [...reachable.positions.values()].filter((position) => {
        const distance = reachable.distance.get(key(position));
        return key(position) !== key(start) && key(position) !== key(boss) && distance >= 2;
      }),
      random,
    );
    const needed = 3 + config.extraChests.length + (hidden ? 1 : 0);
    if (available.length < needed) continue;
    return {
      start,
      boss: { x: boss.x, y: boss.y },
      walls,
      available,
      hidden,
    };
  }
  throw new Error(`ステージ${config.id}の自動生成に失敗しました。`);
}

export function generateStage(config, seed = Date.now()) {
  const normalizedSeed = Number(seed) >>> 0;
  const random = mulberry32(normalizedSeed);
  const layout = pickGeneratedLayout(config, random);
  const positions = [...layout.available];
  const takePosition = () => positions.shift();

  const monsters = [{ id: "monster-1", ...takePosition() }];
  const adventurer = { id: "adventurer", ...takePosition(), loot: [] };
  const contents = shuffle(
    [{ type: "weapon", weaponId: config.weaponId }, ...config.extraChests],
    random,
  );
  const chests = contents.map((content, index) => ({
    id: `chest-${index + 1}`,
    ...takePosition(),
    content: { ...content },
  }));

  let warp = null;
  if (layout.hidden) {
    const roomType = random() < 0.5 ? "treasure" : "monsterHouse";
    warp = {
      entry: takePosition(),
      exit: layout.hidden.roomCells[2],
      roomCells: layout.hidden.roomCells,
      type: roomType,
    };
    if (roomType === "treasure") {
      chests.push({
        id: "hidden-chest",
        ...layout.hidden.roomCells[1],
        content: { type: random() < 0.5 ? "herb" : "light" },
        hiddenRoom: true,
      });
    } else {
      monsters.push({
        id: "room-monster",
        ...layout.hidden.roomCells[1],
        hiddenRoom: true,
      });
    }
  }

  return {
    id: config.id,
    name: config.name,
    seed: normalizedSeed,
    width: config.size,
    height: config.size,
    hp: config.hp,
    start: layout.start,
    boss: { id: "boss", ...layout.boss },
    walls: layout.walls,
    monsters,
    adventurer,
    chests,
    traps: [],
    warp,
    torches: config.torches,
    lights: config.lights,
    startRoll: (normalizedSeed % 6) + 1,
  };
}

export function countStageThreats(stage) {
  return 1 + stage.monsters.length;
}
