function shiftCarousel(id, dir) {
  const el = document.getElementById(id);
  if (!el) return;
  const card = el.querySelector('.promo-carousel-item');
  const multiplier = el.classList.contains('deal-showcase-carousel') ? 1 : 2;
  const gap = parseFloat(getComputedStyle(el).columnGap || getComputedStyle(el).gap || 0) || 0;
  const step = card ? (card.offsetWidth + gap) * multiplier : 320;
  el.scrollBy({ left: dir * step, behavior: 'smooth' });
}

function initDealCarouselDots() {
  document.querySelectorAll('.deal-showcase-carousel').forEach(carousel => {
    const slides = Array.from(carousel.querySelectorAll('.promo-carousel-item'));
    const dots = Array.from(document.querySelectorAll(`[data-carousel-dot="${carousel.id}"]`));
    if (!slides.length || !dots.length) return;

    const setActiveDot = index => {
      dots.forEach((dot, dotIndex) => {
        dot.classList.toggle('active', dotIndex === index);
        dot.setAttribute('aria-current', dotIndex === index ? 'true' : 'false');
      });
    };

    dots.forEach(dot => {
      dot.addEventListener('click', () => {
        const index = Number(dot.dataset.slideIndex || 0);
        const slide = slides[index];
        if (!slide) return;
        carousel.scrollTo({ left: slide.offsetLeft - carousel.offsetLeft, behavior: 'smooth' });
        setActiveDot(index);
      });
    });

    carousel.addEventListener('scroll', () => {
      const center = carousel.scrollLeft + carousel.clientWidth / 2;
      let activeIndex = 0;
      let nearestDistance = Infinity;

      slides.forEach((slide, index) => {
        const slideCenter = slide.offsetLeft - carousel.offsetLeft + slide.offsetWidth / 2;
        const distance = Math.abs(center - slideCenter);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          activeIndex = index;
        }
      });

      setActiveDot(Math.min(activeIndex, dots.length - 1));
    }, { passive: true });
  });
}

// Auto-dismiss alerts after 4 seconds
document.addEventListener('DOMContentLoaded', () => {
  initDealCarouselDots();

  document.querySelectorAll('.alert').forEach(el => {
    setTimeout(() => {
      el.style.transition = 'opacity 0.5s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 500);
    }, 4000);
  });
});
