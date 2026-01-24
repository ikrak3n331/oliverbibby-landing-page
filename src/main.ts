import './style.css'
import gsap from 'gsap'

// Initialize Animations
document.addEventListener('DOMContentLoaded', () => {
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

  // 1. Staggered Text Reveal
  // Items slide up slightly and fade in
  tl.fromTo('.reveal-text',
    {
      y: 30,
      opacity: 0
    },
    {
      y: 0,
      opacity: 1,
      duration: 1.2,
      stagger: 0.15
    }
  );

  // 2. Graceful Image Entry
  // The image fades in and moves up slightly slower to create depth
  tl.fromTo('.hero-image',
    {
      y: 100,
      opacity: 0,
      scale: 1.05
    },
    {
      y: 0,
      opacity: 1,
      scale: 1,
      duration: 2.0,
      ease: 'power2.out'
    },
    '-=1.0' // Start overlapping with text animation
  );
});
