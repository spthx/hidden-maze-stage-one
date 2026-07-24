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

export function findShortestPath(stage, start, goal, blocked = new Set()) {
  const wallSet = createWallSet(stage);
  const startKey = cellKey(start);
  const goalKey = cellKey(goal);
  const queue = [{ ...start }];
  const previous = new Map([[startKey, null]]);
  const offsets = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    const currentKey = cellKey(current);
    if (currentKey === goalKey) {
      const path = [];
      let cursor = currentKey;
      while (cursor !== null) {
        const [x, y] = cursor.split(",").map(Number);
        path.push({ x, y });
        cursor = previous.get(cursor);
      }
      return path.reverse();
    }

    for (const offset of offsets) {
      const next = { x: current.x + offset.x, y: current.y + offset.y };
      const nextKey = cellKey(next);
      if (
        isInside(stage, next) &&
        !wallSet.has(nextKey) &&
        (!blocked.has(nextKey) || nextKey === goalKey) &&
        !previous.has(nextKey)
      ) {
        previous.set(nextKey, currentKey);
        queue.push(next);
      }
    }
  }
  return null;
}

function linePoints(from, to) {
  const points = [];
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const sx = from.x < to.x ? 1 : -1;
  const sy = from.y < to.y ? 1 : -1;
  let error = dx - dy;
  while (x !== to.x || y !== to.y) {
    const twiceError = error * 2;
    if (twiceError > -dy) {
      error -= dy;
      x += sx;
    }
    if (twiceError < dx) {
      error += dx;
      y += sy;
    }
    points.push({ x, y });
  }
  return points;
}

export function hasLineOfSight(stage, from, to) {
  if (!isInside(stage, to)) return false;
  const wallSet = createWallSet(stage);
  const points = linePoints(from, to);
  for (let index = 0; index < points.length; index += 1) {
    if (wallSet.has(cellKey(points[index])) && index < points.length - 1) return false;
  }
  return true;
}

export function revealWithinRadius(stage, origin, radius) {
  const visible = new Set([cellKey(origin)]);
  for (let y = origin.y - radius; y <= origin.y + radius; y += 1) {
    for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
      const target = { x, y };
      if (
        isInside(stage, target) &&
        Math.max(Math.abs(x - origin.x), Math.abs(y - origin.y)) <= radius &&
        hasLineOfSight(stage, origin, target)
      ) {
        visible.add(cellKey(target));
      }
    }
  }
  return visible;
}

export function hasClearOrthogonalLine(stage, from, to, blockers = new Set()) {
  if (from.x !== to.x && from.y !== to.y) return false;
  const distance = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
  if (distance === 0) return false;
  const step = {
    x: Math.sign(to.x - from.x),
    y: Math.sign(to.y - from.y),
  };
  const wallSet = createWallSet(stage);
  let cursor = { x: from.x + step.x, y: from.y + step.y };
  while (cursor.x !== to.x || cursor.y !== to.y) {
    const cursorKey = cellKey(cursor);
    if (wallSet.has(cursorKey) || blockers.has(cursorKey)) return false;
    cursor = { x: cursor.x + step.x, y: cursor.y + step.y };
  }
  return true;
}
