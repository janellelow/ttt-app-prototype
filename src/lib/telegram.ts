// Thin, typed wrapper around window.Telegram.WebApp (loaded in index.html).

interface TelegramWebApp {
  initData: string;
  version: string;
  ready(): void;
  expand(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  openLink(url: string): void;
  openTelegramLink(url: string): void;
  /** Bot API 8.0+: e.g. "activated" when the mini app comes back from minimised. */
  onEvent?(event: string, cb: () => void): void;
  offEvent?(event: string, cb: () => void): void;
  BackButton: {
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  showConfirm?(message: string, callback: (ok: boolean) => void): void;
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export const tg: TelegramWebApp | undefined =
  typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;

/** True when the page was opened inside Telegram (initData is only set there). */
export const insideTelegram = Boolean(tg && tg.initData);

export function prepareTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor?.("#F7F7F5");
    tg.setBackgroundColor?.("#F7F7F5");
  } catch {
    // older Telegram clients don't support colours; that's fine
  }
}

export function haptic(kind: "tap" | "success" | "error" = "tap") {
  try {
    if (kind === "tap") tg?.HapticFeedback?.impactOccurred("light");
    else tg?.HapticFeedback?.notificationOccurred(kind);
  } catch {
    /* not supported */
  }
}

/** Telegram's own confirm dialog (falls back to the browser's). */
export function confirmAction(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (tg?.showConfirm) return tg.showConfirm(message, (ok) => resolve(ok));
    } catch {
      /* fall through */
    }
    resolve(window.confirm(message));
  });
}

export function openLink(url: string) {
  if (tg) tg.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

export function shareText(text: string) {
  const appLink = import.meta.env.VITE_TELEGRAM_APP_LINK || "https://telegram.org";
  const url = `https://t.me/share/url?url=${encodeURIComponent(appLink)}&text=${encodeURIComponent(text)}`;
  if (tg) tg.openTelegramLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}
