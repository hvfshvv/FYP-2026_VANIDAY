function shiftCarousel(id, dir) {
  const el = document.getElementById(id);
  if (!el) return;
  const card = el.querySelector('.promo-carousel-item');
  const step = card ? (card.offsetWidth + 16) * 2 : 320;
  el.scrollBy({ left: dir * step, behavior: 'smooth' });
}

// Auto-dismiss alerts after 4 seconds
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.alert').forEach(el => {
    setTimeout(() => {
      el.style.transition = 'opacity 0.5s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 500);
    }, 4000);
  });
});
