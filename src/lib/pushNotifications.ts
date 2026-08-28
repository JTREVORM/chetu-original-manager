/**
 * Device notifications.
 *
 * Alerts are shown through the service worker registration rather than the
 * `new Notification()` constructor, because Android Chrome refuses the
 * constructor outright — on a phone, which is where staff actually work, it is
 * the only route that displays anything.
 *
 * Scope: this delivers alerts while the app is open or backgrounded (an
 * installed PWA counts as backgrounded). Waking a fully closed app needs the
 * Push API with a VAPID key pair and a server that can post to the browser
 * vendors' push services — that is a backend change, not a client one.
 */

const ASKED_KEY = "chetu_push_prompt_answered";

export const pushSupported = (): boolean =>
  typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;

export const pushPermission = (): NotificationPermission | "unsupported" =>
  pushSupported() ? Notification.permission : "unsupported";

/** Whether we have already put the question to this person on this device. */
export const pushPromptAnswered = (): boolean => {
  try {
    return window.localStorage.getItem(ASKED_KEY) === "yes";
  } catch {
    return false;
  }
};

export const markPushPromptAnswered = (): void => {
  try {
    window.localStorage.setItem(ASKED_KEY, "yes");
  } catch {
    /* private mode — we simply ask again next time */
  }
};

/**
 * Ask the browser for permission. Must be called from a user gesture: Chrome
 * and Safari both ignore a request that is not tied to a click.
 */
export const requestPushPermission = async (): Promise<NotificationPermission | "unsupported"> => {
  if (!pushSupported()) return "unsupported";
  markPushPromptAnswered();
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
};

export interface DeviceAlert {
  title: string;
  message: string;
  /** Where tapping the alert should take the user. */
  link_url?: string | null;
  /** Collapses repeats of the same record into one alert. */
  tag?: string;
}

/** Show one alert on the device. Never throws — an alert must not break a flow. */
export const showDeviceNotification = async (alert: DeviceAlert): Promise<void> => {
  if (!pushSupported() || Notification.permission !== "granted") return;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(alert.title, {
      body: alert.message,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: alert.tag,
      // The phone should buzz: staff are in the field, not watching a screen.
      vibrate: [120, 60, 120],
      data: { url: alert.link_url || "/" },
    } as NotificationOptions);
  } catch {
    /* a failed alert must never interrupt the app */
  }
};
