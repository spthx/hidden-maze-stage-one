import { DIRECTIONS, MazeGame } from "./game.js?v=8";
import { cellKey } from "./pathfinding.js?v=8";
import { Renderer } from "./renderer.js?v=8";
import { generateStage, STAGE_CONFIGS } from "./stages.js?v=8";

class GameSound {
  constructor() {
    this.context = null;
  }

  tone(frequency, duration = 0.08, delay = 0, type = "triangle") {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === "suspended") this.context.resume();
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.035, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  play(event) {
    if (event.type === "bossStrike") {
      [392, 523, 659].forEach((frequency, index) =>
        this.tone(frequency, 0.18, index * 0.09),
      );
    } else if (
      ["wall", "bossRepels", "monsterHitPlayer", "gameOver"].includes(event.type)
    ) {
      this.tone(105, 0.13, 0, "square");
    } else if (
      [
        "weaponStrike",
        "weaponFound",
        "silverSwordFound",
        "torch",
        "light",
        "warpIn",
      ].includes(event.type)
    ) {
      this.tone(510, 0.09);
    } else {
      this.tone(290, 0.045);
    }
  }
}

const renderer = new Renderer();
const sound = new GameSound();
let stageIndex = 0;
let currentSeed = Date.now() >>> 0;
let game = new MazeGame(generateStage(STAGE_CONFIGS[stageIndex], currentSeed));
let targeting = false;
let pendingContactDirection = null;

function render() {
  renderer.render(game, stageIndex, targeting);
}

function runAction(action) {
  pendingContactDirection = null;
  const event = action();
  if (!event || event.type === "ignored") return;
  targeting = false;
  render();
  renderer.animate(event);
  sound.play(event);
}

function loadStage(index, seed = Date.now()) {
  stageIndex = index;
  currentSeed = Number(seed) >>> 0;
  game = new MazeGame(generateStage(STAGE_CONFIGS[stageIndex], currentSeed));
  targeting = false;
  pendingContactDirection = null;
  render();
}

function move(direction) {
  const offset = DIRECTIONS[direction];
  const contactTarget =
    offset && game.started && !game.isFinished && !game.pendingChest
      ? game.livingEntities.find(
          (entity) =>
            entity.x === game.player.x + offset.x &&
            entity.y === game.player.y + offset.y,
        )
      : null;
  const safeBossContact =
    contactTarget?.kind === "boss" && game.canDefeatBoss;
  if (
    contactTarget &&
    !safeBossContact &&
    pendingContactDirection !== direction
  ) {
    const contactKey = cellKey(contactTarget);
    pendingContactDirection = direction;
    targeting = false;
    game.lastEvent = {
      type: "contactWarning",
      direction,
      contactKey,
      kind: contactTarget.kind,
      attackable: game.getAttackableEnemies().some(
        (target) => cellKey(target) === contactKey,
      ),
    };
    render();
    sound.play(game.lastEvent);
    return;
  }
  runAction(() => game.move(direction));
}

document.querySelector("#start-button").addEventListener("click", () => {
  runAction(() => game.start());
});

document.querySelectorAll("[data-direction]").forEach((button) => {
  button.addEventListener("click", () => move(button.dataset.direction));
});
document.querySelectorAll("[data-stage-index]").forEach((button) => {
  button.addEventListener("click", () =>
    loadStage(Number(button.dataset.stageIndex)),
  );
});

document.querySelector("#attack-button").addEventListener("click", () => {
  const targets = game.getAttackableEnemies();
  if (targets.length === 0) {
    game.lastEvent = { type: "noTarget" };
    targeting = false;
  } else if (targets.length === 1) {
    runAction(() => game.attack(cellKey(targets[0])));
    return;
  } else {
    targeting = !targeting;
  }
  pendingContactDirection = null;
  render();
});

document.querySelector("#maze-grid").addEventListener("click", (event) => {
  const attackTarget = event.target.closest("[data-target-key]");
  if (attackTarget && targeting) {
    runAction(() => game.attack(attackTarget.dataset.targetKey));
    return;
  }
  if (targeting) {
    targeting = false;
    render();
    return;
  }
  const moveTarget = event.target.closest("[data-move-direction]");
  if (moveTarget) move(moveTarget.dataset.moveDirection);
});
document.querySelector("#torch-button").addEventListener("click", () =>
  runAction(() => game.useTorch()),
);
document.querySelector("#light-button").addEventListener("click", () =>
  runAction(() => game.useLight()),
);
document.querySelector("#open-chest-button").addEventListener("click", () =>
  runAction(() => game.openChest()),
);
document.querySelector("#leave-chest-button").addEventListener("click", () =>
  runAction(() => game.leaveChest()),
);
document.querySelector("#restart-button").addEventListener("click", () =>
  loadStage(stageIndex, currentSeed),
);
document.querySelector("#retry-button").addEventListener("click", () =>
  loadStage(stageIndex, currentSeed),
);
document.querySelector("#new-maze-button").addEventListener("click", () =>
  loadStage(stageIndex),
);
document.querySelector("#next-stage-button").addEventListener("click", () => {
  const nextIndex =
    game.state === "clear" && stageIndex < STAGE_CONFIGS.length - 1
      ? stageIndex + 1
      : 0;
  loadStage(nextIndex);
});

const KEY_DIRECTIONS = {
  ArrowUp: "up",
  w: "up",
  W: "up",
  ArrowRight: "right",
  d: "right",
  D: "right",
  ArrowDown: "down",
  s: "down",
  S: "down",
  ArrowLeft: "left",
  a: "left",
  A: "left",
};
window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  const direction = KEY_DIRECTIONS[event.key];
  if (direction) {
    event.preventDefault();
    move(direction);
  } else if (event.key === "f" || event.key === "F") {
    document.querySelector("#attack-button").click();
  } else if (event.key === "t" || event.key === "T") {
    document.querySelector("#torch-button").click();
  } else if (event.key === "l" || event.key === "L") {
    document.querySelector("#light-button").click();
  } else if (event.key === "Escape" && targeting) {
    targeting = false;
    render();
  }
});

render();
