const menuButton = document.querySelector('[data-menu-button]');
const menu = document.querySelector('[data-menu]');
const header = document.querySelector('[data-header]');

function closeMenu() {
  if (!menuButton || !menu) return;
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.querySelector('.sr-only').textContent = 'Open navigation';
  menu.classList.remove('is-open');
  document.body.classList.remove('menu-open');
}

if (menuButton && menu) {
  menuButton.addEventListener('click', () => {
    const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!isOpen));
    menuButton.querySelector('.sr-only').textContent = isOpen ? 'Open navigation' : 'Close navigation';
    menu.classList.toggle('is-open', !isOpen);
    document.body.classList.toggle('menu-open', !isOpen);
  });

  menu.addEventListener('click', event => {
    if (event.target.closest('a')) closeMenu();
  });
}

window.addEventListener('resize', () => {
  if (window.innerWidth > 760) closeMenu();
});

window.addEventListener('scroll', () => {
  header?.classList.toggle('scrolled', window.scrollY > 12);
}, { passive: true });

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const reveals = document.querySelectorAll('.reveal');

if (reducedMotion || !('IntersectionObserver' in window)) {
  reveals.forEach(element => element.classList.add('is-visible'));
} else {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: .12 });
  reveals.forEach(element => observer.observe(element));
}

document.querySelectorAll('[data-year]').forEach(element => {
  element.textContent = String(new Date().getFullYear());
});
