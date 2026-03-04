import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    let panel: vscode.WebviewPanel | undefined;

    const cmd = vscode.commands.registerCommand('an-dr-cats.openGame', () => {
        if (panel) {
            panel.reveal();
            return;
        }

        panel = vscode.window.createWebviewPanel(
            'an-dr-cats',
            '🐱 Cat Catcher',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = getGameHtml();

        panel.onDidDispose(() => { panel = undefined; }, null, context.subscriptions);
    });

    context.subscriptions.push(cmd);
}

export function deactivate() {}

function getGameHtml(): string {
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cat Catcher</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: linear-gradient(to bottom right, #312e81, #6b21a8, #be185d);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: sans-serif;
  }
  #root {
    width: 600px;
    max-width: 98vw;
  }
  .ui-top {
    display: flex;
    justify-content: space-between;
    margin-bottom: 1rem;
  }
  .score-box, .timer-box {
    background: rgba(0,0,0,0.5);
    backdrop-filter: blur(10px);
    border-radius: 1rem;
    padding: 0.75rem 1.5rem;
    color: white;
  }
  .score, .timer { font-size: 1.5rem; font-weight: bold; }
  .combo { font-size: 0.875rem; color: #fcd34d; min-height: 1.25rem; }
  .combo-active { animation: pulse 1s infinite; }
  .timer-warning { color: #f87171; animation: pulse 1s infinite; }
  .game-area {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    background: rgba(0,0,0,0.2);
    backdrop-filter: blur(10px);
    border-radius: 1.5rem;
    overflow: hidden;
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,0.8);
    z-index: 20;
    gap: 1rem;
  }
  .title { font-size: 3rem; font-weight: bold; color: white; }
  .subtitle { font-size: 1.25rem; color: #d1d5db; }
  .highscore, .score-final { font-size: 1.5rem; color: #fbbf24; font-weight: bold; }
  .new-record { font-size: 1.25rem; color: #4ade80; animation: pulse 1s infinite; }
  .btn {
    background: linear-gradient(to right, #ec4899, #a855f7, #3b82f6);
    color: white;
    padding: 1rem 3rem;
    border-radius: 9999px;
    font-size: 1.5rem;
    font-weight: bold;
    border: none;
    cursor: pointer;
    transition: transform 0.2s;
  }
  .btn:hover { transform: scale(1.1); }
  .btn:active { transform: scale(0.95); }
  .cat {
    position: absolute;
    cursor: pointer;
    transition: transform 0.2s;
  }
  .cat:hover { transform: scale(1.1); }
  .cat:active { transform: scale(0.95); }
  .particle {
    position: absolute;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    pointer-events: none;
    animation: particleExplode 0.6s ease-out forwards;
  }
  @keyframes catFloat {
    0%,100% { transform: translate(0,0); }
    25% { transform: translate(10px,-15px); }
    50% { transform: translate(-8px,-5px); }
    75% { transform: translate(5px,-20px); }
  }
  @keyframes tailWag {
    0%,100% { transform: rotate(-8deg); }
    50% { transform: rotate(8deg); }
  }
  @keyframes breathe {
    0%,100% { transform: scale(1); }
    50% { transform: scale(1.04); }
  }
  @keyframes earTwitch {
    0%,100% { transform: rotate(0deg); }
    50% { transform: rotate(-4deg); }
  }
  @keyframes blink {
    0%,90%,100% { transform: scaleY(1); }
    95% { transform: scaleY(0.1); }
  }
  @keyframes pulse {
    0%,100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
  @keyframes particleExplode {
    0% { transform: translate(0,0) scale(1); opacity: 1; }
    100% {
      transform: translate(calc(cos(var(--angle)) * 80px), calc(sin(var(--angle)) * 80px)) scale(0);
      opacity: 0;
    }
  }
</style>
</head>
<body>
<div id="root">
  <div class="ui-top">
    <div class="score-box">
      <div class="score" id="score">⭐ 0</div>
      <div class="combo" id="combo"></div>
    </div>
    <div class="timer-box">
      <div class="timer" id="timer">🕐 30s</div>
    </div>
  </div>
  <div class="game-area" id="gameArea"></div>
</div>

<script>
(function() {
  const holoGradients = [
    ['#ff00ff','#00ffff','#ffff00'],
    ['#ff0080','#0080ff','#00ff80'],
    ['#ff69b4','#9370db','#00ced1'],
    ['#ff1493','#1e90ff','#00ff7f'],
    ['#ff6b9d','#c44569','#ffa502'],
    ['#a8e6cf','#dcedc1','#ffd3b6'],
  ];

  let cats = [], score = 0, timeLeft = 30, gameState = 'start';
  let combo = 0, highScore = 0, nextCatId = 0;
  let gameTimer, spawnTimer, cleanupTimer, comboTimer;

  const scoreEl = document.getElementById('score');
  const comboEl = document.getElementById('combo');
  const timerEl = document.getElementById('timer');
  const gameArea = document.getElementById('gameArea');

  function rand(min, max) { return Math.random() * (max - min) + min; }

  function renderOverlay(html) {
    let ov = gameArea.querySelector('.overlay');
    if (!ov) { ov = document.createElement('div'); ov.className = 'overlay'; gameArea.appendChild(ov); }
    ov.innerHTML = html;
    return ov;
  }

  function removeOverlay() {
    const ov = gameArea.querySelector('.overlay');
    if (ov) ov.remove();
  }

  function showStart() {
    const hs = highScore > 0 ? \`<div class="highscore">🏆 Best: \${highScore}</div>\` : '';
    const ov = renderOverlay(\`
      <div class="title">✨ Cat Catcher</div>
      <div class="subtitle">Click the holographic cats!</div>
      \${hs}
      <button class="btn" id="startBtn">START GAME</button>
    \`);
    ov.querySelector('#startBtn').addEventListener('click', startGame);
  }

  function showGameOver() {
    const nr = (score === highScore && score > 0) ? '<div class="new-record">🎉 NEW HIGH SCORE! 🎉</div>' : '';
    const ov = renderOverlay(\`
      <div class="title">🏆 Game Over!</div>
      <div class="score-final">Score: \${score}</div>
      \${nr}
      <button class="btn" id="playBtn">PLAY AGAIN</button>
    \`);
    ov.querySelector('#playBtn').addEventListener('click', startGame);
  }

  function startGame() {
    gameState = 'playing';
    score = 0; timeLeft = 30; cats = []; combo = 0; nextCatId = 0;
    scoreEl.textContent = '⭐ 0';
    comboEl.textContent = '';
    comboEl.classList.remove('combo-active');
    timerEl.textContent = '🕐 30s';
    timerEl.classList.remove('timer-warning');
    removeOverlay();

    // Clear existing cats
    gameArea.querySelectorAll('.cat').forEach(el => el.remove());

    gameTimer = setInterval(() => {
      timeLeft--;
      timerEl.textContent = \`🕐 \${timeLeft}s\`;
      if (timeLeft < 10) timerEl.classList.add('timer-warning');
      if (timeLeft <= 0) endGame();
    }, 1000);

    spawnTimer = setInterval(() => spawnCat(), Math.max(1000 - (30 - timeLeft) * 20, 400));

    cleanupTimer = setInterval(() => {
      const now = Date.now();
      cats = cats.filter(cat => {
        if (now - cat.createdAt > cat.lifetime) { cat.element?.remove(); return false; }
        return true;
      });
    }, 100);
  }

  function endGame() {
    gameState = 'gameOver';
    clearInterval(gameTimer); clearInterval(spawnTimer); clearInterval(cleanupTimer);
    if (score > highScore) highScore = score;
    cats.forEach(cat => cat.element?.remove()); cats = [];
    showGameOver();
  }

  function spawnCat() {
    if (gameState !== 'playing') return;
    const cat = {
      id: nextCatId++,
      x: rand(5, 80), y: rand(5, 70),
      size: rand(70, 110),
      gradient: holoGradients[Math.floor(rand(0, holoGradients.length))],
      speed: rand(2, 4),
      lifetime: rand(3000, 5000),
      earHeight: rand(30, 45), earWidth: rand(25, 35),
      tailCurve: rand(20, 35), whiskerLength: rand(18, 25),
      createdAt: Date.now(),
    };
    cats.push(cat);

    const el = document.createElement('div');
    el.className = 'cat';
    el.style.left = cat.x + '%';
    el.style.top = cat.y + '%';
    el.style.width = cat.size + 'px';
    el.style.height = cat.size + 'px';
    el.style.animation = \`catFloat \${cat.speed}s ease-in-out infinite\`;
    el.innerHTML = catSVG(cat);
    el.addEventListener('click', e => catchCat(cat, e));
    cat.element = el;
    gameArea.appendChild(el);
  }

  function catSVG(cat) {
    const gId = 'g' + cat.id, fId = 'f' + cat.id;
    return \`<svg viewBox="0 0 200 200" style="filter:drop-shadow(0 0 10px rgba(255,255,255,0.6))">
      <defs>
        <linearGradient id="\${gId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="\${cat.gradient[0]}"/>
          <stop offset="50%" stop-color="\${cat.gradient[1]}"/>
          <stop offset="100%" stop-color="\${cat.gradient[2]}"/>
        </linearGradient>
        <filter id="\${fId}">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <path d="M 145 105 Q \${160+cat.tailCurve} \${85-cat.tailCurve} \${175+cat.tailCurve} 65"
            fill="none" stroke="url(#\${gId})" stroke-width="10" stroke-linecap="round" filter="url(#\${fId})"
            style="animation:tailWag \${cat.id%2+1}s ease-in-out infinite;transform-origin:145px 105px"/>
      <rect x="85" y="115" width="15" height="45" rx="7" fill="url(#\${gId})" filter="url(#\${fId})"/>
      <rect x="120" y="115" width="15" height="45" rx="7" fill="url(#\${gId})" filter="url(#\${fId})"/>
      <ellipse cx="100" cy="100" rx="45" ry="35" fill="url(#\${gId})" filter="url(#\${fId})"
               style="animation:breathe \${2+cat.id%2}s ease-in-out infinite"/>
      <circle cx="100" cy="60" r="30" fill="url(#\${gId})" filter="url(#\${fId})"/>
      <path d="M 65 50 L \${55-cat.earWidth*0.6} \${50-cat.earHeight} L \${80+cat.earWidth*0.3} 50 Z"
            fill="url(#\${gId})" filter="url(#\${fId})"
            style="animation:earTwitch \${2.5+cat.id%2}s ease-in-out infinite;transform-origin:70px 50px"/>
      <path d="M 135 50 L \${145+cat.earWidth*0.6} \${50-cat.earHeight} L \${120-cat.earWidth*0.3} 50 Z"
            fill="url(#\${gId})" filter="url(#\${fId})"
            style="animation:earTwitch \${2.5+cat.id%2}s ease-in-out infinite reverse;transform-origin:130px 50px"/>
      <path d="M 72 50 L \${62-cat.earWidth*0.4} \${50-cat.earHeight*0.7} L \${77+cat.earWidth*0.2} 50 Z" fill="#000" opacity="0.35"/>
      <path d="M 128 50 L \${138+cat.earWidth*0.4} \${50-cat.earHeight*0.7} L \${123-cat.earWidth*0.2} 50 Z" fill="#000" opacity="0.35"/>
      <line x1="70" y1="62" x2="\${70-cat.whiskerLength}" y2="60" stroke="#fff" stroke-width="1.5" opacity="0.8" stroke-linecap="round"/>
      <line x1="70" y1="65" x2="\${70-cat.whiskerLength}" y2="65" stroke="#fff" stroke-width="1.5" opacity="0.8" stroke-linecap="round"/>
      <line x1="70" y1="68" x2="\${70-cat.whiskerLength}" y2="70" stroke="#fff" stroke-width="1.5" opacity="0.8" stroke-linecap="round"/>
      <line x1="130" y1="62" x2="\${130+cat.whiskerLength}" y2="60" stroke="#fff" stroke-width="1.5" opacity="0.8" stroke-linecap="round"/>
      <line x1="130" y1="65" x2="\${130+cat.whiskerLength}" y2="65" stroke="#fff" stroke-width="1.5" opacity="0.8" stroke-linecap="round"/>
      <line x1="130" y1="68" x2="\${130+cat.whiskerLength}" y2="70" stroke="#fff" stroke-width="1.5" opacity="0.8" stroke-linecap="round"/>
      <circle cx="88" cy="60" r="6" fill="#000" opacity="0.8" style="animation:blink \${3+cat.id%2}s ease-in-out infinite"/>
      <circle cx="112" cy="60" r="6" fill="#000" opacity="0.8" style="animation:blink \${3+cat.id%2}s ease-in-out infinite"/>
      <circle cx="90" cy="58" r="2" fill="#fff"/>
      <circle cx="114" cy="58" r="2" fill="#fff"/>
      <circle cx="100" cy="68" r="3" fill="#000" opacity="0.7"/>
      <path d="M 100 68 L 95 72" stroke="#000" stroke-width="1.5" opacity="0.5" stroke-linecap="round"/>
      <path d="M 100 68 L 105 72" stroke="#000" stroke-width="1.5" opacity="0.5" stroke-linecap="round"/>
    </svg>\`;
  }

  function catchCat(cat, event) {
    const rect = gameArea.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    for (let i = 0; i < 12; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = x + '%'; p.style.top = y + '%';
      p.style.backgroundColor = cat.gradient[i % 3];
      p.style.setProperty('--angle', (i / 12 * 360) + 'deg');
      gameArea.appendChild(p);
      setTimeout(() => p.remove(), 600);
    }
    cat.element?.remove();
    cats = cats.filter(c => c.id !== cat.id);
    const bonus = combo > 0 ? combo : 1;
    score += 10 * bonus;
    combo++;
    scoreEl.textContent = \`⭐ \${score}\`;
    if (combo > 1) {
      comboEl.textContent = \`\${combo}x COMBO! 🔥\`;
      comboEl.classList.add('combo-active');
    }
    clearTimeout(comboTimer);
    comboTimer = setTimeout(() => {
      combo = 0;
      comboEl.textContent = '';
      comboEl.classList.remove('combo-active');
    }, 2000);
  }

  showStart();
})();
</script>
</body>
</html>`;
}
