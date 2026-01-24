import './style.css'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="bg-gradient">
    <div class="shifting-blob blob-1"></div>
    <div class="shifting-blob blob-2"></div>
  </div>
  <div class="hero">
    <h1>Oliver Bibby</h1>
    <p class="subtitle">Design & Future Manifestation</p>
    <div class="status-tag">Coming Soon</div>
  </div>
`

// Subtle mouse interactivity for the "shifting" blobs
document.addEventListener('mousemove', (e) => {
  const blobs = document.querySelectorAll('.shifting-blob');
  const x = (e.clientX / window.innerWidth - 0.5) * 40;
  const y = (e.clientY / window.innerHeight - 0.5) * 40;

  blobs.forEach((blob, index) => {
    const factor = (index + 1) * 0.5;
    (blob as HTMLElement).style.transform = `translate(${x * factor}px, ${y * factor}px)`;
  });
});
