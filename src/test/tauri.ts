import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";

import { type CommandMap, type CommandName } from "@/services/tauri/commands";

type CommandHandlers = {
  [K in CommandName]?: (
    args: CommandMap[K]["args"],
  ) => CommandMap[K]["result"] | Promise<CommandMap[K]["result"]>;
};

interface TauriGlobal {
  isTauri?: boolean;
}

/**
 * Simula o app desktop: `isTauri()` passa a retornar `true` e cada command
 * chamado é resolvido pelo handler correspondente. Commands sem handler falham.
 */
export function mockDesktopRuntime(handlers: CommandHandlers): void {
  (globalThis as TauriGlobal).isTauri = true;
  mockIPC((command, payload) => {
    const handler = handlers[command as CommandName] as ((args: unknown) => unknown) | undefined;
    if (!handler) throw new Error(`Command não simulado no teste: ${command}`);
    return handler(payload);
  });
}

/** Volta ao modo navegador (sem Tauri). Chamado após cada teste. */
export function resetDesktopRuntime(): void {
  delete (globalThis as TauriGlobal).isTauri;
  clearMocks();
}
