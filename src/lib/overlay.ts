// Helpers for pop-ups (FormDrawer): staying above the phone keyboard and closing with the back button.
import { useEffect, useRef, useState, type RefObject } from 'react';

/** True on phones and tablets (finger), false with a mouse. Decided once: it doesn't change while the app runs. */
export const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/**
 * How far the phone keyboard covers the bottom of the screen, and how much screen is left above it.
 * Measured straight from the visual viewport on every change (no guessing whether the keyboard is open),
 * so switching between the letters keyboard and the number pad doesn't make the pop-up jump.
 * When the keyboard changes size, the field you're typing in is scrolled back into view inside `container`.
 */
export function useKeyboardInset(enabled: boolean, container: RefObject<HTMLElement | null>) {
  const [state, setState] = useState({ inset: 0, height: 0 });
  useEffect(() => {
    const vv = window.visualViewport;
    if (!enabled || !vv) return;
    let frame = 0;
    const measure = (reveal: boolean) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        const height = Math.round(vv.height);
        setState((s) => (s.inset === inset && s.height === height ? s : { inset, height }));
        const focused = document.activeElement;
        if (reveal && focused instanceof HTMLElement && container.current?.contains(focused) && focused.matches('input, textarea')) {
          requestAnimationFrame(() => focused.scrollIntoView({ block: 'nearest' }));
        }
      });
    };
    const onResize = () => measure(true);
    const onScroll = () => measure(false);
    measure(false);
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onScroll);
    };
  }, [enabled, container]);
  return state;
}

// ---------------------------------------------------------------------------
// Back button closes the pop-up
// ---------------------------------------------------------------------------
// While a pop-up is open it has its own entry in the browser history (same address, marked in history.state),
// so the phone's back button / gesture removes that entry and closes the pop-up instead of leaving the page.
// Closing it any other way (✕, Save, tap outside) takes the entry away again.

const openSheets = new Set<string>();
let nextSheet = 0;

function sheetInHistory(): string | undefined {
  const state = window.history.state as { sheet?: unknown } | null;
  return typeof state?.sheet === 'string' ? state.sheet : undefined;
}

if (typeof window !== 'undefined') {
  // landed on the entry of a pop-up that isn't open any more (e.g. went back to a page that was left from
  // inside a pop-up): skip it, so one press of back always does something visible
  window.addEventListener('popstate', () => {
    const sheet = sheetInHistory();
    if (sheet && !openSheets.has(sheet)) window.history.back();
  });
}

export function useBackToClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!open) return;
    const id = `sheet-${++nextSheet}`;
    openSheets.add(id);
    let pushed = false;
    // a tick later, so React's double run of effects in development doesn't add and remove entries
    const timer = window.setTimeout(() => {
      window.history.pushState({ ...(window.history.state ?? {}), sheet: id }, '');
      pushed = true;
    }, 0);
    const onPop = () => {
      if (!pushed || sheetInHistory() === id) return; // a pop-up on top of this one closed
      pushed = false;
      closeRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('popstate', onPop);
      openSheets.delete(id);
      if (pushed && sheetInHistory() === id) window.history.back();
    };
  }, [open]);
}
