import "@testing-library/jest-dom/vitest";

import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { resetDesktopRuntime } from "@/test/tauri";

// As páginas são carregadas sob demanda; a primeira importação a frio (ex.: Recharts)
// pode passar de 1s em máquinas mais lentas.
configure({ asyncUtilTimeout: 5000 });

// jsdom não implementa matchMedia (usado pelo layout responsivo).
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  }),
});

// jsdom não implementa ResizeObserver (usado por Recharts e Radix).
class ResizeObserverStub implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
window.ResizeObserver = ResizeObserverStub;

afterEach(() => {
  cleanup();
  resetDesktopRuntime();
  localStorage.clear();
});
