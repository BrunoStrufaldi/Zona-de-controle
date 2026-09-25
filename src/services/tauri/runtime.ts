import { isTauri } from "@tauri-apps/api/core";

/** `true` dentro do app desktop; `false` no navegador (`npm run dev:web`). */
export function isDesktopRuntime(): boolean {
  return isTauri();
}
