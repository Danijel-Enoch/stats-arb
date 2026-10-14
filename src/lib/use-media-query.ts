"use client";

import { useSyncExternalStore } from "react";

/**
 * Media queries as an external store — the browser owns the value, so there is
 * nothing for React to own. The server snapshot assumes desktop, and the first
 * client render corrects it.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Tailwind's lg breakpoint — where the workspace splits into two panes. */
export function useIsCompact(): boolean {
  return useMediaQuery("(max-width: 1023.98px)");
}
