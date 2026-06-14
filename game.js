(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this);
  var wxApi = typeof wx !== 'undefined' ? wx : null;
  var canvas = createGameCanvas();
  var ctx = canvas.getContext('2d');
  var pixelRatio = 1;
  var viewW = 0;
  var viewH = 0;
  var now = 0;
  var buttons = [];
  var layoutCache = null;
  var raf = root.requestAnimationFrame || function (fn) { return setTimeout(function () { fn(Date.now()); }, 16); };

  var COLORS = {
    ink: '#2a1915',
    parchment: '#ead39b',
    parchmentDeep: '#c89a56',
    gold: '#f4c85d',
    darkGold: '#94662b',
    wood: '#6d3f25',
    woodDark: '#2b1714',
    teal: '#2aa7a2',
    red: '#c34d4d',
    blue: '#3c78bb',
    violet: '#7d5ab8',
    green: '#5f9f55',
    shadow: 'rgba(24, 10, 8, 0.55)',
    cream: '#fff3c9'
  };

  var MAX_LEVEL = 4;
  var MAX_MANA = 10;
  var START_REWARD = 120;

  var BOARD = [
    { type: 'start', name: '起点', desc: '补给' },
    { type: 'property', name: '铜锤铺', cost: 80, rent: 16, color: '#bf5a43', group: '炉火' },
    { type: 'event', name: '奇遇' },
    { type: 'property', name: '银叶坊', cost: 90, rent: 18, color: '#69a95c', group: '月林' },
    { type: 'tax', name: '关税', amount: 70 },
    { type: 'property', name: '蓝焰塔', cost: 120, rent: 24, color: '#3c82bd', group: '奥术' },
    { type: 'bonus', name: '悬赏', amount: 75 },
    { type: 'property', name: '狮鹫驿', cost: 135, rent: 27, color: '#d99c39', group: '王城' },
    { type: 'event', name: '奇遇' },
    { type: 'property', name: '星穹集', cost: 155, rent: 31, color: '#6b62b7', group: '奥术' },
    { type: 'tax', name: '修缮', amount: 85 },
    { type: 'property', name: '符文窖', cost: 175, rent: 35, color: '#9e5f3f', group: '炉火' },
    { type: 'portal', name: '传送' },
    { type: 'property', name: '霜纹港', cost: 190, rent: 38, color: '#59a7c7', group: '潮汐' },
    { type: 'bonus', name: '宝箱', amount: 95 },
    { type: 'property', name: '金盏台', cost: 210, rent: 42, color: '#d2b144', group: '王城' },
    { type: 'event', name: '奇遇' },
    { type: 'property', name: '奥术院', cost: 235, rent: 47, color: '#8d65c8', group: '奥术' },
    { type: 'tax', name: '龙息税', amount: 110 },
    { type: 'property', name: '月影泉', cost: 245, rent: 49, color: '#5b8dce', group: '月林' },
    { type: 'property', name: '黑曜矿', cost: 265, rent: 53, color: '#44485d', group: '炉火' },
    { type: 'event', name: '奇遇' },
    { type: 'property', name: '王冠库', cost: 290, rent: 58, color: '#bb7a35', group: '王城' },
    { type: 'bonus', name: '分红', amount: 115 }
  ];

  var EVENT_CARDS = [
    {
      text: '酒馆吟游诗人唱红了你的店，获得 90 金币和 1 点法力。',
      apply: function (idx) {
        state.players[idx].coins += 90;
        gainMana(idx, 1);
      }
    },
    {
      text: '地精会计发现漏账，支付 90 金币。',
      apply: function (idx) {
        chargePlayer(idx, 90);
      }
    },
    {
      text: '抽到传送卷轴，前进 4 格。',
      move: 4
    },
    {
      text: '深夜巡逻误入小巷，后退 3 格。',
      move: -3
    },
    {
      text: '魔法拍卖大赚一笔，从对手处获得 70 金币。',
      apply: function (idx) {
        transfer(1 - idx, idx, 70);
      }
    },
    {
      text: '炉边赌局失手，付给对手 65 金币。',
      apply: function (idx) {
        transfer(idx, 1 - idx, 65);
      }
    },
    {
      text: '王城订单到手，所有地产各收 16 金币。',
      apply: function (idx) {
        var owned = countProperties(idx);
        state.players[idx].coins += owned * 16;
      }
    },
    {
      text: '镜像护符泛起蓝光，获得 85 点护盾。',
      apply: function (idx) {
        state.players[idx].shield += 85;
      }
    },
    {
      text: '暗月契约生效，对手下一笔支出额外增加 45 金币。',
      apply: function (idx) {
        state.players[1 - idx].hex += 45;
      }
    },
    {
      text: '工匠重铸地契，随机一块自己的地产免费升 1 级。',
      apply: function (idx) {
        upgradeRandomOwnedProperty(idx);
      }
    },
    {
      text: '法力泉涌，获得 3 点法力。',
      apply: function (idx) {
        gainMana(idx, 3);
      }
    },
    {
      text: '秘法骰刻上闪电纹，下一次掷骰 +2。',
      apply: function (idx) {
        state.players[idx].nextRollBonus += 2;
      }
    }
  ];

  var SPELLS = [
    {
      id: 'ward',
      label: '秘银盾',
      cost: 3,
      apply: function (idx) {
        spendMana(idx, 3);
        state.players[idx].shield += 105;
        addLog(state.players[idx].name + ' 施放秘银盾，获得 105 点护盾。');
      }
    },
    {
      id: 'resonance',
      label: '地契鸣',
      cost: 4,
      apply: function (idx) {
        spendMana(idx, 4);
        var coins = countProperties(idx) * 18 + countCompleteGroups(idx) * 35;
        state.players[idx].coins += coins;
        addLog(state.players[idx].name + ' 触发地契共鸣，获得 ' + coins + ' 金币。');
      }
    },
    {
      id: 'hex',
      label: '厄运咒',
      cost: 5,
      apply: function (idx) {
        spendMana(idx, 5);
        state.players[1 - idx].hex += 55;
        state.players[1 - idx].slow += 1;
        addLog(state.players[idx].name + ' 施放厄运咒，对手下一笔支出 +55，下一次掷骰 -1。');
      }
    }
  ];

  var state = null;

  init();

  function createGameCanvas() {
    if (wxApi && wxApi.createCanvas) {
      return wxApi.createCanvas();
    }

    var existing = root.document && root.document.getElementById('gameCanvas');
    if (existing) {
      return existing;
    }

    var created = root.document.createElement('canvas');
    root.document.body.appendChild(created);
    return created;
  }

  function init() {
    resetGame();
    setupShare();
    resize();
    bindInput();
    bindResize();
    loop(0);
  }

  function resetGame() {
    state = {
      players: [
        { name: '你', color: COLORS.teal, pos: 0, coins: 560, mana: 1, shield: 0, hex: 0, slow: 0, nextRollBonus: 0, properties: [], token: 'gem' },
        { name: '老板', color: COLORS.red, pos: 0, coins: 650, mana: 2, shield: 40, hex: 0, slow: 0, nextRollBonus: 0, properties: [], token: 'coin' }
      ],
      owners: new Array(BOARD.length),
      levels: new Array(BOARD.length),
      turn: 0,
      phase: 'ready',
      round: 1,
      dice: 1,
      rollingUntil: 0,
      movingPlayer: -1,
      pulse: 0,
      spellUsed: false,
      danger: 1,
      prompt: '掷骰、买地、攒法力，抢下成套地契。',
      lastEvent: '',
      log: ['困难模式开启：对手资金更多，AI 会施法。'],
      pending: null,
      gameOver: false,
      winner: null
    };

    for (var i = 0; i < BOARD.length; i += 1) {
      state.owners[i] = -1;
      state.levels[i] = 1;
    }
  }

  function setupShare() {
    if (!wxApi) {
      return;
    }

    if (wxApi.showShareMenu) {
      wxApi.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage']
      });
    }

    if (wxApi.onShareAppMessage) {
      wxApi.onShareAppMessage(function () {
        return {
          title: '来挑战一局秘法富翁棋',
          query: 'from=share'
        };
      });
    }
  }

  function resize() {
    var sys = null;

    if (wxApi && wxApi.getSystemInfoSync) {
      sys = wxApi.getSystemInfoSync();
      viewW = sys.windowWidth || 375;
      viewH = sys.windowHeight || 667;
      pixelRatio = sys.pixelRatio || 1;
    } else {
      viewW = root.innerWidth || 375;
      viewH = root.innerHeight || 667;
      pixelRatio = root.devicePixelRatio || 1;
    }

    canvas.width = Math.floor(viewW * pixelRatio);
    canvas.height = Math.floor(viewH * pixelRatio);

    if (canvas.style) {
      canvas.style.width = viewW + 'px';
      canvas.style.height = viewH + 'px';
    }

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    layoutCache = buildLayout();
  }

  function bindResize() {
    if (wxApi && wxApi.onWindowResize) {
      wxApi.onWindowResize(resize);
    } else if (root.addEventListener) {
      root.addEventListener('resize', resize);
    }
  }

  function bindInput() {
    var handler = function (event) {
      var point = getInputPoint(event);
      if (!point) {
        return;
      }
      handleTap(point.x, point.y);
    };

    if (canvas.addEventListener) {
      canvas.addEventListener('touchstart', handler, { passive: false });
      canvas.addEventListener('mousedown', handler);
    }

    if (wxApi && wxApi.onTouchStart) {
      wxApi.onTouchStart(handler);
    }
  }

  function getInputPoint(event) {
    var touch = event && event.touches && event.touches.length ? event.touches[0] : event;
    if (!touch) {
      return null;
    }

    if (typeof touch.clientX === 'number') {
      if (canvas.getBoundingClientRect) {
        var rect = canvas.getBoundingClientRect();
        return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
      }
      return { x: touch.clientX, y: touch.clientY };
    }

    if (typeof touch.x === 'number') {
      return { x: touch.x, y: touch.y };
    }

    return null;
  }

  function handleTap(x, y) {
    for (var i = buttons.length - 1; i >= 0; i -= 1) {
      var b = buttons[i];
      if (!b.disabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        b.action();
        return;
      }
    }
  }

  function loop(t) {
    now = t || Date.now();
    if (state.phase === 'rolling') {
      state.dice = 1 + Math.floor(Math.random() * 6);
      if (now >= state.rollingUntil) {
        finishDiceRoll();
      }
    }

    state.pulse = (Math.sin(now / 220) + 1) / 2;
    draw();
    raf(loop);
  }

  function buildLayout() {
    var topH = clamp(viewH * 0.16, 104, 132);
    var bottomH = clamp(viewH * 0.27, 182, 236);
    var maxBoard = viewH - topH - bottomH - 22;
    var boardSize = Math.floor(Math.min(viewW - 22, maxBoard));

    if (viewW >= 720 && viewH <= 620) {
      boardSize = Math.floor(Math.min(viewH - 150, viewW * 0.54));
    }

    boardSize = Math.max(292, boardSize);
    var boardX = Math.floor((viewW - boardSize) / 2);
    var boardY = Math.floor(topH + 8);
    var bottomY = boardY + boardSize + 10;

    return {
      topH: topH,
      board: { x: boardX, y: boardY, size: boardSize, cell: boardSize / 7 },
      bottom: { x: 12, y: bottomY, w: viewW - 24, h: Math.max(142, viewH - bottomY - 10) }
    };
  }

  function draw() {
    if (!layoutCache) {
      layoutCache = buildLayout();
    }

    buttons = [];
    drawBackground();
    drawHud();
    drawBoard();
    drawBottomPanel();
  }

  function drawBackground() {
    var grad = ctx.createLinearGradient(0, 0, 0, viewH);
    grad.addColorStop(0, '#31211d');
    grad.addColorStop(0.44, '#5c3924');
    grad.addColorStop(1, '#1b1314');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.save();
    ctx.globalAlpha = 0.18;
    for (var y = -20; y < viewH + 40; y += 32) {
      ctx.fillStyle = y % 64 === 0 ? '#9b6237' : '#2d1815';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(viewW * 0.28, y + 14, viewW * 0.62, y - 22, viewW, y + 7);
      ctx.lineTo(viewW, y + 18);
      ctx.bezierCurveTo(viewW * 0.64, y - 5, viewW * 0.28, y + 25, 0, y + 10);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    drawTableInlays();
    drawVignette();
  }

  function drawTableInlays() {
    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = '#d4a34d';
    ctx.lineWidth = 1;
    for (var i = 0; i < 5; i += 1) {
      var y = viewH * (0.18 + i * 0.15);
      ctx.beginPath();
      ctx.moveTo(18, y);
      ctx.bezierCurveTo(viewW * 0.28, y + 12, viewW * 0.7, y - 10, viewW - 18, y + 6);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.18 + state.pulse * 0.12;
    ctx.strokeStyle = '#66d7d2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(viewW / 2, layoutCache ? layoutCache.topH + 46 : viewH * 0.2, Math.min(viewW, viewH) * 0.36, 0.15, Math.PI - 0.15);
    ctx.stroke();
    ctx.restore();
  }

  function drawVignette() {
    var r = Math.max(viewW, viewH) * 0.75;
    var g = ctx.createRadialGradient(viewW / 2, viewH * 0.42, 20, viewW / 2, viewH * 0.42, r);
    g.addColorStop(0, 'rgba(255, 235, 163, 0.08)');
    g.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0.52)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  function drawHud() {
    var pad = 12;
    var gap = 8;
    var w = (viewW - pad * 2 - gap) / 2;
    var h = Math.min(96, layoutCache.topH - 16);

    drawPlayerBadge(state.players[0], pad, 10, w, h, state.turn === 0);
    drawPlayerBadge(state.players[1], pad + w + gap, 10, w, h, state.turn === 1);
  }

  function drawPlayerBadge(player, x, y, w, h, active) {
    ctx.save();
    drawShadowedRoundRect(x, y, w, h, 8, active ? 'rgba(246, 198, 91, 0.4)' : 'rgba(0,0,0,0.3)');

    var g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, active ? '#5c3827' : '#3b2823');
    g.addColorStop(1, '#1c1111');
    roundedRect(x, y, w, h, 8);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = active ? 2.5 : 1.2;
    ctx.strokeStyle = active ? COLORS.gold : 'rgba(238, 197, 102, 0.45)';
    ctx.stroke();

    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(x + 23, y + 29, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.cream;
    ctx.stroke();

    ctx.fillStyle = COLORS.cream;
    ctx.font = '700 15px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(player.name, x + 43, y + 10);

    ctx.font = '12px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#f2d681';
    ctx.fillText('金币 ' + player.coins, x + 43, y + 31);

    drawManaPips(player.mana, x + 43, y + 52, Math.min(8, w - 54));

    ctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = player.hex > 0 ? '#ffb2a2' : '#caa46e';
    var playerIndex = player === state.players[0] ? 0 : 1;
    var status = '地 ' + countProperties(playerIndex) + ' 盾 ' + player.shield;
    if (player.hex > 0) {
      status += ' 咒';
    }
    ctx.fillText(status, x + 43, y + 69);
    ctx.restore();
  }

  function drawManaPips(mana, x, y, maxWidth) {
    var pip = 8;
    var gap = 3;
    var shown = Math.min(MAX_MANA, mana);
    var maxPips = Math.max(1, Math.floor(maxWidth / (pip + gap)));
    var count = Math.min(shown, maxPips);

    for (var i = 0; i < maxPips; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x + i * (pip + gap) + pip / 2, y);
      ctx.lineTo(x + i * (pip + gap) + pip, y + pip / 2);
      ctx.lineTo(x + i * (pip + gap) + pip / 2, y + pip);
      ctx.lineTo(x + i * (pip + gap), y + pip / 2);
      ctx.closePath();
      ctx.fillStyle = i < count ? '#55d8ff' : 'rgba(130, 92, 68, 0.65)';
      ctx.fill();
      ctx.strokeStyle = i < count ? '#effbff' : 'rgba(242, 211, 143, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.font = '10px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#d9f7ff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(String(mana), x + maxPips * (pip + gap) + 1, y - 1);
  }

  function drawBoard() {
    var b = layoutCache.board;
    drawShadowedRoundRect(b.x - 8, b.y - 8, b.size + 16, b.size + 16, 14, 'rgba(0,0,0,0.48)');

    var frame = ctx.createLinearGradient(b.x, b.y, b.x + b.size, b.y + b.size);
    frame.addColorStop(0, '#a76537');
    frame.addColorStop(0.5, '#55301e');
    frame.addColorStop(1, '#c58a45');
    roundedRect(b.x - 7, b.y - 7, b.size + 14, b.size + 14, 14);
    ctx.fillStyle = frame;
    ctx.fill();
    ctx.strokeStyle = '#281412';
    ctx.lineWidth = 3;
    ctx.stroke();

    drawCenterTable(b);

    for (var i = 0; i < BOARD.length; i += 1) {
      drawTile(i, getTileRect(i));
    }

    drawCornerBolts(b);
    drawTokens();
  }

  function drawCenterTable(b) {
    var cell = b.cell;
    var x = b.x + cell + 7;
    var y = b.y + cell + 7;
    var w = b.size - cell * 2 - 14;
    var h = w;

    var parchment = ctx.createLinearGradient(x, y, x, y + h);
    parchment.addColorStop(0, '#fff0bf');
    parchment.addColorStop(0.58, '#e1bd77');
    parchment.addColorStop(1, '#ad743f');
    roundedRect(x, y, w, h, 16);
    ctx.fillStyle = parchment;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#6e3c23';
    ctx.stroke();

    drawArcaneSeal(x + w / 2, y + h * 0.58, Math.min(w, h) * 0.24);

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#885b32';
    for (var i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x + 18, y + 28 + i * 30);
      ctx.bezierCurveTo(x + w * 0.35, y + 22 + i * 31, x + w * 0.72, y + 42 + i * 25, x + w - 18, y + 30 + i * 29);
      ctx.stroke();
    }
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#422116';
    ctx.font = '800 26px "PingFang SC", "Microsoft YaHei", sans-serif';
    fitText('秘法富翁棋', x + w / 2, y + h * 0.23, w - 24, 26, 17, '#422116', 'center');

    drawTinyRunes(x + 22, y + h * 0.29, w - 44);

    ctx.font = '12px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#704525';
    wrapText(state.prompt, x + 24, y + h * 0.36, w - 48, 17, 3);

    drawDice(x + w / 2 - 23, y + h * 0.58 - 23, 46, state.dice);

    ctx.fillStyle = '#6a3a23';
    ctx.font = '700 13px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(state.turn === 0 ? '你的回合' : '对手回合', x + w / 2, y + h - 34);

    ctx.font = '12px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#8a5b33';
    ctx.fillText('第 ' + state.round + ' 轮  连锁 ' + countCompleteGroups(0), x + w / 2, y + h - 16);
  }

  function drawArcaneSeal(cx, cy, radius) {
    ctx.save();
    ctx.globalAlpha = 0.17 + state.pulse * 0.08;
    ctx.strokeStyle = '#3d8f98';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 1;
    ctx.strokeStyle = '#7b4aa5';
    ctx.beginPath();
    for (var i = 0; i < 6; i += 1) {
      var a = -Math.PI / 2 + i * Math.PI / 3;
      var x = cx + Math.cos(a) * radius * 0.82;
      var y = cy + Math.sin(a) * radius * 0.82;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.stroke();

    ctx.strokeStyle = '#e5c36d';
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.55, Math.PI * 0.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.restore();
  }

  function drawTinyRunes(x, y, w) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#6b3e24';
    ctx.lineWidth = 1;
    for (var i = 0; i < 7; i += 1) {
      var rx = x + (w / 6) * i;
      ctx.beginPath();
      ctx.moveTo(rx - 4, y);
      ctx.lineTo(rx, y + 5);
      ctx.lineTo(rx + 4, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDice(x, y, size, value) {
    var wobble = state.phase === 'rolling' ? Math.sin(now / 55) * 0.08 : 0;
    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.rotate(wobble);
    ctx.translate(-size / 2, -size / 2);

    var g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, '#fff6d5');
    g.addColorStop(1, '#d59b4a');
    roundedRect(0, 0, size, size, 9);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#6b371d';
    ctx.stroke();

    ctx.fillStyle = '#432217';
    if (value > 6) {
      ctx.font = '800 22px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(value), size / 2, size / 2 + 1);
      ctx.restore();
      return;
    }

    var pips = {
      1: [[0.5, 0.5]],
      2: [[0.3, 0.3], [0.7, 0.7]],
      3: [[0.3, 0.3], [0.5, 0.5], [0.7, 0.7]],
      4: [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]],
      5: [[0.3, 0.3], [0.7, 0.3], [0.5, 0.5], [0.3, 0.7], [0.7, 0.7]],
      6: [[0.3, 0.25], [0.7, 0.25], [0.3, 0.5], [0.7, 0.5], [0.3, 0.75], [0.7, 0.75]]
    }[value] || [[0.5, 0.5]];

    for (var i = 0; i < pips.length; i += 1) {
      ctx.beginPath();
      ctx.arc(size * pips[i][0], size * pips[i][1], size * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTile(index, rect) {
    var tile = BOARD[index];
    var owner = state.owners[index];
    var level = state.levels[index] || 1;

    ctx.save();
    roundedRect(rect.x + 1.5, rect.y + 1.5, rect.w - 3, rect.h - 3, 7);
    ctx.fillStyle = '#f0d89a';
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = '#704221';
    ctx.stroke();

    var bandColor = getTileColor(tile);
    roundedRect(rect.x + 5, rect.y + 5, rect.w - 10, Math.max(10, rect.h * 0.21), 4);
    ctx.fillStyle = bandColor;
    ctx.fill();
    drawTileCorners(rect, bandColor);

    if (owner >= 0) {
      if (tile.type === 'property' && ownsCompleteGroup(owner, tile.group)) {
        ctx.save();
        ctx.globalAlpha = 0.5 + state.pulse * 0.22;
        ctx.strokeStyle = '#ffe27f';
        ctx.lineWidth = 5;
        roundedRect(rect.x + 3, rect.y + 3, rect.w - 6, rect.h - 6, 7);
        ctx.stroke();
        ctx.restore();
      }
      ctx.lineWidth = 3;
      ctx.strokeStyle = state.players[owner].color;
      roundedRect(rect.x + 3, rect.y + 3, rect.w - 6, rect.h - 6, 7);
      ctx.stroke();
    }

    drawTileIcon(tile, rect);

    ctx.fillStyle = '#3e2117';
    ctx.font = '700 11px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(tile.name, rect.x + rect.w / 2, rect.y + rect.h * 0.64, rect.w - 8, 11, 8, '#3e2117', 'center');

    if (tile.type === 'property') {
      ctx.font = '9px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#6d4328';
      ctx.fillText(owner >= 0 ? 'Lv.' + level : tile.cost, rect.x + rect.w / 2, rect.y + rect.h - 9);
    }

    ctx.restore();
  }

  function drawTileCorners(rect, color) {
    ctx.save();
    ctx.strokeStyle = '#f5d47a';
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.72;
    var pad = 6;
    var len = Math.min(rect.w, rect.h) * 0.17;
    var corners = [
      [rect.x + pad, rect.y + pad, 1, 1],
      [rect.x + rect.w - pad, rect.y + pad, -1, 1],
      [rect.x + rect.w - pad, rect.y + rect.h - pad, -1, -1],
      [rect.x + pad, rect.y + rect.h - pad, 1, -1]
    ];

    for (var i = 0; i < corners.length; i += 1) {
      var c = corners[i];
      ctx.beginPath();
      ctx.moveTo(c[0], c[1] + c[3] * len);
      ctx.lineTo(c[0], c[1]);
      ctx.lineTo(c[0] + c[2] * len, c[1]);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = color;
    roundedRect(rect.x + rect.w * 0.18, rect.y + rect.h * 0.2, rect.w * 0.64, rect.h * 0.5, 8);
    ctx.fill();
    ctx.restore();
  }

  function drawTileIcon(tile, rect) {
    var cx = rect.x + rect.w / 2;
    var cy = rect.y + rect.h * 0.38;
    var r = Math.min(rect.w, rect.h) * 0.13;

    ctx.save();
    ctx.strokeStyle = '#5a2f1d';
    ctx.lineWidth = 1.6;
    ctx.fillStyle = getTileColor(tile);

    if (tile.type === 'property') {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r - 3);
      ctx.lineTo(cx + r + 4, cy);
      ctx.lineTo(cx + r, cy + r + 6);
      ctx.lineTo(cx - r, cy + r + 6);
      ctx.lineTo(cx - r - 4, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f8e9b2';
      ctx.fillRect(cx - r * 0.35, cy + r * 0.2, r * 0.7, r * 0.95);
    } else if (tile.type === 'event') {
      ctx.beginPath();
      ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff1bb';
      ctx.font = '800 18px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', cx, cy + 1);
    } else if (tile.type === 'tax') {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r - 5);
      ctx.lineTo(cx + r + 6, cy + r + 5);
      ctx.lineTo(cx - r - 6, cy + r + 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff0b8';
      ctx.fillRect(cx - 1.4, cy - r + 1, 2.8, r + 5);
      ctx.fillRect(cx - 1.4, cy + r + 1, 2.8, 3);
    } else if (tile.type === 'bonus') {
      roundedRect(cx - r - 5, cy - r, r * 2 + 10, r * 1.65, 4);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r - 5, cy - r * 0.2);
      ctx.lineTo(cx + r + 5, cy - r * 0.2);
      ctx.stroke();
    } else if (tile.type === 'portal') {
      ctx.beginPath();
      ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#fff0a8';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r + 1 + state.pulse * 3, 0, Math.PI * 1.55);
      ctx.strokeStyle = '#56d7d0';
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff2bd';
      ctx.beginPath();
      ctx.moveTo(cx, cy - r - 1);
      ctx.lineTo(cx + r * 0.55, cy + r);
      ctx.lineTo(cx - r * 0.7, cy - r * 0.1);
      ctx.lineTo(cx + r * 0.7, cy - r * 0.1);
      ctx.lineTo(cx - r * 0.55, cy + r);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function getTileColor(tile) {
    if (tile.type === 'property') {
      return tile.color;
    }
    if (tile.type === 'event') {
      return COLORS.violet;
    }
    if (tile.type === 'tax') {
      return '#9d3c36';
    }
    if (tile.type === 'bonus') {
      return '#c99b36';
    }
    if (tile.type === 'portal') {
      return '#26918f';
    }
    return '#6b9d53';
  }

  function drawCornerBolts(b) {
    var points = [
      [b.x + 9, b.y + 9],
      [b.x + b.size - 9, b.y + 9],
      [b.x + b.size - 9, b.y + b.size - 9],
      [b.x + 9, b.y + b.size - 9]
    ];
    ctx.save();
    for (var i = 0; i < points.length; i += 1) {
      var p = points[i];
      var g = ctx.createRadialGradient(p[0] - 2, p[1] - 2, 1, p[0], p[1], 8);
      g.addColorStop(0, '#fff0a5');
      g.addColorStop(1, '#8a5528');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#472314';
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTokens() {
    for (var i = 0; i < state.players.length; i += 1) {
      var player = state.players[i];
      var rect = getTileRect(player.pos);
      var sameSpace = state.players[0].pos === state.players[1].pos;
      var offset = sameSpace ? (i === 0 ? -8 : 8) : 0;
      var cx = rect.x + rect.w / 2 + offset;
      var cy = rect.y + rect.h / 2 + (sameSpace ? (i === 0 ? 9 : -9) : 0);
      var active = state.turn === i;
      drawToken(cx, cy, player.color, active, player.token);
    }
  }

  function drawToken(cx, cy, color, active, token) {
    ctx.save();
    if (active) {
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, 15 + state.pulse * 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 7;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = color;

    if (token === 'gem') {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 14);
      ctx.lineTo(cx + 13, cy - 2);
      ctx.lineTo(cx + 8, cy + 13);
      ctx.lineTo(cx - 8, cy + 13);
      ctx.lineTo(cx - 13, cy - 2);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, 13, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.cream;
    ctx.stroke();
    ctx.restore();
  }

  function drawBottomPanel() {
    var p = layoutCache.bottom;
    drawShadowedRoundRect(p.x, p.y, p.w, p.h, 10, 'rgba(0,0,0,0.42)');

    var g = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
    g.addColorStop(0, '#3b251e');
    g.addColorStop(1, '#1b1112');
    roundedRect(p.x, p.y, p.w, p.h, 10);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#c7964e';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = COLORS.cream;
    ctx.font = '700 15px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('旅途记录', p.x + 16, p.y + 13);

    ctx.font = '12px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#dcbf83';
    var logs = state.log.slice(Math.max(0, state.log.length - 3));
    for (var i = 0; i < logs.length; i += 1) {
      fitText(logs[i], p.x + 16, p.y + 38 + i * 19, p.w - 32, 12, 10, '#dcbf83', 'left');
    }

    drawActionButtons(p);
  }

  function drawActionButtons(panel) {
    var defs = getActionDefs();
    var gap = 10;
    var count = defs.length;
    var buttonH = 45;
    var y = panel.y + panel.h - buttonH - 14;
    var totalGap = gap * (count - 1);
    var w = count ? (panel.w - 28 - totalGap) / count : 0;
    var x = panel.x + 14;

    for (var i = 0; i < defs.length; i += 1) {
      var def = defs[i];
      var rect = { x: x + i * (w + gap), y: y, w: w, h: buttonH };
      drawButton(rect, def.label, def.disabled);
      buttons.push({
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
        disabled: def.disabled,
        action: def.action
      });
    }
  }

  function getActionDefs() {
    if (state.gameOver) {
      return [{ label: '重新开始', action: resetGame }];
    }

    if (state.turn !== 0) {
      return [{ label: '等待对手', disabled: true, action: noop }];
    }

    if (state.phase === 'ready') {
      return [
        { label: '掷骰', action: function () { startTurnRoll(0); } },
        { label: '施法', disabled: state.spellUsed || state.players[0].mana < 3, action: openSpellBook }
      ];
    }

    if (state.phase === 'rolling' || state.phase === 'moving' || state.phase === 'thinking') {
      return [{ label: '行动中', disabled: true, action: noop }];
    }

    if (state.pending && state.pending.type === 'buy') {
      return [
        { label: '购买 ' + state.pending.cost, action: buyPending },
        { label: '跳过', action: function () { closePending('你没有购买 ' + BOARD[state.players[0].pos].name + '。'); } }
      ];
    }

    if (state.pending && state.pending.type === 'spellbook') {
      return [
        { label: '盾 ' + SPELLS[0].cost, disabled: !canCastSpell(0, SPELLS[0]), action: function () { castSpell(SPELLS[0].id, 0); } },
        { label: '地契 ' + SPELLS[1].cost, disabled: !canCastSpell(0, SPELLS[1]), action: function () { castSpell(SPELLS[1].id, 0); } },
        { label: '厄运 ' + SPELLS[2].cost, disabled: !canCastSpell(0, SPELLS[2]), action: function () { castSpell(SPELLS[2].id, 0); } },
        { label: '返回', action: closeSpellBook }
      ];
    }

    if (state.pending && state.pending.type === 'upgrade') {
      return [
        { label: '升级 ' + state.pending.cost, action: upgradePending },
        { label: '继续', action: function () { closePending('你保留了金币。'); } }
      ];
    }

    if (state.pending && state.pending.type === 'continue') {
      return [{ label: '结束回合', action: nextTurn }];
    }

    return [{ label: '继续', action: nextTurn }];
  }

  function drawButton(rect, label, disabled) {
    ctx.save();
    var g = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
    if (disabled) {
      g.addColorStop(0, '#70645b');
      g.addColorStop(1, '#403733');
    } else {
      g.addColorStop(0, '#f0ca68');
      g.addColorStop(0.52, '#b67632');
      g.addColorStop(1, '#78421f');
    }

    roundedRect(rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = disabled ? '#94877c' : '#ffe8a5';
    ctx.stroke();

    if (!disabled) {
      ctx.save();
      ctx.globalAlpha = 0.34;
      roundedRect(rect.x + 5, rect.y + 5, rect.w - 10, rect.h * 0.36, 6);
      ctx.fillStyle = '#fff3bb';
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#3f1d14';
      ctx.beginPath();
      ctx.moveTo(rect.x + 8, rect.y + rect.h / 2);
      ctx.lineTo(rect.x + 16, rect.y + rect.h / 2 - 6);
      ctx.lineTo(rect.x + 16, rect.y + rect.h / 2 + 6);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(rect.x + rect.w - 8, rect.y + rect.h / 2);
      ctx.lineTo(rect.x + rect.w - 16, rect.y + rect.h / 2 - 6);
      ctx.lineTo(rect.x + rect.w - 16, rect.y + rect.h / 2 + 6);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = disabled ? '#d2c7b5' : '#2d1712';
    ctx.font = '800 15px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1, rect.w - 14, 15, 11, ctx.fillStyle, 'center');
    ctx.restore();
  }

  function openSpellBook() {
    if (state.turn !== 0 || state.phase !== 'ready' || state.spellUsed) {
      return;
    }
    state.pending = { type: 'spellbook' };
    state.phase = 'spellbook';
    state.prompt = '选择一张法术：护盾保命，地契回血，厄运压制对手。';
  }

  function closeSpellBook() {
    state.pending = null;
    state.phase = 'ready';
    state.prompt = '法术留在手里，掷骰继续。';
  }

  function canCastSpell(playerIndex, spell) {
    return !state.spellUsed && state.players[playerIndex].mana >= spell.cost;
  }

  function castSpell(id, playerIndex) {
    var spell = null;
    for (var i = 0; i < SPELLS.length; i += 1) {
      if (SPELLS[i].id === id) {
        spell = SPELLS[i];
        break;
      }
    }

    if (!spell || !canCastSpell(playerIndex, spell)) {
      return;
    }

    state.pending = null;
    spell.apply(playerIndex);
    state.spellUsed = true;
    state.phase = playerIndex === 0 ? 'ready' : 'thinking';
  }

  function startTurnRoll(playerIndex) {
    if (state.gameOver || state.phase !== 'ready' || state.turn !== playerIndex) {
      return;
    }

    state.pending = null;
    state.phase = 'rolling';
    state.rollingUntil = now + 650;
    state.prompt = state.players[playerIndex].name + ' 正在掷骰...';
  }

  function finishDiceRoll() {
    if (state.phase !== 'rolling') {
      return;
    }

    var playerIndex = state.turn;
    var player = state.players[playerIndex];
    var raw = 1 + Math.floor(Math.random() * 6);
    var value = clamp(raw + player.nextRollBonus - player.slow, 1, 8);
    player.nextRollBonus = 0;
    player.slow = 0;
    state.dice = value;
    addLog(player.name + ' 掷出 ' + value + ' 点。');
    moveSteps(playerIndex, value, function () {
      resolveLanding(playerIndex, 0);
    });
  }

  function moveSteps(playerIndex, steps, done) {
    var direction = steps >= 0 ? 1 : -1;
    var remaining = Math.abs(steps);

    if (remaining === 0) {
      done();
      return;
    }

    state.phase = 'moving';
    state.movingPlayer = playerIndex;

    var step = function () {
      var player = state.players[playerIndex];
      var oldPos = player.pos;
      player.pos = (player.pos + direction + BOARD.length) % BOARD.length;

      if (direction > 0 && player.pos === 0 && oldPos !== 0) {
        player.coins += START_REWARD;
        gainMana(playerIndex, 2);
        addLog(player.name + ' 路过起点，获得 ' + START_REWARD + ' 金币和 2 点法力。');
      }

      remaining -= 1;
      if (remaining > 0) {
        setTimeout(step, 160);
      } else {
        state.movingPlayer = -1;
        done();
      }
    };

    setTimeout(step, 150);
  }

  function resolveLanding(playerIndex, depth) {
    if (state.gameOver) {
      return;
    }

    depth = depth || 0;
    var player = state.players[playerIndex];
    var tile = BOARD[player.pos];
    state.phase = 'landed';

    if (tile.type === 'start') {
      addLog(player.name + ' 抵达起点，补给完成。');
      finishLanding(playerIndex);
      return;
    }

    if (tile.type === 'property') {
      resolveProperty(playerIndex, tile);
      return;
    }

    if (tile.type === 'tax') {
      var paidTax = chargePlayer(playerIndex, tile.amount);
      addLog(player.name + ' 支付 ' + tile.name + ' ' + paidTax + ' 金币。');
      finishLanding(playerIndex);
      return;
    }

    if (tile.type === 'bonus') {
      player.coins += tile.amount;
      gainMana(playerIndex, 1);
      addLog(player.name + ' 打开 ' + tile.name + '，获得 ' + tile.amount + ' 金币和 1 点法力。');
      finishLanding(playerIndex);
      return;
    }

    if (tile.type === 'portal') {
      var target = getRandomPropertyIndex();
      addLog(player.name + ' 穿过传送门，落到 ' + BOARD[target].name + '。');
      player.pos = target;
      if (depth > 1) {
        finishLanding(playerIndex);
      } else {
        setTimeout(function () { resolveLanding(playerIndex, depth + 1); }, 420);
      }
      return;
    }

    if (tile.type === 'event') {
      resolveEvent(playerIndex, depth);
      return;
    }

    finishLanding(playerIndex);
  }

  function resolveProperty(playerIndex, tile) {
    var player = state.players[playerIndex];
    var tileIndex = player.pos;
    var owner = state.owners[tileIndex];
    var level = state.levels[tileIndex];

    if (owner === -1) {
      if (playerIndex === 0) {
        if (player.coins >= tile.cost) {
          state.prompt = tile.name + ' 属于' + tile.group + '派系。成套后租金更高，是否花 ' + tile.cost + ' 金币买下？';
          state.pending = { type: 'buy', index: tileIndex, cost: tile.cost };
        } else {
          addLog('金币不足，无法购买 ' + tile.name + '。');
          finishLanding(playerIndex);
        }
      } else {
        if (shouldAIBuy(tileIndex)) {
          buyProperty(playerIndex, tileIndex);
        } else {
          addLog(player.name + ' 放弃购买 ' + tile.name + '。');
        }
        finishLanding(playerIndex);
      }
      return;
    }

    if (owner !== playerIndex) {
      var rent = getRent(tileIndex);
      var paidRent = transfer(playerIndex, owner, rent);
      addLog(player.name + ' 向 ' + state.players[owner].name + ' 支付租金 ' + paidRent + '。');
      finishLanding(playerIndex);
      return;
    }

    if (level < MAX_LEVEL) {
      var upgradeCost = getUpgradeCost(tileIndex);
      if (playerIndex === 0 && player.coins >= upgradeCost) {
        state.prompt = tile.name + ' 可升级到 Lv.' + (level + 1) + '，连锁租金会提升。';
        state.pending = { type: 'upgrade', index: tileIndex, cost: upgradeCost };
      } else if (playerIndex === 1 && shouldAIUpgrade(tileIndex, upgradeCost)) {
        upgradeProperty(playerIndex, tileIndex, upgradeCost);
        finishLanding(playerIndex);
      } else {
        addLog(player.name + ' 巡视了自己的 ' + tile.name + '。');
        finishLanding(playerIndex);
      }
    } else {
      addLog(player.name + ' 的 ' + tile.name + ' 已满级。');
      finishLanding(playerIndex);
    }
  }

  function resolveEvent(playerIndex, depth) {
    var card = EVENT_CARDS[Math.floor(Math.random() * EVENT_CARDS.length)];
    var player = state.players[playerIndex];
    addLog('奇遇：' + card.text);
    state.lastEvent = card.text;

    if (typeof card.apply === 'function') {
      card.apply(playerIndex);
      finishLanding(playerIndex);
      return;
    }

    if (card.move && depth < 2) {
      state.prompt = player.name + ' 抽到奇遇：' + card.text;
      setTimeout(function () {
        moveSteps(playerIndex, card.move, function () {
          resolveLanding(playerIndex, depth + 1);
        });
      }, 500);
      return;
    }

    finishLanding(playerIndex);
  }

  function finishLanding(playerIndex) {
    checkGameOver();
    if (state.gameOver) {
      return;
    }

    if (playerIndex === 0) {
      state.pending = { type: 'continue' };
      state.phase = 'landed';
      state.prompt = '本回合行动完成。';
    } else {
      state.phase = 'thinking';
      setTimeout(nextTurn, 760);
    }
  }

  function buyPending() {
    if (!state.pending || state.pending.type !== 'buy') {
      return;
    }
    buyProperty(0, state.pending.index);
    closePending('你买下了 ' + BOARD[state.pending.index].name + '。');
  }

  function upgradePending() {
    if (!state.pending || state.pending.type !== 'upgrade') {
      return;
    }
    upgradeProperty(0, state.pending.index, state.pending.cost);
    closePending('你升级了 ' + BOARD[state.pending.index].name + '。');
  }

  function closePending(message) {
    if (message) {
      addLog(message);
    }
    state.pending = { type: 'continue' };
    state.phase = 'landed';
    state.prompt = '本回合行动完成。';
    checkGameOver();
  }

  function nextTurn() {
    if (state.gameOver) {
      return;
    }

    state.pending = null;
    state.phase = 'ready';
    state.turn = 1 - state.turn;
    state.spellUsed = false;

    if (state.turn === 0) {
      state.round += 1;
      gainMana(0, 1);
      state.prompt = '轮到你了。获得 1 点法力，先施法还是直接掷骰？';
    } else {
      gainMana(1, state.round >= 4 ? 2 : 1);
      state.prompt = '对手正在盘算路线。';
      state.phase = 'thinking';
      setTimeout(function () {
        maybeCastAISpell();
        state.phase = 'ready';
        startTurnRoll(1);
      }, 700);
    }
  }

  function maybeCastAISpell() {
    var ai = state.players[1];
    if (state.turn !== 1 || state.spellUsed) {
      return;
    }

    if (ai.mana >= 5 && (countProperties(0) >= 3 || state.players[0].coins > ai.coins + 120)) {
      castSpell('hex', 1);
      return;
    }

    if (ai.mana >= 4 && countProperties(1) >= 3 && (ai.coins < 360 || Math.random() > 0.45)) {
      castSpell('resonance', 1);
      return;
    }

    if (ai.mana >= 3 && (ai.shield < 70 || ai.coins < 280)) {
      castSpell('ward', 1);
    }
  }

  function buyProperty(playerIndex, tileIndex) {
    var player = state.players[playerIndex];
    var tile = BOARD[tileIndex];
    if (tile.type !== 'property' || state.owners[tileIndex] !== -1 || player.coins < tile.cost) {
      return;
    }

    player.coins -= tile.cost;
    player.properties.push(tileIndex);
    state.owners[tileIndex] = playerIndex;
    state.levels[tileIndex] = 1;
    addLog(player.name + ' 买下 ' + tile.name + '。');
    if (ownsCompleteGroup(playerIndex, tile.group)) {
      gainMana(playerIndex, 2);
      addLog(player.name + ' 集齐' + tile.group + '派系，租金连锁启动。');
    }
  }

  function upgradeProperty(playerIndex, tileIndex, cost) {
    var player = state.players[playerIndex];
    if (state.owners[tileIndex] !== playerIndex || state.levels[tileIndex] >= MAX_LEVEL || player.coins < cost) {
      return;
    }

    player.coins -= cost;
    state.levels[tileIndex] += 1;
    addLog(player.name + ' 将 ' + BOARD[tileIndex].name + ' 升到 Lv.' + state.levels[tileIndex] + '。');
  }

  function upgradeRandomOwnedProperty(playerIndex) {
    var candidates = [];
    for (var i = 0; i < state.owners.length; i += 1) {
      if (state.owners[i] === playerIndex && state.levels[i] < MAX_LEVEL) {
        candidates.push(i);
      }
    }

    if (!candidates.length) {
      state.players[playerIndex].coins += 60;
      addLog(state.players[playerIndex].name + ' 没有可重铸的地产，改得 60 金币。');
      return;
    }

    var tileIndex = candidates[Math.floor(Math.random() * candidates.length)];
    state.levels[tileIndex] += 1;
    addLog(state.players[playerIndex].name + ' 免费重铸 ' + BOARD[tileIndex].name + ' 到 Lv.' + state.levels[tileIndex] + '。');
  }

  function getUpgradeCost(tileIndex) {
    var tile = BOARD[tileIndex];
    var level = state.levels[tileIndex] || 1;
    return Math.floor(tile.cost * (0.42 + level * 0.2));
  }

  function transfer(from, to, amount) {
    if (amount <= 0) {
      return 0;
    }

    var paid = chargePlayer(from, amount);
    state.players[to].coins += paid;
    return paid;
  }

  function chargePlayer(playerIndex, amount) {
    var player = state.players[playerIndex];
    var due = Math.max(0, Math.floor(amount));

    if (player.hex > 0) {
      due += player.hex;
      addLog(player.name + ' 的厄运咒爆发，额外支出 ' + player.hex + ' 金币。');
      player.hex = 0;
    }

    if (player.shield > 0 && due > 0) {
      var absorbed = Math.min(player.shield, due);
      player.shield -= absorbed;
      due -= absorbed;
      addLog(player.name + ' 的护盾抵消了 ' + absorbed + ' 金币。');
    }

    player.coins -= due;
    return due;
  }

  function gainMana(playerIndex, amount) {
    var player = state.players[playerIndex];
    player.mana = Math.min(MAX_MANA, player.mana + amount);
  }

  function spendMana(playerIndex, amount) {
    state.players[playerIndex].mana = Math.max(0, state.players[playerIndex].mana - amount);
  }

  function getRent(tileIndex) {
    var tile = BOARD[tileIndex];
    var owner = state.owners[tileIndex];
    var level = state.levels[tileIndex] || 1;
    var rent = tile.rent * (0.9 + level * 0.82);

    if (owner >= 0 && ownsCompleteGroup(owner, tile.group)) {
      rent *= 1.35;
    }

    if (owner >= 0 && state.players[owner].mana >= 7) {
      rent *= 1.08;
    }

    return Math.floor(rent);
  }

  function countProperties(playerIndex) {
    var count = 0;
    for (var i = 0; i < state.owners.length; i += 1) {
      if (state.owners[i] === playerIndex) {
        count += 1;
      }
    }
    return count;
  }

  function countCompleteGroups(playerIndex) {
    var groups = {};
    var count = 0;

    for (var i = 0; i < BOARD.length; i += 1) {
      if (BOARD[i].type === 'property') {
        groups[BOARD[i].group] = true;
      }
    }

    for (var group in groups) {
      if (Object.prototype.hasOwnProperty.call(groups, group) && ownsCompleteGroup(playerIndex, group)) {
        count += 1;
      }
    }

    return count;
  }

  function ownsCompleteGroup(playerIndex, group) {
    if (!group) {
      return false;
    }

    var total = 0;
    var owned = 0;
    for (var i = 0; i < BOARD.length; i += 1) {
      if (BOARD[i].type === 'property' && BOARD[i].group === group) {
        total += 1;
        if (state.owners[i] === playerIndex) {
          owned += 1;
        }
      }
    }

    return total > 0 && total === owned;
  }

  function countGroupOwned(playerIndex, group) {
    var owned = 0;
    for (var i = 0; i < BOARD.length; i += 1) {
      if (BOARD[i].type === 'property' && BOARD[i].group === group && state.owners[i] === playerIndex) {
        owned += 1;
      }
    }
    return owned;
  }

  function shouldAIBuy(tileIndex) {
    var player = state.players[1];
    var tile = BOARD[tileIndex];
    var groupOwned = countGroupOwned(1, tile.group);
    var pressure = countProperties(0) > countProperties(1) ? 55 : 0;
    var reserve = 105 - groupOwned * 28 - pressure;
    return player.coins - tile.cost > reserve || tile.rent >= 40 || groupOwned > 0;
  }

  function shouldAIUpgrade(tileIndex, cost) {
    var player = state.players[1];
    var tile = BOARD[tileIndex];
    var complete = ownsCompleteGroup(1, tile.group);
    var reserve = complete ? 105 : 155;
    return player.coins - cost > reserve || (complete && player.coins - cost > 70);
  }

  function checkGameOver() {
    if (state.players[0].coins < 0 || state.players[1].coins < 0) {
      state.gameOver = true;
      state.phase = 'gameover';
      state.winner = state.players[0].coins >= 0 ? 0 : 1;
      state.prompt = state.winner === 0 ? '你赢了！酒馆里的金币都在向你叮当作响。' : '对手赢了。再开一局，把商路夺回来。';
      addLog((state.winner === 0 ? '你' : '老板') + ' 获得胜利。');
    }
  }

  function getRandomPropertyIndex() {
    var candidates = [];
    for (var i = 0; i < BOARD.length; i += 1) {
      if (BOARD[i].type === 'property') {
        candidates.push(i);
      }
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function getTileRect(index) {
    var b = layoutCache.board;
    var cell = b.cell;
    var row = 0;
    var col = 0;

    if (index <= 6) {
      col = index;
      row = 6;
    } else if (index <= 11) {
      col = 6;
      row = 12 - index;
    } else if (index <= 18) {
      col = 18 - index;
      row = 0;
    } else {
      col = 0;
      row = index - 18;
    }

    return {
      x: b.x + col * cell,
      y: b.y + row * cell,
      w: cell,
      h: cell
    };
  }

  function addLog(message) {
    state.log.push(message);
    if (state.log.length > 18) {
      state.log.shift();
    }
    state.prompt = message;
  }

  function wrapText(text, x, y, maxWidth, lineHeight, maxLines) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    var line = '';
    var lines = [];
    var chars = String(text).split('');

    for (var i = 0; i < chars.length; i += 1) {
      var test = line + chars[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = chars[i];
      } else {
        line = test;
      }
    }
    if (line) {
      lines.push(line);
    }

    for (var j = 0; j < Math.min(maxLines, lines.length); j += 1) {
      var out = lines[j];
      if (j === maxLines - 1 && lines.length > maxLines) {
        out = out.slice(0, Math.max(1, out.length - 1)) + '…';
      }
      ctx.fillText(out, x, y + j * lineHeight);
    }
  }

  function fitText(text, x, y, maxWidth, size, minSize, color, align) {
    var fontFamily = '"PingFang SC", "Microsoft YaHei", sans-serif';
    var weight = size >= 14 ? '700 ' : '';
    var fontSize = size;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;

    do {
      ctx.font = weight + fontSize + 'px ' + fontFamily;
      if (ctx.measureText(text).width <= maxWidth || fontSize <= minSize) {
        break;
      }
      fontSize -= 1;
    } while (fontSize >= minSize);

    ctx.fillText(text, x, y);
  }

  function drawShadowedRoundRect(x, y, w, h, r, shadow) {
    ctx.save();
    ctx.shadowColor = shadow;
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    roundedRect(x, y, w, h, r);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();
    ctx.restore();
  }

  function roundedRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function noop() {}
}());
