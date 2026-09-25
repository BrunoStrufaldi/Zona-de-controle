import { useCallback, useSyncExternalStore } from "react";

/** Acompanha uma media query CSS (ex.: "(max-width: 1023px)"). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mediaQueryList = window.matchMedia(query);
      mediaQueryList.addEventListener("change", onChange);
      return () => {
        mediaQueryList.removeEventListener("change", onChange);
      };
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Janelas mais estreitas que o breakpoint `lg` do Tailwind (1024px). */
export const COMPACT_LAYOUT_QUERY = "(max-width: 1023px)";
