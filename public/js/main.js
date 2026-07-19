function shiftCarousel(id, dir) {
  const el = document.getElementById(id);
  if (!el) return;

  if (el.classList.contains('deal-showcase-carousel')) {
    const slides = Array.from(el.querySelectorAll('.promo-carousel-item'));
    if (!slides.length) return;
    const currentIndex = getActiveDealSlideIndex(el, slides);
    const nextIndex = (currentIndex + dir + slides.length) % slides.length;
    scrollDealCarouselToIndex(el, slides, nextIndex);
    el.dispatchEvent(new CustomEvent('dealCarouselManualAdvance', { detail: { index: nextIndex } }));
    return;
  }

  const card = el.querySelector('.promo-carousel-item');
  const gap = parseFloat(getComputedStyle(el).columnGap || getComputedStyle(el).gap || 0) || 0;
  const step = card ? (card.offsetWidth + gap) * 2 : 320;
  el.scrollBy({ left: dir * step, behavior: 'smooth' });
}

function getDealSlideLeft(carousel, slide) {
  return Math.max(0, slide.offsetLeft - carousel.offsetLeft);
}

function getActiveDealSlideIndex(carousel, slides) {
  const center = carousel.scrollLeft + carousel.clientWidth / 2;
  let activeIndex = 0;
  let nearestDistance = Infinity;

  slides.forEach((slide, index) => {
    const slideCenter = getDealSlideLeft(carousel, slide) + slide.offsetWidth / 2;
    const distance = Math.abs(center - slideCenter);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      activeIndex = index;
    }
  });

  return activeIndex;
}

function scrollDealCarouselToIndex(carousel, slides, index) {
  const slide = slides[index];
  if (!slide) return;
  carousel.scrollTo({ left: getDealSlideLeft(carousel, slide), behavior: 'smooth' });
}

function initDealCarouselDots() {
  document.querySelectorAll('.deal-showcase-carousel').forEach(carousel => {
    const slides = Array.from(carousel.querySelectorAll('.promo-carousel-item'));
    const dots = Array.from(document.querySelectorAll(`[data-carousel-dot="${carousel.id}"]`));
    if (!slides.length || !dots.length) return;
    let activeIndex = getActiveDealSlideIndex(carousel, slides);
    let scrollTicking = false;
    let autoplayTimer = null;

    const setActiveDot = index => {
      activeIndex = Math.min(index, slides.length - 1);
      dots.forEach((dot, dotIndex) => {
        const isActive = dotIndex === activeIndex;
        dot.classList.toggle('active', isActive);
        dot.setAttribute('aria-current', isActive ? 'true' : 'false');
      });
    };

    const goToSlide = index => {
      const safeIndex = (index + slides.length) % slides.length;
      scrollDealCarouselToIndex(carousel, slides, safeIndex);
      setActiveDot(safeIndex);
    };

    const restartAutoplay = () => {
      if (autoplayTimer) {
        window.clearInterval(autoplayTimer);
      }
      if (slides.length <= 1) return;

      autoplayTimer = window.setInterval(() => {
        if (document.hidden) return;
        goToSlide(activeIndex + 1);
      }, 3000);
    };

    dots.forEach(dot => {
      dot.addEventListener('click', () => {
        const index = Number(dot.dataset.slideIndex || 0);
        goToSlide(index);
        restartAutoplay();
      });
    });

    carousel.addEventListener('scroll', () => {
      if (scrollTicking) return;
      scrollTicking = true;

      window.requestAnimationFrame(() => {
        setActiveDot(getActiveDealSlideIndex(carousel, slides));
        scrollTicking = false;
      });
    }, { passive: true });

    carousel.addEventListener('dealCarouselManualAdvance', event => {
      setActiveDot(Number(event.detail?.index || 0));
      restartAutoplay();
    });

    setActiveDot(activeIndex);
    restartAutoplay();
  });
}

// Auto-dismiss alerts after 4 seconds
document.addEventListener('DOMContentLoaded', () => {
  initDealCarouselDots();

  document.querySelectorAll('.alert:not([data-persist])').forEach(el => {
    setTimeout(() => {
      el.style.transition = 'opacity 0.5s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 500);
    }, 4000);
  });
});
