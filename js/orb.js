// The coach: a tennis ball that breathes. The felt deforms with the coach's
// voice; chalk rings ripple off it while you're talking.
export function createOrb(canvas, getLevels) {
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let mode = "idle";
  let W = 0, H = 0, dpr = 1;
  let inLvl = 0, outLvl = 0, energy = 0, spin = 0, last = performance.now();
  let rings = [], ringClock = 0;
  const felt = makeFelt();

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  function makeFelt() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random();
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v > 0.5 ? 255 : 0;
      img.data[i + 3] = Math.abs(v - 0.5) * 34;
    }
    g.putImageData(img, 0, 0);
    return ctx.createPattern(c, "repeat");
  }

  function blobPath(cx, cy, R, t, amp) {
    const N = 96;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * Math.PI * 2;
      const n =
        Math.sin(3 * th + t * 1.3) * 0.5 +
        Math.sin(5 * th - t * 1.9 + 1.1) * 0.3 +
        Math.sin(7 * th + t * 2.7 + 2.3) * 0.2;
      const r = R * (1 + amp * n);
      const x = cx + Math.cos(th) * r, y = cy + Math.sin(th) * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const still = reduce.matches;
    const lv = getLevels ? getLevels() : { input: 0, output: 0 };
    // fast attack, slow release
    const ease = (cur, target) => cur + (target - cur) * (target > cur ? 0.35 : 0.08);
    inLvl = ease(inLvl, mode === "idle" ? 0 : Math.min(1, lv.input * 4));
    outLvl = ease(outLvl, Math.min(1, lv.output * 4));
    const t = now / 1000;

    const target = mode === "speaking" ? 0.35 + outLvl : mode === "thinking" ? 0.3 : mode === "connecting" ? 0.25 : mode === "listening" ? 0.12 : 0.05;
    energy += (target - energy) * 0.06;
    spin += dt * (0.08 + energy * 0.9 + outLvl * 1.5) * (still ? 0 : 1);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const base = Math.min(W, H) * 0.3;
    const breath = still ? 0 : Math.sin(t * (mode === "idle" ? 0.9 : 1.6)) * 0.018;
    const R = base * (1 + breath + outLvl * 0.1 + (mode === "thinking" ? Math.sin(t * 5) * 0.015 : 0));
    const amp = still ? 0.01 : 0.012 + outLvl * 0.11 + (mode === "thinking" ? 0.014 : 0);

    // chalk rings while the player is talking
    if (!still && mode !== "idle") {
      ringClock += dt * (inLvl * 9);
      if (ringClock > 1 && inLvl > 0.08) { ringClock = 0; rings.push({ r: R * 1.02, a: Math.min(0.55, 0.2 + inLvl * 0.5) }); }
    }
    rings = rings.filter((g) => g.a > 0.01 && g.r < base * 2.2);
    for (const g of rings) {
      g.r += dt * base * 0.9; g.a *= 1 - dt * 1.6;
      ctx.beginPath(); ctx.arc(cx, cy, g.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(238,243,236,${g.a})`; ctx.lineWidth = 1.5; ctx.stroke();
    }

    // listening halo: a steady chalk circle that swells with your voice
    if (mode === "listening" || inLvl > 0.05) {
      ctx.beginPath(); ctx.arc(cx, cy, R * (1.16 + inLvl * 0.25), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(238,243,236,${0.12 + inLvl * 0.5})`; ctx.lineWidth = 2; ctx.stroke();
    }

    // connecting: a dashed service-line ring orbiting
    if (mode === "connecting") {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 1.4);
      ctx.setLineDash([R * 0.18, R * 0.12]);
      ctx.beginPath(); ctx.arc(0, 0, R * 1.22, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(238,243,236,.55)"; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    }

    // glow
    ctx.save();
    ctx.shadowColor = `rgba(223,255,79,${0.18 + energy * 0.35})`;
    ctx.shadowBlur = base * (0.35 + energy * 0.6);
    blobPath(cx, cy, R, t, amp);
    const grad = ctx.createRadialGradient(cx - R * 0.38, cy - R * 0.42, R * 0.08, cx, cy, R * 1.08);
    grad.addColorStop(0, "#F7FFB8");
    grad.addColorStop(0.35, "#E3FF55");
    grad.addColorStop(0.78, "#BFDD2C");
    grad.addColorStop(1, "#839C14");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // felt texture + seam, clipped to the ball
    ctx.save();
    blobPath(cx, cy, R, t, amp);
    ctx.clip();
    ctx.fillStyle = felt; ctx.globalCompositeOperation = "overlay"; ctx.fillRect(cx - R * 1.3, cy - R * 1.3, R * 2.6, R * 2.6);
    ctx.globalCompositeOperation = "source-over";

    ctx.translate(cx, cy);
    ctx.rotate(spin);
    const wob = 1 + amp * 0.6 * Math.sin(t * 2.2);
    ctx.lineCap = "round";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * R * 1.42 * wob, 0, R * 1.02, side > 0 ? Math.PI * 0.66 : -Math.PI * 0.34, side > 0 ? Math.PI * 1.34 : Math.PI * 0.34);
      ctx.strokeStyle = "rgba(255,255,250,.9)"; ctx.lineWidth = R * 0.055; ctx.stroke();
      ctx.strokeStyle = "rgba(120,140,20,.35)"; ctx.lineWidth = R * 0.012; ctx.stroke();
    }
    ctx.restore();

    // inner shade for roundness
    ctx.save();
    blobPath(cx, cy, R, t, amp);
    const shade = ctx.createRadialGradient(cx + R * 0.35, cy + R * 0.45, R * 0.2, cx, cy, R * 1.05);
    shade.addColorStop(0, "rgba(20,40,10,0)");
    shade.addColorStop(1, "rgba(20,40,10,.28)");
    ctx.fillStyle = shade; ctx.fill();
    ctx.restore();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { setMode(m) { mode = m; } };
}
