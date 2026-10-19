// Wires browser lifecycle events to the SaveManager. On iOS Safari a
// backgrounded tab can be killed without any further event, so the save must
// land the moment the page is hidden — synchronously, to the local journal.

import type { SaveManager } from "./manager";

export function bindLifecycle(manager: SaveManager): () => void {
  if (typeof window === "undefined") return () => undefined;

  const onHide = () => {
    if (document.visibilityState === "hidden") manager.flushSync();
  };
  const onPageHide = () => manager.flushSync();
  const onOnline = () => manager.setOnline(true);
  const onOffline = () => manager.setOnline(false);

  document.addEventListener("visibilitychange", onHide);
  document.addEventListener("freeze", onPageHide);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("beforeunload", onPageHide);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  return () => {
    document.removeEventListener("visibilitychange", onHide);
    document.removeEventListener("freeze", onPageHide);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("beforeunload", onPageHide);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}
