'use strict';

const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('#site-nav');
const mobile = matchMedia('(max-width: 760px)');
const imageDialog = document.querySelector('#image-dialog');
const imageBox = imageDialog.querySelector('figure');
const imagePagination = imageDialog.querySelector('.image-pagination');
let imageTrigger;
let imageSeries = [];
let imageIndex = 0;
let activeProjection;

function setMenu(open) {
  menu.setAttribute('aria-expanded', String(open));
  menu.textContent = open ? 'Fermer' : 'Menu';
}

function syncMenu() {
  menu.hidden = !mobile.matches;
  if (!mobile.matches) setMenu(false);
}

function restoreFocus(element) {
  if (element?.isConnected) element.focus({preventScroll: true});
}

function stopProjection(returnFocus = false) {
  if (!activeProjection) return;
  const {link, frame, tools, stop, timer} = activeProjection;
  clearTimeout(timer);
  frame.remove();
  link.hidden = false;
  stop.hidden = true;
  tools.textContent = '';
  activeProjection = undefined;
  if (returnFocus) restoreFocus(link);
}

function startProjection(link) {
  const id = link.dataset.play;
  const projection = link.closest('[data-projection]');
  const tools = projection.querySelector('.projection-status');
  const stop = projection.querySelector('.stop-film');
  const frame = document.createElement('iframe');
  frame.title = link.getAttribute('aria-label');
  frame.src = `https://player.vimeo.com/video/${id}?autoplay=1&muted=1&playsinline=1&dnt=1&title=0&byline=0&portrait=0`;
  frame.allow = 'autoplay; fullscreen; picture-in-picture';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';

  stopProjection();
  tools.textContent = 'Ouverture du lecteur Vimeo…';
  const timer = setTimeout(() => {
    tools.textContent = 'Si la projection ne démarre pas, le film reste accessible sur Vimeo.';
  }, 9500);
  activeProjection = {link, frame, tools, stop, timer};
  frame.addEventListener('load', () => {
    clearTimeout(timer);
    tools.textContent = '';
  }, {once: true});
  link.parentElement.append(frame);
  link.hidden = true;
  stop.hidden = false;
  frame.focus({preventScroll: true});
}

function showImage(link) {
  const original = link.querySelector('img');
  const label = link.closest('figure').querySelector('figcaption').innerText;
  const image = document.createElement('img');
  image.src = link.href;
  image.alt = original.alt;
  image.width = original.width;
  image.height = original.height;
  imageDialog.querySelector('#image-title').textContent = label;
  imageBox.replaceChildren(image);
  imagePagination.hidden = imageSeries.length < 2;
  imagePagination.querySelector('p').textContent = `${imageIndex + 1} / ${imageSeries.length}`;
}

function enlarge(link) {
  const series = link.closest('[data-image-series]');
  imageSeries = series ? Array.from(series.querySelectorAll('[data-enlarge]')) : [link];
  imageIndex = imageSeries.indexOf(link);
  imageTrigger = link;
  showImage(link);
  imageDialog.showModal();
  imageDialog.querySelector('.close-image').focus();
}

function stepImage(step) {
  if (imageSeries.length < 2) return;
  imageIndex = (imageIndex + step + imageSeries.length) % imageSeries.length;
  showImage(imageSeries[imageIndex]);
}

function followLegacyRoute() {
  const list = document.querySelector('#legacy-routes');
  if (!list || !location.hash.startsWith('#/')) return;
  const [route, encodedAnchor] = location.hash.slice(2).split('~', 2);
  if (!JSON.parse(list.textContent).includes(route)) return;
  let anchor = '';
  try {
    anchor = decodeURIComponent(encodedAnchor || '');
  } catch {
    return;
  }
  if (!/^[a-z0-9-]*$/.test(anchor)) return;
  const aliases = {main: 'contenu', top: 'haut', reel: 'film-reel'};
  const id = Object.hasOwn(aliases, anchor) ? aliases[anchor] : anchor;
  const hash = id ? `#${id}` : '';
  if (route === 'index.html') {
    history.replaceState(null, '', location.pathname + location.search + hash);
    if (id) document.getElementById(id)?.scrollIntoView();
  } else {
    location.replace(route + hash);
  }
}

syncMenu();
mobile.addEventListener('change', syncMenu);
menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') === 'false'));
nav.addEventListener('click', event => {
  if (event.target.closest('a')) setMenu(false);
});
document.addEventListener('keydown', event => {
  if (imageDialog.open && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && imageSeries.length > 1) {
    event.preventDefault();
    stepImage(event.key === 'ArrowLeft' ? -1 : 1);
  }
  if (event.key === 'Escape' && !imageDialog.open && menu.getAttribute('aria-expanded') === 'true') {
    setMenu(false);
    restoreFocus(menu);
  }
});

document.addEventListener('click', event => {
  const target = event.target;
  if (!nav.contains(target) && !menu.contains(target)) setMenu(false);
  if (target.closest('.stop-film')) {
    stopProjection(true);
    return;
  }
  if (target === imageDialog || target.closest('.close-image')) {
    imageDialog.close();
    return;
  }
  const step = target.closest('[data-image-step]');
  if (step) {
    stepImage(Number(step.dataset.imageStep));
    return;
  }
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = target.closest('a');
  if (!link) return;
  if (/^\d+$/.test(link.dataset.play || '')) {
    event.preventDefault();
    startProjection(link);
  } else if (link.hasAttribute('data-enlarge') && typeof imageDialog.showModal === 'function') {
    event.preventDefault();
    enlarge(link);
  }
});

imageDialog.addEventListener('close', () => {
  imageBox.replaceChildren();
  restoreFocus(imageTrigger);
  imageTrigger = undefined;
  imageSeries = [];
});

if ('IntersectionObserver' in window && matchMedia('(prefers-reduced-motion: no-preference)').matches) {
  const reveal = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-revealed');
      reveal.unobserve(entry.target);
    }
  }, {threshold: .18});
  document.querySelectorAll('[data-reveal]').forEach(element => reveal.observe(element));
}
window.addEventListener('pagehide', () => stopProjection());
window.addEventListener('hashchange', followLegacyRoute);
followLegacyRoute();
