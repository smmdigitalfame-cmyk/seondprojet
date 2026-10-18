// Telegram Mini App helpers
// Docs: https://core.telegram.org/bots/webapps

interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TgWebApp {
  initData: string;
  initDataUnsafe: {
    user?: TgUser;
    start_param?: string;
  };
  ready: () => void;
  expand: () => void;
  close: () => void;
  openLink: (url: string) => void;
  openTelegramLink: (url: string) => void;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  MainButton: {
    setText: (t: string) => void;
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy") => void;
    notificationOccurred: (type: "success" | "error" | "warning") => void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export function getWebApp(): TgWebApp | null {
  return typeof window !== "undefined" ? window.Telegram?.WebApp ?? null : null;
}

export function isInTelegram(): boolean {
  const tg = getWebApp();
  // initData empty => loaded outside Telegram (e.g. plain browser)
  return !!(tg && tg.initData && tg.initData.length > 0);
}

export function getTelegramUser(): TgUser | null {
  return getWebApp()?.initDataUnsafe?.user ?? null;
}

export function getTelegramChatId(): string {
  const u = getTelegramUser();
  return u?.id ? String(u.id) : "";
}

export function initTelegramApp() {
  const tg = getWebApp();
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    if (tg.colorScheme === "dark") {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {
    console.warn("Telegram init failed", e);
  }
}