/* Tenebris Army — Heavy Metal Breakout v3 (complete JS)
   - Fixes TDZ error by declaring `state` before resize()
   - Works with new merged markup and (mostly) with older markup
   - DPR-aware, mobile HUD + drag, difficulty, power-ups, leaderboard
   - Uses your <audio> tags if present; falls back to WebAudio beeps
*/

(() => {
  // ---------- DOM refs (support old + new IDs) ----------
  const canvas =
    document.getElementById('game') ||
    document.getElementById('breakout');

  if (!canvas) {
    console.warn('[Breakout v3] No canvas with id #game or #breakout found.');
    return;
  }

  const ctx = canvas.getContext('2d');
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const frame =
    document.getElementById('gameFrame') ||
    document.getElementById('breakout-canvas-wrap') ||
    canvas.parentElement;

  // HUD / controls
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const levelEl = document.getElementById('level');
  const bestEl = document.getElementById('best') || document.getElementById('highscore'); // old id fallback
  const bestSideEl = document.getElementById('bestSide');

  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const helpBtn  = document.getElementById('helpBtn');

  const difficultySel =
    document.getElementById('difficulty') ||
    (() => { const sel = document.querySelector('select#difficulty'); return sel; })();

  const musicToggle = document.getElementById('musicToggle');
  const sfxToggle   = document.getElementById('sfxToggle');

  // Overlays (new)
  const intro      = document.getElementById('intro');
  const help       = document.getElementById('help');
  const paused     = document.getElementById('paused');
  const gameover   = document.getElementById('gameover');

  const introStart   = document.getElementById('introStart');
  const introHelp    = document.getElementById('introHelp');
  const startFromHelp= document.getElementById('startFromHelp');
  const closeHelp    = document.getElementById('closeHelp');
  const resumeBtn    = document.getElementById('resumeBtn');
  const restartBtn   = document.getElementById('restartBtn');
  const againBtn     = document.getElementById('againBtn');
  const finalScore   = document.getElementById('finalScore');

  // Mobile HUD buttons (new)
  const leftBtn   = document.getElementById('leftBtn') || document.querySelector('.touch-controls .left');
  const rightBtn  = document.getElementById('rightBtn')|| document.querySelector('.touch-controls .right');
  const launchBtn = document.getElementById('launchBtn'); // optional

  // Leaderboard
  const lbList = document.getElementById('leaderboard-list');

  // Optional legacy audio tags
  const tagMusic = document.getElementById('bg-music');
  const tagHit   = document.getElementById('sfx-hit');
  const tagLose  = document.getElementById('sfx-lose');
  const tagWin   = document.getElementById('sfx-win');
  const tagDeath = document.getElementById('sfx-death');

  // ---------- helpers ----------
  const on = (el, ev, fn, opts) => { if (el) el.addEventListener(ev, fn, opts); };

  // ---------- STATE (declare BEFORE resize) ----------
  let state = null;

  // ---------- sizing / DPR ----------
  function resize() {
    const maxW = frame ? Math.min(frame.clientWidth, 1000) : Math.min(window.innerWidth, 1000);
    const w = Math.max(320, maxW);
    const h = Math.round(w * 0.66); // ~3:2

    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width  = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);

    if (state) {
      state.width  = canvas.width  / dpr;
      state.height = canvas.height / dpr;
    }
  }
  resize();
  if (typeof ResizeObserver !== 'undefined' && frame) new ResizeObserver(resize).observe(frame);
  else on(window, 'resize', resize);

  // ---------- audio (WebAudio fallback) ----------
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;
  const ensureAudio = () => { if (!audioCtx) audioCtx = new AudioCtx(); };

  function beep({ freq = 440, dur = 0.07, type = 'square', vol = 0.04 }) {
    if (sfxToggle && !sfxToggle.checked) return;
    ensureAudio();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = vol;
    o.connect(g).connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  }
  function playSFX(kind) {
    if (sfxToggle && !sfxToggle.checked) return;
    const map = { hit: tagHit, lose: tagLose, win: tagWin, death: tagDeath };
    const tag = map[kind];
    if (tag && tag.readyState >= 2) { try { tag.currentTime = 0; tag.play(); } catch(_){} }
    else {
      const preset = { hit:{freq:520}, lose:{freq:160,dur:.2}, win:{freq:660,dur:.12,type:'sawtooth'}, death:{freq:110,dur:.25} }[kind] || {};
      beep(preset);
    }
  }
  function playMusic(on) {
    if (!tagMusic) return;
    try { on && (!musicToggle || musicToggle.checked) ? tagMusic.play() : tagMusic.pause(); } catch(_){}
  }

  // ---------- gameplay constants ----------
  const BASE = { paddleW: 120, paddleH: 16, paddleSpeed: 8, ballR: 7, rows: 6, cols: 12, brickW: 64, brickH: 22, brickGap: 6 };
  function diffParams(mode) {
    switch (mode) {
      case 'easy':   return { speed:5,   lives:5, hp:1 };
      case 'normal': return { speed:6.3, lives:4, hp:1 };
      case 'hard':   return { speed:7.4, lives:3, hp:2 };
      case 'insane': return { speed:8.6, lives:2, hp:3 };
      default:       return { speed:6.3, lives:4, hp:1 };
    }
  }

  // ---------- storage / leaderboard ----------
  const BEST_KEY  = 'ta_breakout_best_v3';
  const TABLE_KEY = 'ta_breakout_table_v3';
  let best  = parseInt(localStorage.getItem(BEST_KEY)  || '0', 10);
  let table = JSON.parse(localStorage.getItem(TABLE_KEY) || '[]');

  function setBest(v) {
    best = Math.max(best, v);
    localStorage.setItem(BEST_KEY, String(best));
    if (bestEl) bestEl.textContent = best;
    if (bestSideEl) bestSideEl.textContent = best;
  }
  function renderTable() {
    if (!lbList) return;
    lbList.innerHTML = '';
    table.slice(0, 5).forEach(e => {
      const li = document.createElement('li');
      li.textContent = `${e.initials} – ${e.score}`;
      lbList.appendChild(li);
    });
  }
  function saveScore(initials, score) {
    table.push({ initials, score });
    table.sort((a,b) => b.score - a.score);
    table = table.slice(0, 5);
    localStorage.setItem(TABLE_KEY, JSON.stringify(table));
    renderTable();
  }

  // ---------- init/reset ----------
  function newGame() {
    const d = diffParams(difficultySel?.value || 'normal');
    const width  = canvas.width  / dpr;
    const height = canvas.height / dpr;

    state = {
      running:false, waitingLaunch:true, heavy:false, slow:0,
      score:0, lives:d.lives, level:1, combo:0,
      paddle:{ x: width/2 - BASE.paddleW/2, y: height - 30 - BASE.paddleH, w: BASE.paddleW, h: BASE.paddleH, vx:0 },
      ball:{ x: width/2, y: height - 60, r: BASE.ballR, vx: (Math.random()<.5?-1:1)*d.speed, vy: -d.speed, speed:d.speed },
      bricks: makeBricks(d.hp),
      width, height,
      keys:{left:false,right:false},
      multiballs:[],
      powerups:[],
    };
    updateHUD();
    draw();
  }

  function makeBricks(hp) {
    const { cols, rows, brickW, brickH, brickGap } = BASE;
    const offsetX = (canvas.width/dpr - (cols*brickW + (cols-1)*brickGap)) / 2;
    const offsetY = 70;
    const bricks = [];
    for (let r=0;r<rows;r++){
      bricks[r] = [];
      for (let c=0;c<cols;c++){
        bricks[r][c] = { x: offsetX + c*(brickW+brickGap), y: offsetY + r*(brickH+brickGap), w: brickW, h: brickH, hp: hp + Math.floor(r/2) };
      }
    }
    return bricks;
  }

  // ---------- draw helpers ----------
  function drawBackground(){
    const w = canvas.width, h = canvas.height;
    const g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#0d0f16'); g.addColorStop(1,'#0a0a0a');
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);

    // lightning
    ctx.save(); ctx.globalAlpha=.06; ctx.strokeStyle='#b77cff'; ctx.lineWidth=3*dpr; ctx.beginPath();
    const veins=5; for(let i=0;i<veins;i++){ let x=Math.random()*w; ctx.moveTo(x,0); let y=0; while(y<h){ x+=(Math.random()-.5)*60*dpr; y+=Math.random()*80*dpr; ctx.lineTo(x,y);} }
    ctx.stroke(); ctx.restore();

    // vignette
    const vg = ctx.createRadialGradient(w/2,h/2, Math.min(w,h)/6, w/2,h/2, Math.max(w,h)/1.1);
    vg.addColorStop(0,'#0000'); vg.addColorStop(1,'#000c');
    ctx.fillStyle=vg; ctx.fillRect(0,0,w,h);
  }
  function roundRect(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
  function drawPaddle(p){
    ctx.save();
    ctx.fillStyle='#aab4c0'; roundRect(p.x*dpr,p.y*dpr,p.w*dpr,p.h*dpr,8*dpr); ctx.fill();
    const g=ctx.createLinearGradient(p.x*dpr,p.y*dpr,(p.x+p.w)*dpr,(p.y+p.h)*dpr);
    g.addColorStop(0,'#ffffff15'); g.addColorStop(1,'#00000022');
    ctx.fillStyle=g; roundRect(p.x*dpr,p.y*dpr,p.w*dpr,p.h*dpr,8*dpr); ctx.fill();
    ctx.restore();
  }
  function drawBall(b){
    ctx.save();
    const x=b.x*dpr, y=b.y*dpr, r=b.r*dpr;
    const g=ctx.createRadialGradient(x-r/2,y-r/2, r/4, x,y,r);
    g.addColorStop(0,'#fff'); g.addColorStop(1,state.heavy?'#f06':'#9cf');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=.25; ctx.beginPath(); ctx.arc(x,y,r*2.3,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  function drawBricks(){
    const bricks=state.bricks; if(!bricks) return;
    for(let r=0;r<bricks.length;r++){
      for(let c=0;c<bricks[r].length;c++){
        const b=bricks[r][c]; if(!b||b.hp<=0) continue;
        const x=b.x*dpr,y=b.y*dpr,w=b.w*dpr,h=b.h*dpr;
        const g=ctx.createLinearGradient(x,y,x+w,y+h);
        const shade = Math.min(1, .2+.15*r + .1*b.hp);
        g.addColorStop(0,`rgba(205,212,219,${0.6+shade*0.3})`);
        g.addColorStop(1,'rgba(42,47,56,1)');
        ctx.fillStyle=g; roundRect(x,y,w,h,6*dpr); ctx.fill();
        ctx.fillStyle='rgba(226,17,17,0.35)'; ctx.fillRect(x,y,w,2*dpr); // blood edge
        ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.font=`${12*dpr}px system-ui`; ctx.fillText('☠', x+w/2-6*dpr, y+h/2+5*dpr);
      }
    }
  }
  function drawPowerup(p){
    const x=p.x*dpr,y=p.y*dpr,w=p.w*dpr,h=p.h*dpr;
    ctx.save();
    ctx.fillStyle='rgba(158,255,0,0.9)'; roundRect(x,y,w,h,6*dpr); ctx.fill();
    ctx.fillStyle='#000'; ctx.font = `${16*dpr}px monospace`;
    ctx.fillText(p.icon, x+w/2-6*dpr, y+h/2+6*dpr);
    ctx.restore();
  }

  // ---------- HUD / loop ----------
  function updateHUD(){ if(scoreEl) scoreEl.textContent = state.score|0; if(livesEl) livesEl.textContent = state.lives; if(levelEl) levelEl.textContent = state.level; setBest(state.score); }

  let rafId=null, lastTime=0;
  function loop(t){
    if(!state?.running){ rafId=null; return; }
    if(!lastTime) lastTime=t; const dt=Math.min(33, t-lastTime); lastTime=t;
    update(dt/16.6667); draw(); rafId=requestAnimationFrame(loop);
  }

  function update(dt){
    const s=state; const w=s.width, h=s.height;

    // paddle
    s.paddle.x += s.paddle.vx * dt * BASE.paddleSpeed;
    s.paddle.x  = Math.max(8, Math.min(w - s.paddle.w - 8, s.paddle.x));

    // balls
    stepBall(s.ball, dt);
    s.multiballs = s.multiballs.filter(b=>!b._dead);
    for(const mb of s.multiballs) stepBall(mb, dt);

    // powerups
    for(const p of s.powerups){
      p.y += 2*dt;
      if (collideRect(p, s.paddle)) { applyPowerup(p.type); p._dead=true; playSFX('hit'); }
      if (p.y>h+40) p._dead=true;
    }
    s.powerups = s.powerups.filter(p=>!p._dead);

    if(s.slow>0) s.slow -= dt/60; else s.slow=0;
  }

  function stepBall(ball, dt){
    const s=state; const speed = ball.speed * (s.slow>0?0.6:1);
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;

    const r=ball.r, w=s.width, h=s.height;
    if(ball.x<r){ ball.x=r;    ball.vx=Math.abs(ball.vx);  playSFX('hit'); }
    if(ball.x>w-r){ ball.x=w-r; ball.vx=-Math.abs(ball.vx); playSFX('hit'); }
    if(ball.y<r){ ball.y=r;    ball.vy=Math.abs(ball.vy);  playSFX('hit'); }

    // paddle
    const p=s.paddle;
    if(ball.y>p.y-r && ball.y<p.y+p.h && ball.x>p.x && ball.x<p.x+p.w && ball.vy>0){
      const hit = (ball.x - (p.x+p.w/2))/(p.w/2); // -1..1
      ball.vy = -Math.abs(speed)*(0.9+0.2*Math.abs(hit));
      ball.vx = speed * hit * 1.1;
      s.combo = Math.min(10, s.combo+1);
      playSFX('hit');
    }

    // bricks
    const bres = hitBrick(ball);
    if(bres){
      const {b} = bres;
      if(!s.heavy){ (bres.axis==='x') ? (ball.vx*=-1) : (ball.vy*=-1); }
      b.hp--;
      if(b.hp<=0){
        s.score += 10 * Math.max(1, s.combo);
        if(Math.random()<0.12) spawnPowerup(b.x+b.w/2, b.y+b.h/2);
        playSFX('hit');
      } else playSFX('hit');
      updateHUD();
    }

    // fall
    if(ball.y>h+r){
      if(ball._multi){ ball._dead=true; return; }
      s.lives--; s.combo=0; updateHUD();
      if(s.lives<=0){ endGame(); return; }
      s.waitingLaunch=true; placeBallOnPaddle(ball); playSFX('lose');
    }

    // win level
    if(allBricksBroken()){
      s.level++; if(levelEl) levelEl.textContent = s.level;
      if(tagWin && (!musicToggle || musicToggle.checked)) { try{ tagWin.currentTime=0; tagWin.play(); }catch(_){} }
      ball.speed *= 1.08; ball.vx*=1.08; ball.vy*=1.08;
      state.bricks = makeBricks(diffParams(difficultySel?.value || 'normal').hp + Math.floor((s.level-1)/2));
    }
  }

  function placeBallOnPaddle(ball){ ball.x = state.paddle.x + state.paddle.w/2; ball.y = state.paddle.y - ball.r - 2; ball.vx = (Math.random()<.5?-1:1)*ball.speed; ball.vy = -Math.abs(ball.speed); }
  function hitBrick(ball){ const bricks=state.bricks; const r=ball.r; for(let row of bricks){ for(let b of row){ if(!b||b.hp<=0) continue; if(ball.x+r>b.x && ball.x-r<b.x+b.w && ball.y+r>b.y && ball.y-r<b.y+b.h){ return {b, axis: axisOfImpact(ball,b)}; } } } return null; }
  function axisOfImpact(ball,b){ const cx=ball.x-(b.x+b.w/2); const cy=ball.y-(b.y+b.h/2); const dx=(b.w/2+ball.r)-Math.abs(cx); const dy=(b.h/2+ball.r)-Math.abs(cy); return dx<dy?'x':'y'; }
  function allBricksBroken(){ for(let r of state.bricks){ for(let b of r){ if(b&&b.hp>0) return false; } } return true; }

  // ---------- power-ups ----------
  function spawnPowerup(x,y){
    const types=['multi','heavy','widen','slow'];
    const type = types[Math.floor(Math.random()*types.length)];
    const icon = type==='multi'?'⛧': type==='heavy'?'🜏': type==='widen'?'🜍':'✺';
    const w=36,h=22;
    state.powerups.push({ type, icon, x:x-w/2, y, w, h });
  }
  function applyPowerup(type){
    const s=state;
    if(type==='multi'){
      for(let i=0;i<2;i++){
        const nb={...s.ball}; nb._multi=true; nb.vx*=(i===0?1.1:-1.1); nb.vy*=1.05; s.multiballs.push(nb);
      }
    } else if(type==='heavy'){
      s.heavy=true; setTimeout(()=> s.heavy=false, 6000);
    } else if(type==='widen'){
      s.paddle.w=Math.min(s.paddle.w+40, BASE.paddleW*1.8); setTimeout(()=> s.paddle.w=BASE.paddleW, 10000);
    } else if(type==='slow'){
      s.slow=1;
    }
  }

  // ---------- input ----------
  let dragging=false, dragId=null;
  function movePaddleTo(clientX){
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    state.paddle.x = Math.max(8, Math.min(state.width - state.paddle.w - 8, x - state.paddle.w/2));
    if(state.waitingLaunch) placeBallOnPaddle(state.ball);
  }
  on(canvas,'mousedown', e=>{ dragging=true; movePaddleTo(e.clientX); ensureAudio(); });
  on(window,'mousemove', e=>{ if(dragging) movePaddleTo(e.clientX); });
  on(window,'mouseup', ()=> dragging=false);

  on(canvas,'touchstart', (e)=>{ ensureAudio(); dragging=true; dragId=e.changedTouches[0].identifier; movePaddleTo(e.changedTouches[0].clientX); e.preventDefault(); }, {passive:false});
  on(canvas,'touchmove', (e)=>{ const t=[...e.changedTouches].find(t=>t.identifier===dragId); if(t){ movePaddleTo(t.clientX); e.preventDefault(); } }, {passive:false});
  on(canvas,'touchend', ()=>{ dragging=false; dragId=null; });

  on(window,'keydown', (e)=>{
    if(e.code==='ArrowLeft'){ state.keys.left=true;  state.paddle.vx=-1; }
    if(e.code==='ArrowRight'){state.keys.right=true; state.paddle.vx= 1; }
    if(e.code==='Space'){ if(state.waitingLaunch){ state.waitingLaunch=false; playSFX('hit'); } }
    if(e.code==='KeyP'){ togglePause(); }
  });
  on(window,'keyup', (e)=>{
    if(e.code==='ArrowLeft'){ state.keys.left=false;  state.paddle.vx = state.keys.right? 1 : 0; }
    if(e.code==='ArrowRight'){state.keys.right=false; state.paddle.vx = state.keys.left ?-1 : 0; }
  });

  // Mobile HUD / old arrow buttons
  on(leftBtn,  'touchstart', e=>{ e.preventDefault(); state.paddle.vx=-1; }, {passive:false});
  on(leftBtn,  'touchend',   ()=>{ if(state.paddle.vx<0) state.paddle.vx=0; });
  on(rightBtn, 'touchstart', e=>{ e.preventDefault(); state.paddle.vx= 1; }, {passive:false});
  on(rightBtn, 'touchend',   ()=>{ if(state.paddle.vx>0) state.paddle.vx=0; });
  on(launchBtn,'touchstart', e=>{ e.preventDefault(); if(state.waitingLaunch){ state.waitingLaunch=false; playSFX('hit'); } });

  // ---------- overlays & controls ----------
  function show(el, v=true){ if(!el) return; el.style.display = v? 'grid' : 'none'; el.classList.toggle('hidden', !v); }

  function startGame(){
    show(intro,false); show(help,false); show(paused,false); show(gameover,false);
    newGame(); resume(); playMusic(true); countdown3();
  }
  function endGame(){
    if(finalScore) finalScore.textContent = state.score;
    show(gameover,true); pause(); playMusic(false); playSFX('death');
    let initials = (prompt('Enter your initials for the leaderboard (3 letters):','TNB')||'').toUpperCase().slice(0,3);
    if(initials) saveScore(initials, state.score);
  }
  function pause(){ state.running=false; show(paused,true); }
  function resume(){ show(paused,false); if(!state.running){ state.running=true; lastTime=0; requestAnimationFrame(loop); } }
  function togglePause(){ if(!state) return; if(!state.running){ resume(); playMusic(true); } else { pause(); playMusic(false); } }

  function countdown3(){
    let n=3;
    const tick=()=>{ if(n===0) return;
      const w=canvas.width, h=canvas.height; draw();
      ctx.save(); ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fillRect(0,0,w,h);
      ctx.fillStyle='#fff'; ctx.font=`${88*dpr}px Impact, sans-serif`; ctx.textAlign='center'; ctx.fillText(String(n), w/2, h/2); ctx.restore();
      n--; if(n>0) setTimeout(tick, 500);
    };
    setTimeout(tick, 50);
  }

  on(startBtn,'click', startGame);
  on(pauseBtn,'click', togglePause);
  on(helpBtn,'click',  ()=>{ show(help,true); show(intro,false); });

  on(introStart,'click', startGame);
  on(introHelp,'click',  ()=> show(help,true));
  on(closeHelp,'click',  ()=> show(help,false));
  on(startFromHelp,'click', startGame);
  on(resumeBtn,'click',   resume);
  on(restartBtn,'click',  startGame);
  on(againBtn,'click',    startGame);

  on(canvas,'click', ()=>{ if(state && state.waitingLaunch){ state.waitingLaunch=false; playSFX('hit'); } });

  // ---------- utils ----------
  function collideRect(a, b){
    // Treat a as rect (powerup), b as paddle rect
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------- render ----------
  function draw(){
    drawBackground();
    drawBricks();
    drawPaddle(state.paddle);
    drawBall(state.ball);
    for(const b of state.multiballs) drawBall(b);
    if(state.powerups) for(const p of state.powerups) drawPowerup(p);

    // watermark
    ctx.save(); ctx.globalAlpha=.05; ctx.fillStyle='#fff'; ctx.font=`${64*dpr}px Impact, system-ui, sans-serif`;
    ctx.fillText('TENEBRIS ARMY', 20*dpr, (state.height-20)*dpr);
    ctx.restore();
  }

  // ---------- boot ----------
  if (bestEl) bestEl.textContent = best;
  if (bestSideEl) bestSideEl.textContent = best;
  renderTable();
  newGame();

  // If the page has no Start button/overlay (e.g., old page), auto-start:
  if (!startBtn && !introStart && !intro) { state.running = true; requestAnimationFrame(loop); }
})();
