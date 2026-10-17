// Analytics: paste a Google Analytics ID (e.g. 'G-XXXXXXX') to switch on; leave '' to keep it off.
const GA_ID = '';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- Smooth scrolling ----------
let lenis = null;
if (!reduce && window.Lenis) {
  lenis = new Lenis({ duration: 1.3, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
  requestAnimationFrame(function raf(t) { lenis.raf(t); requestAnimationFrame(raf); });
}
const scrollTo = el => lenis ? lenis.scrollTo(el, { offset: -10, duration: 1.8 }) : el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });

// ---------- Hero field: noise settling into a normal distribution ----------
const field = (() => {
  const c = $('#field'), ctx = c.getContext('2d'), hero = $('.hero'), title = $('.hero__title');
  let W, H, dots = [], free = [], gap = 0, r = 1, t0 = 0, running = false, visible = true, started = false, curve = null;
  const mouse = { x: -9999, y: -9999 };

  function build() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = c.clientWidth; H = c.clientHeight;
    c.width = W * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const mobile = W < 700, bins = mobile ? 25 : 45;
    // on desktop, start the bell just clear of where the headline text ends
    const range = document.createRange(); range.selectNodeContents(title);
    const textRight = range.getBoundingClientRect().right - c.getBoundingClientRect().left;
    const x0 = mobile ? W * .04 : Math.max(W * .39, textRight - W * .21), x1 = mobile ? W * .96 : W, bw = (x1 - x0) / bins; // bell always ends at the right edge
    gap = bw * .62; r = Math.max(1, bw * .13);
    const base = H - r - 6, // bottom row rests on the footer line
          // on phones the bell fills whatever height is left under the text block, and runs wider
          room = mobile ? base - (title.parentNode.getBoundingClientRect().bottom - c.getBoundingClientRect().top) - 28 : Infinity,
          maxH = Math.floor(Math.min(H * (mobile ? .45 : .55), room) / gap), sd = bins / (mobile ? 4.4 : 6.4);
    // height in rows at column fi: the bell, plus tails that rise from two rows at each screen edge
    const cx = x0 + bw * bins / 2;
    const rows = fi => {
      const z = (fi - (bins - 1) / 2) / sd, x = x0 + bw * (fi + .5);
      const side = clamp(x < cx ? x / cx : (W - x) / (W - cx), 0, 1);
      const bell = maxH * Math.exp(-z * z / 2), tail = 1 + 1.9 * side; // never below two rows
      return (bell + tail + Math.sqrt((bell - tail) ** 2 + 1)) / 2; // smooth max, no kink where they meet
    };
    dots = [];
    // columns run edge to edge; each fills up to just under the curve
    for (let i = -Math.ceil(x0 / bw); i < bins + Math.ceil((W - x1) / bw); i++) {
      // as many rows as fit under the curve without touching it
      const h = Math.floor(rows(i) + .2 - (r + 2) / gap) + 1, x = x0 + bw * (i + .5);
      for (let k = 0; k < h; k++) dots.push({
        i, x, ty: base - k * gap, sx: Math.random() * W, sy: Math.random() * H,
        delay: Math.random() * 1.1, ox: 0, oy: 0, a: .16 + .5 * (k / (maxH || 1))
      });
    }
    curve = maxH > 2 ? { x0, bw, base, rows } : null;
    free = Array.from({ length: W < 700 ? 50 : 110 }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25 }));
  }

  const buckets = [[], [], [], [], []];
  const easeOut = t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);

  function frame(now) {
    if (!running) return;
    const t = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H);

    // drifting noise
    ctx.fillStyle = 'rgba(236,232,225,.14)';
    ctx.beginPath();
    for (const p of free) {
      p.x = (p.x + p.vx + W) % W; p.y = (p.y + p.vy + H) % H;
      ctx.moveTo(p.x + r * .8, p.y); ctx.arc(p.x, p.y, r * .8, 0, 6.283);
    }
    ctx.fill();

    // histogram dots, bucketed by alpha to keep draw calls low (arrays reused, no per-frame garbage)
    for (const b of buckets) b.length = 0;
    for (const d of dots) {
      const p = easeOut(clamp((t - d.delay) / 2.4, 0, 1));
      const breathe = 1 + .045 * Math.sin(t * .9 + d.i * .32);
      let x = d.sx + (d.x - d.sx) * p;
      let y = d.sy + ((curve.base - (curve.base - d.ty) * breathe) - d.sy) * p;
      // gentle repulsion from the cursor
      const dx = x - mouse.x, dy = y - mouse.y, dist = Math.hypot(dx, dy);
      let tx = 0, ty = 0;
      if (dist < 110) { const f = (110 - dist) / 110 * 22; tx = dx / (dist || 1) * f; ty = dy / (dist || 1) * f; }
      d.ox += (tx - d.ox) * .08; d.oy += (ty - d.oy) * .08;
      buckets[Math.min(4, Math.floor(d.a * 7))].push(x + d.ox, y + d.oy);
    }
    buckets.forEach((b, bi) => {
      if (!b.length) return;
      ctx.fillStyle = `rgba(236,232,225,${.12 + bi * .12})`;
      ctx.beginPath();
      for (let j = 0; j < b.length; j += 2) { ctx.moveTo(b[j] + r, b[j + 1]); ctx.arc(b[j], b[j + 1], r, 0, 6.283); }
      ctx.fill();
    });

    // the fitted density curve fades in once the dots settle
    const ca = clamp((t - 2.2) / 1.5, 0, 1);
    if (curve && ca > 0) {
      const { x0, bw, base, rows } = curve;
      ctx.strokeStyle = `rgba(236,232,225,${.35 * ca})`; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let j = 0; j <= 240; j++) { // edge to edge across the screen
        const fi = (j / 240 * W - x0) / bw - .5;
        const breathe = 1 + .045 * Math.sin(t * .9 + fi * .32);
        const x = x0 + bw * (fi + .5);
        const y = base - (rows(fi) + .2) * gap * breathe;
        j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    requestAnimationFrame(frame);
  }

  const play = () => { if (!reduce && !running && started && visible) { running = true; requestAnimationFrame(frame); } };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? play() : (running = false); }).observe(hero);
  hero.addEventListener('pointermove', e => { const b = c.getBoundingClientRect(); mouse.x = e.clientX - b.left; mouse.y = e.clientY - b.top; });
  hero.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; });
  // skip same-size resizes (mobile address bar showing/hiding), which would reshuffle the dots mid-scroll
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (c.clientWidth === W && c.clientHeight === H) return; build(); if (reduce) { running = true; frame(t0 + 1e7); running = false; } }, 200); });

  return {
    start: () => document.fonts.ready.then(() => { // fonts first, so the text width is final
      build(); started = true; t0 = performance.now();
      if (reduce) { running = true; frame(t0 + 1e7); running = false; return; } // draw the settled state once
      play();
    })
  };
})();

// ---------- Preloader ----------
const finishLoad = () => { root.classList.remove('is-loading'); root.classList.add('loaded'); field.start(); };
if (reduce) {
  finishLoad();
} else {
  lenis?.stop();
  setTimeout(() => { finishLoad(); lenis?.start(); }, 1950); // let the K's entrance play out
}


// ---------- Anchor links ----------
$$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
  const el = $(a.getAttribute('href'));
  if (!el) return;
  e.preventDefault();
  scrollTo(el);
}));

// ---------- Reveal on scroll ----------
const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: .12, rootMargin: '0px 0px -60px 0px' });
$$('.r').forEach(el => io.observe(el));

// ---------- Header + scroll-driven bits ----------
const nav = $('#nav');
let lastY = 0, ticking = false;
function onScroll() {
  const y = scrollY;
  nav.classList.toggle('solid', y > 30);
  nav.classList.toggle('hide', y > 500 && y > lastY + 2);
  if (y < lastY - 2) nav.classList.remove('hide');
  lastY = y; ticking = false;
}
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
onScroll();



// ---------- Optional analytics ----------
if (GA_ID) {
  const s = document.createElement('script');
  s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.append(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag('js', new Date()); gtag('config', GA_ID);
}
