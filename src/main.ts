// ============================================================
// OLIVER BIBBY PORTFOLIO — JAVASCRIPT/TYPESCRIPT
// ============================================================

import './style.css';

// ── Animated Hero Story ───────────────────────────────────────
// Loaded on demand so the other pages don't pay for it.
const storyHero = document.querySelector<HTMLElement>('.hero--story');
if (storyHero) {
  import('./hero/story').then(({ initHeroStory }) => initHeroStory(storyHero));
}

// ── Card Spotlight Mouse Tracking ────────────────────────────────
const spotlightCards = document.querySelectorAll('.bento-card, .service-card');

spotlightCards.forEach((card) => {
  card.addEventListener('mousemove', (e: Event) => {
    const mouseEvent = e as MouseEvent;
    const rect = (card as HTMLElement).getBoundingClientRect();
    const x = mouseEvent.clientX - rect.left;
    const y = mouseEvent.clientY - rect.top;
    
    (card as HTMLElement).style.setProperty('--mouse-x', `${x}px`);
    (card as HTMLElement).style.setProperty('--mouse-y', `${y}px`);
  });
});

// ── Scroll Reveal Observer ─────────────────────────────────────
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  {
    threshold: 0.08,
    rootMargin: '0px 0px -20px 0px'
  }
);

document.querySelectorAll('.fade-up').forEach((el) => {
  revealObserver.observe(el);
});

// ── Smooth Anchors Scrolling ────────────────────────────────────
document.querySelectorAll('a[href^="/#"], a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (e) => {
    const hash = (link as HTMLAnchorElement).hash;
    const target = document.querySelector(hash);
    if (target) {
      e.preventDefault();
      
      // Update history without page jump
      history.pushState(null, '', hash);
      
      const headerOffset = 40; // reduced offset for bottom nav style
      const elementPosition = target.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - headerOffset;
      
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  });
});

// ── Navigation Scroll Spy ──────────────────────────────────────
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav__links a, .nav-link-item');

function scrollSpy() {
  const scrollPosition = window.scrollY + 250; // offset for viewport detection

  // Check if we are on the contact page
  if (window.location.pathname.includes('contact.html')) {
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.includes('contact.html')) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
    return;
  }

  // Otherwise, spy on homepage sections
  let currentActiveId = '';
  sections.forEach(section => {
    const top = (section as HTMLElement).offsetTop;
    const height = (section as HTMLElement).offsetHeight;
    if (scrollPosition >= top && scrollPosition < top + height) {
      currentActiveId = section.getAttribute('id') || '';
    }
  });

  // Since we only have Home (about) and Case Studies (work) as navigation anchors,
  // map scroll spy positions in 'services' section to the 'about' (Home) tab.
  if (currentActiveId === 'services') {
    currentActiveId = 'about';
  }

  // Default to 'about' if we are at the very top
  if (window.scrollY < 100) {
    currentActiveId = 'about';
  }

  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href) {
      const hashIndex = href.indexOf('#');
      if (hashIndex !== -1) {
        const hash = href.substring(hashIndex + 1);
        if (hash === currentActiveId) {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      } else {
        link.classList.remove('active');
      }
    }
  });
}

window.addEventListener('scroll', scrollSpy, { passive: true });
window.addEventListener('load', scrollSpy);
