/*
 * physics.js — гравитационная баллистика в поле точечной массы.
 * Чистые функции без DOM: используются страницей визуализации и тестами в node.
 *
 * Система координат: центр планеты в (0, 0), метры и секунды, ось Y вверх.
 */
(function (global) {
  "use strict";

  const G = 6.674e-11; // гравитационная постоянная, м^3/(кг·с^2)

  function hypot(x, y) {
    return Math.sqrt(x * x + y * y);
  }

  /*
   * Кеплеровы элементы по начальному состоянию.
   * Возвращает { E, a, e, rp, ra, T } — энергия, большая полуось,
   * эксцентриситет, перицентр/апоцентр (от центра), период.
   * Для E >= 0 (парабола/гипербола) a, rp, ra, T равны null.
   */
  function orbitalElements(M, p0, v0) {
    const GM = G * M;
    const r0 = hypot(p0.x, p0.y);
    const v2 = v0.x * v0.x + v0.y * v0.y;
    const E = v2 / 2 - GM / r0;

    if (E >= 0) return { E, a: null, e: null, rp: null, ra: null, T: null };

    const a = -GM / (2 * E);
    const dot = p0.x * v0.x + p0.y * v0.y;
    const k = (v2 - GM / r0) / GM;
    const ex = k * p0.x - (dot / GM) * v0.x;
    const ey = k * p0.y - (dot / GM) * v0.y;
    const e = hypot(ex, ey);

    return {
      E,
      a,
      e,
      rp: a * (1 - e),
      ra: a * (1 + e),
      T: 2 * Math.PI * Math.sqrt((a * a * a) / GM),
    };
  }

  /*
   * Интегрирование траектории методом Рунге–Кутты 4-го порядка
   * с адаптивным шагом (доля местного орбитального периода).
   *
   * Остановка:
   *  - r <= R          → impact (падение на поверхность)
   *  - r >= maxR при E >= 0 → escape (уходит от планеты)
   *  - t >= периода    → orbit (замкнутая орбита)
   *
   * Возвращает { points, times, outcome, flightTime, elements };
   * times[i] — момент времени в точке points[i] (для анимации с реальной
   * скоростью движения вдоль траектории).
   */
  function simulate(M, R, p0, v0, opts) {
    const GM = G * M;
    const maxR = (opts && opts.maxRFactor ? opts.maxRFactor : 40) * R;
    const el = orbitalElements(M, p0, v0);

    let expected;
    if (el.E >= 0) expected = "escape";
    else expected = el.rp <= R ? "impact" : "orbit";

    let x = p0.x;
    let y = p0.y;
    let vx = v0.x;
    let vy = v0.y;
    let t = 0;

    const tEnd = expected === "orbit" ? el.T * 1.0005 : Infinity;
    const maxIter = 400000;

    const points = [[x, y]];
    const times = [0];
    let outcome = expected;
    let flightTime = null;

    function deriv(px, py, pvx, pvy) {
      const r = hypot(px, py);
      const f = -GM / (r * r * r);
      return [pvx, pvy, px * f, py * f];
    }

    for (let iter = 0; iter < maxIter; iter++) {
      const r = hypot(x, y);
      let dt = 0.0012 * Math.sqrt((r * r * r) / GM);
      if (t + dt > tEnd) dt = tEnd - t;
      if (dt <= 0) break;

      const k1 = deriv(x, y, vx, vy);
      const k2 = deriv(
        x + (k1[0] * dt) / 2, y + (k1[1] * dt) / 2,
        vx + (k1[2] * dt) / 2, vy + (k1[3] * dt) / 2
      );
      const k3 = deriv(
        x + (k2[0] * dt) / 2, y + (k2[1] * dt) / 2,
        vx + (k2[2] * dt) / 2, vy + (k2[3] * dt) / 2
      );
      const k4 = deriv(
        x + k3[0] * dt, y + k3[1] * dt,
        vx + k3[2] * dt, vy + k3[3] * dt
      );

      x += (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      y += (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      vx += (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
      vy += (dt / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
      t += dt;

      points.push([x, y]);
      times.push(t);

      const rn = hypot(x, y);
      if (rn <= R) {
        outcome = "impact";
        flightTime = t;
        break;
      }
      if (el.E >= 0 && rn >= maxR) {
        outcome = "escape";
        break;
      }
      if (t >= tEnd) {
        outcome = "orbit";
        break;
      }
    }

    if (outcome === "impact" && flightTime === null) flightTime = t;

    return { points, times, outcome, flightTime, elements: el };
  }

  global.Physics = { G, orbitalElements, simulate };
})(typeof window !== "undefined" ? window : globalThis);
