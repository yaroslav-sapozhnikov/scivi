/*
 * ellipse.js — визуализация «Фокусы эллипса».
 * Мировые координаты: центр эллипса (0,0), большая полуось a = 1, Y вверх.
 * На экран переводит view: sx = x*scale + tx, sy = -y*scale + ty.
 */
(function () {
  "use strict";

  const BOUNCES = 5;   // столько раз луч отражается от эллипса после «Пустить луч»
  const FLIGHT_SEC = 5; // весь путь луча занимает ~5 секунд экранного времени

  const LABEL_F1 = "F₁"; // фокус, из которого стартует луч
  const LABEL_F2 = "F₂"; // пустой фокус

  // ---------- элементы ----------

  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");

  const ui = {
    eccSlider: document.getElementById("eccSlider"),
    eccValue: document.getElementById("eccValue"),
    angleSlider: document.getElementById("angleSlider"),
    angleValue: document.getElementById("angleValue"),
    fireBtn: document.getElementById("fireBtn"),
    dataE: document.getElementById("dataE"),
    dataA: document.getElementById("dataA"),
    dataB: document.getElementById("dataB"),
    dataC: document.getElementById("dataC"),
  };

  // ---------- состояние ----------

  const state = {
    e: 0.6,
    angleDeg: 40,
    geom: null,  // { a, b, c, F1, F2 }
    path: null,  // предпросмотр [F1, H1, F2] или путь [F1, H1, ..., H5] — мировые координаты
    anim: null,  // { dist, total, done }
  };

  // ---------- геометрия эллипса ----------

  function computeGeometry() {
    const e = state.e;
    return {
      a: 1,
      b: Math.sqrt(1 - e * e),
      c: e,
      F1: { x: -e, y: 0 }, // луч стартует отсюда
      F2: { x: e, y: 0 },  // пустой фокус
    };
  }

  // пересечение луча P + t·d (t > 0) с эллипсом x²/a² + y²/b² = 1
  function rayHit(P, d) {
    const a2 = state.geom.a * state.geom.a;
    const b2 = state.geom.b * state.geom.b;
    const qa = (d.x * d.x) / a2 + (d.y * d.y) / b2;
    const qb = 2 * ((P.x * d.x) / a2 + (P.y * d.y) / b2);
    const qc = (P.x * P.x) / a2 + (P.y * P.y) / b2 - 1;
    const disc = qb * qb - 4 * qa * qc;
    if (disc <= 0) return null;
    const sq = Math.sqrt(disc);
    // нужен наименьший положительный корень; корень t ≈ 0 — это точка старта
    let t = (-qb - sq) / (2 * qa);
    if (t <= 1e-9) t = (-qb + sq) / (2 * qa);
    if (t <= 1e-9) return null;
    return { x: P.x + d.x * t, y: P.y + d.y * t };
  }

  // путь луча: из F1 под углом angleDeg, BOUNCES отражений;
  // каждый отражённый сегмент по построению проходит через очередной фокус
  function computePath() {
    const g = state.geom;
    const th = (state.angleDeg * Math.PI) / 180;
    let p = { x: g.F1.x, y: g.F1.y };
    let d = { x: Math.cos(th), y: Math.sin(th) };
    const pts = [{ x: p.x, y: p.y }];
    for (let i = 0; i < BOUNCES; i++) {
      const hit = rayHit(p, d);
      if (!hit) break;
      pts.push(hit);
      // нормаль к эллипсу в точке попадания — градиент (x/a², y/b²)
      let nx = hit.x / (g.a * g.a);
      let ny = hit.y / (g.b * g.b);
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;
      const dot = d.x * nx + d.y * ny;
      const rx = d.x - 2 * dot * nx;
      const ry = d.y - 2 * dot * ny;
      const rl = Math.hypot(rx, ry) || 1;
      d = { x: rx / rl, y: ry / rl };
      p = hit;
    }
    return pts;
  }

  // предпросмотр до нажатия «Пустить луч»: одно отражение, финиш в F2
  // (отражённый луч по свойству эллипса идёт точно через F2)
  function computePreview() {
    const g = state.geom;
    const th = (state.angleDeg * Math.PI) / 180;
    const d = { x: Math.cos(th), y: Math.sin(th) };
    const pts = [{ x: g.F1.x, y: g.F1.y }];
    const hit = rayHit(g.F1, d);
    if (hit) pts.push(hit);
    pts.push({ x: g.F2.x, y: g.F2.y });
    return pts;
  }

  function pathLength() {
    const pts = state.path;
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    return total;
  }

  // точка на пути на расстоянии dist от старта
  function pointAt(dist) {
    const pts = state.path;
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (dist <= acc + seg || i === pts.length - 1) {
        const f = seg > 0 ? Math.min(Math.max((dist - acc) / seg, 0), 1) : 1;
        return {
          x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f,
          y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f,
        };
      }
      acc += seg;
    }
    return pts[pts.length - 1];
  }

  // ---------- вид ----------

  function view() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    return { scale: Math.min(w, h) * 0.35, tx: w / 2, ty: h / 2 };
  }

  function toScreen(x, y, v) {
    return [x * v.scale + v.tx, -y * v.scale + v.ty];
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

  function drawEllipse(v) {
    const g = state.geom;
    const [cx, cy] = toScreen(0, 0, v);
    ctx.beginPath();
    ctx.ellipse(cx, cy, g.a * v.scale, g.b * v.scale, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "#6ea8fe";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // без anim — пунктирный предпросмотр до F2; с anim — пройденная часть яркая
  function drawPath(v) {
    const pts = state.path;
    if (!pts || pts.length < 2) return;
    const a = state.anim;

    if (!a) {
      ctx.strokeStyle = "rgba(251, 191, 36, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      let [sx, sy] = toScreen(pts[0].x, pts[0].y, v);
      ctx.moveTo(sx, sy);
      for (let i = 1; i < pts.length; i++) {
        [sx, sy] = toScreen(pts[i].x, pts[i].y, v);
        ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    const traveled = a.dist;

    // тусклый остаток — целиком, поверх него яркая пройденная часть
    ctx.strokeStyle = "rgba(251, 191, 36, 0.2)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let [sx, sy] = toScreen(pts[0].x, pts[0].y, v);
    ctx.moveTo(sx, sy);
    for (let i = 1; i < pts.length; i++) {
      [sx, sy] = toScreen(pts[i].x, pts[i].y, v);
      ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    if (a && traveled > 0) {
      const total = a.total;
      const brightLen = a.done ? total : Math.min(traveled, total);
      ctx.strokeStyle = a.done ? "rgba(251, 191, 36, 0.5)" : "rgba(251, 191, 36, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      let acc = 0;
      [sx, sy] = toScreen(pts[0].x, pts[0].y, v);
      ctx.moveTo(sx, sy);
      for (let i = 1; i < pts.length; i++) {
        const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        if (acc + seg >= brightLen) {
          const p = pointAt(brightLen);
          const [px, py] = toScreen(p.x, p.y, v);
          ctx.lineTo(px, py);
          break;
        }
        acc += seg;
        [sx, sy] = toScreen(pts[i].x, pts[i].y, v);
        ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
  }

  function drawDot(v) {
    const a = state.anim;
    if (!a || a.done || a.dist <= 0) return;
    const p = pointAt(Math.min(a.dist, a.total));
    const [sx, sy] = toScreen(p.x, p.y, v);
    ctx.beginPath();
    ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function drawFocus(v, F, label, filled, above) {
    const [sx, sy] = toScreen(F.x, F.y, v);
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    if (filled) {
      ctx.fillStyle = "#fbbf24";
      ctx.fill();
    } else {
      ctx.strokeStyle = "#8b949e";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.fillStyle = "#8b949e";
    ctx.font = "13px system-ui, sans-serif";
    if (above == null) {
      // фокусы далеко друг от друга: подпись снаружи от маркера
      ctx.textAlign = filled ? "right" : "left";
      ctx.fillText(label, sx + (filled ? -10 : 10), sy + 4);
    } else {
      // подписи над и под маркерами; x зажат, чтобы текст не вылезал за края
      const half = ctx.measureText(label).width / 2;
      const w = canvas.clientWidth;
      const x = Math.min(Math.max(sx, half + 4), w - half - 4);
      ctx.textAlign = "center";
      ctx.fillText(label, x, sy + (above ? -12 : 22));
    }
  }

  function drawFoci(v) {
    const g = state.geom;
    const w = canvas.clientWidth;
    ctx.font = "13px system-ui, sans-serif";
    const [sx1] = toScreen(g.F1.x, 0, v);
    const [sx2] = toScreen(g.F2.x, 0, v);
    const fitsOuter =
      sx1 - 10 - ctx.measureText(LABEL_F1).width > 4 &&
      sx2 + 10 + ctx.measureText(LABEL_F2).width < w - 4;
    // вертикальное размещение: фокусы близко друг к другу
    // или боковые подписи не помещаются в ширину канваса
    const vertical = g.c * v.scale < 60 || !fitsOuter;
    drawFocus(v, g.F1, LABEL_F1, true, vertical ? true : null);
    drawFocus(v, g.F2, LABEL_F2, false, vertical ? false : null);
  }

  function draw() {
    resizeCanvas();
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const v = view();
    drawPath(v);
    drawEllipse(v);
    drawFoci(v);
    drawDot(v);
  }

  // ---------- анимация луча ----------

  function fire() {
    state.path = computePath();
    if (state.path.length < 2) return;
    state.anim = { dist: 0, total: pathLength(), done: false };
  }

  let lastFrame = null;
  function tick(ts) {
    const a = state.anim;
    if (a && !a.done) {
      if (lastFrame !== null) {
        const dt = Math.min((ts - lastFrame) / 1000, 0.1);
        a.dist += (a.total / FLIGHT_SEC) * dt;
        if (a.dist >= a.total) {
          a.dist = a.total;
          a.done = true;
        }
      }
      draw();
    }
    lastFrame = ts;
    requestAnimationFrame(tick);
  }

  // ---------- UI ----------

  function fmt(x) {
    return x.toFixed(2).replace(".", ",");
  }

  function updateReadouts() {
    const g = state.geom;
    ui.eccValue.textContent = "e = " + fmt(state.e);
    ui.angleValue.textContent = state.angleDeg + "°";
    ui.dataE.textContent = fmt(state.e);
    ui.dataA.textContent = "1";
    ui.dataB.textContent = fmt(g.b);
    ui.dataC.textContent = fmt(2 * g.c);
  }

  function bindEvents() {
    ui.eccSlider.addEventListener("input", () => {
      state.e = Number(ui.eccSlider.value) / 1000;
      state.geom = computeGeometry();
      state.path = computePreview();
      state.anim = null;
      updateReadouts();
      draw();
    });

    ui.angleSlider.addEventListener("input", () => {
      state.angleDeg = Number(ui.angleSlider.value);
      state.path = computePreview();
      state.anim = null;
      updateReadouts();
      draw();
    });

    ui.fireBtn.addEventListener("click", fire);

    window.addEventListener("resize", draw);
  }

  // ---------- инициализация ----------

  function init() {
    state.e = Number(ui.eccSlider.value) / 1000;
    state.angleDeg = Number(ui.angleSlider.value);
    state.geom = computeGeometry();
    state.path = computePreview();
    updateReadouts();
    bindEvents();
    draw();
    requestAnimationFrame(tick);
  }

  init();
})();
