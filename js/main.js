import { MazeGame } from "./game.js";
import { Renderer } from "./renderer.js";
import { prototypeStage } from "./stages.js";

class GameSound {
  constructor() {
    this.context = null;
    this.muted = false;
  }

  toggle() {
    this.muted = !this.muted;
    return this.muted;
  }

  ensureContext() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) this.context = new AudioContext();
    }
    if (this.context?.state === "suspended") this.context.resume();
  }

  tone(frequency, duration = 0.08, delay = 0, type = "sine", volume = 0.035) {
    if (this.muted) return;
    this.ensureContext();
    if (!this.context) return;

    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  play(event) {
    if (event.type === "clear") {
      [392, 523, 659, 784].forEach((frequency, index) => {
        this.tone(frequency, 0.18, index * 0.09, "triangle", 0.045);
      });
      return;
    }

    if (event.type === "gameOver") {
      [196, 165, 131].forEach((frequency, index) => {
        this.tone(frequency, 0.2, index * 0.12, "sawtooth", 0.025);
      });
      return;
    }

    if (event.type === "wall" || event.type === "boundary") {
      this.tone(92, 0.12, 0, "square", 0.025);
      return;
    }

    if (event.distanceDelta < 0) {
      this.tone(520, 0.07, 0, "triangle");
    } else if (event.distanceDelta > 0) {
      this.tone(240, 0.09, 0, "triangle");
    } else {
      this.tone(350, 0.06, 0, "triangle", 0.02);
    }
  }
}

const game = new MazeGame(prototypeStage);
const renderer = new Renderer();
const sound = new GameSound();
const soundButton = document.querySelector("#sound-button");

function move(direction) {
  const event = game.move(direction);
  if (event.type === "ignored") return;
  renderer.render(game);
  renderer.animate(event);
  sound.play(event);
}

function restart() {
  game.reset();
  renderer.render(game);
  sound.tone(330, 0.06, 0, "triangle", 0.02);
}

document.querySelectorAll("[data-direction]").forEach((button) => {
  button.addEventListener("click", () => move(button.dataset.direction));
});

document.querySelector("#restart-button").addEventListener("click", restart);
document.querySelector("#retry-button").addEventListener("click", restart);

soundButton.addEventListener("click", () => {
  const muted = sound.toggle();
  soundButton.textContent = muted ? "◎ サウンド OFF" : "◉ サウンド ON";
  soundButton.setAttribute("aria-pressed", String(muted));
  if (!muted) sound.tone(440, 0.07, 0, "triangle", 0.025);
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
  const direction = KEY_DIRECTIONS[event.key];
  if (!direction || event.repeat) return;
  event.preventDefault();
  move(direction);
});

renderer.render(game);
