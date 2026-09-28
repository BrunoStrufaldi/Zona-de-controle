import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => {
    document.removeEventListener("visibilitychange", onChange);
  };
}

function getVisible(): boolean {
  return document.visibilityState !== "hidden";
}

/** `false` enquanto a janela está minimizada ou oculta. */
export function useDocumentVisible(): boolean {
  return useSyncExternalStore(subscribe, getVisible, () => true);
}
