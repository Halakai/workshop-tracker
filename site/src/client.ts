// The little the website does in the browser: photo galleries with a full-screen view, the before/after slider,
// and today's opening hours. The pages work without it.
import './site.css';

function track(root: Element): HTMLElement {
  return root.querySelector<HTMLElement>('[data-track]')!;
}

function currentIndex(el: HTMLElement): number {
  return el.clientWidth ? Math.round(el.scrollLeft / el.clientWidth) : 0;
}

function goTo(el: HTMLElement, index: number, smooth = true) {
  el.scrollTo({ left: index * el.clientWidth, behavior: smooth ? 'smooth' : 'instant' });
}

/** Counter, ← → buttons and arrow keys for a scroll-snap strip of photos. */
function wireStrip(root: Element, count: number) {
  const strip = track(root);
  const counter = root.querySelector('[data-counter]');
  // remembered, because a closed dialog has no width to work it out from
  let index = 0;
  const update = () => {
    index = currentIndex(strip);
    if (counter) counter.textContent = `${index + 1} / ${count}`;
  };
  strip.addEventListener('scroll', update, { passive: true });
  root.querySelector('[data-prev]')?.addEventListener('click', () => goTo(strip, Math.max(0, currentIndex(strip) - 1)));
  root.querySelector('[data-next]')?.addEventListener('click', () => goTo(strip, Math.min(count - 1, currentIndex(strip) + 1)));
  return { strip, update, index: () => index };
}

for (const gallery of document.querySelectorAll('[data-gallery]')) {
  const slides = gallery.querySelectorAll<HTMLButtonElement>('[data-open]');
  wireStrip(gallery, slides.length);
  const dialog = gallery.nextElementSibling instanceof HTMLDialogElement ? gallery.nextElementSibling : null;
  if (!dialog) continue;
  const box = wireStrip(dialog, slides.length);
  const load = () => dialog.querySelectorAll<HTMLImageElement>('img[data-src]').forEach((img) => (img.src = img.dataset.src!));

  slides.forEach((slide, i) =>
    slide.addEventListener('click', () => {
      load();
      dialog.showModal();
      document.documentElement.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        goTo(box.strip, i, false);
        box.update();
      });
    }),
  );
  dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    document.documentElement.style.overflow = '';
    goTo(track(gallery), box.index(), false);
  });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') goTo(box.strip, Math.min(slides.length - 1, currentIndex(box.strip) + 1));
    if (e.key === 'ArrowLeft') goTo(box.strip, Math.max(0, currentIndex(box.strip) - 1));
  });
}

for (const compare of document.querySelectorAll<HTMLElement>('[data-compare]')) {
  const range = compare.querySelector<HTMLInputElement>('input[type=range]')!;
  const set = () => compare.style.setProperty('--pos', `${range.value}%`);
  range.addEventListener('input', set);
  set();
}

// Opening hours: mark today's line and say whether the workshop is open now (in the workshop's time zone).
for (const box of document.querySelectorAll<HTMLElement>('[data-hours]')) {
  const hours = JSON.parse(box.dataset.hours!) as { weekday: number; opens: string | null; closes: string | null }[];
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zagreb', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1;
  const now = `${parts.hour}:${parts.minute}`;
  box.querySelectorAll<HTMLElement>('[data-weekdays]').forEach((row) => {
    if (row.dataset.weekdays!.split(' ').includes(String(weekday))) row.classList.add('is-today');
  });
  const today = hours.find((h) => h.weekday === weekday);
  const open = Boolean(today?.opens && today.closes && today.opens <= now && now < today.closes);
  const badge = box.querySelector<HTMLElement>('[data-open-now]');
  if (badge) {
    badge.textContent = open ? box.dataset.openText! : box.dataset.closedText!;
    badge.classList.remove('hidden');
    badge.classList.add(open ? 'is-open' : 'is-closed');
  }
}
