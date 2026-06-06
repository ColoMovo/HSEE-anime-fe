const canvas = document.getElementById("heroCanvas");
const ctx = canvas.getContext("2d");
const audio = document.getElementById("bgm");
const tapLayer = document.getElementById("tapLayer");
const startButton = document.getElementById("startButton");
const playButton = document.getElementById("playButton");
const restartButton = document.getElementById("restartButton");
const recordButton = document.getElementById("recordButton");
const fullscreenButton = document.getElementById("fullscreenButton");
const seekBar = document.getElementById("seekBar");
const currentTime = document.getElementById("currentTime");
const durationTime = document.getElementById("durationTime");

const W = canvas.width;
const H = canvas.height;
const TOTAL_FALLBACK = 128;
let isSeeking = false;
let recorder = null;
let recordedChunks = [];
let recordingStopHandler = null;

// === 音频分析 ===
let audioCtx = null;
let analyser = null;
let freqData = null;
let beatHistory = [];
let lastBeatTime = -10;
let beatPulse = 0;
let ringPulse = 0;
let invertPulse = 0;   // 节拍触发"墨色反转"
let beatCount = 0;

// === 镜头 ===
const camera = {
  zoom: 0.92,
  targetZoom: 0.92,
  x: 0,
  y: 0,
  shake: 0,
  roll: 0,
};

const text = {
  play: "播放",
  pause: "暂停",
  replay: "重播",
  record: "录制",
  stop: "停止",
  fullscreen: "全屏",
  stamp: "2026 高考加油",
  unsupported: "当前浏览器不支持直接录制，请用新版 Chrome 或 Edge 打开。",
};

const scenes = [
  { at: 0,  title: "启程", sub: "江面三万尺，压不住一叶扁舟的孤勇" },
  { at: 12, title: "题海", sub: "函数咬人，曲线杀人，笔未停，夜已深" },
  { at: 30, title: "提笔", sub: "台灯是黑夜里，唯一不肯熄灭的那颗星" },
  { at: 50, title: "破阵", sub: "剑未出鞘三年，今夜就斩断这三年的恐惧" },
  { at: 68, title: "风起", sub: "山在退，浪在平，万里光已照到身上" },
  { at: 92, title: "合笔", sub: "愿你合上笔盖那一刻，像侠客归山般从容" },
];

// 山在每个 scene 阶段的总强度（0=全无 1=满）
const mountainStrength = [0.95, 1.0, 0.85, 0.65, 0.4, 0.15];

// 考点按场景分组：每组 4 张，挂在不同位置
const termGroups = [
  // 0 启程
  [
    { label: "函数零点",   x:  240, y: 700, rot:  0.05, depth: 0.65 },
    { label: "圆锥曲线",   x:  720, y: 620, rot: -0.07, depth: 0.7  },
    { label: "电磁感应",   x: 1180, y: 760, rot:  0.04, depth: 0.6  },
    { label: "E = B L v",  x: 1620, y: 680, rot: -0.05, depth: 0.8  },
  ],
  // 1 题海
  [
    { label: "导数极值",   x:  280, y: 700, rot:  0.06, depth: 0.6  },
    { label: "化学平衡",   x:  780, y: 620, rot: -0.08, depth: 0.7  },
    { label: "概率分布",   x: 1180, y: 760, rot:  0.05, depth: 0.6  },
    { label: "光合作用",   x: 1580, y: 700, rot: -0.06, depth: 0.75 },
  ],
  // 2 提笔
  [
    { label: "立体几何",   x:  260, y: 720, rot:  0.05, depth: 0.65 },
    { label: "牛顿定律",   x:  760, y: 620, rot: -0.06, depth: 0.7  },
    { label: "pH = -log[H+]", x: 1240, y: 720, rot: 0.04, depth: 0.6  },
    { label: "F = m a",    x: 1680, y: 680, rot: -0.05, depth: 0.8  },
  ],
  // 3 破阵
  [
    { label: "数列通项",   x:  340, y: 720, rot:  0.05, depth: 0.6  },
    { label: "遗传图谱",   x:  840, y: 640, rot: -0.06, depth: 0.7  },
    { label: "离子方程",   x: 1260, y: 720, rot:  0.04, depth: 0.55 },
    { label: "C₆H₁₂O₆",   x: 1620, y: 680, rot: -0.05, depth: 0.75 },
  ],
  // 4 风起
  [
    { label: "论证结构",   x:  300, y: 700, rot:  0.05, depth: 0.65 },
    { label: "文言实词",   x:  740, y: 620, rot: -0.07, depth: 0.7  },
    { label: "阅读理解",   x: 1140, y: 720, rot:  0.05, depth: 0.6  },
    { label: "a_n = a_1 q^(n-1)", x: 1580, y: 680, rot: -0.06, depth: 0.8  },
  ],
  // 5 合笔
  [
    { label: "完形填空",   x:  340, y: 720, rot:  0.05, depth: 0.6  },
    { label: "作文立意",   x:  820, y: 640, rot: -0.06, depth: 0.7  },
    { label: "f'(x) = 0",  x: 1260, y: 720, rot:  0.04, depth: 0.65 },
    { label: "sin(A + B)", x: 1660, y: 680, rot: -0.05, depth: 0.75 },
  ],
];

// 把 6 组展平为 cards 列表（绑 sceneIdx + 出现时序）
const termCards = termGroups.flatMap((group, sceneIdx) =>
  group.map((c, slotIdx) => ({
    ...c,
    sceneIdx,
    appearAt: scenes[sceneIdx].at + 0.6 + slotIdx * 1.8,
    exitLead: 1.4, // scene 结束前 1.4s 开始淡出
  })),
);

const stars = Array.from({ length: 380 }, (_, i) => ({
  x: hash(i, 977) * W,
  y: hash(i, 431) * H * 0.55,
  r: 0.4 + hash(i, 71) * 1.45,
  phase: hash(i, 113) * Math.PI * 2,
  layer: Math.floor(hash(i, 211) * 3),
}));

const motes = Array.from({ length: 260 }, (_, i) => ({
  x: hash(i, 131) * W,
  y: 200 + hash(i, 293) * 760,
  speed: 0.25 + hash(i, 17) * 1.1,
  size: 0.7 + hash(i, 41) * 2.5,
  alpha: 0.08 + hash(i, 19) * 0.42,
  layer: hash(i, 151) > 0.65 ? 1 : 0,
}));

const mountainLayers = Array.from({ length: 5 }, (_, layer) => {
  const points = Array.from({ length: 18 }, (_, i) => {
    const base = 90 + layer * 22;
    return base + Math.sin(i * 1.4 + layer) * 58 + hash(i + layer * 13, 47) * 138;
  });
  return {
    points,
    yBase: 480 + layer * 64,
    speed: 12 + layer * 17,
    parallax: 0.3 + layer * 0.35,
    alphaBase: 0.32 + layer * 0.13,
    grayBase: 38 + layer * 14,
  };
});

const foreground = Array.from({ length: 28 }, (_, i) => ({
  x: (i / 28) * W * 1.4,
  h: 30 + hash(i, 23) * 60,
  speed: 0.9 + hash(i, 33) * 0.5,
  type: i % 3,
  phase: hash(i, 47) * Math.PI * 2,
}));

function hash(seed, salt) {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function easeInOut(x) {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}

function easeOutBack(x) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function duration() {
  return Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : TOTAL_FALLBACK;
}

function sceneAt(t) {
  let scene = scenes[0];
  for (const item of scenes) {
    if (t >= item.at) scene = item;
  }
  return scene;
}

function sceneIndexAt(t) {
  let idx = 0;
  for (let i = 0; i < scenes.length; i += 1) {
    if (t >= scenes[i].at) idx = i;
  }
  return idx;
}

function analyseAudio() {
  if (!analyser) return { energy: 0, low: 0, mid: 0, high: 0 };
  analyser.getByteFrequencyData(freqData);
  let sum = 0, lowSum = 0, midSum = 0, highSum = 0;
  const lowEnd = 8, midEnd = 36;
  for (let i = 0; i < freqData.length; i += 1) {
    const v = freqData[i];
    sum += v;
    if (i < lowEnd) lowSum += v;
    else if (i < midEnd) midSum += v;
    else highSum += v;
  }
  const n = freqData.length;
  return {
    energy: sum / n / 255,
    low: lowSum / lowEnd / 255,
    mid: midSum / (midEnd - lowEnd) / 255,
    high: highSum / (n - midEnd) / 255,
  };
}

function detectBeat(t, low) {
  beatHistory.push(low);
  if (beatHistory.length > 43) beatHistory.shift();
  const avg = beatHistory.reduce((a, b) => a + b, 0) / Math.max(1, beatHistory.length);
  const threshold = Math.max(0.55, avg * 1.45);
  if (low > threshold && t - lastBeatTime > 0.22) {
    lastBeatTime = t;
    beatCount += 1;
    return true;
  }
  return false;
}

function setupAudioAnalysis() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaElementSource(audio);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.62;
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    freqData = new Uint8Array(analyser.frequencyBinCount);
  } catch (e) {
    console.warn("Audio analysis init failed", e);
  }
}

function updateCamera(t, energy) {
  const intro = easeInOut(clamp(t / 8, 0, 1));
  const build = easeInOut(clamp((t - 8) / 28, 0, 1));
  const climax = easeInOut(clamp((t - 48) / 14, 0, 1));
  const outro = easeInOut(clamp((t - 96) / 18, 0, 1));

  const z1 = mix(0.92, 1.02, intro);
  const z2 = mix(z1, 1.20, climax);
  camera.targetZoom = mix(z2, 0.97, outro) + energy * 0.05 + beatPulse * 0.03;
  camera.zoom += (camera.targetZoom - camera.zoom) * 0.14;

  const baseSway = Math.sin(t * 0.18) * 22;
  const beatSway = beatPulse > 0.4 ? Math.sin(t * 24) * 14 : 0;
  camera.x = baseSway + beatSway;
  camera.y = -climax * 22 - energy * 5;
  camera.roll = Math.sin(t * 0.12) * 0.012 + beatPulse * 0.02 * (Math.random() - 0.5);
  camera.shake = beatPulse * 8 + climax * 3 * beatPulse;
}

// === 飞白绘制辅助：在 y 高度画 3-4 道断线，模拟笔触未饱和 ===
function drawFlyingWhite(y, w, density, baseAlpha) {
  ctx.save();
  for (let k = 0; k < density; k += 1) {
    const x = hash(k, 5) * w - 100;
    const len = 30 + hash(k, 13) * 90;
    const a = baseAlpha * (0.3 + hash(k, 23) * 0.7);
    ctx.globalAlpha = a;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y + hash(k, 31) * 4, len, 1 + hash(k, 47) * 1.5);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawSky(t, progress, energy) {
  const dawn = easeInOut(clamp((t - 62) / 38, 0, 1));
  const danger = clamp((t - 15) / 24, 0, 1) * (1 - clamp((t - 58) / 18, 0, 1));
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  const skyTop = Math.round(mix(6, 70, dawn) + danger * 12);
  const skyMid = Math.round(mix(18, 130, dawn) + danger * 12);
  const skyBot = Math.round(mix(4, 22, dawn));
  sky.addColorStop(0, `rgb(${skyTop}, ${skyTop}, ${skyTop})`);
  sky.addColorStop(0.48, `rgb(${skyMid}, ${skyMid}, ${skyMid})`);
  sky.addColorStop(1, `rgb(${skyBot}, ${skyBot}, ${skyBot})`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  const sunX = 280 + dawn * 1160;
  const sunY = 760 - dawn * 540;
  const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 760);
  glow.addColorStop(0, `rgba(255, 255, 255, ${0.34 + energy * 0.18})`);
  glow.addColorStop(0.26, `rgba(220, 220, 220, ${0.1 + dawn * 0.22})`);
  glow.addColorStop(1, "rgba(220, 220, 220, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const storm = ctx.createRadialGradient(W * 0.5, H * 0.42, 80, W * 0.5, H * 0.42, 720);
  storm.addColorStop(0, `rgba(120, 120, 120, ${danger * 0.16})`);
  storm.addColorStop(0.42, `rgba(80, 80, 80, ${danger * 0.24})`);
  storm.addColorStop(1, "rgba(80, 80, 80, 0)");
  ctx.fillStyle = storm;
  ctx.fillRect(0, 0, W, H);

  for (const star of stars) {
    if (star.layer !== 0) continue;
    const twinkle = (Math.sin(t * 1.7 + star.phase) + 1) / 2;
    ctx.globalAlpha = (1 - dawn) * (0.12 + twinkle * 0.64);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawMountainLayer(layer, t, progress, index, globalStrength) {
  const depth = index / Math.max(1, mountainLayers.length - 1);
  const offset = -progress * layer.speed * 9 * layer.parallax + Math.sin(t * 0.05 + index) * 12;
  const dawn = easeInOut(clamp((t - 62) / 38, 0, 1));
  const gray = Math.round(mix(layer.grayBase + 30, layer.grayBase + 70, dawn) - index * 4);
  const g = Math.max(18, Math.min(180, gray));
  const alpha = (layer.alphaBase + depth * 0.22) * globalStrength;

  ctx.save();
  ctx.translate(offset % (320 + index * 60), 0);
  ctx.beginPath();
  ctx.moveTo(-300, H);
  ctx.lineTo(-300, layer.yBase);
  for (let i = 0; i < layer.points.length; i += 1) {
    const x = (i / (layer.points.length - 1)) * (W + 620) - 310;
    const y = layer.yBase - layer.points[i] * (0.6 + depth * 0.75) + Math.sin(i * 1.7 + t * 0.08 + index) * (10 + depth * 16);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W + 300, H);
  ctx.closePath();
  ctx.fillStyle = `rgba(${g}, ${g}, ${g}, ${alpha})`;
  ctx.fill();

  // 山顶飞白：3-4 条断线
  drawFlyingWhite(layer.yBase - 6, W + 620, 14, 0.18 + depth * 0.22);

  // 山底墨晕：把山脚"泡"在雾里
  const footGrad = ctx.createLinearGradient(0, layer.yBase - 30, 0, layer.yBase + 80);
  footGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
  footGrad.addColorStop(1, `rgba(0, 0, 0, ${0.5 * globalStrength})`);
  ctx.fillStyle = footGrad;
  ctx.fillRect(-300, layer.yBase - 30, W + 620, 110);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawMountains(t, progress) {
  const sceneIdx = sceneIndexAt(t);
  const strength = mountainStrength[sceneIdx] ?? 1;
  for (let i = 0; i < mountainLayers.length; i += 1) {
    drawMountainLayer(mountainLayers[i], t, progress, i, strength);
  }
}

function drawForeground(t, progress) {
  const offset = -progress * 60;
  ctx.save();
  for (const f of foreground) {
    const x = (f.x + offset * f.speed * 12) % (W * 1.5) - 100;
    const sway = Math.sin(t * 1.3 + f.phase) * 4;
    ctx.fillStyle = "#080808";
    ctx.beginPath();
    if (f.type === 0) {
      for (let k = 0; k < 3; k += 1) {
        ctx.moveTo(x + k * 6, 980);
        ctx.quadraticCurveTo(x + k * 6 + sway, 980 - f.h * 0.5, x + k * 6 + sway * 2, 980 - f.h);
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#0a0a0a";
      ctx.stroke();
    } else if (f.type === 1) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#060606";
      ctx.moveTo(x, 980);
      ctx.quadraticCurveTo(x + sway, 980 - f.h * 0.6, x + sway * 2, 980 - f.h);
      ctx.stroke();
    } else {
      ctx.moveTo(x - 14, 980);
      ctx.lineTo(x + sway, 980 - f.h);
      ctx.lineTo(x + 14, 980);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawFog(t, energy) {
  const offset = -t * 6;
  const fogY = 460;
  for (let i = 0; i < 4; i += 1) {
    ctx.globalAlpha = 0.05 + i * 0.04 + energy * 0.02;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    const y = fogY + i * 38;
    ctx.moveTo(0, y);
    for (let x = 0; x <= W; x += 30) {
      const yy = y + Math.sin((x + offset * (1 + i * 0.3)) * 0.012 + i) * 18;
      ctx.lineTo(x, yy);
    }
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawRiver(t, progress, energy) {
  const river = ctx.createLinearGradient(0, 570, 0, H);
  river.addColorStop(0, "rgba(110, 110, 110, 0.16)");
  river.addColorStop(0.46, "rgba(56, 56, 56, 0.6)");
  river.addColorStop(1, "rgba(4, 4, 4, 0.98)");
  ctx.fillStyle = river;
  ctx.fillRect(0, 560, W, H - 560);

  for (let i = 0; i < 36; i += 1) {
    const y = 580 + i * 18;
    const amp = 8 + i * 1.7;
    const drift = (t * (34 + i * 3.5)) % 300;
    ctx.beginPath();
    for (let x = -320; x <= W + 320; x += 16) {
      const wave = Math.sin((x + drift) * 0.012 + i) * amp;
      const py = y + wave + Math.sin(t * 0.9 + i) * 5;
      if (x === -320) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    }
    const v = Math.round(200 + i);
    ctx.strokeStyle = `rgba(${v}, ${v}, ${v}, ${0.05 + energy * 0.06})`;
    ctx.lineWidth = 1 + i * 0.04;
    ctx.stroke();
  }

  // 河面飞白：几道不规则短白线
  drawFlyingWhite(720, W, 18, 0.08 + energy * 0.06);
  drawFlyingWhite(820, W, 14, 0.06 + energy * 0.04);

  const trail = ctx.createLinearGradient(0, 650, W, 940);
  trail.addColorStop(0, "rgba(255, 255, 255, 0)");
  trail.addColorStop(clamp(progress, 0.16, 0.84), `rgba(255, 255, 255, ${0.16 + energy * 0.22})`);
  trail.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = trail;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.bezierCurveTo(520, 828, 1130, 714, W, 632);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

// === 考点卡：水墨风 ===
function drawInkCard(card, t, sceneIdx, energy) {
  const local = t - card.appearAt;
  if (local < 0) return;
  const sceneEnd = scenes[sceneIdx + 1]?.at ?? duration();
  const sceneSpan = sceneEnd - scenes[sceneIdx].at;
  const exitStart = sceneSpan - card.exitLead;
  if (local > sceneSpan) return;

  // 视差：基于 depth 跟随镜头
  const px = card.x - camera.x * (1 - card.depth) * 0.5;
  const py = card.y - camera.y * (1 - card.depth) * 0.5;
  const rot = card.rot;
  // 节拍时墨被"撞"一下 + 微旋转
  const beat = beatPulse * 6;
  const sway = Math.sin(t * 0.7 + card.x * 0.01) * 3;

  const fadeIn = clamp(local / 0.7, 0, 1);
  const fadeOut = clamp(1 - (local - exitStart) / card.exitLead, 0, 1);
  const opacity = fadeIn * fadeOut;
  if (opacity <= 0.01) return;

  ctx.save();
  ctx.translate(px + sway, py - beat);
  ctx.rotate(rot + beatPulse * 0.015 * (Math.random() - 0.5));
  ctx.globalAlpha = opacity;

  // 卡身：白色半透明底
  const grad = ctx.createLinearGradient(0, -34, 0, 34);
  grad.addColorStop(0, "rgba(255, 255, 255, 0.14)");
  grad.addColorStop(1, "rgba(255, 255, 255, 0.06)");
  ctx.fillStyle = grad;
  roundRect(-96, -34, 192, 68, 3);
  ctx.fill();

  // 卡边：白墨描边
  ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 飞白：底下一道墨痕 + 随机小墨点
  ctx.globalAlpha = opacity * 0.7;
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.fillRect(-90, 30, 180, 1.5);
  // 不规则飞白
  for (let k = 0; k < 4; k += 1) {
    const fx = -86 + hash(k, 7 + card.sceneIdx * 7) * 172;
    const fw = 12 + hash(k, 13) * 30;
    ctx.fillRect(fx, 32, fw, 1);
  }

  // 文字
  ctx.globalAlpha = opacity;
  ctx.fillStyle = "rgba(245, 240, 224, 0.95)";
  ctx.font = '500 26px "Ma Shan Zheng", "STKaiti", "KaiTi", "FangSong", serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // 加点字重感：先描再填
  ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.strokeText(card.label, 0, 0);
  ctx.fillStyle = "rgba(245, 240, 224, 0.95)";
  ctx.fillText(card.label, 0, 0);

  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawTermCards(t, energy) {
  const sceneIdx = sceneIndexAt(t);
  for (const card of termCards) {
    if (card.sceneIdx !== sceneIdx) continue;
    drawInkCard(card, t, sceneIdx, energy);
  }
}

function drawPenBody(length, width, colorA, colorB) {
  const body = ctx.createLinearGradient(-length / 2, 0, length / 2, 0);
  body.addColorStop(0, colorA);
  body.addColorStop(0.5, "#e8e8e8");
  body.addColorStop(1, colorB);
  ctx.fillStyle = body;
  roundRect(-length / 2, -width / 2, length, width, width / 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
  ctx.lineWidth = 3;
  ctx.stroke();
  // 笔身飞白
  drawFlyingWhite(0, length, 6, 0.4);
}

function drawPenSword(t, energy) {
  const intro = clamp((t - 30) / 12, 0, 1);
  if (intro <= 0) return;
  const morph = easeInOut(clamp((t - 42) / 12, 0, 1));
  const swing = easeOutBack(clamp((t - 51) / 8, 0, 1));
  const exit = clamp((t - 78) / 18, 0, 1);
  const slashFlash = clamp((t - 54) / 2.4, 0, 1) * (1 - clamp((t - 60) / 8, 0, 1));

  const startX = -260;
  const holdX = 500;
  const x = mix(startX, holdX, easeOutCubic(intro)) + swing * 620 + exit * 760;
  const y = 690 - intro * 210 - swing * 160 + Math.sin(t * 2.4) * 6;
  const angle = -0.24 - morph * 0.42 + swing * 1.05;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = intro * (1 - exit * 0.35);

  ctx.shadowColor = `rgba(255, 255, 255, ${0.24 + energy * 0.22})`;
  ctx.shadowBlur = 24 + morph * 44;
  if (morph < 0.95) {
    drawPenBody(420, 34, "#3a3a3a", "#9a9a9a");
    ctx.fillStyle = "#0c0c0c";
    ctx.beginPath();
    ctx.moveTo(226, 0);
    ctx.lineTo(284, -18);
    ctx.lineTo(284, 18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fillRect(-164, -4, 252, 8);
  }

  ctx.globalAlpha = intro * morph;
  const bladeLen = 560 + swing * 90;
  const blade = ctx.createLinearGradient(-80, 0, bladeLen, 0);
  blade.addColorStop(0, "#3a3a3a");
  blade.addColorStop(0.18, "#c8c8c8");
  blade.addColorStop(0.58, "#e8e8e8");
  blade.addColorStop(1, "#ffffff");
  ctx.fillStyle = blade;
  ctx.beginPath();
  ctx.moveTo(-70, -22);
  ctx.lineTo(bladeLen - 40, -10);
  ctx.lineTo(bladeLen + 46, 0);
  ctx.lineTo(bladeLen - 40, 10);
  ctx.lineTo(-70, 22);
  ctx.closePath();
  ctx.fill();

  // 剑刃飞白
  drawFlyingWhite(0, bladeLen, 8, 0.5);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.78)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(bladeLen + 24, 0);
  ctx.stroke();

  ctx.fillStyle = "#2a2a2a";
  roundRect(-136, -30, 126, 60, 7);
  ctx.fill();
  ctx.fillStyle = "#aaaaaa";
  ctx.fillRect(-28, -48, 18, 96);
  ctx.restore();

  if (slashFlash > 0) {
    drawSlash(t, slashFlash);
  }
}

function drawSlash(t, flash) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.58);
  for (let i = 0; i < 5; i += 1) {
    ctx.globalAlpha = flash * (0.34 - i * 0.04);
    ctx.strokeStyle = i % 2 ? "#ffffff" : "#cccccc";
    ctx.lineWidth = 18 + i * 18;
    ctx.beginPath();
    ctx.moveTo(-760 - i * 16, 0);
    ctx.quadraticCurveTo(-120, -70 - i * 12, 820 + i * 28, 0);
    ctx.stroke();
  }
  ctx.globalAlpha = flash;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-790, 0);
  ctx.quadraticCurveTo(-60, -92, 850, 0);
  ctx.stroke();
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawBoat(t, progress, energy) {
  const late = easeInOut(clamp((t - 66) / 24, 0, 1));
  const x = 170 + easeOutCubic(progress) * 1420;
  const y = 800 - Math.sin(progress * Math.PI) * 142 - late * 26 + Math.sin(t * 2.3) * 8;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.055 + Math.sin(t * 0.9) * 0.018);
  ctx.scale(1 + energy * 0.05, 1 + energy * 0.04);

  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.beginPath();
  ctx.ellipse(8, 46, 158, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  const hull = ctx.createLinearGradient(-150, 0, 170, 60);
  hull.addColorStop(0, "#222222");
  hull.addColorStop(0.46, "#6a6a6a");
  hull.addColorStop(1, "#1a1a1a");
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(-156, 18);
  ctx.quadraticCurveTo(-80, 76, 96, 56);
  ctx.quadraticCurveTo(150, 50, 182, 11);
  ctx.quadraticCurveTo(38, 31, -156, 18);
  ctx.fill();

  // 船底墨晕
  const footGrad = ctx.createLinearGradient(0, 30, 0, 80);
  footGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
  footGrad.addColorStop(1, "rgba(0, 0, 0, 0.4)");
  ctx.fillStyle = footGrad;
  ctx.beginPath();
  ctx.moveTo(-156, 18);
  ctx.quadraticCurveTo(-80, 76, 96, 56);
  ctx.quadraticCurveTo(150, 50, 182, 11);
  ctx.quadraticCurveTo(38, 31, -156, 18);
  ctx.closePath();
  ctx.fill();

  const sail = ctx.createLinearGradient(0, -130, 94, 12);
  sail.addColorStop(0, "#f0f0f0");
  sail.addColorStop(1, "#9a9a9a");
  ctx.fillStyle = sail;
  ctx.beginPath();
  ctx.moveTo(-50, 11);
  ctx.lineTo(30, -142);
  ctx.lineTo(88, 7);
  ctx.closePath();
  ctx.fill();

  // 帆上飞白（3 道）
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = "#ffffff";
  for (let k = 0; k < 3; k += 1) {
    const yy = -120 + k * 32;
    ctx.fillRect(-44 + k * 4, yy, 70 - k * 8, 1.2);
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(30, -142);
  ctx.lineTo(30, 18);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(-120, 75);
  ctx.quadraticCurveTo(22, 112, 174, 58);
  ctx.stroke();
  ctx.restore();
}

function drawMotes(t, energy) {
  for (const p of motes) {
    const x = (p.x + t * 48 * p.speed) % (W + 140) - 70;
    const y = p.y + Math.sin(t * p.speed + p.x) * 24;
    ctx.globalAlpha = p.alpha + energy * 0.22;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawSceneText(t, energy) {
  const scene = sceneAt(t);
  const index = scenes.indexOf(scene);
  const nextAt = scenes[index + 1]?.at ?? duration();
  const local = clamp((t - scene.at) / Math.max(1, nextAt - scene.at), 0, 1);
  const fade = clamp(Math.min(local / 0.14, (1 - local) / 0.15), 0, 1);
  const lift = (1 - easeInOut(clamp(local / 0.5, 0, 1))) * 36;
  const beat = beatPulse * 10;

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.textAlign = "center";
  ctx.lineJoin = "round";

  ctx.font = '700 96px "Ma Shan Zheng", "STKaiti", "KaiTi", "FangSong", serif';
  ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
  ctx.shadowBlur = 36;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
  ctx.lineWidth = 5;
  ctx.strokeText(scene.title, W / 2, 270 + lift - beat);
  ctx.fillStyle = "#f3ecda";
  ctx.fillText(scene.title, W / 2, 270 + lift - beat);

  ctx.shadowBlur = 22;
  ctx.font = '400 38px "ZCOOL XiaoWei", "STKaiti", "FangSong", serif';
  ctx.fillStyle = "rgba(243, 236, 218, 0.92)";
  ctx.fillText(scene.sub, W / 2, 340 + lift - beat * 0.4);
  ctx.restore();
}

function drawFinalSeal(t) {
  const show = easeInOut(clamp((t - 94) / 16, 0, 1));
  if (show <= 0) return;
  ctx.save();
  ctx.globalAlpha = show * 0.92;
  ctx.translate(W - 222, 198);
  ctx.rotate(-0.08);
  // 印章也来点飞白
  ctx.strokeStyle = "rgba(202, 53, 43, 0.9)";
  ctx.lineWidth = 8;
  ctx.strokeRect(-74, -74, 148, 148);
  // 印章飞白
  drawFlyingWhite(0, 148, 4, 0.5);
  ctx.fillStyle = "rgba(202, 53, 43, 0.92)";
  ctx.font = '700 36px "Ma Shan Zheng", "STKaiti", "KaiTi", serif';
  ctx.textAlign = "center";
  ctx.fillText("\u524d\u7a0b", 0, -12);
  ctx.fillText("\u4e07\u91cc", 0, 38);
  ctx.restore();
}

function drawBeatRing(t, energy) {
  if (ringPulse <= 0.02) return;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.translate(W / 2, H * 0.5);
  for (let i = 0; i < 3; i += 1) {
    const r = 80 + i * 100 + (1 - ringPulse) * 280;
    ctx.globalAlpha = ringPulse * (0.42 - i * 0.1);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2 + i * 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawOverlay(t, progress, energy) {
  // 暗角
  const vignette = ctx.createRadialGradient(W / 2, H / 2, 220, W / 2, H / 2, 1060);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, `rgba(0, 0, 0, ${0.55 - energy * 0.12})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // 扫描线
  ctx.globalAlpha = 0.06;
  for (let y = 0; y < H; y += 4) {
    ctx.fillStyle = y % 8 ? "#000" : "#fff";
    ctx.fillRect(0, y, W, 1);
  }
  ctx.globalAlpha = 1;

  // 节拍白闪
  if (beatPulse > 0.65) {
    ctx.globalAlpha = (beatPulse - 0.65) * 0.45;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // HUD
  ctx.fillStyle = "rgba(243, 236, 218, 0.78)";
  ctx.font = '500 25px "ZCOOL XiaoWei", "STKaiti", "FangSong", serif';
  ctx.textAlign = "left";
  ctx.fillText(text.stamp, 62, 78);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(243, 236, 218, 0.55)";
  ctx.fillText("Last Hope - Victor Cooper", W - 62, H - 54);

  ctx.save();
  ctx.translate(62, H - 78);
  ctx.fillStyle = "rgba(243, 236, 218, 0.2)";
  ctx.fillRect(0, 0, 420, 4);
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fillRect(0, 0, 420 * progress, 4);
  ctx.restore();
}

// === 墨色反转：difference 模式叠加白色蒙层，节拍时把画面"翻一下" ===
function drawInvertPulse() {
  if (invertPulse <= 0.015) return;
  ctx.save();
  ctx.globalCompositeOperation = "difference";
  ctx.fillStyle = `rgba(255, 255, 255, ${invertPulse * 0.95})`;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function render() {
  const t = audio.currentTime || 0;
  const total = duration();
  const progress = clamp(t / total, 0, 1);

  const a = analyseAudio();
  beatPulse *= 0.86;
  ringPulse *= 0.92;
  invertPulse *= 0.92;
  if (detectBeat(t, a.low)) {
    beatPulse = 1.0;
    ringPulse = 1.0;
    invertPulse = Math.min(1.0, invertPulse + 0.55);
  }
  const energy = a.energy;

  updateCamera(t, energy);

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(camera.roll);
  ctx.scale(camera.zoom, camera.zoom);
  if (camera.shake > 0.1) {
    ctx.translate(
      (Math.random() - 0.5) * camera.shake,
      (Math.random() - 0.5) * camera.shake * 0.6
    );
  }
  ctx.translate(-W / 2 + camera.x, -H / 2 + camera.y);

  drawSky(t, progress, energy);
  drawMountains(t, progress);
  drawFog(t, energy);
  drawRiver(t, progress, energy);
  drawTermCards(t, energy);   // 考点卡：跟随镜头
  drawPenSword(t, energy);
  drawBoat(t, progress, energy);
  drawMotes(t, energy);
  drawSceneText(t, energy);
  drawFinalSeal(t);
  drawBeatRing(t, energy);
  drawForeground(t, progress);
  ctx.restore();

  drawOverlay(t, progress, energy);
  drawInvertPulse();   // 墨色反转：最上层，节拍触发

  if (!isSeeking) seekBar.value = Math.round(progress * 1000);
  currentTime.textContent = formatTime(t);
  durationTime.textContent = formatTime(total);
  playButton.textContent = audio.paused ? text.play : text.pause;
  tapLayer.classList.toggle("is-hidden", !audio.paused || t > 0);

  requestAnimationFrame(render);
}

async function play() {
  setupAudioAnalysis();
  if (audioCtx && audioCtx.state === "suspended") {
    await audioCtx.resume();
  }
  await audio.play();
}

function restart() {
  audio.currentTime = 0;
  play();
}

function downloadRecording() {
  const blob = new Blob(recordedChunks, { type: "video/webm" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "qingzhou-gaokao-video.webm";
  a.click();
  URL.revokeObjectURL(url);
}

function stopRecording() {
  if (recorder && recorder.state !== "inactive") recorder.stop();
}

function startRecording() {
  if (!canvas.captureStream || !audio.captureStream || !window.MediaRecorder) {
    alert(text.unsupported);
    return;
  }
  recordedChunks = [];
  const canvasStream = canvas.captureStream(60);
  const audioStream = audio.captureStream();
  const mixedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioStream.getAudioTracks(),
  ]);
  const mimeTypes = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  const supportedMimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
  recorder = new MediaRecorder(
    mixedStream,
    supportedMimeType ? { mimeType: supportedMimeType } : undefined,
  );
  recorder.ondataavailable = (event) => {
    if (event.data.size) recordedChunks.push(event.data);
  };
  recorder.onstop = () => {
    recordButton.textContent = text.record;
    downloadRecording();
    audio.removeEventListener("ended", recordingStopHandler);
  };
  recordingStopHandler = stopRecording;
  audio.addEventListener("ended", recordingStopHandler, { once: true });
  recorder.start();
  recordButton.textContent = text.stop;
  if (audio.paused) play();
}

startButton.textContent = text.play;
playButton.textContent = text.play;
restartButton.textContent = text.replay;
recordButton.textContent = text.record;
fullscreenButton.textContent = text.fullscreen;

startButton.addEventListener("click", play);
playButton.addEventListener("click", () => {
  if (audio.paused) play();
  else audio.pause();
});
restartButton.addEventListener("click", restart);
recordButton.addEventListener("click", () => {
  if (recorder && recorder.state === "recording") stopRecording();
  else startRecording();
});
fullscreenButton.addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.querySelector(".stage-shell").requestFullscreen();
});

seekBar.addEventListener("input", () => {
  isSeeking = true;
  audio.currentTime = (Number(seekBar.value) / 1000) * duration();
});
seekBar.addEventListener("change", () => {
  isSeeking = false;
});

audio.addEventListener("loadedmetadata", () => {
  durationTime.textContent = formatTime(duration());
});
audio.addEventListener("ended", () => {
  tapLayer.classList.remove("is-hidden");
});

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => requestAnimationFrame(render));
} else {
  requestAnimationFrame(render);
}
