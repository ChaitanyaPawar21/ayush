// Analytics: paste a Google Analytics ID (e.g. 'G-XXXXXXX') to switch on; leave '' to keep it off.
const GA_ID = '';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
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

// ---------- Preloader ----------
const count = $('#count');
const finishLoad = () => { root.classList.remove('is-loading'); root.classList.add('loaded'); field.start(); };
if (reduce) {
  finishLoad.pending = true;
} else {
  lenis?.stop();
  const t0 = performance.now(), dur = 1700;
  (function tick(now) {
    const p = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - p, 3);
    count.textContent = String(Math.round(e * 100)).padStart(3, '0');
    if (p < 1) return requestAnimationFrame(tick);
    setTimeout(() => { finishLoad(); lenis?.start(); }, 250);
  })(t0);
}

// ---------- Hero field: noise settling into a normal distribution ----------
const field = (() => {
  const c = $('#field'), ctx = c.getContext('2d'), hero = $('.hero');
  let W, H, dpr, dots = [], free = [], cols = [], gap, r, t0 = 0, running = false, visible = true, started = false;
  const mouse = { x: -9999, y: -9999 };

  function build() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = c.clientWidth; H = c.clientHeight;
    c.width = W * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const mobile = W < 700;
    const bins = mobile ? 25 : 45;
    const x0 = mobile ? W * .04 : W * .36, x1 = W * (mobile ? .96 : .97);
    const bw = (x1 - x0) / bins;
    gap = bw * .62; r = Math.max(1, bw * .13);
    const base = H * (mobile ? .9 : .86), maxH = Math.floor(H * (mobile ? .42 : .55) / gap), sd = bins / 6.4;
    dots = []; cols = [];
    for (let i = 0; i < bins; i++) {
      const z = (i - (bins - 1) / 2) / sd, h = Math.round(maxH * Math.exp(-z * z / 2));
      const x = x0 + bw * (i + .5);
      cols.push({ x, h });
      for (let k = 0; k < h; k++) dots.push({
        i, k, h, x, ty: base - k * gap,
        sx: Math.random() * W, sy: Math.random() * H, delay: Math.random() * 1.1,
        ox: 0, oy: 0, a: .16 + .5 * (k / maxH)
      });
    }
    free = Array.from({ length: mobile ? 50 : 110 }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25 }));
    Object.assign(field, { base, maxH, sd, x0, bw, bins });
  }

  const easeOut = t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);

  function frame(now) {
    if (!running) return;
    const t = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H);

    // drifting noise
    ctx.fillStyle = 'rgba(236,232,225,.14)';
    ctx.beginPath();
    for (const p of free) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0; if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.moveTo(p.x + r * .8, p.y); ctx.arc(p.x, p.y, r * .8, 0, 6.283);
    }
    ctx.fill();

    // histogram dots, bucketed by alpha to keep draw calls low
    const buckets = [[], [], [], [], []];
    let settled = 1;
    for (const d of dots) {
      const p = easeOut(clamp((t - d.delay) / 2.4, 0, 1));
      settled = Math.min(settled, p);
      const breathe = 1 + .045 * Math.sin(t * .9 + d.i * .32);
      let x = d.sx + (d.x - d.sx) * p;
      let y = d.sy + ((field.base - (field.base - d.ty) * breathe) - d.sy) * p;
      // gentle repulsion from the cursor
      const dx = x - mouse.x, dy = y - mouse.y, dist = Math.hypot(dx, dy);
      let tx = 0, ty = 0;
      if (dist < 110) { const f = (110 - dist) / 110 * 22; tx = dx / (dist || 1) * f; ty = dy / (dist || 1) * f; }
      d.ox += (tx - d.ox) * .08; d.oy += (ty - d.oy) * .08;
      x += d.ox; y += d.oy;
      buckets[Math.min(4, Math.floor(d.a * 7))].push(x, y);
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
    if (ca > 0) {
      ctx.strokeStyle = `rgba(225,38,46,${.55 * ca})`; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let j = 0; j <= 160; j++) {
        const fi = j / 160 * (field.bins - 1), z = (fi - (field.bins - 1) / 2) / field.sd;
        const breathe = 1 + .045 * Math.sin(t * .9 + fi * .32);
        const x = field.x0 + field.bw * (fi + .5);
        const y = field.base - (field.maxH * Math.exp(-z * z / 2) - .3) * gap * breathe - gap * .9;
        j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    requestAnimationFrame(frame);
  }

  const play = () => { if (!running && started && visible) { running = true; requestAnimationFrame(frame); } };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? play() : (running = false); }).observe(hero);
  hero.addEventListener('pointermove', e => { const b = c.getBoundingClientRect(); mouse.x = e.clientX - b.left; mouse.y = e.clientY - b.top; });
  hero.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; });
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(build, 200); });

  return {
    start() {
      build(); started = true; t0 = performance.now();
      if (reduce) { t0 -= 10000; running = true; frame(performance.now()); running = false; return; } // draw the settled state once
      play();
    }
  };
})();
if (finishLoad.pending) finishLoad();

// ---------- Mobile menu ----------
const burger = $('#burger'), menu = $('#menu');
const setMenu = open => {
  root.classList.toggle('menu-open', open);
  burger.setAttribute('aria-expanded', open);
  burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  menu.setAttribute('aria-hidden', !open);
  open ? lenis?.stop() : lenis?.start();
};
burger.addEventListener('click', () => setMenu(!root.classList.contains('menu-open')));

// ---------- Anchor links ----------
$$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
  const el = $(a.getAttribute('href'));
  if (!el) return;
  e.preventDefault();
  if (root.classList.contains('menu-open')) { setMenu(false); setTimeout(() => scrollTo(el), 350); } else scrollTo(el);
}));

// ---------- Reveal on scroll ----------
const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: .12, rootMargin: '0px 0px -60px 0px' });
$$('.r').forEach(el => io.observe(el));

// ---------- Statement: words light up as you scroll ----------
const stmt = $('[data-words]');
stmt.innerHTML = stmt.textContent.trim().split(/\s+/).map(w => `<span class="w">${w}</span>`).join(' ');
const words = $$('.w', stmt);

// ---------- Sticky process ----------
const steps = $$('.step'), pnum = $('#pnum'), pbar = $('#pbar');
const stepIO = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  steps.forEach(s => s.classList.toggle('active', s === e.target));
  const n = e.target.dataset.step;
  if (pnum.textContent !== n) {
    pnum.classList.add('swap');
    setTimeout(() => { pnum.textContent = n; pnum.classList.remove('swap'); }, 250);
  }
  pbar.style.transform = `scaleX(${+n / steps.length})`;
}), { rootMargin: '-45% 0px -45% 0px' });
steps.forEach(s => stepIO.observe(s));

// ---------- Header + scroll-driven bits ----------
const nav = $('#nav');
let lastY = 0, ticking = false;
function onScroll() {
  const y = scrollY;
  nav.classList.toggle('solid', y > 30);
  nav.classList.toggle('hide', y > 500 && y > lastY + 2 && !root.classList.contains('menu-open'));
  if (y < lastY - 2) nav.classList.remove('hide');
  const b = stmt.getBoundingClientRect();
  const p = clamp((innerHeight * .85 - b.top) / (b.height + innerHeight * .25), 0, 1);
  const lit = Math.round(p * words.length);
  words.forEach((w, i) => w.classList.toggle('lit', i < lit));
  lastY = y; ticking = false;
}
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
onScroll();

const links = $$('.nav__links a');
const navIO = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) links.forEach(l => l.classList.toggle('on', l.hash === '#' + e.target.id));
}), { rootMargin: '-50% 0px -50% 0px' });
['firm', 'approach', 'culture', 'careers', 'contact'].forEach(id => navIO.observe($('#' + id)));

// ---------- Cursor ring + pillar glow (mouse only) ----------
if (fine && !reduce) {
  const cur = $('#cursor');
  let mx = -100, my = -100, cx = -100, cy = -100;
  addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; cur.classList.add('on'); }, { passive: true });
  document.addEventListener('pointerleave', () => cur.classList.remove('on'));
  (function loop() {
    cx += (mx - cx) * .16; cy += (my - cy) * .16;
    cur.style.transform = `translate(${cx}px, ${cy}px)`;
    requestAnimationFrame(loop);
  })();
  document.addEventListener('pointerover', e => cur.classList.toggle('big', !!e.target.closest('a, button, label, .pillars li')));

  $$('.pillars li').forEach(li => li.addEventListener('pointermove', e => {
    const b = li.getBoundingClientRect();
    li.style.setProperty('--x', e.clientX - b.left + 'px');
    li.style.setProperty('--y', e.clientY - b.top + 'px');
  }));
}

// ---------- Apply drawer ----------
const drawer = $('#drawer'), roleSel = $('#role'), roleName = $('#drawer-role');
let lastFocus = null;
function openDrawer(role) {
  roleSel.value = role;
  roleName.textContent = role === 'Other' ? 'Kendberg' : role;
  lastFocus = document.activeElement;
  drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false');
  lenis?.stop(); root.style.overflow = 'hidden';
  setTimeout(() => $('#apply [name=name]').focus(), 700);
}
function closeDrawer() {
  if (!drawer.classList.contains('open')) return;
  drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true');
  lenis?.start(); root.style.overflow = '';
  lastFocus?.focus({ preventScroll: true });
}
$$('[data-role]').forEach(b => b.addEventListener('click', () => openDrawer(b.dataset.role)));
$$('[data-close]').forEach(b => b.addEventListener('click', closeDrawer));
roleSel.addEventListener('change', () => { roleName.textContent = roleSel.value === 'Other' ? 'Kendberg' : roleSel.value; });
addEventListener('keydown', e => { if (e.key === 'Escape') { closeDrawer(); setMenu(false); } });
$('#apply [type=file]').addEventListener('change', e => { $('#file-name').textContent = e.target.files[0]?.name || 'Optional · PDF or Word'; });

// ---------- Forms (FormSubmit): return here with a thank-you ----------
const here = location.href.split(/[?#]/)[0];
$('#apply [name=_next]').value = here + '?sent=apply#careers';
$('#contact-form [name=_next]').value = here + '?sent=contact#contact';
const sent = new URLSearchParams(location.search).get('sent');
if (sent) {
  const t = $('#toast');
  t.textContent = sent === 'apply' ? 'Thank you — your application has been received.' : 'Thank you — we will be in touch shortly.';
  setTimeout(() => t.classList.add('show'), 2400);
  setTimeout(() => t.classList.remove('show'), 8000);
  history.replaceState(null, '', here + location.hash);
}

$('#year').textContent = new Date().getFullYear();

// ---------- Optional analytics ----------
if (GA_ID) {
  const s = document.createElement('script');
  s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.append(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag('js', new Date()); gtag('config', GA_ID);
}
