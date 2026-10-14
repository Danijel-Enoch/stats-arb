"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

const KEY = "stats-arb-theme";
const EVENT = "stats-arb-themechange";

/**
 * Three states, as the CSS expects: an explicit choice stamps `data-theme` on
 * <html>, and no choice leaves it unstamped so `prefers-color-scheme` decides.
 *
 * Modelled as an external store rather than effect-synced state — the source of
 * truth really is outside React (localStorage plus the OS media query), and
 * useSyncExternalStore is what that is for.
 */
function read(): Theme {
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // private browsing: fall through to the OS preference
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  window.addEventListener(EVENT, onChange);
  // another tab changed it
  window.addEventListener("storage", onChange);
  return () => {
    mq.removeEventListener("change", onChange);
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, serverSnapshot);

  const setTheme = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // the stamp below still applies for this session
    }
    document.documentElement.dataset.theme = next;
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { theme, setTheme };
}

/** The server cannot know; the pre-paint script in the layout fixes it up. */
function serverSnapshot(): Theme {
  return "dark";
}

/**
 * Runs before first paint so a stored choice never flashes the other theme.
 * Deliberately writes nothing when there is no stored choice, leaving the
 * media query in charge.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  KEY,
)});if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}})()`;
