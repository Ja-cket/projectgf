(() => {
  const scene = document.getElementById("scene");
  const world = document.getElementById("world");
  const intro = document.getElementById("intro");
  const tap = document.getElementById("tap");
  const letter = document.getElementById("letter");
  const heartbeat = letter.querySelector(".heartbeat");
  const flash = document.getElementById("flash");
  const canvas = document.getElementById("field");
  const ctx = canvas.getContext("2d");

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  // Deep red / crimson / wine — not pastel pink
  const COLORS = [
    "#6b1218",
    "#8a1520",
    "#a01828",
    "#b81e2e",
    "#c42233",
    "#d42a38",
    "#e23a3a",
    "#ef4a4a",
    "#ff5a5a",
    "#9a1020",
    "#7a0e18",
    "#5c0c14",
    "#ff6e6e",
    "#c01028",
  ];

  let width = 0;
  let height = 0;
  let dpr = 1;
  let opened = false;
  let rafId = 0;
  let mode = "wall"; // wall | dive | calm
  let diveStart = 0;
  let cameraZ = 0;
  let shakeAmp = 0;

  /** @type {Array<ReturnType<typeof makePiece>>} */
  const pieces = [];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function makePiece(kind = "wall") {
    const isHeart = Math.random() < 0.7;

    if (kind === "wall") {
      // Fill the entire frame densely — slight breathing room only at dead center
      let x = Math.random() * width;
      let y = Math.random() * height;
      const cx = width * 0.5;
      const cy = height * 0.48;
      const dist = Math.hypot(x - cx, y - cy);
      const clearR = Math.min(width, height) * 0.09;

      // If too close to center, push outward so hint stays readable but curtain stays thick
      if (dist < clearR) {
        const angle = Math.atan2(y - cy, x - cx) || rand(0, Math.PI * 2);
        const push = clearR + rand(0, clearR * 0.8);
        x = cx + Math.cos(angle) * push;
        y = cy + Math.sin(angle) * push;
      }

      return {
        type: isHeart ? "heart" : "petal",
        x,
        y,
        z: rand(20, 480),
        baseX: x,
        baseY: y,
        size: rand(16, 46),
        rot: rand(0, Math.PI * 2),
        spin: rand(-0.015, 0.015),
        wobble: rand(0, Math.PI * 2),
        wobbleSpeed: rand(0.006, 0.018),
        alpha: rand(0.55, 0.98),
        color: COLORS[(Math.random() * COLORS.length) | 0],
        vx: 0,
        vy: 0,
        vz: 0,
        life: 1,
        layer: Math.random(),
      };
    }

    const angle = Math.random() * Math.PI * 2;
    const radius = rand(4, Math.hypot(width, height) * 0.6);
    return {
      type: isHeart ? "heart" : "petal",
      x: width * 0.5 + Math.cos(angle) * radius,
      y: height * 0.5 + Math.sin(angle) * radius,
      z: cameraZ + rand(40, 720),
      baseX: 0,
      baseY: 0,
      size: rand(14, 52),
      rot: rand(0, Math.PI * 2),
      spin: rand(-0.16, 0.16),
      wobble: rand(0, Math.PI * 2),
      wobbleSpeed: rand(0.02, 0.07),
      alpha: rand(0.5, 1),
      color: COLORS[(Math.random() * COLORS.length) | 0],
      vx: Math.cos(angle) * rand(0.4, 3.2),
      vy: Math.sin(angle) * rand(0.4, 3.2),
      vz: -rand(5, 16),
      life: 1,
      layer: 1,
    };
  }

  function seedWall() {
    pieces.length = 0;
    // Heavy coverage — overlapping curtain, not sparse confetti
    const area = width * height;
    const count = Math.round(Math.min(520, Math.max(280, area / 1400)));
    for (let i = 0; i < count; i += 1) {
      pieces.push(makePiece("wall"));
    }

    // Extra near-layer blobs to kill empty gaps
    const nearCount = Math.round(count * 0.35);
    for (let i = 0; i < nearCount; i += 1) {
      const p = makePiece("wall");
      p.z = rand(18, 110);
      p.size = rand(28, 64);
      p.alpha = rand(0.65, 1);
      pieces.push(p);
    }
  }

  function project(p) {
    const focal = Math.min(width, height) * 0.78;
    const depth = Math.max(p.z - cameraZ, 6);
    const scale = focal / depth;
    const px = width * 0.5 + (p.x - width * 0.5) * scale;
    const py = height * 0.5 + (p.y - height * 0.5) * scale;
    return { px, py, scale, depth };
  }

  function drawHeart(size) {
    const s = size;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.3);
    ctx.bezierCurveTo(0, -s * 0.25, -s * 0.7, -s * 0.25, -s * 0.7, s * 0.12);
    ctx.bezierCurveTo(-s * 0.7, s * 0.45, -s * 0.15, s * 0.72, 0, s);
    ctx.bezierCurveTo(s * 0.15, s * 0.72, s * 0.7, s * 0.45, s * 0.7, s * 0.12);
    ctx.bezierCurveTo(s * 0.7, -s * 0.25, 0, -s * 0.25, 0, s * 0.3);
    ctx.closePath();
    ctx.fill();
  }

  function drawPetal(size) {
    ctx.beginPath();
    ctx.moveTo(0, size * 0.15);
    ctx.quadraticCurveTo(size * 0.7, -size * 0.1, size * 0.15, -size);
    ctx.quadraticCurveTo(0, -size * 0.55, -size * 0.15, -size);
    ctx.quadraticCurveTo(-size * 0.7, -size * 0.1, 0, size * 0.15);
    ctx.fill();
  }

  function drawPiece(p, now) {
    const { px, py, scale, depth } = project(p);
    if (scale < 0.03 || scale > 11) return;

    const fadeNear = depth < 40 ? depth / 40 : 1;
    const fadeFar = depth > 440 ? Math.max(0, 1 - (depth - 440) / 160) : 1;
    const alpha = p.alpha * fadeNear * fadeFar * p.life;
    if (alpha <= 0.02) return;

    const wobbleX = Math.sin(now * 0.001 * p.wobbleSpeed * 60 + p.wobble) * 3.5;
    const wobbleY = Math.cos(now * 0.001 * p.wobbleSpeed * 50 + p.wobble) * 2.8;

    ctx.save();
    ctx.translate(px + wobbleX, py + wobbleY);
    ctx.rotate(p.rot);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;

    // Soft edge overlap — darker rim for density
    if (p.type === "heart") {
      drawHeart(p.size * 0.58);
      ctx.globalAlpha = alpha * 0.22;
      ctx.fillStyle = "#2a0408";
      drawHeart(p.size * 0.38);
    } else {
      drawPetal(p.size);
    }

    ctx.restore();
  }

  function updateWall(p, now) {
    p.rot += p.spin;
    p.wobble += p.wobbleSpeed;
    p.x = p.baseX + Math.sin(now * 0.00055 + p.wobble) * 4.5;
    p.y = p.baseY + Math.cos(now * 0.0007 + p.wobble * 1.2) * 3.8;
  }

  function updateDive(p) {
    p.x += p.vx;
    p.y += p.vy;
    p.z += p.vz - 11;
    p.rot += p.spin * 2.4;
    p.vx *= 1.012;
    p.vy *= 1.012;

    const dx = p.x - width * 0.5;
    const dy = p.y - height * 0.5;
    p.x += dx * 0.014;
    p.y += dy * 0.014;

    if (p.z - cameraZ < 14) p.life -= 0.09;
  }

  function spawnDiveBurst(amount) {
    for (let i = 0; i < amount; i += 1) pieces.push(makePiece("dive"));
  }

  function sortByDepth() {
    pieces.sort((a, b) => b.z - a.z);
  }

  function tick(now) {
    ctx.clearRect(0, 0, width, height);

    if (mode === "dive") {
      const t = (now - diveStart) / 2150;
      cameraZ = Math.min(580, t * t * 640);
      shakeAmp = Math.max(0, 1 - t) * 12;

      if (t < 0.75 && Math.random() < 0.7) spawnDiveBurst(5);

      for (const p of pieces) {
        if (p.vz === 0 && p.baseX) {
          const angle = Math.atan2(p.y - height * 0.5, p.x - width * 0.5);
          p.vx = Math.cos(angle) * rand(1, 4);
          p.vy = Math.sin(angle) * rand(1, 4);
          p.vz = -rand(7, 18);
          p.spin = rand(-0.2, 0.2);
          p.baseX = 0;
        }
        updateDive(p);
      }

      if (shakeAmp > 0.2) {
        ctx.save();
        ctx.translate(
          (Math.random() - 0.5) * shakeAmp,
          (Math.random() - 0.5) * shakeAmp
        );
      }
    } else if (mode === "wall") {
      for (const p of pieces) updateWall(p, now);
    } else {
      if (pieces.length < 36 && Math.random() < 0.04) {
        const p = makePiece("wall");
        p.z = rand(200, 460);
        p.alpha *= 0.5;
        p.size *= 0.75;
        pieces.push(p);
      }
      for (let i = pieces.length - 1; i >= 0; i -= 1) {
        const p = pieces[i];
        updateWall(p, now);
        p.y += 0.18;
        if (p.y > height + 50) pieces.splice(i, 1);
      }
    }

    if (mode === "dive") {
      for (let i = pieces.length - 1; i >= 0; i -= 1) {
        const p = pieces[i];
        if (p.life <= 0 || p.z - cameraZ < 3 || p.z - cameraZ > 920) {
          pieces.splice(i, 1);
        }
      }
    }

    sortByDepth();
    for (const p of pieces) drawPiece(p, now);

    if (mode === "dive" && shakeAmp > 0.2) ctx.restore();

    rafId = requestAnimationFrame(tick);
  }

  function showLetter() {
    intro.hidden = true;
    letter.hidden = false;
    requestAnimationFrame(() => {
      letter.classList.add("is-visible");
      heartbeat.classList.add("is-beating");
    });
  }

  function openHeart() {
    if (opened) return;
    opened = true;
    tap.disabled = true;

    if (reduceMotion) {
      world.classList.remove("is-idle");
      intro.classList.add("is-leaving");
      scene.classList.add("is-clear");
      pieces.length = 0;
      mode = "calm";
      window.setTimeout(showLetter, 100);
      return;
    }

    mode = "dive";
    diveStart = performance.now();
    cameraZ = 0;
    world.classList.remove("is-idle");
    world.classList.add("is-rushing");
    scene.classList.add("is-diving");
    intro.classList.add("is-leaving");
    flash.classList.add("is-on");
    spawnDiveBurst(70);

    if (navigator.vibrate) navigator.vibrate([16, 35, 16, 35, 28]);

    window.setTimeout(() => {
      mode = "calm";
      cameraZ = 0;
      pieces.length = 0;
      for (let i = 0; i < 28; i += 1) {
        const p = makePiece("wall");
        p.z = rand(220, 500);
        p.alpha *= 0.42;
        p.size *= 0.7;
        pieces.push(p);
      }
      scene.classList.remove("is-diving");
      scene.classList.add("is-clear");
      world.classList.remove("is-rushing");
      showLetter();
    }, 2100);
  }

  resize();
  seedWall();
  world.classList.add("is-idle");

  if (!reduceMotion) {
    rafId = requestAnimationFrame(tick);
  } else {
    sortByDepth();
    for (const p of pieces) {
      updateWall(p, 0);
      drawPiece(p, 0);
    }
  }

  window.addEventListener("resize", () => {
    resize();
    if (mode === "wall" && !opened) seedWall();
  });

  // Whole first screen is the interaction — "жми" is only a whisper
  tap.addEventListener("click", openHeart);
  scene.addEventListener("click", (e) => {
    if (opened) return;
    if (e.target.closest(".letter")) return;
    openHeart();
  });

  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(rafId);
  });
})();
