import React, { useEffect, useState } from "react";
import { Download, MoreVertical, Share, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Snoozed, not silenced: the prompt returns after this long. */
const SNOOZE_KEY = "chetu_install_snoozed_until";
const SNOOZE_HOURS = 12;

type Platform = "prompt" | "ios" | "android-manual" | "desktop-manual";

/**
 * Install prompt for the Chetu app.
 *
 * Staff are meant to run this from their home screen, so the prompt is a
 * centred dialog rather than a corner toast, and "Not now" snoozes it for
 * twelve hours instead of dismissing it forever.
 *
 * A browser only fires `beforeinstallprompt` when it considers the app
 * installable, and never on iOS. Where that event does not arrive, this falls
 * back to showing the manual steps for the platform in question, so the prompt
 * appears either way.
 *
 * There is always a way past it. A blocking dialog would lock out anyone whose
 * browser cannot install a web app at all, which is not a trade worth making.
 */
export const InstallAppPrompt: React.FC = () => {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    // Already installed — never ask again.
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return undefined;

    const snoozedUntil = Number(localStorage.getItem(SNOOZE_KEY) || 0);
    if (Date.now() < snoozedUntil) return undefined;

    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setPlatform("prompt");
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const onInstalled = () => {
      localStorage.removeItem(SNOOZE_KEY);
      setVisible(false);
    };
    window.addEventListener("appinstalled", onInstalled);

    // iOS never fires the event, so show its steps immediately. On everything
    // else, wait a moment: if the event has not arrived by then it is not
    // coming, and manual instructions are the only thing left to offer.
    let timer: number | undefined;
    if (isIos) {
      setPlatform("ios");
      setVisible(true);
    } else {
      timer = window.setTimeout(() => {
        setDeferred((current) => {
          if (!current) {
            setPlatform(isAndroid ? "android-manual" : "desktop-manual");
            setVisible(true);
          }
          return current;
        });
      }, 3500);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const snooze = () => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_HOURS * 3600000));
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
    // Declining is not a permanent answer either.
    if (outcome === "dismissed") snooze();
  };

  if (!visible || !platform) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/60 p-4 sm:items-center">
      <div className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="relative bg-[#0B4394] px-5 pb-5 pt-6 text-center text-white">
          <button
            type="button"
            onClick={snooze}
            aria-label="Not now"
            className="absolute right-3 top-3 rounded p-1.5 text-blue-100 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-white">
            <img src="/icon-192.png" alt="" className="h-11 w-11 rounded-lg" />
          </span>
          <h2 className="text-lg font-bold leading-tight">Install Chetu Microfinance</h2>
          <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-blue-100">
            Add it to your home screen to open it like any other app — full screen, one tap, no
            browser bar in the way.
          </p>
        </div>

        <div className="p-5">
          {platform === "prompt" && (
            <button
              type="button"
              onClick={install}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#0B4394] text-[15px] font-semibold text-white hover:bg-[#093672]"
            >
              <Download className="h-4.5 w-4.5" />
              Install app
            </button>
          )}

          {platform === "ios" && (
            <ol className="space-y-2.5 text-[13px] text-slate-700">
              <Step n={1}>
                Tap <Share className="mx-0.5 inline h-4 w-4 align-text-bottom text-[#0B4394]" />
                <b>Share</b> at the bottom of Safari.
              </Step>
              <Step n={2}>
                Scroll down and tap <b>Add to Home Screen</b>.
              </Step>
              <Step n={3}>
                Tap <b>Add</b>. Chetu then opens from your home screen.
              </Step>
            </ol>
          )}

          {platform === "android-manual" && (
            <ol className="space-y-2.5 text-[13px] text-slate-700">
              <Step n={1}>
                Tap{" "}
                <MoreVertical className="mx-0.5 inline h-4 w-4 align-text-bottom text-[#0B4394]" />
                in the browser toolbar.
              </Step>
              <Step n={2}>
                Tap <b>Install app</b>, or <b>Add to Home screen</b>.
              </Step>
              <Step n={3}>Confirm. Chetu then opens from your home screen.</Step>
            </ol>
          )}

          {platform === "desktop-manual" && (
            <ol className="space-y-2.5 text-[13px] text-slate-700">
              <Step n={1}>Look for the install icon at the right-hand end of the address bar.</Step>
              <Step n={2}>
                Or open the browser menu and choose <b>Install Chetu Microfinance</b>.
              </Step>
              <Step n={3}>Confirm, and it opens in its own window.</Step>
            </ol>
          )}

          <button
            type="button"
            onClick={snooze}
            className="mt-3 h-11 w-full rounded-lg text-[13px] font-semibold text-slate-500 hover:bg-slate-50"
          >
            Not now
          </button>
          <p className="mt-1 text-center text-[11px] text-slate-400">
            You will be reminded again later today.
          </p>
        </div>
      </div>
    </div>
  );
};

const Step: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <li className="flex gap-2.5">
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0B4394]/10 text-[11px] font-bold text-[#0B4394]">
      {n}
    </span>
    <span className="leading-relaxed">{children}</span>
  </li>
);
