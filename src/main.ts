// ============================================================
// OLIVER BIBBY PORTFOLIO — Shared JavaScript
// ============================================================

import './style.css';

// ── Theme Switcher ────────────────────────────────────────────
const THEME_COUNT = 6;
const THEME_KEY = 'ob-theme';

function applyTheme(index: number) {
  document.documentElement.setAttribute('data-theme', String(index));
  localStorage.setItem(THEME_KEY, String(index));
}

// Restore persisted theme on every page load
const savedTheme = parseInt(localStorage.getItem(THEME_KEY) ?? '0', 10);
applyTheme(isNaN(savedTheme) ? 0 : Math.min(savedTheme, THEME_COUNT - 1));

// Wire up the dot (only present on index.html)
const dot = document.getElementById('theme-dot');
if (dot) {
  dot.addEventListener('click', () => {
    const current = parseInt(document.documentElement.getAttribute('data-theme') ?? '0', 10);
    applyTheme((current + 1) % THEME_COUNT);
  });
  dot.addEventListener('keydown', (e: Event) => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Enter' || ke.key === ' ') {
      ke.preventDefault();
      dot.click();
    }
  });
}

// ── Nav scroll state ─────────────────────────────────────────
const nav = document.querySelector('.nav') as HTMLElement | null;
if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
}

// ── Mobile nav toggle ─────────────────────────────────────────
const hamburger = document.querySelector('.nav__hamburger');
const drawer = document.querySelector('.nav__drawer');

hamburger?.addEventListener('click', () => {
  drawer?.classList.toggle('open');
  const spans = hamburger.querySelectorAll('span');
  const isOpen = drawer?.classList.contains('open');
  if (spans[0] && spans[1] && spans[2]) {
    (spans[0] as HTMLElement).style.transform = isOpen ? 'rotate(45deg) translate(5px, 5px)' : '';
    (spans[1] as HTMLElement).style.opacity = isOpen ? '0' : '1';
    (spans[2] as HTMLElement).style.transform = isOpen ? 'rotate(-45deg) translate(5px, -5px)' : '';
  }
});

// Close drawer when a link is clicked
drawer?.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    drawer.classList.remove('open');
    const spans = hamburger?.querySelectorAll('span');
    if (spans) {
      (spans[0] as HTMLElement).style.transform = '';
      (spans[1] as HTMLElement).style.opacity = '1';
      (spans[2] as HTMLElement).style.transform = '';
    }
  });
});

// ── Active nav link ──────────────────────────────────────────
const currentPath = window.location.pathname;
document.querySelectorAll('.nav__links a, .nav__drawer a').forEach(link => {
  const href = link.getAttribute('href') ?? '';
  const isActive =
    (href === '/' && (currentPath === '/' || currentPath === '/index.html')) ||
    (href !== '/' && currentPath.includes(href.replace('.html', '')));
  if (isActive) link.classList.add('active');
});

// ── Scroll-in animations ─────────────────────────────────────
const observer = new IntersectionObserver(
  entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
);

document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));

// ── Smooth scroll for anchor links ───────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const target = document.querySelector((link as HTMLAnchorElement).hash);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
