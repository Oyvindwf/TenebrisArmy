// js/snake.js

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const highEl = document.getElementById("high");
const menu = document.getElementById("menu");
const menuModal = document.getElementById("menu-modal");
const difficultySelect = document.getElementById("difficulty");
const musicStatus = document.getElementById("music-status");
const sfxStatus = document.getElementById("sfx-status");
const countdownDisplay = document.getElementById("countdown");
const leaderboardList = document.getElementById("leaderboard-list");
const leaderboardBox = document.getElementById("leaderboard");
const touchControls = document.getElementById("touch-controls");
const canvasWrap = document.getElementById("canvas-wrap");

const music = null;
const sfxEat = null;
const sfxDeath = null;

let box, gridCount;
let score = 0;
window.direction = "RIGHT";
let snake = [];
let food = {};
let gameInterval;
let gameSpeed = 100;
let allowMusic = true;
let allowSFX = true;
let isGameRunning = false;
let isPaused = false;

const leaderboardKey = "snakeLeaderboard";
let leaderboard = JSON.parse(localStorage.getItem(leaderboardKey)) || [];

let currentState = "menu";

// MOBILE/RESPONSIVE
function isMobile() { return window.innerWidth <= 800; }

// UI STATE LOGIC
function updateUIState() {
  if (isMobile()) {
    if (currentState === "menu") {
      leaderboardBox.style.display = 'block';
      touchControls.style.display = 'none';
    } else {
      leaderboardBox.style.display = 'none';
      touchControls.classList.add('visible');
      touchControls.style.display = 'flex';
    }
  } else {
    leaderboardBox.style.display = 'block';
    touchControls.classList.remove('visible');
    touchControls.style.display = 'none';
  }
}

// Sizing logic: canvas/menu/modal
function resizeCanvasAndLayout() {
  let size = Math.min(window.innerWidth * (isMobile() ? 0.97 : 0.60), 640);
  if (window.innerWidth < 480) size = Math.min(window.innerWidth * 0.94, 380);
  if (size < 110) size = 110;
  canvas.width = size;
  canvas.height = size;
  gridCount = 20;
  box = Math.floor(canvas.width / gridCount);

  // Position and size menu-modal exactly over the canvas
  canvasWrap.style.width = canvas.width + "px";
  canvasWrap.style.height = canvas.height + "px";
  menuModal.style.width = canvas.width + "px";
  menuModal.style.height = canvas.height + "px";
  menuModal.style.left = "0px";
  menuModal.style.top = "0px";
  menuModal.style.position = "absolute";
  // Keep the menu (box) inside menuModal centered and smaller
  menu.style.width = (canvas.width * 0.66) + "px";
  menu.style.maxWidth = "360px";
  menu.style.minWidth = "220px";
  menu.style.margin = "0 auto";

  updateUIState();
}
window.addEventListener('resize', () => {
  resizeCanvasAndLayout();
  updateUIState();
});

// DIRECTION HANDLING
function setDirection(dir) {
  if (dir === "LEFT" && window.direction !== "RIGHT") window.direction = "LEFT";
  else if (dir === "UP" && window.direction !== "DOWN") window.direction = "UP";
  else if (dir === "RIGHT" && window.direction !== "LEFT") window.direction = "RIGHT";
  else if (dir === "DOWN" && window.direction !== "UP") window.direction = "DOWN";
}
document.addEventListener("keydown", (e) => {
  if (!isGameRunning || isPaused) return;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    e.preventDefault();
    setDirection(e.key.replace("Arrow", "").toUpperCase());
  } else if (e.key.toLowerCase() === "p") {
    togglePause();
  }
});

// Touch controls (D-pad)
function setupTouchControls() {
  const touchUp = document.querySelector(".touch-controls .up");
  const touchDown = document.querySelector(".touch-controls .down");
  const touchLeft = document.querySelector(".touch-controls .left");
  const touchRight = document.querySelector(".touch-controls .right");
  const pauseBtn = document.querySelector(".pause-btn");
  function setDir(dir) { setDirection(dir); }
  if (touchUp) {
    touchUp.addEventListener("touchstart", e => { e.preventDefault(); setDir("UP"); });
    touchUp.addEventListener("click", () => setDir("UP"));
  }
  if (touchDown) {
    touchDown.addEventListener("touchstart", e => { e.preventDefault(); setDir("DOWN"); });
    touchDown.addEventListener("click", () => setDir("DOWN"));
  }
  if (touchLeft) {
    touchLeft.addEventListener("touchstart", e => { e.preventDefault(); setDir("LEFT"); });
    touchLeft.addEventListener("click", () => setDir("LEFT"));
  }
  if (touchRight) {
    touchRight.addEventListener("touchstart", e => { e.preventDefault(); setDir("RIGHT"); });
    touchRight.addEventListener("click", () => setDir("RIGHT"));
  }
  if (pauseBtn) {
    pauseBtn.addEventListener("touchstart", e => { e.preventDefault(); togglePause(); });
    pauseBtn.addEventListener("click", togglePause);
  }
}
document.addEventListener("DOMContentLoaded", setupTouchControls);

function togglePause() {
  if (!isGameRunning) return;
  isPaused = !isPaused;
  if (isPaused) {
    clearInterval(gameInterval);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.font = Math.floor(canvas.width / 16) + "px monospace";
    ctx.textAlign = "center";
    ctx.fillText("⏸ Paused – Press P or Pause", canvas.width / 2, canvas.height / 2);
    if (music) music.pause();
  } else {
    gameInterval = setInterval(draw, gameSpeed);
    if (allowMusic && music) music.play();
  }
}

// Show the menu overlay (the game menu, always before game starts)
function showMenuOverlay() {
  // Do not remove this! This is what shows the menu when needed
  resizeCanvasAndLayout();
  menuModal.classList.add("active");
  currentState = "menu";
  updateUIState();
}
function hideMenuOverlay() {
  menuModal.classList.remove("active");
  currentState = "game";
  updateUIState();
}

// Called ONLY when pressing "Start Game"
window.initiateStart = function initiateStart() {
  // 3-second countdown before starting
  showMenuOverlay();
  let counter = 3;
  countdownDisplay.textContent = counter;
  const countdown = setInterval(() => {
    counter--;
    if (counter > 0) {
      countdownDisplay.textContent = counter;
    } else {
      clearInterval(countdown);
      countdownDisplay.textContent = "";
      hideMenuOverlay();
      startGame();
    }
  }, 1000);
}

function startGame() {
  isGameRunning = true;
  isPaused = false;
  gameSpeed = parseInt(difficultySelect.value);
  score = 0;
  window.direction = "RIGHT";
  resizeCanvasAndLayout();
  gridCount = 20;
  box = Math.floor(canvas.width / gridCount);
  snake = [{ x: 9 * box, y: 10 * box }];
  food = randomFood();
  scoreEl.textContent = score;
  updateLeaderboard();
  if (allowMusic && music) music.play();
  clearInterval(gameInterval);
  gameInterval = setInterval(draw, gameSpeed);
  currentState = "game";
  updateUIState();
}

function randomFood() {
  return {
    x: Math.floor(Math.random() * (gridCount - 2) + 1) * box,
    y: Math.floor(Math.random() * (gridCount - 2) + 1) * box
  };
}

window.toggleMusic = function toggleMusic() {
  allowMusic = !allowMusic;
  musicStatus.textContent = allowMusic ? "ON" : "OFF";
  if (music) allowMusic ? music.play() : music.pause();
}
window.toggleSFX = function toggleSFX() {
  allowSFX = !allowSFX;
  sfxStatus.textContent = allowSFX ? "ON" : "OFF";
}

function draw() {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < snake.length; i++) {
    ctx.fillStyle = i === 0 ? "#f45" : "#aaa";
    ctx.fillRect(snake[i].x, snake[i].y, box, box);
    ctx.strokeStyle = "#333";
    ctx.strokeRect(snake[i].x, snake[i].y, box, box);
  }

  ctx.fillStyle = "#0f0";
  ctx.fillRect(food.x, food.y, box, box);

  let headX = snake[0].x;
  let headY = snake[0].y;

  if (window.direction === "LEFT") headX -= box;
  if (window.direction === "UP") headY -= box;
  if (window.direction === "RIGHT") headX += box;
  if (window.direction === "DOWN") headY += box;

  if (headX === food.x && headY === food.y) {
    score++;
    if (allowSFX && sfxEat) sfxEat.play();
    scoreEl.textContent = score;
    food = randomFood();
  } else {
    snake.pop();
  }

  const newHead = { x: headX, y: headY };

  if (
    headX < 0 || headX >= canvas.width ||
    headY < 0 || headY >= canvas.height ||
    collision(newHead, snake)
  ) {
    clearInterval(gameInterval);
    if (allowSFX && sfxDeath) sfxDeath.play();
    flashEffect();
    handleGameOver();
    return;
  }

  snake.unshift(newHead);
}

function flashEffect() {
  let flashes = 0;
  let interval = setInterval(() => {
    canvas.style.visibility = canvas.style.visibility === "hidden" ? "visible" : "hidden";
    flashes++;
    if (flashes > 6) {
      clearInterval(interval);
      canvas.style.visibility = "visible";
    }
  }, 100);
}

function collision(head, body) {
  return body.some(seg => head.x === seg.x && head.y === seg.y);
}

function handleGameOver() {
  isGameRunning = false;
  isPaused = false;
  setTimeout(() => {
    const initials = prompt("Enter your initials for the leaderboard (3 letters):", "YOU")?.toUpperCase().slice(0, 3);
    if (initials) {
      leaderboard.push({ initials, score });
      leaderboard.sort((a, b) => b.score - a.score);
      leaderboard = leaderboard.slice(0, 5);
      localStorage.setItem(leaderboardKey, JSON.stringify(leaderboard));
    }
    updateLeaderboard();
    showMenuOverlay();
  }, 800);
}

function updateLeaderboard() {
  if (leaderboardList) {
    leaderboardList.innerHTML = "";
    leaderboard.forEach(entry => {
      const item = document.createElement("li");
      item.textContent = `${entry.initials} – ${entry.score}`;
      leaderboardList.appendChild(item);
    });
  }
  highEl.textContent = leaderboard.length > 0 ? leaderboard[0].score : 0;
}

// Only show menu on load, do not auto-start game
document.addEventListener("DOMContentLoaded", () => {
  updateLeaderboard();
  showMenuOverlay();      // <--- THIS is what makes the menu show on load
  updateUIState();
  resizeCanvasAndLayout();
});
