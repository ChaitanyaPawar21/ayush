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

// ---------- Preloader ----------
const count = $('#count');
const finishLoad = () => { root.classList.remove('is-loading'); root.classList.add('loaded'); };
if (reduce) {
  finishLoad();
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

// ---------- Header + scroll-driven bits ----------
const nav = $('#nav');
let lastY = 0, ticking = false;
function onScroll() {
  const y = scrollY;
  nav.classList.toggle('solid', y > 30);
  nav.classList.toggle('hide', y > 500 && y > lastY + 2 && !root.classList.contains('menu-open'));
  if (y < lastY - 2) nav.classList.remove('hide');
  lastY = y; ticking = false;
}
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
onScroll();

addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

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
