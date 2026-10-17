// Smooth scrolling for the inner pages, same feel as the home page (main.js).
if (window.Lenis && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const lenis = new Lenis({ duration: 1.3, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
  requestAnimationFrame(function raf(t) { lenis.raf(t); requestAnimationFrame(raf); });
}
