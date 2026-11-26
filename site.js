'use strict';

const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('#site-nav');
const mobile = matchMedia('(max-width: 760px)');
const imageDialog = document.querySelector('#image-dialog');
const imageBox = imageDialog.querySelector('figure');
const imagePagination = imageDialog.querySelector('.image-pagination');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let imageTrigger;
let imageSeries = [];
let imageIndex = 0;
let activeProjection;
const stoppedByViewer = new WeakSet();

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
  if (returnFocus) {
    stoppedByViewer.add(link);
    restoreFocus(link);
  }
}

function startProjection(link, automatic = false) {
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
  if (!automatic) tools.textContent = 'Ouverture du lecteur Vimeo…';
  const timer = setTimeout(() => {
    tools.textContent = 'Si la projection ne démarre pas, le film reste accessible sur Vimeo.';
  }, 9500);
  activeProjection = {link, frame, tools, stop, timer, automatic};
  frame.addEventListener('load', () => {
    clearTimeout(timer);
    tools.textContent = '';
  }, {once: true});
  link.parentElement.append(frame);
  link.hidden = true;
  stop.hidden = false;
  if (!automatic) {
    stoppedByViewer.delete(link);
    frame.focus({preventScroll: true});
  }
}

function setUpScrollPlayback(screens) {
  const viewportTop = 58;
  const startAt = .55;
  const visibility = new Map();
  let scrolledPastTop = false;
  let pendingStart;

  function canAutoplay() {
    return scrolledPastTop && window.scrollY > 0 && !reducedMotion.matches && !document.hidden && !imageDialog.open
      && menu.getAttribute('aria-expanded') !== 'true';
  }

  function updatePlayback() {
    clearTimeout(pendingStart);
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    if (activeProjection) {
      const {link, automatic} = activeProjection;
      if (automatic && !canAutoplay()) stopProjection();
      else if ((visibility.get(link) ?? 1) < .25) stopProjection();
      else return;
    }
    if (!canAutoplay()) return;

    let candidate;
    let mostVisible = startAt;
    for (const [link, visible] of visibility) {
      if (visible < mostVisible || stoppedByViewer.has(link) || document.activeElement === link) continue;
      candidate = link;
      mostVisible = visible;
    }
    if (!candidate) return;
    pendingStart = setTimeout(() => {
      const bounds = candidate.parentElement.getBoundingClientRect();
      const visibleHeight = Math.min(window.innerHeight, bounds.bottom) - Math.max(viewportTop, bounds.top);
      if (!activeProjection && canAutoplay() && document.activeElement !== candidate
        && visibleHeight >= startAt * Math.min(bounds.height, window.innerHeight - viewportTop)) {
        startProjection(candidate, true);
      }
    }, 300);
  }

  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const link = entry.target.querySelector('[data-play]');
      const screenHeight = Math.min(entry.boundingClientRect.height, entry.rootBounds?.height ?? window.innerHeight);
      const visible = screenHeight > 0 ? entry.intersectionRect.height / screenHeight : 0;
      visibility.set(link, visible);
    }
    updatePlayback();
  }, {rootMargin: `-${viewportTop}px 0px 0px`, threshold: [0, .15, .25, .35, .45, .55, .65, .8, 1]});
  screens.forEach(screen => observer.observe(screen));

  window.addEventListener('scroll', () => {
    const pastTop = window.scrollY > 0;
    if (pastTop === scrolledPastTop) return;
    scrolledPastTop = pastTop;
    updatePlayback();
  }, {passive: true});
  document.addEventListener('visibilitychange', updatePlayback);
  document.addEventListener('fullscreenchange', updatePlayback);
  reducedMotion.addEventListener('change', updatePlayback);
  imageDialog.addEventListener('close', updatePlayback);
}

function showImage(link) {
  const original = link.querySelector('img');
  const caption = link.closest('figure').querySelector('figcaption');
  const label = [...caption.children].map(part => part.textContent).join(' · ');
  const image = document.createElement('img');
  image.src = link.href;
  image.alt = original.alt;
  image.width = Number(original.getAttribute('width'));
  image.height = Number(original.getAttribute('height'));
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

const bookMontages = new WeakMap();

function playBookMontage(pages, incoming, outgoing, forward = true) {
  const easing = getComputedStyle(pages).getPropertyValue('--ease-out').trim();
  const timing = {easing, fill: 'both'};
  const animations = [];
  let layer;

  if (outgoing) {
    const fromHeight = outgoing.offsetHeight;
    layer = outgoing.cloneNode(true);
    layer.removeAttribute('id');
    layer.removeAttribute('data-book-spread');
    layer.removeAttribute('data-book-dissolve');
    layer.setAttribute('aria-hidden', 'true');
    layer.inert = true;
    layer.classList.add('book-montage-previous');
    layer.style.height = `${fromHeight}px`;
    layer.querySelectorAll('[data-enlarge]').forEach(link => link.removeAttribute('data-enlarge'));
    layer.querySelectorAll('.book-dissolve-frame').forEach(frame => frame.remove());
    outgoing.hidden = true;
    incoming.hidden = false;
    pages.append(layer);
    animations.push(layer.animate([{opacity: 1}, {opacity: 0}], {duration: 115, fill: 'both'}));

    const toHeight = incoming.offsetHeight;
    if (fromHeight !== toHeight) {
      animations.push(pages.animate([
        {height: `${fromHeight}px`},
        {height: `${toHeight}px`},
      ], {...timing, delay: 35, duration: 365}));
    }
  }

  const firstPhoto = incoming.querySelector('.book-figure:not(.book-figure--drawing)');
  incoming.querySelectorAll('.book-figure').forEach(figure => {
    if (figure === firstPhoto) {
      animations.push(figure.querySelector('.enlarge').animate([
        {transform: `translateX(${forward ? -105 : 105}%)`},
        {transform: 'none'},
      ], {...timing, delay: 65, duration: 440}));
    } else {
      animations.push(figure.animate([
        {transform: 'translateY(85%)', opacity: 0},
        {transform: 'none', opacity: 1},
      ], {...timing, delay: firstPhoto ? 230 : 65, duration: 350}));
    }
  });
  incoming.querySelectorAll('.book-leaf h5, .book-leaf--text p').forEach(text => {
    animations.push(text.animate([
      {transform: 'translateY(-15px)', opacity: 0},
      {transform: 'none', opacity: 1},
    ], {...timing, delay: 130, duration: 275}));
  });

  const montage = {
    finished: Promise.allSettled(animations.map(animation => animation.finished)).then(finish),
    cancel: finish,
  };
  bookMontages.set(pages, montage);
  pages.classList.add('is-book-montage');

  function finish() {
    if (bookMontages.get(pages) !== montage) return;
    bookMontages.delete(pages);
    animations.forEach(animation => animation.cancel());
    layer?.remove();
    pages.classList.remove('is-book-montage');
  }
}

function prepareBook(book) {
  const pages = book.querySelector('.book-pages');
  const spreads = [...pages.querySelectorAll('[data-book-spread]')];
  const navigation = book.querySelector('.book-navigation');
  const controls = book.querySelector('.book-controls');
  const rail = navigation.querySelector('.book-thumbnails');
  const thumbnails = [...rail.querySelectorAll('[data-book-index]')];
  const previous = controls.querySelector('[data-book-step="-1"]');
  const next = controls.querySelector('[data-book-step="1"]');
  const count = controls.querySelector('.book-count');
  let current = -1;
  let touchStart;

  function turnTo(index) {
    if (index < 0 || index >= spreads.length || index === current) return;
    const outgoing = spreads[current];
    bookMontages.get(pages)?.cancel();
    if (outgoing && !reducedMotion.matches && typeof outgoing.animate === 'function') {
      playBookMontage(pages, spreads[index], outgoing, index > current);
    } else {
      spreads.forEach((spread, position) => { spread.hidden = position !== index; });
    }
    current = index;
    thumbnails.forEach((thumbnail, position) => {
      if (position === index) thumbnail.setAttribute('aria-current', 'page');
      else thumbnail.removeAttribute('aria-current');
    });
    previous.setAttribute('aria-disabled', String(index === 0));
    next.setAttribute('aria-disabled', String(index === spreads.length - 1));
    count.textContent = (index + 1) + ' / ' + spreads.length;

    if (!outgoing) return;
    const bounds = rail.getBoundingClientRect();
    const thumbnail = thumbnails[index].getBoundingClientRect();
    const shift = thumbnail.left < bounds.left ? thumbnail.left - bounds.left
      : thumbnail.right > bounds.right ? thumbnail.right - bounds.right : 0;
    if (shift) rail.scrollBy({left: shift, behavior: reducedMotion.matches ? 'auto' : 'smooth'});
  }

  reducedMotion.addEventListener('change', () => bookMontages.get(pages)?.cancel());
  book.addEventListener('click', event => {
    const button = event.target.closest('[data-book-index], [data-book-step]');
    if (!button) return;
    turnTo(button.hasAttribute('data-book-index') ? Number(button.dataset.bookIndex) : current + Number(button.dataset.bookStep));
  });
  book.addEventListener('keydown', event => {
    if (!event.target.closest('.book-navigation, .book-controls')) return;
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    turnTo(current + (event.key === 'ArrowRight' ? 1 : -1));
    if (event.target.hasAttribute('data-book-index')) restoreFocus(thumbnails[current]);
  });
  pages.addEventListener('touchstart', event => {
    touchStart = event.touches.length === 1 ? event.changedTouches[0] : undefined;
  }, {passive: true});
  pages.addEventListener('touchcancel', () => { touchStart = undefined; });
  pages.addEventListener('touchend', event => {
    if (!touchStart) return;
    const point = event.changedTouches[0];
    const dx = point.clientX - touchStart.clientX;
    const dy = point.clientY - touchStart.clientY;
    touchStart = undefined;
    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (event.cancelable) event.preventDefault();
    turnTo(current + (dx < 0 ? 1 : -1));
  }, {passive: false});

  turnTo(0);
  navigation.hidden = spreads.length === 1;
  controls.hidden = spreads.length === 1;
}

const filmBooks = document.querySelectorAll('[data-film-book]');
filmBooks.forEach(prepareBook);
if (filmBooks.length && 'IntersectionObserver' in window) {
  const upcomingBooks = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.querySelectorAll('.book-thumbnail img').forEach(image => { image.loading = 'eager'; });
      upcomingBooks.unobserve(entry.target);
    }
  }, {rootMargin: '350px 0px'});
  filmBooks.forEach(book => upcomingBooks.observe(book));
}

function setUpCoverPush(image) {
  let frame = 0;
  let previous = -1;
  const progress = () => Math.max(0, Math.min(1, window.scrollY / 360));
  function update() {
    frame = 0;
    previous = progress();
    image.style.setProperty('--cover-progress', previous);
  }
  window.addEventListener('scroll', () => {
    if (!frame && !reducedMotion.matches && progress() !== previous) frame = requestAnimationFrame(update);
  }, {passive: true});
  update();
}

async function dissolveBookStill(photo) {
  const spread = photo.closest('[data-book-dissolve]');
  const drawing = spread.querySelector('.book-figure--drawing .enlarge img');
  const overlay = new Image();
  overlay.className = 'book-dissolve-frame';
  overlay.alt = '';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.src = drawing.currentSrc || drawing.src;
  try {
    await Promise.all([photo.decode(), overlay.decode(), bookMontages.get(spread.parentElement)?.finished]);
  } catch {
    return;
  }
  const bounds = photo.getBoundingClientRect();
  if (spread.hidden || reducedMotion.matches || bounds.bottom <= 0 || bounds.top >= window.innerHeight) return;
  photo.after(overlay);
  const fade = overlay.animate([{opacity: 1}, {opacity: 1, offset: .16}, {opacity: 0}], {
    duration: mobile.matches ? 360 : 420,
    easing: 'linear',
  });
  fade.finished.then(() => overlay.remove(), () => overlay.remove());
}

function setUpBookMotion() {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const target = entry.target;
      const isPhoto = target instanceof HTMLImageElement;
      if (!entry.isIntersecting || entry.intersectionRatio < (isPhoto ? .25 : .08)) continue;
      observer.unobserve(target);
      if (reducedMotion.matches) continue;
      if (isPhoto) {
        dissolveBookStill(target);
        continue;
      }
      const spread = target.querySelector('[data-book-spread]:not([hidden])');
      if (spread && !bookMontages.has(target) && typeof spread.animate === 'function') playBookMontage(target, spread);
    }
  }, {threshold: [.08, .25]});
  const dissolvePhotos = '[data-book-dissolve] .book-figure:not(.book-figure--drawing) .enlarge > img';
  document.querySelectorAll(`.book-pages, ${dissolvePhotos}`).forEach(element => observer.observe(element));
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
    if (activeProjection?.automatic) stopProjection();
    enlarge(link);
  }
});

imageDialog.addEventListener('close', () => {
  imageBox.replaceChildren();
  restoreFocus(imageTrigger);
  imageTrigger = undefined;
  imageSeries = [];
});

const coverImage = document.querySelector('.cover-picture img');
if (coverImage && !reducedMotion.matches) setUpCoverPush(coverImage);

const scrollScreens = document.querySelectorAll('[data-scroll-play]');
if (scrollScreens.length && 'IntersectionObserver' in window) setUpScrollPlayback(scrollScreens);

if ('IntersectionObserver' in window && !reducedMotion.matches) {
  if (filmBooks.length) setUpBookMotion();
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
