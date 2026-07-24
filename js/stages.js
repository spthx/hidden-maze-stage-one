export const WEAPONS = Object.freeze({
  sword: {
    id: "sword",
    name: "剣",
    mark: "剣",
    rangeMin: 1,
    rangeMax: 1,
    uses: 3,
    description: "隣接する敵を先制攻撃",
  },
  spear: {
    id: "spear",
    name: "ヤリ",
    mark: "槍",
    rangeMin: 1,
    rangeMax: 2,
    uses: 2,
    description: "直線2マスまで先制攻撃",
  },
  bow: {
    id: "bow",
    name: "弓",
    mark: "弓",
    rangeMin: 2,
    rangeMax: 4,
    uses: 2,
    description: "離れた敵を遠距離攻撃",
  },
});

export const STAGE_CONFIGS = Object.freeze([
  {
    id: 1,
    name: "石壁の入口",
    size: 5,
    hp: 5,
    wallDensity: 0.14,
    minimumBossDistance: 7,
    fieldMonsters: 1,
    traps: 0,
    chestContents: [{ type: "weapon", weaponId: "sword" }],
    torches: 1,
    lights: 0,
  },
  {
    id: 2,
    name: "二重の回廊",
    size: 6,
    hp: 5,
    wallDensity: 0.18,
    minimumBossDistance: 9,
    fieldMonsters: 2,
    traps: 1,
    chestContents: [
      { type: "weapon", weaponId: "spear" },
      { type: "companion" },
    ],
    torches: 1,
    lights: 1,
  },
  {
    id: 3,
    name: "遠見の大迷宮",
    size: 8,
    hp: 6,
    wallDensity: 0.21,
    minimumBossDistance: 12,
    fieldMonsters: 1,
    traps: 2,
    chestContents: [
      { type: "weapon", weaponId: "bow" },
      { type: "companion" },
      { type: "mimic" },
    ],
    torches: 1,
    lights: 1,
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
  const protectedKeys = new Set([
    key(start),
    key({ x: 1, y: size - 1 }),
    key({ x: 0, y: size - 2 }),
  ]);

  for (let attempt = 0; attempt < 400; attempt += 1) {
    const walls = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const position = { x, y };
        if (!protectedKeys.has(key(position)) && random() < config.wallDensity) {
          walls.push(position);
        }
      }
    }

    const reachable = getReachable(size, walls, start);
    const minimumFloorCount = Math.floor(size * size * 0.68);
    if (reachable.positions.size < minimumFloorCount) continue;

    const farCells = [...reachable.positions.entries()]
      .filter(([, position]) => key(position) !== key(start))
      .map(([positionKey, position]) => ({
        ...position,
        distance: reachable.distance.get(positionKey),
      }))
      .filter((position) => position.distance >= config.minimumBossDistance)
      .sort((a, b) => b.distance - a.distance);

    if (farCells.length === 0) continue;
    const bossPool = farCells.slice(0, Math.max(1, Math.ceil(farCells.length / 3)));
    const boss = bossPool[Math.floor(random() * bossPool.length)];

    const requiredCells =
      config.fieldMonsters + config.traps + config.chestContents.length;
    const available = shuffle(
      [...reachable.positions.values()].filter((position) => {
        const distance = reachable.distance.get(key(position));
        return key(position) !== key(start) && key(position) !== key(boss) && distance >= 2;
      }),
      random,
    );

    if (available.length < requiredCells) continue;
    return { start, boss: { x: boss.x, y: boss.y }, walls, available };
  }

  throw new Error(`ステージ${config.id}の自動生成に失敗しました。`);
}

export function generateStage(config, seed = Date.now()) {
  const normalizedSeed = Number(seed) >>> 0;
  const random = mulberry32(normalizedSeed);
  const layout = pickGeneratedLayout(config, random);
  const positions = [...layout.available];
  const takePosition = () => positions.shift();

  const monsters = Array.from({ length: config.fieldMonsters }, (_, index) => ({
    id: `monster-${index + 1}`,
    ...takePosition(),
  }));

  const shuffledContents = shuffle(config.chestContents, random);
  const chests = shuffledContents.map((content, index) => ({
    id: `chest-${index + 1}`,
    ...takePosition(),
    content: { ...content },
  }));

  const traps = Array.from({ length: config.traps }, (_, index) => ({
    id: `trap-${index + 1}`,
    ...takePosition(),
  }));

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
    chests,
    traps,
    torches: config.torches,
    lights: config.lights,
  };
}

export function countStageThreats(stage) {
  const mimicCount = stage.chests.filter((chest) => chest.content.type === "mimic").length;
  return 1 + stage.monsters.length + mimicCount;
}
