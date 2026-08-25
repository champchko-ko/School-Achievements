'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Download, Share2, SquarePlus, X } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISSAL_KEY = 'school-achievements-pwa-dismissed';

export default function PwaInstallPrompt() {
  const pathname = usePathname();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [wasDismissed, setWasDismissed] = useState(true);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const updateStandalone = () => setIsStandalone(standaloneQuery.matches || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));

    updateStandalone();
    standaloneQuery.addEventListener('change', updateStandalone);

    const userAgent = window.navigator.userAgent;
    setIsIos(
      /iphone|ipad|ipod/i.test(userAgent) ||
      (userAgent.includes('Macintosh') && window.navigator.maxTouchPoints > 1)
    );
    setWasDismissed(window.localStorage.getItem(DISMISSAL_KEY) === 'true');

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setWasDismissed(false);
    };

    const handleAppInstalled = () => {
      setInstallEvent(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
        console.error('Service worker registration failed:', error);
      });
    }

    return () => {
      standaloneQuery.removeEventListener('change', updateStandalone);
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    window.localStorage.setItem(DISMISSAL_KEY, 'true');
    setWasDismissed(true);
    setShowIosGuide(false);
  }, []);

  const install = useCallback(async () => {
    if (!installEvent) return;

    await installEvent.prompt();
    const choice = await installEvent.userChoice;

    if (choice.outcome === 'accepted') {
      setWasDismissed(true);
    }

    setInstallEvent(null);
  }, [installEvent]);

  if (
    pathname === '/intro' ||
    pathname === '/kiosk' ||
    pathname === '/maintenance' ||
    isStandalone ||
    wasDismissed ||
    (!installEvent && !isIos)
  ) {
    return null;
  }

  return (
    <>
      <button
        onClick={isIos ? () => setShowIosGuide(true) : install}
        className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full bg-yellow-400 px-4 py-3 text-sm font-black text-purple-900 shadow-xl transition hover:bg-yellow-300 print:hidden"
        aria-label="Install School Achievements"
      >
        <Download size={18} />
        Install App
      </button>

      {showIosGuide && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 print:hidden">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black">Add School Achievements</h2>
                <p className="mt-1 text-sm text-slate-600">أضف التطبيق إلى شاشتك الرئيسية على iPhone أو iPad.</p>
              </div>
              <button onClick={dismiss} aria-label="Close install guide" className="rounded-full p-1 text-slate-500 hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>

            <ol className="mt-5 space-y-3 text-sm font-medium">
              <li className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                <Share2 size={22} className="shrink-0 text-purple-700" />
                Tap the Safari <span className="font-black">Share</span> button.
              </li>
              <li className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                <SquarePlus size={22} className="shrink-0 text-purple-700" />
                Choose <span className="font-black">Add to Home Screen</span>.
              </li>
              <li className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                <Download size={22} className="shrink-0 text-purple-700" />
                Tap <span className="font-black">Add</span> to confirm.
              </li>
            </ol>

            <button onClick={dismiss} className="mt-5 w-full rounded-xl bg-purple-800 px-4 py-3 font-bold text-white transition hover:bg-purple-900">
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
