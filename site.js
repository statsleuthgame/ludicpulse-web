const menuButton = document.querySelector('[data-menu-button]');
const menu = document.querySelector('[data-menu]');
const menuParent = menu?.parentNode;
const header = document.querySelector('[data-header]');
const pageRegions = [document.querySelector('main'), document.querySelector('footer')].filter(Boolean);
let menuReturnFocus = null;
let menuScrollY = 0;

function setPageInert(isInert) {
  pageRegions.forEach(region => {
    if (isInert) region.setAttribute('inert', '');
    else region.removeAttribute('inert');
  });
}

function closeMenu({ restoreFocus = false, restoreScroll = true } = {}) {
  if (!menuButton || !menu) return;
  const wasOpen = menuButton.getAttribute('aria-expanded') === 'true';
  if (!wasOpen) return;
  const scrollYToRestore = menuScrollY;
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.querySelector('.sr-only').textContent = 'Open navigation';
  menu.classList.remove('is-open');
  document.body.classList.remove('menu-open');
  document.body.style.top = '';
  setPageInert(false);
  if (restoreFocus) menuReturnFocus?.focus({ preventScroll: true });
  menuReturnFocus = null;
  menuScrollY = 0;
  if (restoreScroll) requestAnimationFrame(() => {
    const previousScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, scrollYToRestore);
    document.documentElement.style.scrollBehavior = previousScrollBehavior;
  });
}

function openMenu() {
  if (!menuButton || !menu) return;
  menuScrollY = window.scrollY;
  menuReturnFocus = document.activeElement;
  document.body.append(menu);
  menuButton.setAttribute('aria-expanded', 'true');
  menuButton.querySelector('.sr-only').textContent = 'Close navigation';
  menu.classList.add('is-open');
  document.body.style.top = `-${menuScrollY}px`;
  document.body.classList.add('menu-open');
  setPageInert(true);
  queueMicrotask(() => menuParent?.append(menu));
  requestAnimationFrame(() => menu.querySelector('a')?.focus());
}

if (menuButton && menu) {
  menuButton.addEventListener('click', () => {
    const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
    if (isOpen) closeMenu({ restoreFocus: true });
    else openMenu();
  });

  menu.addEventListener('click', event => {
    if (event.target.closest('a')) closeMenu({ restoreScroll: false });
  });

  document.addEventListener('keydown', event => {
    if (menuButton.getAttribute('aria-expanded') !== 'true') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu({ restoreFocus: true });
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = [menuButton, ...menu.querySelectorAll('a')];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

window.addEventListener('resize', () => {
  if (window.innerWidth > 760) closeMenu();
});

window.addEventListener('scroll', () => {
  header?.classList.toggle('scrolled', window.scrollY > 12);
}, { passive: true });

document.querySelectorAll('.skip-link').forEach(link => {
  link.addEventListener('click', () => {
    const target = document.querySelector(link.hash);
    requestAnimationFrame(() => target?.focus({ preventScroll: true }));
  });
});

document.querySelectorAll('[data-year]').forEach(element => {
  element.textContent = String(new Date().getFullYear());
});
