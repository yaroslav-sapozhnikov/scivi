/*
 * orbit.js — визуализация «Вывод на орбиту».
 * Внутренняя система координат — мировая: центр планеты (0,0), метры, Y вверх.
 * На экран переводит view: sx = x*scale + tx, sy = -y*scale + ty.
 */
(function () {
  "use strict";

  const { G, simulate } = window.Physics;

  const SPEED_MAX = 5e5; // м/с (500 км/с) — верх слайдера скорости

  const BODIES = [
    { name: "Луна",    M: 7.35e22,  R: 1.737e6, color: "#b5b0a4", rings: false },
    { name: "Марс",    M: 6.42e23,  R: 3.390e6, color: "#c2542f", rings: false },
    { name: "Земля",   M: 5.97e24,  R: 6.371e6, color: "#3b82c4", rings: false },
    { name: "Сатурн",  M: 5.68e26,  R: 5.823e7, color: "#d3b078", rings: true  },
    { name: "Юпитер",  M: 1.90e27,  R: 6.991e7, color: "#c8a06a", rings: false },
    { name: "Солнце",  M: 1.989e30, R: 6.957e8, color: "#f0b23e", rings: false },
  ];

  const GRAY_COLOR = "#5b6470";
  const LOG_MIN = Math.log10(3e22);
  const LOG_MAX = Math.log10(BODIES[BODIES.length - 1].M); // Солнце — максимум слайдера
  const MATCH_TOL = 0.05; // допуск совпадения с планетой, в десятичных порядках

  // логарифмическая шкала скорости: от 500 м/с до 500 км/с
  const SPEED_LOG_MIN = Math.log10(500);
  const SPEED_LOG_MAX = Math.log10(SPEED_MAX);

  // ---------- элементы ----------

  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");

  const ui = {
    massSlider: document.getElementById("massSlider"),
    massTicks: document.getElementById("massTicks"),
    massValue: document.getElementById("massValue"),
    bodyName: document.getElementById("bodyName"),
    angleSlider: document.getElementById("angleSlider"),
    angleValue: document.getElementById("angleValue"),
    speedSlider: document.getElementById("speedSlider"),
    speedTicks: document.getElementById("speedTicks"),
    speedValue: document.getElementById("speedValue"),
    btnV1: document.getElementById("btnV1"),
    btnV2: document.getElementById("btnV2"),
    fireBtn: document.getElementById("fireBtn"),
    outcome: document.getElementById("outcome"),
    outcomeTitle: document.getElementById("outcomeTitle"),
    outcomeDetail: document.getElementById("outcomeDetail"),
    dataMass: document.getElementById("dataMass"),
    dataRadius: document.getElementById("dataRadius"),
    dataRho: document.getElementById("dataRho"),
    dataG: document.getElementById("dataG"),
    dataV1: document.getElementById("dataV1"),
    dataV2: document.getElementById("dataV2"),
  };

  // ---------- состояние ----------

  const state = {
    body: null,             // { name|null, M, R, color, rings }
    mode: "surface",        // surface | space
    cannon: { x: 0, y: 0 }, // мировые координаты пушки
    aimDeg: 15,
    traj: null,             // { points, times, outcome, flightTime, elements }
    anim: null,             // { t, tEnd, idx, rate, finished }
    view: { scale: 1, tx: 0, ty: 0 },
  };

  // ---------- форматирование ----------

  const SUP = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };

  function formatSci(x, digits) {
    if (x === 0) return "0";
    const exp = Math.floor(Math.log10(Math.abs(x)));
    const mant = x / Math.pow(10, exp);
    const sup = String(exp).split("").map((c) => SUP[c]).join("");
    return mant.toFixed(digits == null ? 2 : digits).replace(".", ",") + " × 10" + sup;
  }

  function formatKm(m) {
    return Math.round(m / 1000).toLocaleString("ru-RU") + " км";
  }

  function formatSpeed(ms) {
    if (ms < 1000) return Math.round(ms) + " м/с";
    if (ms < 1e7) return (ms / 1000).toFixed(2).replace(".", ",") + " км/с";
    return formatSci(ms) + " м/с";
  }

  function formatTime(sec) {
    if (sec < 120) return Math.round(sec) + " с";
    if (sec < 7200) return Math.round(sec / 60) + " мин";
    if (sec < 172800) return (sec / 3600).toFixed(1).replace(".", ",") + " ч";
    return (sec / 86400).toFixed(1).replace(".", ",") + " сут";
  }

  // ---------- небесное тело ----------

  function sliderToLogM() {
    return LOG_MIN + (ui.massSlider.value / 1000) * (LOG_MAX - LOG_MIN);
  }

  function resolveBody(logM) {
    for (const b of BODIES) {
      if (Math.abs(Math.log10(b.M) - logM) < MATCH_TOL) return { ...b };
    }
    // безымянное тело: радиус интерполируем в лог-лог шкале между соседними телами
    const logs = BODIES.map((b) => Math.log10(b.M));
    let R;
    if (logM <= logs[0]) R = BODIES[0].R;
    else if (logM >= logs[logs.length - 1]) R = BODIES[BODIES.length - 1].R;
    else {
      for (let i = 0; i < logs.length - 1; i++) {
        if (logM >= logs[i] && logM <= logs[i + 1]) {
          const t = (logM - logs[i]) / (logs[i + 1] - logs[i]);
          R = Math.pow(10, Math.log10(BODIES[i].R) * (1 - t) + Math.log10(BODIES[i + 1].R) * t);
          break;
        }
      }
    }
    return { name: null, M: Math.pow(10, logM), R, color: GRAY_COLOR, rings: false };
  }

  function placeTickLabel(el, pct) {
    // подписи у краёв шкалы не должны вылезать наружу
    if (pct > 88) el.style.transform = "translateX(-95%)";
    else if (pct < 6) el.style.transform = "translateX(-5%)";
  }

  function buildMassTicks() {
    ui.massTicks.innerHTML = "";
    for (const b of BODIES) {
      const pct = ((Math.log10(b.M) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100;
      const el = document.createElement("div");
      el.className = "tick";
      el.style.left = pct + "%";
      el.textContent = b.name;
      el.dataset.name = b.name;
      placeTickLabel(el, pct);
      ui.massTicks.appendChild(el);
    }
  }

  function highlightMassTick() {
    const name = state.body.name;
    ui.massTicks.querySelectorAll(".tick").forEach((t) => {
      t.classList.toggle("hot", t.dataset.name === name);
    });
  }

  // ---------- скорость (логарифмический слайдер) ----------

  function speedFromSlider() {
    const f = ui.speedSlider.value / 1000;
    return Math.pow(10, SPEED_LOG_MIN + f * (SPEED_LOG_MAX - SPEED_LOG_MIN));
  }

  function setSpeed(v) {
    const f = (Math.log10(v) - SPEED_LOG_MIN) / (SPEED_LOG_MAX - SPEED_LOG_MIN);
    ui.speedSlider.value = Math.round(Math.min(Math.max(f, 0), 1) * 1000);
    updateReadouts();
    recompute();
    draw();
  }

  function speedPct(v) {
    return ((Math.log10(v) - SPEED_LOG_MIN) / (SPEED_LOG_MAX - SPEED_LOG_MIN)) * 100;
  }

  // ---------- пушка и выстрел ----------

  function launchRadius() {
    return Math.max(Math.hypot(state.cannon.x, state.cannon.y), state.body.R * 1.002);
  }

  function vCirc() {
    return Math.sqrt((G * state.body.M) / launchRadius());
  }

  function vEsc() {
    return Math.sqrt((2 * G * state.body.M) / launchRadius());
  }

  function launchState() {
    // стартуем чуть выше поверхности, чтобы не сработал мгновенный «impact»
    let cx = state.cannon.x;
    let cy = state.cannon.y;
    const R = state.body.R;
    const r = Math.hypot(cx, cy);
    const rMin = R * 1.002;
    if (r < rMin) {
      const k = rMin / (r || 1);
      cx *= k;
      cy *= k;
    }

    let dx, dy;
    if (state.mode === "space") {
      // абсолютный угол: 0° — вправо, растёт против часовой,
      // не зависит от положения пушки относительно планеты
      const th = (state.aimDeg * Math.PI) / 180;
      dx = Math.cos(th);
      dy = Math.sin(th);
    } else {
      // угол от местного горизонта: 0° — по касательной, 90° — вертикально вверх
      const rl = Math.hypot(cx, cy);
      const ux = cx / rl;
      const uy = cy / rl;   // радиально «вверх»
      const tx = -uy;
      const ty = ux;        // касательная против часовой (местный горизонт)
      const th = (state.aimDeg * Math.PI) / 180;
      dx = tx * Math.cos(th) + ux * Math.sin(th);
      dy = ty * Math.cos(th) + uy * Math.sin(th);
    }

    const v = speedFromSlider();
    return { p0: { x: cx, y: cy }, v0: { x: dx * v, y: dy * v }, dir: { x: dx, y: dy } };
  }

  function recompute() {
    const { p0, v0 } = launchState();
    const res = simulate(state.body.M, state.body.R, p0, v0);
    // прореживаем точки для отрисовки и анимации (времена — тем же шагом)
    const maxPts = 4000;
    if (res.points.length > maxPts) {
      const stride = Math.ceil(res.points.length / maxPts);
      const p = [];
      const tm = [];
      for (let i = 0; i < res.points.length; i += stride) {
        p.push(res.points[i]);
        tm.push(res.times[i]);
      }
      const last = res.points.length - 1;
      if (last % stride !== 0) {
        p.push(res.points[last]);
        tm.push(res.times[last]);
      }
      res.points = p;
      res.times = tm;
    }
    state.traj = res;
    state.anim = null;
    updateOutcome();
  }

  // ---------- UI ----------

  function updateBodyInfo() {
    const b = state.body;
    ui.bodyName.textContent = b.name || "Безымянное тело";
    ui.massValue.textContent = formatSci(b.M) + " кг";
    ui.dataMass.textContent = formatSci(b.M) + " кг";
    ui.dataRadius.textContent = formatKm(b.R);
    const rho = b.M / ((4 / 3) * Math.PI * Math.pow(b.R, 3));
    ui.dataRho.textContent = Math.round(rho).toLocaleString("ru-RU") + " кг/м³";
    ui.dataG.textContent = (G * b.M / (b.R * b.R)).toFixed(2).replace(".", ",") + " м/с²";
    ui.dataV1.textContent = formatSpeed(Math.sqrt(G * b.M / b.R));
    ui.dataV2.textContent = formatSpeed(Math.sqrt(2 * G * b.M / b.R));
    highlightMassTick();
  }

  function updateSpeedTicks() {
    ui.speedTicks.innerHTML = "";
    [
      { v: vCirc(), label: "v₁ " + formatSpeed(vCirc()), low: false },
      { v: vEsc(), label: "v₂ " + formatSpeed(vEsc()), low: true },
    ].forEach(({ v, label, low }) => {
      // метки за пределами шкалы прижимаем к правому краю
      const pct = Math.min(Math.max(speedPct(v), 0), 100);
      const el = document.createElement("div");
      el.className = "tick" + (low ? " low" : "");
      el.style.left = pct + "%";
      el.textContent = label;
      placeTickLabel(el, pct);
      ui.speedTicks.appendChild(el);
    });
  }

  function updateAngleControl() {
    const space = state.mode === "space";
    ui.angleSlider.max = space ? 360 : 180;
    if (!space && state.aimDeg > 180) state.aimDeg = 180;
    ui.angleSlider.value = state.aimDeg;
  }

  function updateReadouts() {
    ui.angleValue.textContent = state.aimDeg + "°";
    ui.speedValue.textContent = formatSpeed(speedFromSlider());
  }

  function updateOutcome() {
    const t = state.traj;
    const el = t.elements;
    ui.outcome.className = "outcome " + t.outcome;
    if (t.outcome === "impact") {
      // падение возможно и при достаточной скорости — если целиться в планету
      const enough = speedFromSlider() >= vCirc();
      ui.outcomeTitle.textContent = "Снаряд упал на поверхность";
      ui.outcomeDetail.textContent =
        "Время полёта: " + formatTime(t.flightTime) + ". " +
        (enough
          ? "Скорости хватало, но траектория пересеклась с поверхностью — попробуйте другой угол."
          : "Скорости не хватило, чтобы удержаться над планетой.");
    } else if (t.outcome === "orbit") {
      const hp = Math.max(el.rp - state.body.R, 0);
      const ha = Math.max(el.ra - state.body.R, 0);
      ui.outcomeTitle.textContent = "Замкнутая орбита";
      ui.outcomeDetail.textContent =
        "Перицентр: " + formatKm(hp) + ", апоцентр: " + formatKm(ha) +
        ", период: " + formatTime(el.T) + ".";
    } else {
      ui.outcomeTitle.textContent = "Снаряд уходит от планеты";
      ui.outcomeDetail.textContent =
        "Скорость выше второй космической — гравитация не сможет его вернуть.";
    }
  }

  // ---------- вид (масштаб/сдвиг) ----------

  function fitView() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    state.view.scale = (Math.min(w, h) * 0.18) / state.body.R;
    state.view.tx = w / 2;
    state.view.ty = h / 2;
  }

  function toScreen(x, y) {
    return [x * state.view.scale + state.view.tx, -y * state.view.scale + state.view.ty];
  }

  function toWorld(sx, sy) {
    return {
      x: (sx - state.view.tx) / state.view.scale,
      y: -(sy - state.view.ty) / state.view.scale,
    };
  }

  // ---------- отрисовка ----------

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawPlanet() {
    const b = state.body;
    const [cx, cy] = toScreen(0, 0);
    const rPx = b.R * state.view.scale;

    // тонкое свечение
    ctx.beginPath();
    ctx.arc(cx, cy, rPx * 1.25, 0, Math.PI * 2);
    const glow = ctx.createRadialGradient(cx, cy, rPx, cx, cy, rPx * 1.25);
    glow.addColorStop(0, "rgba(120,160,220,0.10)");
    glow.addColorStop(1, "rgba(120,160,220,0)");
    ctx.fillStyle = glow;
    ctx.fill();

    if (b.rings) drawRings(cx, cy, rPx, false);

    ctx.beginPath();
    ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(
      cx - rPx * 0.35, cy - rPx * 0.35, rPx * 0.1,
      cx, cy, rPx
    );
    grad.addColorStop(0, lighten(b.color));
    grad.addColorStop(1, b.color);
    ctx.fillStyle = grad;
    ctx.fill();

    if (b.rings) drawRings(cx, cy, rPx, true);

    if (b.name) {
      ctx.fillStyle = "#8b949e";
      ctx.font = "13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(b.name, cx, cy + rPx + 20);
    }
  }

  function drawRings(cx, cy, rPx, front) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.28);
    ctx.strokeStyle = "rgba(210,190,150,0.65)";
    ctx.lineWidth = Math.max(rPx * 0.12, 1.5);
    ctx.beginPath();
    if (front) {
      ctx.ellipse(0, 0, rPx * 1.9, rPx * 0.5, 0, 0, Math.PI);
    } else {
      ctx.ellipse(0, 0, rPx * 1.9, rPx * 0.5, 0, Math.PI, Math.PI * 2);
    }
    ctx.stroke();
    ctx.restore();
  }

  function lighten(hex) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => Math.min(255, Math.round(c + (255 - c) * 0.35));
    const r = f((n >> 16) & 255);
    const g = f((n >> 8) & 255);
    const b = f(n & 255);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function drawTrajectory() {
    const t = state.traj;
    if (!t || t.points.length < 2) return;
    const colors = { impact: "#f87171", orbit: "#34d399", escape: "#fbbf24" };
    ctx.strokeStyle = colors[t.outcome];
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const pts = t.points;
    let [sx, sy] = toScreen(pts[0][0], pts[0][1]);
    ctx.moveTo(sx, sy);
    for (let i = 1; i < pts.length; i++) {
      [sx, sy] = toScreen(pts[i][0], pts[i][1]);
      ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    const last = pts[pts.length - 1];
    const [lx, ly] = toScreen(last[0], last[1]);

    if (t.outcome === "impact") {
      // крестик в точке падения
      ctx.strokeStyle = "#f87171";
      ctx.lineWidth = 2;
      const s = 6;
      ctx.beginPath();
      ctx.moveTo(lx - s, ly - s); ctx.lineTo(lx + s, ly + s);
      ctx.moveTo(lx - s, ly + s); ctx.lineTo(lx + s, ly - s);
      ctx.stroke();
    } else if (t.outcome === "escape") {
      // стрелка по направлению ухода
      const prev = pts[Math.max(pts.length - 6, 0)];
      const [px, py] = toScreen(prev[0], prev[1]);
      const ang = Math.atan2(ly - py, lx - px);
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.moveTo(lx + Math.cos(ang) * 10, ly + Math.sin(ang) * 10);
      ctx.lineTo(lx + Math.cos(ang + 2.5) * 8, ly + Math.sin(ang + 2.5) * 8);
      ctx.lineTo(lx + Math.cos(ang - 2.5) * 8, ly + Math.sin(ang - 2.5) * 8);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawCannon() {
    const { dir } = launchState();
    // ствол и основание рисуем от одной точки — позиции пушки
    const [cx, cy] = toScreen(state.cannon.x, state.cannon.y);

    // ствол
    const sdx = dir.x;
    const sdy = -dir.y; // мировой Y вверх → экранный вниз
    const len = 24;
    const norm = Math.hypot(sdx, sdy) || 1;
    ctx.strokeStyle = "#c9d1d9";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + (sdx / norm) * len, cy + (sdy / norm) * len);
    ctx.stroke();

    // основание
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#30363d";
    ctx.fill();
    ctx.strokeStyle = "#8b949e";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // ---------- анимация запуска (реальная скорость вдоль траектории) ----------

  function fire() {
    const t = state.traj;
    if (!t || t.points.length < 2) return;
    const tEnd = t.times[t.times.length - 1];
    state.anim = {
      t: 0,
      tEnd,
      idx: 0,
      rate: tEnd > 0 ? tEnd / 8 : 1, // весь полёт занимает ~8 секунд экранного времени
      finished: false,
    };
  }

  function projectilePos() {
    const a = state.anim;
    const tr = state.traj;
    const times = tr.times;
    const pts = tr.points;
    while (a.idx < times.length - 2 && times[a.idx + 1] < a.t) a.idx++;
    const i = a.idx;
    const i2 = i + 1;
    const span = times[i2] - times[i];
    const f = span > 0 ? Math.min(Math.max((a.t - times[i]) / span, 0), 1) : 1;
    return [
      pts[i][0] + (pts[i2][0] - pts[i][0]) * f,
      pts[i][1] + (pts[i2][1] - pts[i][1]) * f,
    ];
  }

  function drawProjectile() {
    if (!state.anim || !state.traj) return;
    const [x, y] = projectilePos();
    const [sx, sy] = toScreen(x, y);
    ctx.beginPath();
    ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function draw() {
    resizeCanvas();
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    drawPlanet();
    drawTrajectory();
    drawCannon();
    drawProjectile();
  }

  let lastFrame = null;
  function tick(ts) {
    const a = state.anim;
    if (a && !a.finished) {
      if (lastFrame !== null) {
        a.t += a.rate * Math.min((ts - lastFrame) / 1000, 0.1);
        if (a.t >= a.tEnd) {
          a.t = a.tEnd;
          a.finished = true; // снаряд остаётся в конечной точке, перерисовка прекращается
        }
      }
      draw();
    }
    lastFrame = ts;
    requestAnimationFrame(tick);
  }

  // ---------- события ----------

  function placeCannon(world) {
    const R = state.body.R;
    const r = Math.hypot(world.x, world.y);
    if (state.mode === "surface") {
      const k = R / (r || 1);
      state.cannon.x = world.x * k;
      state.cannon.y = world.y * k;
    } else {
      const rMin = R * 1.05;
      if (r < rMin) {
        const k = rMin / (r || 1);
        world.x *= k;
        world.y *= k;
      }
      state.cannon.x = world.x;
      state.cannon.y = world.y;
    }
    updateSpeedTicks();
    recompute();
    draw();
  }

  function bindEvents() {
    ui.massSlider.addEventListener("input", () => {
      state.body = resolveBody(sliderToLogM());
      const R = state.body.R;
      const r = Math.hypot(state.cannon.x, state.cannon.y);
      if (state.mode === "surface" || r < R * 1.05) {
        const k = (state.mode === "surface" ? R : R * 1.05) / (r || 1);
        state.cannon.x *= k;
        state.cannon.y *= k;
      }
      // камеру не трогаем: планета меняет размер прямо на экране
      updateBodyInfo();
      updateSpeedTicks();
      recompute();
      draw();
    });

    ui.angleSlider.addEventListener("input", () => {
      state.aimDeg = Number(ui.angleSlider.value);
      updateReadouts();
      recompute();
      draw();
    });

    ui.speedSlider.addEventListener("input", () => {
      updateReadouts();
      recompute();
      draw();
    });

    ui.btnV1.addEventListener("click", () => setSpeed(vCirc()));
    ui.btnV2.addEventListener("click", () => setSpeed(vEsc()));

    document.querySelectorAll('input[name="mode"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        state.mode = radio.value;
        if (state.mode === "surface") {
          const r = Math.hypot(state.cannon.x, state.cannon.y);
          const k = state.body.R / (r || 1);
          state.cannon.x *= k;
          state.cannon.y *= k;
        }
        updateAngleControl();
        updateSpeedTicks();
        updateReadouts();
        recompute();
        draw();
      });
    });

    ui.fireBtn.addEventListener("click", fire);

    // клик — поставить пушку, перетаскивание — сдвиг, колесо — масштаб
    let drag = null;
    canvas.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, moved: false, tx: state.view.tx, ty: state.view.ty };
    });

    window.addEventListener("mousemove", (e) => {
      if (!drag) return;
      if (e.buttons === 0) {
        // кнопку отпустили вне окна — сбрасываем «застрявшее» перетаскивание
        drag = null;
        return;
      }
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved) {
        state.view.tx = drag.tx + dx;
        state.view.ty = drag.ty + dy;
        draw();
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (!drag) return;
      if (!drag.moved && e.target === canvas) {
        const rect = canvas.getBoundingClientRect();
        placeCannon(toWorld(e.clientX - rect.left, e.clientY - rect.top));
      }
      drag = null;
    });

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = Math.pow(1.0015, -e.deltaY);
      const s = state.view;
      const ns = Math.min(Math.max(s.scale * factor, 1e-13), 1e-2);
      const k = ns / s.scale;
      s.tx = mx - (mx - s.tx) * k;
      s.ty = my - (my - s.ty) * k;
      s.scale = ns;
      draw();
    }, { passive: false });

    window.addEventListener("resize", draw);
  }

  // ---------- инициализация ----------

  function init() {
    buildMassTicks();

    // стартовое тело — Земля
    const earth = BODIES.find((b) => b.name === "Земля");
    ui.massSlider.value = Math.round(
      ((Math.log10(earth.M) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 1000
    );
    state.body = resolveBody(sliderToLogM());

    // пушка на поверхности, справа от центра
    state.cannon = { x: state.body.R, y: 0 };

    // стартовая скорость — чуть выше первой космической: сразу видна орбита
    ui.speedSlider.value = 0;
    setSpeedSilent(1.05 * vCirc());

    fitView();
    updateBodyInfo();
    updateSpeedTicks();
    updateAngleControl();
    updateReadouts();
    recompute();
    bindEvents();
    draw();
    requestAnimationFrame(tick);
  }

  function setSpeedSilent(v) {
    const f = (Math.log10(v) - SPEED_LOG_MIN) / (SPEED_LOG_MAX - SPEED_LOG_MIN);
    ui.speedSlider.value = Math.round(Math.min(Math.max(f, 0), 1) * 1000);
  }

  init();
})();
