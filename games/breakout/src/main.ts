import "./style.css";

type Difficulty = "easy" | "normal" | "hard";
type Mode = "arcade" | "campaign";
type Screen = "menu" | "playing" | "paused" | "gameover" | "leaderboard" | "settings" | "info";
type DesktopKeyMode = "ad" | "arrows" | "both";

type Settings = {
  musicOn: boolean;
  musicVol: number;
  sfxOn: boolean;
  sfxVol: number;
  showTouchButtons: boolean;
  desktopKeys: DesktopKeyMode;
};

const DEFAULT_SETTINGS: Settings = {
  musicOn: true,
  musicVol: 0.6,
  sfxOn: true,
  sfxVol: 0.7,
  showTouchButtons: false,
  desktopKeys: "ad",
};

const STORAGE_KEY = "tenebris_breakout_settings_v1";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
function saveSettings(s: Settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

type Rect = { x: number; y: number; w: number; h: number };
function rectIntersects(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

type PowerUpType = "WIDEN" | "SLOW" | "MULTI" | "LASER" | "SHIELD";
type PowerUpDrop = { x: number; y: number; r: number; vy: number; type: PowerUpType };

type Ball = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  stuckToPaddle: boolean;
};

class BreakoutApp {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private screen: Screen = "menu";
  private mode: Mode = "arcade";
  private difficulty: Difficulty = "normal";
  private settings: Settings = loadSettings();

  private dpr = 1;
  private bgImg: HTMLImageElement | null = null;

  private lastTime = 0;

  private score = 0;
  private level = 1;
  private lives = 3;

  private W = 0;
  private H = 0;

  // Performance guardrail (your request)
  private readonly MAX_BALLS = 3;

  // Paddle
  private paddle = { x: 0, y: 0, w: 140, h: 16, speed: 900 };
  private readonly paddleBaseW = 140;

  // Balls (now supports multi-ball)
  private balls: Ball[] = [];
  private ballBaseSpeed = 520;

  // Bricks
  private bricks: Array<{ rect: Rect; hp: number; points: number }> = [];

  // Powerups
  private drops: PowerUpDrop[] = [];
  private widenUntil = 0;
  private slowUntil = 0;
  private shieldCharges = 0;

  // Laser
  private laserUntil = 0;
  private laserAmmo = 0;
  private laserCooldown = 0;
  private lasers: Array<{ x: number; y: number; vy: number }> = [];

  // Input
  private leftHeld = false;
  private rightHeld = false;
  private touchHeldLeft = false;
  private touchHeldRight = false;

  private isDragging = false;
  private dragOffsetX = 0;

  // UI refs
  private hudEl = document.getElementById("hud")!;
  private hudModeEl = document.getElementById("hud-mode")!;
  private hudDiffEl = document.getElementById("hud-diff")!;
  private hudLevelEl = document.getElementById("hud-level")!;
  private hudScoreEl = document.getElementById("hud-score")!;
  private hudLivesEl = document.getElementById("hud-lives")!;
  private goScoreEl = document.getElementById("go-score")!;

  private touchControls = document.getElementById("touch-controls")!;
  private touchLeft = document.getElementById("touch-left") as HTMLButtonElement;
  private touchRight = document.getElementById("touch-right") as HTMLButtonElement;

  constructor() {
    const c = document.getElementById("game");
    if (!(c instanceof HTMLCanvasElement)) throw new Error("Canvas not found");
    this.canvas = c;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2D context not available");
    this.ctx = ctx;

    this.hookUI();
    this.refreshInfoNumbers();
    this.hookInput();

    this.applySettingsToUI();

    this.updateTouchControlsVisibility();

    this.loadBackground("/assets/backgrounds/breakout-bg.jpg");

    this.resize();
    window.addEventListener("resize", () => this.resize(), { passive: true });

    requestAnimationFrame((t) => this.loop(t));
  }

  private nowMs() {
    return performance.now();
  }

  private showScreen(s: Screen) {
    const set = (id: string, on: boolean) =>
      document.getElementById(id)!.classList.toggle("hidden", !on);

    set("screen-menu", s === "menu");
    set("screen-pause", s === "paused");
    set("screen-gameover", s === "gameover");
    set("screen-leaderboard", s === "leaderboard");
    set("screen-settings", s === "settings");
    set("screen-info", s === "info");

    const hudVisible = s === "playing" || s === "paused";
    this.hudEl.classList.toggle("hidden", !hudVisible);

    this.screen = s;
    this.refreshHUD();
  }

    // ===== INFO MENU =====
  private setupInfoTabs() {
    const tabButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-info-tab]")
    );
    const panels = Array.from(
      document.querySelectorAll<HTMLElement>("[data-info-panel]")
    );

    const show = (key: string) => {
      tabButtons.forEach((b) =>
        b.classList.toggle("active", b.dataset.infoTab === key)
      );
      panels.forEach((p) =>
        p.classList.toggle("hidden", p.dataset.infoPanel !== key)
      );
    };

    tabButtons.forEach((btn) =>
      btn.addEventListener("click", () => show(btn.dataset.infoTab!))
    );

    show("basics"); // default tab
  }

  private refreshInfoNumbers() {
    const set = (id: string, v: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };

    // Must match startGame() values
    set("info-lives-easy", "5");
    set("info-lives-normal", "3");
    set("info-lives-hard", "2");

    // Reads real game constant
    set("info-max-balls", String(this.MAX_BALLS));
  }

  private hookUI() {
    document.getElementById("btn-start")!.addEventListener("click", () => this.startGame());

    document.getElementById("btn-leaderboard")!.addEventListener("click", () => this.showScreen("leaderboard"));
    document.getElementById("btn-settings")!.addEventListener("click", () => this.showScreen("settings"));
    document.getElementById("btn-help")!.addEventListener("click", () => this.showScreen("info"));

    document.getElementById("btn-lb-back")!.addEventListener("click", () => this.showScreen("menu"));
    document.getElementById("btn-info-back")!.addEventListener("click", () => this.showScreen("menu"));
    document.getElementById("btn-settings-back")!.addEventListener("click", () => this.showScreen("menu"));

    document.getElementById("btn-resume")!.addEventListener("click", () => this.resume());
    document.getElementById("btn-restart")!.addEventListener("click", () => this.startGame());
    document.getElementById("btn-menu")!.addEventListener("click", () => this.showScreen("menu"));

    document.getElementById("btn-go-restart")!.addEventListener("click", () => this.startGame());
    document.getElementById("btn-go-menu")!.addEventListener("click", () => this.showScreen("menu"));

    document.getElementById("btn-pause")!.addEventListener("click", () => this.pause());
    document.getElementById("btn-info")!.addEventListener("click", () => this.showScreen("info"));

    document.querySelectorAll<HTMLButtonElement>("[data-diff]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.difficulty = btn.dataset.diff as Difficulty;
        btn.parentElement?.querySelectorAll("[data-diff]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.refreshHUD();
      });
    });
    
    document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.mode = btn.dataset.mode as Mode;
        btn.parentElement?.querySelectorAll("[data-mode]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.refreshHUD();
      });
    });

    // Settings
    const musicToggle = document.getElementById("music-toggle") as HTMLInputElement;
    const musicVol = document.getElementById("music-vol") as HTMLInputElement;
    const sfxToggle = document.getElementById("sfx-toggle") as HTMLInputElement;
    const sfxVol = document.getElementById("sfx-vol") as HTMLInputElement;
    const touchButtonsToggle = document.getElementById("touch-buttons-toggle") as HTMLInputElement;
    const desktopKeys = document.getElementById("desktop-keys") as HTMLSelectElement;

    const onSettingsChanged = () => {
      this.settings.musicOn = musicToggle.checked;
      this.settings.musicVol = parseFloat(musicVol.value);
      this.settings.sfxOn = sfxToggle.checked;
      this.settings.sfxVol = parseFloat(sfxVol.value);
      this.settings.showTouchButtons = touchButtonsToggle.checked;
      this.settings.desktopKeys = desktopKeys.value as DesktopKeyMode;

      saveSettings(this.settings);
      this.updateTouchControlsVisibility();
    };

    [musicToggle, musicVol, sfxToggle, sfxVol, touchButtonsToggle, desktopKeys].forEach((el) => {
      el.addEventListener("change", onSettingsChanged);
      el.addEventListener("input", onSettingsChanged);
    });
    this.setupInfoTabs();
    this.showScreen("menu");
  }

  private applySettingsToUI() {
    (document.getElementById("music-toggle") as HTMLInputElement).checked = this.settings.musicOn;
    (document.getElementById("music-vol") as HTMLInputElement).value = String(this.settings.musicVol);
    (document.getElementById("sfx-toggle") as HTMLInputElement).checked = this.settings.sfxOn;
    (document.getElementById("sfx-vol") as HTMLInputElement).value = String(this.settings.sfxVol);
    (document.getElementById("touch-buttons-toggle") as HTMLInputElement).checked = this.settings.showTouchButtons;
    (document.getElementById("desktop-keys") as HTMLSelectElement).value = this.settings.desktopKeys;
  }

  private updateTouchControlsVisibility() {
    this.touchControls.classList.toggle("hidden", !this.settings.showTouchButtons);
  }

  private hookInput() {
    window.addEventListener("keydown", (e) => {
      if (e.key === "p" || e.key === "P") {
        if (this.screen === "playing") this.pause();
        else if (this.screen === "paused") this.resume();
        return;
      }

      // Laser fire (optional): F
      if ((e.key === "f" || e.key === "F") && this.screen === "playing") {
        if (e.repeat) return;
        this.tryFireLaser();
      }

      if (this.settings.desktopKeys === "ad" || this.settings.desktopKeys === "both") {
        if (e.key === "a" || e.key === "A") this.leftHeld = true;
        if (e.key === "d" || e.key === "D") this.rightHeld = true;
      }
      if (this.settings.desktopKeys === "arrows" || this.settings.desktopKeys === "both") {
        if (e.key === "ArrowLeft") this.leftHeld = true;
        if (e.key === "ArrowRight") this.rightHeld = true;
      }

      if (e.code === "Space" && this.screen === "playing") {
        e.preventDefault();
        if (e.repeat) return;
        // launch all stuck balls
        const anyStuck = this.balls.some((b) => b.stuckToPaddle);
        if (anyStuck) this.launchStuckBalls();
      }
    });

    window.addEventListener("keyup", (e) => {
      if (this.settings.desktopKeys === "ad" || this.settings.desktopKeys === "both") {
        if (e.key === "a" || e.key === "A") this.leftHeld = false;
        if (e.key === "d" || e.key === "D") this.rightHeld = false;
      }
      if (this.settings.desktopKeys === "arrows" || this.settings.desktopKeys === "both") {
        if (e.key === "ArrowLeft") this.leftHeld = false;
        if (e.key === "ArrowRight") this.rightHeld = false;
      }
    });

    // Pointer: drag paddle; tap to launch
    this.canvas.addEventListener("pointerdown", (e) => {
      if (this.screen !== "playing") return;

      const x = this.toCanvasX(e.clientX);
      const paddleRect: Rect = { x: this.paddle.x, y: this.paddle.y, w: this.paddle.w, h: this.paddle.h };

      if (x >= paddleRect.x && x <= paddleRect.x + paddleRect.w) {
        this.isDragging = true;
        this.dragOffsetX = x - this.paddle.x;
      } else {
        // tap to launch
        if (this.balls.some((b) => b.stuckToPaddle)) this.launchStuckBalls();
      }
    });

    window.addEventListener("pointerup", () => (this.isDragging = false));
    window.addEventListener("pointercancel", () => (this.isDragging = false));

this.canvas.addEventListener("pointermove", (e) => {
  if (this.screen !== "playing") return;

  const x = this.toCanvasX(e.clientX);

  // Only move paddle when user is actively dragging (mobile + optional desktop)
  if (this.isDragging) {
    this.paddle.x = clamp(x - this.dragOffsetX, 8, this.W - this.paddle.w - 8);
  }
});

    // Touch buttons
    const bindTouchHold = (btn: HTMLButtonElement, side: "left" | "right") => {
      const set = (v: boolean) => (side === "left" ? (this.touchHeldLeft = v) : (this.touchHeldRight = v));
      btn.addEventListener("pointerdown", (ev) => { ev.preventDefault(); set(true); });
      btn.addEventListener("pointerup", () => set(false));
      btn.addEventListener("pointercancel", () => set(false));
      btn.addEventListener("pointerleave", () => set(false));
    };
    bindTouchHold(this.touchLeft, "left");
    bindTouchHold(this.touchRight, "right");
  }

  private toCanvasX(clientX: number) {
    const rect = this.canvas.getBoundingClientRect();
    return ((clientX - rect.left) * (this.canvas.width / rect.width)) / this.dpr;
  }

  private pause() {
    if (this.screen !== "playing") return;
    this.showScreen("paused");
  }
  private resume() {
    if (this.screen !== "paused") return;
    this.showScreen("playing");
  }

  private startGame() {
    this.score = 0;
    this.level = 1;
    this.lives = this.difficulty === "easy" ? 5 : this.difficulty === "hard" ? 2 : 3;

    this.drops = [];
    this.lasers = [];
    this.laserCooldown = 0;

    this.widenUntil = 0;
    this.slowUntil = 0;
    this.laserUntil = 0;
    this.laserAmmo = 0;
    this.shieldCharges = 0;

    this.applyDifficultyTuning();
    this.resetRound(true);
    this.buildLevel(this.level);

    this.showScreen("playing");
  }

  private applyDifficultyTuning() {
    if (this.difficulty === "easy") {
      this.paddle.w = 170;
      this.ballBaseSpeed = 470;
    } else if (this.difficulty === "hard") {
      this.paddle.w = 120;
      this.ballBaseSpeed = 600;
    } else {
      this.paddle.w = 140;
      this.ballBaseSpeed = 520;
    }
  }

  private resetRound(fullResetPaddle: boolean) {
    if (fullResetPaddle) {
      this.paddle.x = (this.W - this.paddle.w) / 2;
      this.paddle.y = this.H - 42;
    }

    // One main ball, stuck
    this.balls = [
      {
        x: this.paddle.x + this.paddle.w / 2,
        y: this.paddle.y - 7 - 2,
        r: 7,
        vx: 0,
        vy: 0,
        stuckToPaddle: true,
      },
    ];
  }

  private launchStuckBalls() {
    for (const b of this.balls) {
      if (!b.stuckToPaddle) continue;
      const angle = rand(-0.9, 0.9);
      const speed = this.getBallSpeed();
      b.vx = Math.sin(angle) * speed;
      b.vy = -Math.cos(angle) * speed;
      b.stuckToPaddle = false;
    }
  }

  private getBallSpeed() {
    // Slow buff affects speed (temporary)
    const slowActive = this.nowMs() < this.slowUntil;
    return slowActive ? this.ballBaseSpeed * 0.78 : this.ballBaseSpeed;
  }

  private buildLevel(level: number) {
    this.bricks = [];

    const marginX = 26;
    const topY = 90;
    const cols = 10;
    const rowsBase = this.mode === "campaign" ? 6 : 5;
    const extraRows = this.mode === "arcade" ? Math.floor((level - 1) / 2) : 0;
    const rows = clamp(rowsBase + extraRows, 5, 10);

    const gap = 8;
    const brickW = Math.floor((this.W - marginX * 2 - gap * (cols - 1)) / cols);
    const brickH = 18;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = marginX + c * (brickW + gap);
        const y = topY + r * (brickH + gap);

        let hp = 1;
        if (this.mode === "arcade") {
          const toughChance = clamp((level - 1) * 0.05, 0, 0.35);
          if (Math.random() < toughChance) hp = 2;
          if (this.difficulty === "hard" && Math.random() < toughChance * 0.5) hp = 3;
        }

        const points = (rows - r) * 10;
        this.bricks.push({ rect: { x, y, w: brickW, h: brickH }, hp, points });
      }
    }
  }

  private maybeSpawnDrop(x: number, y: number) {
    // Drop chance tuned to “feels fun but not constant”
    const baseChance = this.difficulty === "easy" ? 0.22 : this.difficulty === "hard" ? 0.14 : 0.18;
    if (Math.random() > baseChance) return;

    const roll = Math.random();
    let type: PowerUpType;

    // Weighted
    if (roll < 0.26) type = "WIDEN";
    else if (roll < 0.50) type = "SLOW";
    else if (roll < 0.70) type = "SHIELD";
    else if (roll < 0.86) type = "MULTI";
    else type = "LASER";

    this.drops.push({
      x,
      y,
      r: 11,
      vy: 220,
      type,
    });
  }

  private applyPowerUp(type: PowerUpType) {
    const now = this.nowMs();

    if (type === "WIDEN") {
      this.widenUntil = now + 12000;
      return;
    }
    if (type === "SLOW") {
      this.slowUntil = now + 9000;
      return;
    }
    if (type === "SHIELD") {
      this.shieldCharges = clamp(this.shieldCharges + 1, 0, 3);
      return;
    }
    if (type === "MULTI") {
      if (this.balls.length >= this.MAX_BALLS) return;

      // spawn 1 additional ball (or 2 if room and hard)
      const toSpawn = this.balls.length === 1 && this.MAX_BALLS >= 3 ? 2 : 1;
      const spawnCount = clamp(toSpawn, 1, this.MAX_BALLS - this.balls.length);

      for (let i = 0; i < spawnCount; i++) {
        const base = this.balls[0];
        const angle = rand(-1.0, 1.0);
        const speed = this.getBallSpeed();
        this.balls.push({
          x: base.x,
          y: base.y,
          r: base.r,
          vx: Math.sin(angle) * speed,
          vy: -Math.cos(angle) * speed,
          stuckToPaddle: false,
        });
      }
      return;
    }
    if (type === "LASER") {
      this.laserUntil = now + 12000;
      this.laserAmmo = clamp(this.laserAmmo + 18, 0, 40);
      return;
    }
  }

  private tryFireLaser() {
    const now = this.nowMs();
    if (now > this.laserUntil) return;
    if (this.laserAmmo <= 0) return;
    if (this.laserCooldown > 0) return;

    // fire two shots from paddle edges
    const x1 = this.paddle.x + 16;
    const x2 = this.paddle.x + this.paddle.w - 16;
    const y = this.paddle.y;

    this.lasers.push({ x: x1, y, vy: -880 });
    this.lasers.push({ x: x2, y, vy: -880 });

    this.laserAmmo -= 2;
    this.laserCooldown = 0.12; // seconds
  }

  private loop(t: number) {
    const dt = this.lastTime ? Math.min(0.033, (t - this.lastTime) / 1000) : 0;
    this.lastTime = t;

    if (this.screen === "playing") this.update(dt);
    this.render();

    requestAnimationFrame((tt) => this.loop(tt));
  }

  private update(dt: number) {
    const now = this.nowMs();

    // Buff effects
    const widenActive = now < this.widenUntil;
    const laserActive = now < this.laserUntil;

    // Paddle width buff (smoothly)
    const targetW =
      widenActive
        ? clamp(this.paddleBaseW + 60, 120, 220)
        : this.difficulty === "easy"
          ? 170
          : this.difficulty === "hard"
            ? 120
            : 140;

    // lerp for smoothness
    this.paddle.w += (targetW - this.paddle.w) * clamp(dt * 8, 0, 1);

    // Input movement
    const left = this.leftHeld || this.touchHeldLeft;
    const right = this.rightHeld || this.touchHeldRight;

    if (left && !right) this.paddle.x -= this.paddle.speed * dt;
    if (right && !left) this.paddle.x += this.paddle.speed * dt;
    this.paddle.x = clamp(this.paddle.x, 8, this.W - this.paddle.w - 8);

    // Laser cooldown
    this.laserCooldown = Math.max(0, this.laserCooldown - dt);

    // Update lasers
    for (const L of this.lasers) {
      L.y += L.vy * dt;
    }
    this.lasers = this.lasers.filter((L) => L.y > 40);

    // Laser hits bricks
    for (const L of this.lasers) {
      const lr: Rect = { x: L.x - 2, y: L.y - 10, w: 4, h: 12 };
      for (const b of this.bricks) {
        if (b.hp <= 0) continue;
        if (!rectIntersects(lr, b.rect)) continue;

        b.hp -= 1;
        this.score += b.hp <= 0 ? b.points : Math.floor(b.points / 3);
        // move laser out so it doesn't multi-hit
        L.y = -9999;
        break;
      }
    }
    this.lasers = this.lasers.filter((L) => L.y > -1000);

    // Stick any stuck balls
    for (const ball of this.balls) {
      if (!ball.stuckToPaddle) continue;
      ball.x = this.paddle.x + this.paddle.w / 2;
      ball.y = this.paddle.y - ball.r - 2;
    }

    // Update drops
    for (const d of this.drops) {
      d.y += d.vy * dt;
    }

    // Catch drops with paddle
    const paddleRect: Rect = { x: this.paddle.x, y: this.paddle.y, w: this.paddle.w, h: this.paddle.h };
    for (const d of this.drops) {
      const dr: Rect = { x: d.x - d.r, y: d.y - d.r, w: d.r * 2, h: d.r * 2 };
      if (rectIntersects(dr, paddleRect)) {
        this.applyPowerUp(d.type);
        d.y = this.H + 999;
      }
    }
    this.drops = this.drops.filter((d) => d.y < this.H + 60);

    // If ALL balls stuck -> wait for launch, no physics
    if (this.balls.every((b) => b.stuckToPaddle)) {
      this.refreshHUD(laserActive);
      return;
    }

    // Update balls
    for (const ball of this.balls) {
      if (ball.stuckToPaddle) continue;

      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      // Walls
      if (ball.x - ball.r < 8) { ball.x = 8 + ball.r; ball.vx *= -1; }
      if (ball.x + ball.r > this.W - 8) { ball.x = this.W - 8 - ball.r; ball.vx *= -1; }
      if (ball.y - ball.r < 56) { ball.y = 56 + ball.r; ball.vy *= -1; }

      // Paddle collision
      const br: Rect = { x: ball.x - ball.r, y: ball.y - ball.r, w: ball.r * 2, h: ball.r * 2 };
      if (rectIntersects(br, paddleRect) && ball.vy > 0) {
        ball.y = this.paddle.y - ball.r - 0.5;

        const hit = (ball.x - (this.paddle.x + this.paddle.w / 2)) / (this.paddle.w / 2);
        const maxAngle = 1.1;
        const angle = clamp(hit, -1, 1) * maxAngle;

        const speed = Math.hypot(ball.vx, ball.vy) || this.getBallSpeed();
        ball.vx = Math.sin(angle) * speed;
        ball.vy = -Math.cos(angle) * speed;
      }

      // Brick collision (one per ball per frame)
      for (const b of this.bricks) {
        if (b.hp <= 0) continue;
        if (!rectIntersects(br, b.rect)) continue;

        const prevX = ball.x - ball.vx * dt;
        const prevY = ball.y - ball.vy * dt;
        const prevRect: Rect = { x: prevX - ball.r, y: prevY - ball.r, w: ball.r * 2, h: ball.r * 2 };

        const wasLeft = prevRect.x + prevRect.w <= b.rect.x;
        const wasRight = prevRect.x >= b.rect.x + b.rect.w;
        if (wasLeft || wasRight) ball.vx *= -1;
        else ball.vy *= -1;

        b.hp -= 1;
        this.score += b.hp <= 0 ? b.points : Math.floor(b.points / 3);

        if (b.hp <= 0) {
          // Spawn drop at brick center
          this.maybeSpawnDrop(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2);
        }
        break;
      }
    }

    // Handle balls falling (multi-ball aware)
    for (const ball of this.balls) {
      if (ball.stuckToPaddle) continue;

      if (ball.y - ball.r > this.H + 20) {
        // Shield can save ONE fall
        if (this.shieldCharges > 0) {
          this.shieldCharges -= 1;
          // bounce ball back up from bottom
          ball.y = this.H - 80;
          ball.vy = -Math.abs(ball.vy);
          continue;
        }

        // remove this ball
        ball.y = this.H + 9999;
      }
    }
    this.balls = this.balls.filter((b) => b.y < this.H + 2000);

    // If no balls remain, life lost
    if (this.balls.length === 0) {
      this.lives -= 1;
      if (this.lives <= 0) {
        this.goScoreEl.textContent = String(this.score);
        this.showScreen("gameover");
        return;
      }
      this.resetRound(false);
      this.refreshHUD(laserActive);
      return;
    }

    // Level clear
    if (!this.bricks.some((b) => b.hp > 0)) {
      this.level += 1;
      this.applyDifficultyTuning();
      this.buildLevel(this.level);
      this.resetRound(true);
    }

    this.refreshHUD(laserActive);
  }

  private refreshHUD(laserActive = false) {
    this.hudModeEl.textContent = this.mode.toUpperCase();
    this.hudDiffEl.textContent = this.difficulty.toUpperCase();
    this.hudLevelEl.textContent = `LV ${this.level}`;
    this.hudScoreEl.textContent = String(this.score);

    // Show lives + shield charges + (optional) ammo hint using hearts + dots
    const hearts = "♥".repeat(clamp(this.lives, 0, 9));
    const shields = this.shieldCharges > 0 ? `  ⛨${this.shieldCharges}` : "";
    const ammo = laserActive ? `  ⟡${this.laserAmmo}` : "";
    const balls = this.balls.length > 1 ? `  ●${this.balls.length}` : "";
    this.hudLivesEl.textContent = `${hearts}${shields}${ammo}${balls}`;
  }

  private loadBackground(src: string) {
    const img = new Image();
    img.src = src;
    img.onload = () => (this.bgImg = img);
    img.onerror = () => console.warn("Background failed to load:", src);
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this.canvas.width = Math.floor(rect.width * this.dpr);
    this.canvas.height = Math.floor(rect.height * this.dpr);

    this.W = this.canvas.width / this.dpr;
    this.H = this.canvas.height / this.dpr;

    this.paddle.y = this.H - 42;
    this.paddle.x = clamp(this.paddle.x, 8, this.W - this.paddle.w - 8);
  }

  private render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const w = this.W;
    const h = this.H;

    // Background cover
    if (this.bgImg) {
      const img = this.bgImg;
      const scale = Math.max(w / img.width, h / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = "#070709";
      ctx.fillRect(0, 0, w, h);
    }

    // Dark overlay
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, w, h);

    // Frame
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 56, w - 16, h - 64);

    // Bricks
    for (const b of this.bricks) {
      if (b.hp <= 0) continue;
      const alpha = b.hp === 1 ? 0.55 : b.hp === 2 ? 0.7 : 0.85;
      ctx.fillStyle = `rgba(255,122,24,${alpha})`;
      ctx.fillRect(b.rect.x, b.rect.y, b.rect.w, b.rect.h);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.strokeRect(b.rect.x, b.rect.y, b.rect.w, b.rect.h);
    }

    // Drops
    for (const d of this.drops) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fill();

      ctx.strokeStyle = "rgba(255,122,24,0.55)";
      ctx.stroke();

      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "900 11px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        d.type === "WIDEN" ? "W" :
        d.type === "SLOW" ? "S" :
        d.type === "MULTI" ? "M" :
        d.type === "LASER" ? "L" : "⛨",
        d.x, d.y + 0.5
      );
    }
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";

    // Paddle
    ctx.fillStyle = "rgba(240,240,244,0.85)";
    ctx.fillRect(this.paddle.x, this.paddle.y, this.paddle.w, this.paddle.h);

    // Laser “emitters” visual
    const laserActive = performance.now() < this.laserUntil;
    if (laserActive) {
      ctx.fillStyle = "rgba(255,122,24,0.65)";
      ctx.fillRect(this.paddle.x + 10, this.paddle.y - 4, 10, 4);
      ctx.fillRect(this.paddle.x + this.paddle.w - 20, this.paddle.y - 4, 10, 4);
    }

    // Balls
    for (const b of this.balls) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fill();
    }

    // Lasers
    ctx.fillStyle = "rgba(255,122,24,0.85)";
    for (const L of this.lasers) {
      ctx.fillRect(L.x - 1.5, L.y - 10, 3, 12);
    }

    // Hint text
    if (this.screen === "playing" && this.balls.every((b) => b.stuckToPaddle)) {
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = "#fff";
      ctx.font = "700 14px system-ui";
      ctx.fillText("Tap / Click or press SPACE to launch", 18, 46);
      ctx.globalAlpha = 1;
    }

    // Paused dim
    if (this.screen === "paused") {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 0, w, h);
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  new BreakoutApp();
});


