// ============================================================
// OLIVER BIBBY PORTFOLIO — JAVASCRIPT/TYPESCRIPT
// ============================================================

import './style.css';
import * as THREE from 'three';

// ── 3D Hero Grid Wave ─────────────────────────────────────────
(function initHeroGrid() {
  const canvas = document.getElementById('hero-grid-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;

  // ─ Renderer
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0); // transparent

  // ─ Scene & Camera
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(0, 12, 22);
  camera.lookAt(0, 0, 0);

  // ─ Grid parameters
  const gridWidth = 60;   // number of cells X
  const gridDepth = 40;   // number of cells Z
  const cellSize = 0.6;   // spacing between grid lines
  const halfW = (gridWidth * cellSize) / 2;
  const halfD = (gridDepth * cellSize) / 2;

  // ─ Build grid geometry (lines along X and Z)
  // We create individual line segments so each vertex can be displaced independently.
  const positions: number[] = [];
  const colors: number[] = [];

  const baseColor = new THREE.Color('#6366f1'); // indigo
  const edgeColor = new THREE.Color('#1e1b4b'); // dark indigo

  // Lines along X (horizontal rows)
  for (let iz = 0; iz <= gridDepth; iz++) {
    const z = iz * cellSize - halfD;
    for (let ix = 0; ix < gridWidth; ix++) {
      const x1 = ix * cellSize - halfW;
      const x2 = (ix + 1) * cellSize - halfW;
      positions.push(x1, 0, z, x2, 0, z);
      // Color based on distance from center for natural fade
      const d1 = Math.sqrt((x1 / halfW) ** 2 + (z / halfD) ** 2);
      const d2 = Math.sqrt((x2 / halfW) ** 2 + (z / halfD) ** 2);
      const c1 = baseColor.clone().lerp(edgeColor, Math.min(d1, 1));
      const c2 = baseColor.clone().lerp(edgeColor, Math.min(d2, 1));
      colors.push(c1.r, c1.g, c1.b, c2.r, c2.g, c2.b);
    }
  }

  // Lines along Z (vertical columns)
  for (let ix = 0; ix <= gridWidth; ix++) {
    const x = ix * cellSize - halfW;
    for (let iz = 0; iz < gridDepth; iz++) {
      const z1 = iz * cellSize - halfD;
      const z2 = (iz + 1) * cellSize - halfD;
      positions.push(x, 0, z1, x, 0, z2);
      const d1 = Math.sqrt((x / halfW) ** 2 + (z1 / halfD) ** 2);
      const d2 = Math.sqrt((x / halfW) ** 2 + (z2 / halfD) ** 2);
      const c1 = baseColor.clone().lerp(edgeColor, Math.min(d1, 1));
      const c2 = baseColor.clone().lerp(edgeColor, Math.min(d2, 1));
      colors.push(c1.r, c1.g, c1.b, c2.r, c2.g, c2.b);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });

  const gridMesh = new THREE.LineSegments(geometry, material);
  scene.add(gridMesh);

  // ─ Store original positions for wave displacement
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
  const vertexCount = posAttr.count;
  const originalY = new Float32Array(vertexCount); // all zeros initially

  // ─ Resize handling
  function resize() {
    const hero = canvas!.parentElement!;
    const w = hero.clientWidth;
    const h = hero.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  // ─ Wave displacement function
  function waveHeight(x: number, z: number, time: number): number {
    // Layer 1 — slow broad wave
    const w1 = Math.sin(x * 0.15 + time * 0.4) * Math.cos(z * 0.12 + time * 0.3) * 1.2;
    // Layer 2 — perpendicular ripple
    const w2 = Math.sin((x + z) * 0.1 + time * 0.25) * 0.6;
    // Layer 3 — fine detail
    const w3 = Math.sin(x * 0.4 - time * 0.6) * Math.sin(z * 0.35 + time * 0.45) * 0.3;

    return w1 + w2 + w3;
  }

  // ─ Animation loop
  const clock = new THREE.Clock();
  let animFrameId: number;

  function animate() {
    animFrameId = requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();

    // Displace each vertex Y based on its X/Z position
    for (let i = 0; i < vertexCount; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      posAttr.setY(i, originalY[i] + waveHeight(x, z, elapsed));
    }
    posAttr.needsUpdate = true;

    renderer.render(scene, camera);
  }
  animate();

  // ─ Cleanup on page hide (for HMR / SPA navigation)
  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(animFrameId);
    renderer.dispose();
  });
})();

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
