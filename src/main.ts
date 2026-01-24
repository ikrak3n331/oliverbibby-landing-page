import './style.css'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="bg-mesh"></div>
  <div class="hero">
    <h1>Oliver Bibby</h1>
    <p class="subtitle">Creative Vision & Digital Alchemy</p>
    <div class="manifesting">Manifesting soon</div>
  </div>
`

// Optional: Add subtle parallax or interactive elements here
document.addEventListener('mousemove', (e) => {
  const mesh = document.querySelector('.bg-mesh') as HTMLDivElement;
  if (!mesh) return;

  const x = (e.clientX / window.innerWidth) * 20;
  const y = (e.clientY / window.innerHeight) * 20;

  mesh.style.transform = `translate(${-x}px, ${-y}px)`;
});
