const chapters = [...document.querySelectorAll('[data-chapter]')];
const navigation = [...document.querySelectorAll('[data-nav]')];

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
    if (!visible) return;

    for (const link of navigation) {
      link.classList.toggle('active', link.dataset.nav === visible.target.dataset.chapter);
    }
  }, { rootMargin: '-15% 0px -72% 0px', threshold: [0, 0.2, 0.5] });

  for (const chapter of chapters) observer.observe(chapter);
}