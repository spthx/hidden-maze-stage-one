export function cellKey(position) {
  return `${position.x},${position.y}`;
}

export function isInside(stage, position) {
  return (
    position.x >= 0 &&
    position.y >= 0 &&
    position.x < stage.width &&
    position.y < stage.height
  );
}

export function createWallSet(stage) {
  return new Set(stage.walls.map(cellKey));
}

const NEIGHBORS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export function findShortestPath(stage) {
  const wallSet = createWallSet(stage);
  const startKey = cellKey(stage.start);
  const exitKey = cellKey(stage.exit);
  const queue = [{ ...stage.start }];
  const previous = new Map([[startKey, null]]);

  while (queue.length > 0) {
    const current = queue.shift();
    const currentKey = cellKey(current);

    if (currentKey === exitKey) {
      const path = [];
      let cursor = currentKey;

      while (cursor !== null) {
        const [x, y] = cursor.split(",").map(Number);
        path.push({ x, y });
        cursor = previous.get(cursor);
      }

      return path.reverse();
    }

    for (const offset of NEIGHBORS) {
      const next = {
        x: current.x + offset.x,
        y: current.y + offset.y,
      };
      const nextKey = cellKey(next);

      if (
        isInside(stage, next) &&
        !wallSet.has(nextKey) &&
        !previous.has(nextKey)
      ) {
        previous.set(nextKey, currentKey);
        queue.push(next);
      }
    }
  }

  return null;
}

export function validateStage(stage) {
  if (!Number.isInteger(stage.width) || !Number.isInteger(stage.height)) {
    throw new Error("盤面サイズが不正です。");
  }

  if (!isInside(stage, stage.start) || !isInside(stage, stage.exit)) {
    throw new Error("スタートまたは出口が盤面外です。");
  }

  if (cellKey(stage.start) === cellKey(stage.exit)) {
    throw new Error("スタートと出口が同じです。");
  }

  const wallSet = createWallSet(stage);
  if (wallSet.size !== stage.walls.length) {
    throw new Error("壁座標が重複しています。");
  }

  for (const wall of stage.walls) {
    if (!isInside(stage, wall)) {
      throw new Error(`盤面外の壁があります: ${cellKey(wall)}`);
    }
  }

  if (wallSet.has(cellKey(stage.start)) || wallSet.has(cellKey(stage.exit))) {
    throw new Error("スタートまたは出口が壁になっています。");
  }

  const shortestPath = findShortestPath(stage);
  if (!shortestPath) {
    throw new Error("出口へ到達できないステージです。");
  }

  if (shortestPath.length - 1 < 4) {
    throw new Error("最短経路が短すぎます。");
  }

  return shortestPath;
}
