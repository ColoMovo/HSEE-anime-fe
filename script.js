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
const mountainStrength = [0.95, 1.0, 0.85, 0.0, 0.0, 0.0];

// 考点按场景分组：每组 4 张，挂在不同位置
const termGroups = [
  // 0 启程
  [
    { label: "函数零点",   x:  240, y: 700, rot:  0.05, depth: 0.65, desc: "f(x)=0 存在性与根的分布定理" },
    { label: "圆锥曲线",   x:  720, y: 620, rot: -0.07, depth: 0.7,  desc: "椭圆双曲线离心率与齐次化方程" },
    { label: "电磁感应",   x: 1180, y: 760, rot:  0.04, depth: 0.6,  desc: "法拉第定律与楞次定律方向判定" },
    { label: "E = B L v",  x: 1620, y: 680, rot: -0.05, depth: 0.8,  desc: "导体棒切割磁感线产生动生电动势" },
  ],
  // 1 题海
  [
    { label: "导数极值",   x:  280, y: 700, rot:  0.06, depth: 0.6,  desc: "f'(x)=0 单调区间与极值点判定" },
    { label: "化学平衡",   x:  780, y: 620, rot: -0.08, depth: 0.7,  desc: "等效平衡与平衡常数 K 综合计算" },
    { label: "概率分布",   x: 1180, y: 760, rot:  0.05, depth: 0.6,  desc: "离散随机变量均值与方差计算" },
    { label: "光合作用",   x: 1580, y: 700, rot: -0.06, depth: 0.75, desc: "光反应与暗反应的物质能量转化" },
  ],
  // 2 提笔
  [
    { label: "立体几何",   x:  260, y: 720, rot:  0.05, depth: 0.65, desc: "空间向量求二面角与线面角" },
    { label: "牛顿定律",   x:  760, y: 620, rot: -0.06, depth: 0.7,  desc: "连接体模型、传送带与板块物理分析" },
    { label: "pH = -log[H+]", x: 1240, y: 720, rot: 0.04, depth: 0.6,  desc: "酸碱滴定曲线与三大守恒关系" },
    { label: "F = m a",    x: 1680, y: 680, rot: -0.05, depth: 0.8,  desc: "瞬时性与矢量性动力学分析" },
  ],
  // 3 破阵
  [
    { label: "数列通项",   x:  340, y: 720, rot:  0.05, depth: 0.6,  desc: "累加累乘法与错位相减求和" },
    { label: "遗传图谱",   x:  840, y: 640, rot: -0.06, depth: 0.7,  desc: "伴性遗传概率与常染色体自由组合" },
    { label: "离子方程",   x: 1260, y: 720, rot:  0.04, depth: 0.55, desc: "电荷守恒、拆分原则与离子共存判定" },
    { label: "C₆H₁₂O₆",   x: 1620, y: 680, rot: -0.05, depth: 0.75, desc: "葡萄糖呼吸作用与 ATP 能量转换" },
  ],
  // 4 风起
  [
    { label: "论证结构",   x:  300, y: 700, rot:  0.05, depth: 0.65, desc: "并列式、递进式与对照式逻辑论证" },
    { label: "文言实词",   x:  740, y: 620, rot: -0.07, depth: 0.7,  desc: "词类活用、通假字与一词多义辨析" },
    { label: "阅读理解",   x: 1140, y: 720, rot:  0.05, depth: 0.6,  desc: "定位中心句与文章主旨大意整合" },
    { label: "等比数列",   x: 1580, y: 680, rot: -0.06, depth: 0.8,  desc: "a_n = a_1 q^(n-1) 及求和公式" },
  ],
  // 5 合笔
  [
    { label: "完形填空",   x:  340, y: 720, rot:  0.05, depth: 0.6,  desc: "上下文语境线索与高频词汇精析" },
    { label: "作文立意",   x:  820, y: 640, rot: -0.06, depth: 0.7,  desc: "时代思辨深度与核心论点层层递进" },
    { label: "切线方程",   x: 1260, y: 720, rot:  0.04, depth: 0.65, desc: "y - y0 = f'(x0)(x - x0) 的几何意义" },
    { label: "和差化积",   x: 1660, y: 680, rot: -0.05, depth: 0.75, desc: "三角恒等变换与两角和差公式" },
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

const boatWakes = [];
const lanterns = [];
const examPapers = [];
const inkRains = [];
const windLines = [];
const stampSplaters = [];
const bgChars = [];
let lastBgCharSpawn = 0;
let stampLanded = false;
let lastTime = 0;

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
  if (low > threshold && t - lastBeatTime > 0.42) {
    lastBeatTime = t;
    beatCount += 1;
    return true;
  }
  return false;
}

let audioDestNode = null;

function setupAudioAnalysis() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaElementSource(audio);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.62;
    
    // 创建媒体流音频目标节点，用于内录无损音频
    audioDestNode = audioCtx.createMediaStreamDestination();
    
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    source.connect(audioDestNode);
    
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
  // 仅在高潮期 (t >= 50) 启用节拍相关的横向强摆动，开头平静期保持平稳
  const beatSway = (t >= 50 && beatPulse > 0.4) ? Math.sin(t * 24) * 14 : 0;
  camera.x = baseSway + beatSway;
  camera.y = -climax * 22 - energy * 5;

  // 节拍滚转抖动同样仅在高潮期启用
  const rollJitter = (t >= 50) ? beatPulse * 0.02 * (Math.random() - 0.5) : 0;
  camera.roll = Math.sin(t * 0.12) * 0.012 + rollJitter;

  // 54s 斩击瞬时极强抖动，随后呈指数衰减
  const slashTime = t - 54;
  let slashShake = 0;
  if (slashTime >= 0 && slashTime < 3.0) {
    slashShake = Math.exp(-slashTime * 2.2) * 62;
  }

  // 94.2s 盖印重落瞬时极强抖动，随后呈指数衰减
  const stampTime = t - 94.2;
  let stampShake = 0;
  if (stampTime >= 0 && stampTime < 2.0) {
    stampShake = Math.exp(-stampTime * 4.0) * 36;
  }
  
  // 节拍常规抖动也仅在高潮期触发
  const beatShake = (t >= 50) ? (beatPulse * 8 + climax * 3 * beatPulse) : 0;
  camera.shake = beatShake + slashShake + stampShake;
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
  
  // 模拟镜头景深效果 (DoF) - 焦平面设在 0.5 深度处，两侧深度逐渐模糊
  const focusPlane = 0.5;
  const blurRad = Math.abs(depth - focusPlane) * 6.5;
  if (blurRad > 0.6) {
    ctx.filter = `blur(${blurRad.toFixed(1)}px)`;
  } else {
    ctx.filter = "none";
  }

  ctx.translate(offset % (320 + index * 60), 0);

  // 1. 定义山体轮廓的 Path
  const getMountainPath = (yOffset = 0, scaleY = 1.0) => {
    const path = new Path2D();
    path.moveTo(-300, H);
    path.lineTo(-300, layer.yBase + yOffset);
    for (let i = 0; i < layer.points.length; i += 1) {
      const x = (i / (layer.points.length - 1)) * (W + 620) - 310;
      const baseHeight = layer.points[i] * (0.6 + depth * 0.75) * scaleY;
      const wave = Math.sin(i * 1.7 + t * 0.08 + index) * (10 + depth * 16);
      const y = layer.yBase - baseHeight + wave + yOffset;
      path.lineTo(x, y);
    }
    path.lineTo(W + 300, H);
    path.closePath();
    return path;
  };

  // 2. 绘制底层水墨晕染 (Wash Layer) - 稍微向下偏移，具有淡雅的水墨渐变
  const washPath = getMountainPath(18, 0.95);
  const washGrad = ctx.createLinearGradient(0, layer.yBase - 150, 0, H);
  washGrad.addColorStop(0, `rgba(${g}, ${g}, ${g}, ${alpha * 0.45})`);
  washGrad.addColorStop(0.5, `rgba(${Math.max(10, g - 12)}, ${Math.max(10, g - 12)}, ${Math.max(10, g - 12)}, ${alpha * 0.7})`);
  washGrad.addColorStop(1, `rgba(10, 10, 10, ${alpha * 0.9})`);
  ctx.fillStyle = washGrad;
  ctx.fill(washPath);

  // 3. 绘制表层山体及勾勒墨线 (Contour Layer)
  const contourPath = getMountainPath(0, 1.0);
  ctx.fillStyle = `rgba(${g}, ${g}, ${g}, ${alpha * 0.95})`;
  ctx.fill(contourPath);

  // 写意勾线（传统国画勾勒）
  ctx.strokeStyle = `rgba(${Math.max(6, g - 28)}, ${Math.max(6, g - 28)}, ${Math.max(6, g - 28)}, ${alpha * 0.85})`;
  ctx.lineWidth = 1.5 + depth * 2.4;
  ctx.lineJoin = "round";
  ctx.stroke(contourPath);

  // 山顶飞白：3-4 条断线
  drawFlyingWhite(layer.yBase - 6, W + 620, 14, 0.18 + depth * 0.22);

  // 山底墨晕：把山脚"泡"在雾里
  const footGrad = ctx.createLinearGradient(0, layer.yBase - 30, 0, layer.yBase + 80);
  footGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
  footGrad.addColorStop(1, `rgba(0, 0, 0, ${0.5 * globalStrength})`);
  ctx.fillStyle = footGrad;
  ctx.fillRect(-300, layer.yBase - 30, W + 620, 110);
  ctx.restore();

  // 4. 缥缈烟云 (Drifting Clouds) - 绘制于山峦之间的云雾，增强立体透视和震撼感
  ctx.save();
  const cloudCount = 2;
  for (let f = 0; f < cloudCount; f += 1) {
    // 雾气横向漂移，速度由层级决定
    const cloudX = ((hash(f + index * 9, 17) * W * 1.5 + t * (12 + index * 6)) % (W + 600)) - 300;
    const cloudY = layer.yBase - 80 + hash(f + index * 13, 37) * 120;
    const cloudR = 140 + hash(f, 41) * 180;
    const cloudGrad = ctx.createRadialGradient(cloudX, cloudY, cloudR * 0.05, cloudX, cloudY, cloudR);
    
    // 烟云的透明度与山脉强度挂钩
    const cloudAlpha = (0.05 + index * 0.035) * globalStrength;
    cloudGrad.addColorStop(0, `rgba(240, 240, 240, ${cloudAlpha})`);
    cloudGrad.addColorStop(0.4, `rgba(220, 220, 220, ${cloudAlpha * 0.45})`);
    cloudGrad.addColorStop(1, "rgba(220, 220, 220, 0)");
    
    ctx.fillStyle = cloudGrad;
    ctx.beginPath();
    ctx.arc(cloudX, cloudY, cloudR, 0, Math.PI * 2);
    ctx.fill();
  }
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

function drawBgChars(t) {
  if (t < 50) return;
  ctx.save();
  const focusPlane = 0.7; // 焦平面在近中景，背景字在 0.2~0.65，会产生模糊
  for (const c of bgChars) {
    const blur = Math.abs(c.depth - focusPlane) * 12.0;
    
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.scale(c.scale, c.scale);
    ctx.globalAlpha = c.opacity;
    
    if (blur > 0.6) {
      ctx.filter = `blur(${blur.toFixed(1)}px)`;
    } else {
      ctx.filter = "none";
    }
    
    ctx.fillStyle = "#f6f0e0";
    ctx.font = '900 240px "Ma Shan Zheng", "STKaiti", "KaiTi", serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    // 绘制水墨书法叠层：淡墨勾勒，金边意境
    ctx.shadowColor = "rgba(197, 160, 89, 0.25)";
    ctx.shadowBlur = 12;
    ctx.strokeStyle = "rgba(12, 12, 12, 0.46)";
    ctx.lineWidth = 6;
    ctx.strokeText(c.char, 0, 0);
    ctx.fillText(c.char, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

function drawInkStorm(t, energy) {
  if (t < 50 || t >= 68) return;
  ctx.save();
  // 随音乐能量和节拍跳跃的透明度
  ctx.globalAlpha = 0.08 + beatPulse * 0.15;
  
  // 3层自旋的巨大水墨雷暴漩涡
  for (let i = 0; i < 3; i++) {
    const cx = W * 0.5 + Math.sin(t * 0.8 + i) * 150;
    const cy = H * 0.35 + Math.cos(t * 0.6 + i) * 80;
    const radius = 280 + i * 160 + beatPulse * 60;
    const grad = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
    grad.addColorStop(0, "rgba(10, 10, 10, 0.88)");
    grad.addColorStop(0.4, "rgba(22, 22, 22, 0.52)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    
    ctx.fillStyle = grad;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.3 * (i % 2 ? 1 : -1));
    ctx.scale(1.5, 0.75); // 偏斜透视
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawGodRays(t, energy) {
  if (t < 68) return;
  ctx.save();
  const dawn = easeInOut(clamp((t - 62) / 38, 0, 1));
  const sunX = 280 + dawn * 1160;
  const sunY = 760 - dawn * 540;
  const rayCount = 16;
  const angleStep = (Math.PI * 2) / rayCount;
  const rot = t * 0.05; // 缓慢自旋
  
  // 强度跟节拍和音乐低音能量相关
  ctx.globalAlpha = (0.05 + energy * 0.12) * dawn;
  ctx.fillStyle = "rgba(255, 222, 120, 0.36)";
  
  for (let i = 0; i < rayCount; i++) {
    if (i % 2 === 0) continue;
    const angle1 = rot + i * angleStep;
    const angle2 = rot + (i + 0.55) * angleStep;
    ctx.beginPath();
    ctx.moveTo(sunX, sunY);
    ctx.lineTo(sunX + Math.cos(angle1) * 2000, sunY + Math.sin(angle1) * 2000);
    ctx.lineTo(sunX + Math.cos(angle2) * 2000, sunY + Math.sin(angle2) * 2000);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawForeground(t, progress) {
  const offset = -progress * 60;
  ctx.save();
  // 模拟前景近景景深模糊 (Foreground DoF)
  ctx.filter = "blur(9.0px)";
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

  // 1. 绘制山脉在江面的微弱写意倒影 (Distorted Reflection of Mountains)
  ctx.save();
  const sceneIdx = sceneIndexAt(t);
  const strength = mountainStrength[sceneIdx] ?? 1;
  for (let i = 0; i < mountainLayers.length; i += 1) {
    const layer = mountainLayers[i];
    const depth = i / Math.max(1, mountainLayers.length - 1);
    const offset = -progress * layer.speed * 9 * layer.parallax + Math.sin(t * 0.05 + i) * 12;
    const alpha = (layer.alphaBase + depth * 0.15) * strength * 0.22;
    
    ctx.save();
    ctx.translate(offset % (320 + i * 60), 0);
    ctx.beginPath();
    ctx.moveTo(-300, H);
    for (let j = 0; j < layer.points.length; j += 1) {
      const x = (j / (layer.points.length - 1)) * (W + 620) - 310;
      const baseHeight = layer.points[j] * (0.6 + depth * 0.75);
      const wave = Math.sin(j * 1.7 + t * 0.08 + i) * (10 + depth * 16);
      
      // 倒影点：以 560px 湖岸为基准折射，纵向压缩并添加水波抖动
      const mY = layer.yBase - baseHeight + wave;
      const distFromRiver = Math.max(0, mY - 560);
      const reflectY = 560 + distFromRiver * 0.6 + Math.sin(x * 0.05 + t * 4) * 8;
      ctx.lineTo(x, reflectY);
    }
    ctx.lineTo(W + 300, H);
    ctx.closePath();
    ctx.fillStyle = `rgba(12, 12, 12, ${alpha})`;
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // 1.5. 绘制孔明灯在江水中的写意倒影 (Distorted Lantern Reflections)
  if (t >= 68) {
    ctx.save();
    for (const l of lanterns) {
      if (l.y < 560) {
        const distToWater = 560 - l.y;
        const refAlpha = l.life * Math.max(0, 1 - distToWater / 450) * 0.18;
        if (refAlpha <= 0.01) continue;
        
        const refGrad = ctx.createLinearGradient(l.x, 560, l.x, H);
        refGrad.addColorStop(0, `rgba(255, 180, 60, ${refAlpha * 0.95})`);
        refGrad.addColorStop(0.35, `rgba(224, 130, 40, ${refAlpha * 0.4})`);
        refGrad.addColorStop(1, "rgba(224, 130, 40, 0)");
        
        ctx.fillStyle = refGrad;
        ctx.beginPath();
        // 倒影随着水流稍微波动抖动
        const wobble = Math.sin(t * 5.2 + l.y * 0.1) * 5;
        ctx.moveTo(l.x - 14 + wobble, 560);
        ctx.lineTo(l.x + 14 + wobble, 560);
        ctx.lineTo(l.x + 3 + wobble * 0.5, H);
        ctx.lineTo(l.x - 3 + wobble * 0.5, H);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // 2. 绘制中国画写意水波线 (Sino-style Wave Lines)
  for (let i = 0; i < 28; i += 1) {
    const y = 575 + i * 20;
    const amp = 7 + i * 1.9;
    const drift = (t * (30 + i * 4)) % 400;
    ctx.beginPath();
    for (let x = -320; x <= W + 320; x += 32) {
      const wave = Math.sin((x + drift) * 0.01 + i) * amp;
      const py = y + wave + Math.sin(t * 1.1 + i) * 6;
      if (x === -320) ctx.moveTo(x, py);
      else {
        // 使用贝塞尔曲线使波浪线条更加圆润流畅
        const prevX = x - 32;
        const prevWave = Math.sin((prevX + drift) * 0.01 + i) * amp;
        const prevPy = y + prevWave + Math.sin(t * 1.1 + i) * 6;
        ctx.bezierCurveTo(prevX + 16, prevPy, x - 16, py, x, py);
      }
    }
    // 粗细与墨色相交替，增加宣纸手绘的“质朴感”
    const isDarkInk = i % 3 === 0;
    const alpha = (isDarkInk ? 0.045 : 0.085) + energy * 0.08;
    const gVal = isDarkInk ? 12 : Math.min(235, 180 + i * 2);
    ctx.strokeStyle = `rgba(${gVal}, ${gVal}, ${gVal}, ${alpha})`;
    ctx.lineWidth = (isDarkInk ? 0.9 : 1.5) + i * 0.05;
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
  
  // 模拟镜头景深效果 (DoF) - 焦平面设在 0.7 深度处，偏离则模糊
  const cardFocus = 0.7;
  const cBlur = Math.abs(card.depth - cardFocus) * 9.5;
  if (cBlur > 0.6) {
    ctx.filter = `blur(${cBlur.toFixed(1)}px)`;
  } else {
    ctx.filter = "none";
  }

  ctx.translate(px + sway, py - beat);
  ctx.rotate(rot + beatPulse * 0.015 * (Math.random() - 0.5));
  ctx.globalAlpha = opacity;

  // 1. 卡身宣纸质感底色 (Warm Xuan Paper Background - Enlarged to 340x120)
  const grad = ctx.createLinearGradient(0, -60, 0, 60);
  grad.addColorStop(0, "rgba(246, 242, 230, 0.19)");
  grad.addColorStop(1, "rgba(240, 235, 220, 0.09)");
  ctx.fillStyle = grad;
  ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
  ctx.shadowBlur = 14;
  roundRect(-170, -60, 340, 120, 8);
  ctx.fill();
  ctx.shadowBlur = 0; // 重置

  // 2. 绘制洒金碎片 (Sprinkling Gold Foil Speckles)
  ctx.fillStyle = "rgba(212, 175, 55, 0.42)";
  for (let k = 0; k < 6; k += 1) {
    const gx = -150 + hash(k, card.appearAt * 3) * 300;
    const gy = -46 + hash(k, card.appearAt * 7) * 92;
    const gs = 1.5 + hash(k, 19) * 2.5;
    ctx.fillRect(gx, gy, gs, gs);
  }

  // 3. 绘制手绘感卡边
  ctx.strokeStyle = "rgba(246, 242, 230, 0.52)";
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // 叠画一层微微错位的淡墨边线，模拟手工宣纸裁切毛边
  ctx.strokeStyle = "rgba(10, 10, 10, 0.28)";
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.moveTo(-168, 60);
  ctx.lineTo(168, 60);
  ctx.moveTo(170, -58);
  ctx.lineTo(170, 58);
  ctx.stroke();

  // 飞白：底下一道墨痕 + 随机小墨点
  ctx.globalAlpha = opacity * 0.7;
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.fillRect(-162, 56, 324, 1.5);
  // 不规则飞白
  for (let k = 0; k < 4; k += 1) {
    const fx = -155 + hash(k, 7 + card.sceneIdx * 7) * 310;
    const fw = 12 + hash(k, 13) * 30;
    ctx.fillRect(fx, 58, fw, 1);
  }

  // 文字分层绘制 (Enlarged and double-lined)
  ctx.globalAlpha = opacity;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  // 第一行：标题 (Enlarged to 38px)
  ctx.fillStyle = "rgba(245, 240, 224, 0.95)";
  ctx.font = '700 38px "Ma Shan Zheng", "STKaiti", "KaiTi", "FangSong", serif';
  ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
  ctx.lineWidth = 2.4;
  ctx.strokeText(card.label, 0, -18);
  ctx.fillText(card.label, 0, -18);

  // 第二行：相关公式/定义 (22px)
  if (card.desc) {
    ctx.font = '400 22px "ZCOOL XiaoWei", "Noto Serif SC", "STKaiti", "KaiTi", serif';
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.lineWidth = 1.8;
    ctx.strokeText(card.desc, 0, 26);
    ctx.fillStyle = "rgba(245, 240, 224, 0.82)";
    ctx.fillText(card.desc, 0, 26);
  }

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

  // === 变身期 (t在30-50s) 的水墨螺旋与星华尘埃粒子 ===
  if (t >= 30 && t < 50) {
    ctx.save();
    const particleCount = 18;
    const timeFactor = t * 6.5;
    for (let k = 0; k < particleCount; k += 1) {
      // 算出沿笔轴（x轴）的分布
      const pxFactor = (k / particleCount) * 1.4 - 0.7; // -0.7 到 0.7
      const px = pxFactor * 380;
      // 螺旋半径随形态演化收紧
      const radius = (28 + Math.sin(timeFactor + k * 0.8) * 15) * (1.25 - morph * 0.65);
      const angleOffset = timeFactor + k * 1.35;
      const py = Math.sin(angleOffset) * radius;
      const pz = Math.cos(angleOffset);
      const pAlpha = clamp((pz + 1.25) * 0.45 * intro * (1 - morph * 0.45), 0, 1);
      
      const grad = ctx.createRadialGradient(px, py, 1, px, py, 4 + Math.random() * 4);
      if (k % 2 === 0) {
        grad.addColorStop(0, "rgba(255, 255, 255, 0.9)");
        grad.addColorStop(1, "rgba(255, 255, 255, 0)");
      } else {
        grad.addColorStop(0, "rgba(10, 10, 10, 0.8)");
        grad.addColorStop(1, "rgba(10, 10, 10, 0)");
      }
      ctx.fillStyle = grad;
      ctx.globalAlpha = pAlpha * intro;
      ctx.beginPath();
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

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
  // 1. 绘制弯月弧形斩击光芒
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

  // 2. 绘制水墨写意径向冲击波圆环与溅射粒子
  const age = t - 54;
  if (age >= 0 && age < 2.2) {
    const progress = clamp(age / 1.4, 0, 1);
    const radius = progress * 1050;
    const alpha = (1 - progress) * flash;
    const thickness = (1 - progress) * 64;

    ctx.save();
    ctx.translate(W / 2, H / 2);
    
    // 双层冲击波本体（黑与白高对比度叠合）
    for (let k = 0; k < 2; k += 1) {
      ctx.globalAlpha = alpha * 0.75;
      ctx.strokeStyle = k === 0 ? "#ffffff" : "#080808";
      ctx.lineWidth = thickness * (k === 0 ? 1.0 : 0.65);
      
      ctx.beginPath();
      const segments = 48;
      for (let s = 0; s <= segments; s += 1) {
        const theta = (s / segments) * Math.PI * 2;
        const rOffset = Math.sin(theta * 12 + t * 5) * 28 * (1 - progress);
        const rx = Math.cos(theta) * (radius + rOffset);
        const ry = Math.sin(theta) * (radius + rOffset) * 0.65; // 压扁符合透视
        if (s === 0) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
      }
      ctx.stroke();
    }

    // 泼墨飞流溅射粒子
    const pCount = 24;
    for (let p = 0; p < pCount; p += 1) {
      const theta = hash(p, 5) * Math.PI * 2;
      const speed = 15 + hash(p, 19) * 22;
      const px = Math.cos(theta) * (radius * 0.95 + age * speed * 20);
      const py = Math.sin(theta) * (radius * 0.95 * 0.65 + age * speed * 12);
      const size = (5 + hash(p, 31) * 14) * (1 - progress);
      
      // 一半画黑一半画白，水墨晕染感更足
      ctx.fillStyle = p % 2 ? "#ffffff" : "#0d0d0d";
      ctx.globalAlpha = alpha * (0.35 + hash(p, 11) * 0.55);
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
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

  // 1. 绘制吃水线下的波浪抖动倒影 (Distorted Boat Reflection)
  ctx.save();
  ctx.translate(x, y + 42); // 偏置到吃水线
  ctx.scale(1.0, -0.45);   // 翻转并压扁
  const refSway = Math.sin(t * 4.5) * 0.03;
  ctx.rotate(refSway);     // 倒影随波摆动
  ctx.globalAlpha = 0.24;

  // 船身倒影
  ctx.fillStyle = "rgba(8, 8, 8, 0.45)";
  ctx.beginPath();
  ctx.moveTo(-156, 18);
  ctx.quadraticCurveTo(-80, 76, 96, 56);
  ctx.quadraticCurveTo(150, 50, 182, 11);
  ctx.quadraticCurveTo(38, 31, -156, 18);
  ctx.fill();

  // 船帆倒影
  ctx.fillStyle = "rgba(50, 50, 50, 0.3)";
  ctx.beginPath();
  ctx.moveTo(-50, 11);
  ctx.lineTo(30, -142);
  ctx.lineTo(88, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 2. 绘制实体轻舟 (Real Boat)
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
    const fx = -44 + k * 4;
    ctx.fillRect(fx, yy, 70 - k * 8, 1.2);
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

  // 3. 船尾写意烛火 (Candle Flame) - 在平静且压抑的夜读阶段（t在12-66s）点燃
  if (t >= 12 && t < 66) {
    ctx.save();
    // 船尾坐标在 hull 的左侧，约为 (-115, 22)
    const fireX = -115;
    const fireY = 22;
    const opacity = clamp((t - 12) / 2, 0, 1) * (1 - clamp((t - 62) / 4, 0, 1));
    ctx.globalAlpha = opacity;
    
    // 灯架
    ctx.strokeStyle = "rgba(240, 234, 216, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(fireX - 6, fireY - 14, 12, 18);
    ctx.beginPath();
    ctx.moveTo(fireX, fireY - 14);
    ctx.lineTo(fireX, fireY - 20);
    ctx.stroke();
    
    // 烛火及黄色发光 (Flickering Golden Flame)
    const flicker = Math.sin(t * 18 + hash(0, t)) * 1.5 + 4.5;
    const fireGlow = ctx.createRadialGradient(fireX, fireY - 3, 1, fireX, fireY - 3, flicker * 2.8);
    fireGlow.addColorStop(0, "rgba(255, 204, 102, 0.95)");
    fireGlow.addColorStop(0.4, "rgba(224, 120, 40, 0.42)");
    fireGlow.addColorStop(1, "rgba(224, 120, 40, 0)");
    ctx.fillStyle = fireGlow;
    ctx.beginPath();
    ctx.arc(fireX, fireY - 3, flicker * 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

function drawMotes(t, energy) {
  ctx.save();
  for (const p of motes) {
    const x = (p.x + t * 48 * p.speed) % (W + 140) - 70;
    const y = p.y + Math.sin(t * p.speed + p.x) * 24;
    ctx.filter = p.layer === 1 ? "blur(4.0px)" : "blur(1.2px)";
    ctx.globalAlpha = p.alpha + energy * 0.22;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
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

  ctx.font = '700 160px "Ma Shan Zheng", "STKaiti", "KaiTi", "FangSong", serif';
  
  // 1. 绘制底层暗金色晕染光芒 (Glow & Outer Shadow - Enlarged)
  ctx.shadowColor = "rgba(197, 160, 89, 0.65)"; // 金黄色光晕
  ctx.shadowBlur = 64 + beatPulse * 30;
  ctx.strokeStyle = "rgba(164, 126, 61, 0.4)";
  ctx.lineWidth = 18;
  ctx.strokeText(scene.title, W / 2, 250 + lift - beat);

  // 2. 绘制中层深墨勾边 (Deep Ink Stroke)
  ctx.shadowBlur = 0; // 重置阴影以避免混叠
  ctx.strokeStyle = "rgba(12, 12, 12, 0.9)";
  ctx.lineWidth = 6;
  ctx.strokeText(scene.title, W / 2, 250 + lift - beat);

  // 3. 填充字芯 (Cream/Ivory Fill)
  ctx.fillStyle = "#f6f0e0";
  ctx.fillText(scene.title, W / 2, 250 + lift - beat);

  // 4. 副标题绘制（增加大小与行间距）
  ctx.font = '400 56px "ZCOOL XiaoWei", "STKaiti", "FangSong", serif';
  ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
  ctx.shadowBlur = 14;
  ctx.fillStyle = "rgba(243, 236, 218, 0.94)";
  ctx.fillText(scene.sub, W / 2, 370 + lift - beat * 0.4);
  ctx.restore();
}

function drawFinalSeal(t) {
  if (t < 94.0) return;

  // 0.2秒完成落印
  const dropProgress = clamp((t - 94.0) / 0.2, 0, 1);
  const show = easeOutCubic(dropProgress);
  const scale = mix(2.5, 1.0, show); // 从大到小砸下
  const alpha = show * 0.92;
  const shakeOffset = dropProgress < 1.0 ? 0 : Math.sin((t - 94.2) * 40) * 3 * Math.exp(-(t - 94.2) * 5); // 落地余震抖动

  // 落地瞬间触发朱砂粒子喷射与状态记录
  if (t >= 94.2 && !stampLanded) {
    stampLanded = true;
    for (let k = 0; k < 25; k += 1) {
      stampSplaters.push({
        x: W - 222 + (Math.random() - 0.5) * 50,
        y: 198 + (Math.random() - 0.5) * 50,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 10 - 2, // 抛物线运动
        life: 1.0,
        decay: 0.02 + Math.random() * 0.03,
        size: 3 + Math.random() * 5
      });
    }
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(W - 222 + shakeOffset, 198);
  ctx.scale(scale, scale);
  ctx.rotate(-0.08);

  // 红色印框 (Enlarged to 180x180)
  ctx.strokeStyle = "rgba(202, 53, 43, 0.92)";
  ctx.lineWidth = 7;
  ctx.strokeRect(-90, -90, 180, 180);
  // 印章飞白
  drawFlyingWhite(0, 180, 4, 0.5);

  ctx.fillStyle = "rgba(202, 53, 43, 0.94)";
  ctx.font = '700 46px "Ma Shan Zheng", "STKaiti", "KaiTi", serif';
  ctx.textAlign = "center";
  ctx.fillText("前程", 0, -16);
  ctx.fillText("万里", 0, 48);
  ctx.restore();

  // 绘制和更新朱砂爆裂粒子
  if (t >= 94.2) {
    ctx.save();
    for (let i = stampSplaters.length - 1; i >= 0; i -= 1) {
      const p = stampSplaters[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.22; // 模拟重力加速下落
      p.life -= p.decay;
      if (p.life <= 0) {
        stampSplaters.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = p.life * 0.85;
      // 朱砂红渐变色
      ctx.fillStyle = `rgba(202, 53, 43, ${p.life * 0.85})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
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

  // 节拍白闪 (仅在高潮期 t >= 50 时触发，开头的平静期不闪烁)
  if (t >= 50 && beatPulse > 0.65) {
    ctx.globalAlpha = (beatPulse - 0.65) * 0.45;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // HUD (Enlarged text size)
  ctx.fillStyle = "rgba(243, 236, 218, 0.78)";
  ctx.font = '500 32px "ZCOOL XiaoWei", "STKaiti", "FangSong", serif';
  ctx.textAlign = "left";
  ctx.fillText(text.stamp, 62, 84);

  ctx.textAlign = "right";
  ctx.font = '500 28px "ZCOOL XiaoWei", "STKaiti", "FangSong", serif';
  ctx.fillStyle = "rgba(243, 236, 218, 0.55)";
  ctx.fillText("Last Hope - Victor Cooper", W - 62, H - 60);

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

function drawExamPapers() {
  ctx.save();
  for (const p of examPapers) {
    const depth = p.depth ?? 0.7;
    const focusPlane = 0.7;
    const pBlur = Math.abs(depth - focusPlane) * 7.0;
    
    ctx.save();
    if (pBlur > 0.6) {
      ctx.filter = `blur(${pBlur.toFixed(1)}px)`;
    } else {
      ctx.filter = "none";
    }
    ctx.globalAlpha = p.opacity;
    
    if (!p.sliced) {
      // 绘制完整考卷
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      
      // 纸身宣纸质感底色
      ctx.fillStyle = "rgba(248, 246, 238, 0.82)";
      ctx.strokeStyle = "rgba(20, 20, 20, 0.4)";
      ctx.lineWidth = 1;
      roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 2);
      ctx.fill();
      ctx.stroke();
      
      // 考题线条（墨纹模拟题海）
      ctx.strokeStyle = "rgba(40, 40, 40, 0.35)";
      ctx.lineWidth = 1;
      for (let k = 0; k < 6; k += 1) {
        const lineY = -p.h * 0.35 + k * (p.h * 0.14);
        ctx.beginPath();
        ctx.moveTo(-p.w * 0.38, lineY);
        ctx.lineTo(p.w * 0.38, lineY + Math.sin(k * 2 + p.seed * 5) * 2);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // 绘制被砍碎的两半纸张 (Two Sliced Halves)
      const dist = p.sliceAge * 220;
      
      // 1. 左半部分
      ctx.save();
      ctx.translate(p.x + p.vx1 * p.sliceAge * 40, p.y + p.vy1 * p.sliceAge * 40);
      ctx.rotate(p.rot + p.rot1);
      
      ctx.fillStyle = "rgba(248, 246, 238, 0.72)";
      ctx.strokeStyle = "rgba(20, 20, 20, 0.3)";
      ctx.lineWidth = 1;
      
      ctx.beginPath();
      ctx.moveTo(-p.w / 2, -p.h / 2);
      ctx.lineTo(p.w * 0.05 + Math.sin(p.seed * 10) * 4, -p.h / 2);
      ctx.lineTo(-p.w * 0.08 + Math.cos(p.seed * 20) * 6, 0);
      ctx.lineTo(p.w * 0.05 + Math.sin(p.seed * 30) * 4, p.h / 2);
      ctx.lineTo(-p.w / 2, p.h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // 2. 右半部分
      ctx.save();
      ctx.translate(p.x + p.vx2 * p.sliceAge * 40, p.y + p.vy2 * p.sliceAge * 40);
      ctx.rotate(p.rot + p.rot2);
      
      ctx.fillStyle = "rgba(248, 246, 238, 0.72)";
      ctx.strokeStyle = "rgba(20, 20, 20, 0.3)";
      ctx.lineWidth = 1;
      
      ctx.beginPath();
      ctx.moveTo(p.w * 0.05 + Math.sin(p.seed * 10) * 4, -p.h / 2);
      ctx.lineTo(p.w / 2, -p.h / 2);
      ctx.lineTo(p.w / 2, p.h / 2);
      ctx.lineTo(p.w * 0.05 + Math.sin(p.seed * 30) * 4, p.h / 2);
      ctx.lineTo(-p.w * 0.08 + Math.cos(p.seed * 20) * 6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      
      // 3. 溅射细微墨迹尾迹
      if (Math.random() < 0.28) {
        ctx.fillStyle = "rgba(10, 10, 10, 0.5)";
        ctx.beginPath();
        ctx.arc(p.x + (Math.random() - 0.5) * dist, p.y + (Math.random() - 0.5) * dist, 1.5 + Math.random() * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawInkRain() {
  ctx.save();
  for (const p of inkRains) {
    if (p.rippleLife === 0) {
      // 绘制下落雨线
      ctx.strokeStyle = p.isWhite ? `rgba(240, 234, 216, ${p.alpha * 0.8})` : `rgba(10, 10, 10, ${p.alpha})`;
      ctx.lineWidth = p.isWhite ? 0.9 : 1.4;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y + p.len);
      ctx.stroke();
    } else {
      // 绘制江面水墨涟漪
      const rSize = (1.0 - p.rippleLife) * 32;
      ctx.globalAlpha = p.rippleLife * p.alpha * 1.5;
      ctx.strokeStyle = p.isWhite ? "rgba(255, 255, 255, 0.4)" : "rgba(12, 12, 12, 0.6)";
      ctx.lineWidth = 1;
      
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rSize, rSize * 0.35, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawLanterns() {
  ctx.save();
  for (const l of lanterns) {
    const depth = l.depth ?? 0.6;
    const focusPlane = 0.6;
    const lBlur = Math.abs(depth - focusPlane) * 8.0;
    
    ctx.save();
    if (lBlur > 0.6) {
      ctx.filter = `blur(${lBlur.toFixed(1)}px)`;
    } else {
      ctx.filter = "none";
    }
    
    const breath = Math.sin(audio.currentTime * 2 + l.phase) * 0.15 + 0.85;
    ctx.globalAlpha = l.life * breath * 0.78;
    
    // 1. 绘制金色发光外晕 (Golden Glow outer ring)
    const glow = ctx.createRadialGradient(l.x, l.y, l.size * 0.1, l.x, l.y, l.size * 2.8);
    glow.addColorStop(0, "rgba(255, 218, 110, 0.95)");
    glow.addColorStop(0.35, "rgba(224, 160, 60, 0.45)");
    glow.addColorStop(1, "rgba(224, 160, 60, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(l.x, l.y, l.size * 2.8, 0, Math.PI * 2);
    ctx.fill();

    // 2. 绘制天灯灯笼实体 (Trapezoid Lantern Body)
    ctx.fillStyle = "rgba(254, 235, 172, 0.95)";
    ctx.strokeStyle = "rgba(180, 110, 30, 0.75)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    // 稍微向外倾斜的写意四边形
    ctx.moveTo(l.x - l.size * 0.5, l.y + l.size * 0.7);
    ctx.lineTo(l.x - l.size * 0.7, l.y - l.size * 0.7);
    ctx.lineTo(l.x + l.size * 0.7, l.y - l.size * 0.7);
    ctx.lineTo(l.x + l.size * 0.5, l.y + l.size * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawWindLines() {
  ctx.save();
  for (const w of windLines) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${w.alpha})`;
    ctx.lineWidth = w.lineWidth;
    ctx.beginPath();
    ctx.moveTo(w.x, w.y);
    ctx.lineTo(w.x + w.len, w.y);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawBoatWakes() {
  ctx.save();
  for (const p of boatWakes) {
    ctx.globalAlpha = p.life * 0.32;
    const grad = ctx.createRadialGradient(p.x, p.y, p.size * 0.1, p.x, p.y, p.size);
    if (p.isInk) {
      grad.addColorStop(0, "rgba(22, 22, 22, 0.85)");
      grad.addColorStop(0.4, "rgba(42, 42, 42, 0.3)");
      grad.addColorStop(1, "rgba(42, 42, 42, 0)");
    } else {
      grad.addColorStop(0, "rgba(255, 255, 255, 0.9)");
      grad.addColorStop(0.4, "rgba(240, 240, 240, 0.4)");
      grad.addColorStop(1, "rgba(240, 240, 240, 0)");
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function render() {
  const t = window.isRemotion ? (window.remotionFrame / 60) : (audio.currentTime || 0);
  const total = duration();
  const progress = clamp(t / total, 0, 1);

  // 若时间向后跳跃（例如重播或拖动进度条倒退），重置所有的粒子系统及盖印状态
  if (t < lastTime - 0.001 || t === 0) {
    lanterns.length = 0;
    examPapers.length = 0;
    inkRains.length = 0;
    windLines.length = 0;
    stampSplaters.length = 0;
    bgChars.length = 0;
    lastBgCharSpawn = 0;
    stampLanded = false;
  }
  lastTime = t;

  let a;
  let isBeat = false;
  if (isAudioReady && preAnalyzedAudio.length > 0) {
    const frameIdx = Math.min(preAnalyzedAudio.length - 1, Math.floor(t * 60));
    a = preAnalyzedAudio[frameIdx] || { energy: 0, low: 0, mid: 0, high: 0, isBeat: false };
    isBeat = a.isBeat;
  } else {
    a = analyseAudio();
    isBeat = detectBeat(t, a.low);
  }

  beatPulse *= 0.86;
  ringPulse *= 0.92;
  invertPulse *= 0.88; // 更快的衰减以获得更清爽利落的闪烁效果
  if (isBeat) {
    beatPulse = 1.0;
    ringPulse = 1.0;
    // 仅在高潮期 (50s 到 94s - 破阵/风起/合笔) 且低音能量足够强时触发反转，反转强度与能量成正比
    if (t >= 50 && t < 94) {
      invertPulse = Math.min(1.0, invertPulse + 0.35 + a.low * 0.5);
    }
  }
  const energy = a.energy;

  const isPlaying = window.isRemotion ? true : !audio.paused;

  // 1. 在轻舟后方生成尾迹水花粒子
  const late = easeInOut(clamp((t - 66) / 24, 0, 1));
  const boatX = 170 + easeOutCubic(progress) * 1420;
  const boatY = 800 - Math.sin(progress * Math.PI) * 142 - late * 26 + Math.sin(t * 2.3) * 8;

  if (isPlaying) {
    // 基础生成数量 + 节拍强音能量触发大量水流喷射
    const spawnCount = 1 + (beatPulse > 0.5 ? 4 : 0);
    for (let k = 0; k < spawnCount; k++) {
      boatWakes.push({
        x: boatX - 78 + (Math.random() - 0.5) * 12,
        y: boatY + 38 + (Math.random() - 0.5) * 6,
        vx: -2.0 - Math.random() * 2.5 - progress * 1.5,
        vy: (Math.random() - 0.5) * 1.0,
        life: 1.0,
        decay: 0.015 + Math.random() * 0.02,
        size: 3 + Math.random() * 6,
        maxSize: 16 + Math.random() * 22,
        isInk: Math.random() > 0.45
      });
    }
  }

  // 2. 更新水花粒子生命周期与物理运动
  for (let i = boatWakes.length - 1; i >= 0; i--) {
    const p = boatWakes[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= p.decay;
    p.size = mix(p.size, p.maxSize, 0.08); // 水波晕开变大
    if (p.life <= 0) {
      boatWakes.splice(i, 1);
    }
  }

  // 3. 生成与更新「题海/提笔」水墨雨丝 (Ink Rain) - t在12s到50s之间
  if (isPlaying && t >= 12 && t < 50) {
    const rainCount = Math.floor(Math.random() * 3) + 1;
    for (let k = 0; k < rainCount; k += 1) {
      inkRains.push({
        x: Math.random() * W,
        y: -50,
        speed: 12 + Math.random() * 8,
        len: 30 + Math.random() * 35,
        alpha: 0.05 + Math.random() * 0.08,
        isWhite: Math.random() > 0.75, // 一小部分是白色飞白雨，大部分是黑墨雨
        rippleLife: 0
      });
    }
  }

  // 更新墨雨粒子
  for (let i = inkRains.length - 1; i >= 0; i -= 1) {
    const p = inkRains[i];
    if (p.rippleLife === 0) {
      const limitY = 575 + (p.x % 17) * 18;
      p.y += p.speed;
      if (p.y >= limitY) {
        p.y = limitY;
        p.rippleLife = 1.0; // 触地开始扩散涟漪
      }
    } else {
      p.rippleLife -= 0.025; // 涟漪渐消
      if (p.rippleLife <= 0) {
        inkRains.splice(i, 1);
      }
    }
  }

  // 4. 生成与更新飞舞考卷 (Exam Papers) - t在50s到68s之间
  if (isPlaying && t >= 50 && t < 68) {
    if (Math.random() < 0.04) {
      const depth = 0.3 + Math.random() * 0.7;
      examPapers.push({
        x: W + 120,
        y: 100 + Math.random() * 420,
        depth,
        vx: (-2.5 - Math.random() * 2.5) * depth * 1.3,
        vy: ((Math.random() - 0.5) * 1.2) * depth,
        w: (50 + Math.random() * 12) * depth * 1.4,
        h: (70 + Math.random() * 15) * depth * 1.4,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.05,
        sliced: false,
        sliceAge: 0,
        vx1: 0, vy1: 0, rot1: 0, rotS1: 0,
        vx2: 0, vy2: 0, rot2: 0, rotS2: 0,
        opacity: 1.0,
        seed: Math.random()
      });
    }
  }

  // 斩击一剑两断触发 (t在54s斩击时刻)
  if (t >= 54.0 && t < 54.3) {
    for (const p of examPapers) {
      if (!p.sliced) {
        p.sliced = true;
        // 分裂弹射物理分量
        p.vx1 = -3 - Math.random() * 4;
        p.vy1 = 3 + Math.random() * 4;
        p.rotS1 = -0.08 - Math.random() * 0.12;

        p.vx2 = 3 + Math.random() * 4;
        p.vy2 = -3 - Math.random() * 3;
        p.rotS2 = 0.08 + Math.random() * 0.12;
      }
    }
  }

  // 更新考卷粒子
  for (let i = examPapers.length - 1; i >= 0; i -= 1) {
    const p = examPapers[i];
    if (!p.sliced) {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.rotSpeed;
      if (p.x < -150) {
        examPapers.splice(i, 1);
      }
    } else {
      p.sliceAge += 0.016;
      p.x += p.vx;
      p.y += p.vy;
      p.rot1 += p.rotS1;
      p.rot2 += p.rotS2;
      p.opacity -= 0.035;
      if (p.opacity <= 0) {
        examPapers.splice(i, 1);
      }
    }
  }

  // 5. 生成与更新「风起 & 合笔」孔明灯 (Sky Lanterns) - t在68s到94s之间
  if (isPlaying && t >= 68 && t < 94) {
    if (Math.random() < 0.05) {
      const depth = 0.2 + Math.random() * 0.8;
      lanterns.push({
        x: 50 + Math.random() * (W - 100),
        y: H + 30,
        depth,
        vy: (-0.5 - Math.random() * 0.9) * depth,
        vx: (0.15 + Math.random() * 0.45) * depth,
        size: (6 + Math.random() * 8) * depth * 1.5,
        life: 1.0,
        decay: (0.0016 + Math.random() * 0.0015) * (0.5 + (1 - depth) * 0.5),
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  // 更新孔明灯
  for (let i = lanterns.length - 1; i >= 0; i -= 1) {
    const l = lanterns[i];
    l.x += l.vx;
    l.y += l.vy;
    if (l.y < 100) {
      l.life -= 0.015;
    } else {
      l.life -= l.decay;
    }
    if (l.life <= 0 || l.x > W + 50) {
      lanterns.splice(i, 1);
    }
  }

  // 6. 生成与更新「风起」狂风飞白线 (Wind Lines) - t在68s到92s之间
  if (isPlaying && t >= 68 && t < 92) {
    if (Math.random() < 0.16) {
      windLines.push({
        x: -350,
        y: 100 + Math.random() * 450,
        vx: 24 + Math.random() * 18,
        len: 260 + Math.random() * 220,
        alpha: 0.06 + Math.random() * 0.08,
        lineWidth: 1.0 + Math.random() * 1.8
      });
    }
  }

  // 更新风线
  for (let i = windLines.length - 1; i >= 0; i -= 1) {
    const w = windLines[i];
    w.x += w.vx;
    if (w.x > W) {
      windLines.splice(i, 1);
    }
  }

  // 7. 生成与更新「写意景深背景书法大字」 - t在50s到92s之间
  if (isPlaying && t >= 50 && t < 92) {
    if (t - lastBgCharSpawn > 2.0) {
      lastBgCharSpawn = t;
      const chars = ["破", "浪", "风", "捷", "魁", "鹏", "鳌", "跃", "锋", "越", "搏"];
      const randomChar = chars[Math.floor(Math.random() * chars.length)];
      bgChars.push({
        char: randomChar,
        x: W * 0.15 + Math.random() * W * 0.7,
        y: H * 0.22 + Math.random() * H * 0.38,
        scale: 0.15,
        maxScale: 1.3 + Math.random() * 0.8,
        opacity: 0.0,
        maxOpacity: 0.08 + Math.random() * 0.07,
        rot: (Math.random() - 0.5) * 0.38,
        depth: 0.2 + Math.random() * 0.45
      });
    }
  }

  // 更新背景字
  for (let i = bgChars.length - 1; i >= 0; i -= 1) {
    const c = bgChars[i];
    c.scale += 0.0035;
    if (c.scale < 0.4) {
      c.opacity = mix(c.opacity, c.maxOpacity, 0.08);
    } else if (c.scale > c.maxScale - 0.3) {
      c.opacity = mix(c.opacity, 0.0, 0.06);
    }
    if (c.scale >= c.maxScale || (c.opacity <= 0.001 && c.scale > 0.4)) {
      bgChars.splice(i, 1);
    }
  }

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
  drawGodRays(t, energy);
  drawInkStorm(t, energy);
  drawBgChars(t);
  drawMountains(t, progress);
  drawFog(t, energy);
  drawRiver(t, progress, energy);
  drawInkRain();   // 绘制水墨雨丝及溅射涟漪
  drawBoatWakes(); // 绘制水花尾迹
  drawExamPapers(); // 绘制飞舞/被斩裂的考卷
  drawLanterns();  // 绘制升空孔明灯
  drawWindLines(); // 绘制飞白疾风线
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

  if (!window.isRemotion) {
    requestAnimationFrame(render);
  }
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
  if (!canvas.captureStream || !window.MediaRecorder) {
    alert(text.unsupported);
    return;
  }
  recordedChunks = [];
  const canvasStream = canvas.captureStream(60);
  
  let mixedStream;
  if (audioCtx && audioDestNode) {
    const audioStream = audioDestNode.stream;
    mixedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioStream.getAudioTracks(),
    ]);
  } else {
    try {
      const audioStream = audio.captureStream ? audio.captureStream() : (audio.mozCaptureStream ? audio.mozCaptureStream() : null);
      if (audioStream) {
        mixedStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...audioStream.getAudioTracks(),
        ]);
      } else {
        mixedStream = new MediaStream([...canvasStream.getVideoTracks()]);
      }
    } catch (e) {
      mixedStream = new MediaStream([...canvasStream.getVideoTracks()]);
    }
  }
  
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

// === URL Parameter Checking for Remotion Mode ===
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get("remotion") === "true") {
  window.isRemotion = true;
  document.body.classList.add("remotion-mode");
}

// Cooley-Tukey Radix-2 FFT (Iterative In-Place)
function fft(re, im) {
  const n = re.length;
  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (i < j) {
      let temp = re[i]; re[i] = re[j]; re[j] = temp;
      temp = im[i]; im[i] = im[j]; im[j] = temp;
    }
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
  }
  
  // Cooley-Tukey decimation-in-time
  for (let len = 2; len <= n; len <<= 1) {
    const angle = -2 * Math.PI / len;
    const wlen_re = Math.cos(angle);
    const wlen_im = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let w_re = 1.0;
      let w_im = 0.0;
      for (let k = 0; k < len / 2; k++) {
        const u_re = re[i + k];
        const u_im = im[i + k];
        const v_re = re[i + k + len / 2] * w_re - im[i + k + len / 2] * w_im;
        const v_im = re[i + k + len / 2] * w_im + im[i + k + len / 2] * w_re;
        re[i + k] = u_re + v_re;
        im[i + k] = u_im + v_im;
        re[i + k + len / 2] = u_re - v_re;
        im[i + k + len / 2] = u_im - v_im;
        const next_w_re = w_re * wlen_re - w_im * wlen_im;
        w_im = w_re * wlen_im + w_im * wlen_re;
        w_re = next_w_re;
      }
    }
  }
}

let preAnalyzedAudio = [];
let isAudioReady = false;
window.isReady = false;

async function preAnalyzeBGM() {
  try {
    // 1. Try to load from localStorage first (instant!)
    const cached = localStorage.getItem("bgm-analysis");
    if (cached) {
      preAnalyzedAudio = JSON.parse(cached);
      window.preAnalyzedAudio = preAnalyzedAudio;
      isAudioReady = true;
      window.isReady = true;
      console.log("Loaded cached BGM data from localStorage. Total frames:", preAnalyzedAudio.length);
      try {
        await fetch("/save-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(preAnalyzedAudio)
        });
        console.log("Successfully posted audio analysis to server from localStorage.");
      } catch (e) {}
      window.parent.postMessage({ type: "ready" }, "*");
      return;
    }
  } catch (e) {
    console.warn("localStorage check failed:", e);
  }

  try {
    // 2. Try to load pre-analyzed JSON if available (much faster, bypassing audio decoding)
    const jsonRes = await fetch("./bgm-analysis.json");
    if (jsonRes.ok) {
      preAnalyzedAudio = await jsonRes.json();
      window.preAnalyzedAudio = preAnalyzedAudio;
      isAudioReady = true;
      window.isReady = true;
      console.log("Loaded pre-analyzed BGM data. Total frames:", preAnalyzedAudio.length);
      window.parent.postMessage({ type: "ready" }, "*");
      return;
    }
  } catch (e) {
    console.log("No pre-analyzed JSON, doing offline FFT fallback...");
  }

  try {
    const res = await fetch("./Last Hope - Victor Cooper.flac");
    if (!res.ok) throw new Error("Fetch failed");
    const arrayBuffer = await res.arrayBuffer();
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const tempCtx = new OfflineCtx(1, 1, 44100);
    const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);

    const sampleRate = audioBuffer.sampleRate;
    const channelData = audioBuffer.getChannelData(0); // Left channel
    const frameRate = 60;
    const frameDuration = 1 / frameRate;
    const samplesPerFrame = sampleRate * frameDuration;
    const fftSize = 256;
    const nBins = fftSize / 2;
    const totalFrames = Math.floor(audioBuffer.duration * frameRate);

    preAnalyzedAudio = [];
    let beatHistoryOffline = [];
    let lastBeatTimeOffline = -10;

    const minDecibels = -100;
    const maxDecibels = -30;
    const dbScale = maxDecibels - minDecibels;

    for (let f = 0; f < totalFrames; f++) {
      const t = f / frameRate;
      const startSample = Math.floor(f * samplesPerFrame);

      const re = new Float32Array(fftSize);
      const im = new Float32Array(fftSize);

      for (let i = 0; i < fftSize; i++) {
        const idx = startSample + i;
        re[i] = idx < channelData.length ? channelData[idx] : 0;
      }

      // Apply Hanning Window
      for (let i = 0; i < fftSize; i++) {
        const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
        re[i] *= w;
      }

      fft(re, im);

      let sum = 0, lowSum = 0, midSum = 0, highSum = 0;
      const lowEnd = 8, midEnd = 36;

      for (let i = 0; i < nBins; i++) {
        const mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
        // Compensate for windowing loss (Hanning window energy loss correction factor is ~2.0)
        const db = 20 * Math.log10(Math.max(1e-5, (mag * 2.0) / fftSize));
        let v = 255 * (db - minDecibels) / dbScale;
        v = Math.max(0, Math.min(255, v));

        sum += v;
        if (i < lowEnd) lowSum += v;
        else if (i < midEnd) midSum += v;
        else highSum += v;
      }

      const energy = sum / nBins / 255;
      const low = lowSum / lowEnd / 255;
      const mid = midSum / (midEnd - lowEnd) / 255;
      const high = highSum / (nBins - midEnd) / 255;

      // Offline beat detection matching detectBeat exactly
      let isBeat = false;
      beatHistoryOffline.push(low);
      if (beatHistoryOffline.length > 43) beatHistoryOffline.shift();
      const avg = beatHistoryOffline.reduce((a, b) => a + b, 0) / Math.max(1, beatHistoryOffline.length);
      const threshold = Math.max(0.55, avg * 1.45);
      if (low > threshold && t - lastBeatTimeOffline > 0.42) {
        lastBeatTimeOffline = t;
        isBeat = true;
      }

      preAnalyzedAudio.push({ energy, low, mid, high, isBeat });
    }

    window.preAnalyzedAudio = preAnalyzedAudio;
    try {
      localStorage.setItem("bgm-analysis", JSON.stringify(preAnalyzedAudio));
    } catch (e) {}
    try {
      await fetch("/save-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preAnalyzedAudio)
      });
      console.log("Successfully posted audio analysis to server.");
    } catch (e) {
      console.warn("Failed to post audio analysis to server:", e);
    }
    isAudioReady = true;
    window.isReady = true;
    console.log("BGM analysis complete. Total frames:", preAnalyzedAudio.length);
    window.parent.postMessage({ type: "ready" }, "*");
  } catch (err) {
    console.error("BGM analysis failed:", err);
    // Fallback: fill with zeroes so it doesn't crash
    preAnalyzedAudio = Array.from({ length: 7680 }, () => ({
      energy: 0, low: 0, mid: 0, high: 0, isBeat: false
    }));
    isAudioReady = true;
    window.isReady = true;
    window.parent.postMessage({ type: "ready" }, "*");
  }
}

// Start BGM analysis on load
preAnalyzeBGM();

// Expose Remotion frame rendering hook
window.renderRemotionFrame = function(frame) {
  window.isRemotion = true;
  window.remotionFrame = frame;
  render();
};

window.addEventListener("message", (event) => {
  if (event.data) {
    if (event.data.type === "render-frame") {
      window.renderRemotionFrame(event.data.frame);
    } else if (event.data.type === "check-ready") {
      if (window.isReady) {
        window.parent.postMessage({ type: "ready" }, "*");
      }
    }
  }
});

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    if (!window.isRemotion) requestAnimationFrame(render);
  });
} else {
  if (!window.isRemotion) requestAnimationFrame(render);
}
