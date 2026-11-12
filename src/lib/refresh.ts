import { useEffect, useRef } from "react";
import { tg } from "./telegram";

/** How often an open screen re-checks for changes made elsewhere. */
export const REFRESH_EVERY_MS = 30_000;

/**
 * Keeps a screen up to date with changes made somewhere else, for example a
 * Head of Department editing the roadmap in the web console while a trainee
 * has the mini app open. Calls `reload`:
 *   - as soon as the app comes back to the foreground (Telegram "activated",
 *     tab focus, or the page becoming visible), and
 *   - every 30 seconds while it is on screen.
 * `reload` should keep showing the old data until the new data arrives.
 */
export function useAutoRefresh(reload: () => unknown, enabled = true) {
  const latest = useRef(reload);
  latest.current = reload;

  useEffect(() => {
    if (!enabled) return;
    let running = false;
    const run = () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      Promise.resolve()
        .then(() => latest.current())
        .catch(() => {
          /* the screen shows its own errors; try again next time */
        })
        .finally(() => {
          running = false;
        });
    };
    document.addEventListener("visibilitychange", run);
    window.addEventListener("focus", run);
    tg?.onEvent?.("activated", run);
    const timer = window.setInterval(run, REFRESH_EVERY_MS);
    return () => {
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("focus", run);
      tg?.offEvent?.("activated", run);
      window.clearInterval(timer);
    };
  }, [enabled]);
}
