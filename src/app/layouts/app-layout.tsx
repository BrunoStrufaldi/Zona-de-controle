import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router";

import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { navigation } from "@/config/navigation";
import { COMPACT_LAYOUT_QUERY, useMediaQuery } from "@/hooks/use-media-query";
import { findNavigationTrail } from "@/lib/navigation";
import { useUiStore } from "@/stores/ui-store";

const NOT_FOUND_TRAIL = ["Página não encontrada"];

/**
 * Layout principal: sidebar fixa + cabeçalho + área de conteúdo.
 *
 * - Desktop (≥ 1024px): sidebar expandida, podendo ser recolhida manualmente.
 * - Janelas estreitas: sidebar vira trilho de ícones e abre como sobreposição.
 */
export function AppLayout() {
  const { pathname } = useLocation();
  const isCompact = useMediaQuery(COMPACT_LAYOUT_QUERY);
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const overlayOpen = useUiStore((state) => state.sidebarOverlayOpen);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const setOverlayOpen = useUiStore((state) => state.setSidebarOverlayOpen);
  const mainRef = useRef<HTMLElement>(null);

  const trail = findNavigationTrail(navigation, pathname);
  const showOverlay = isCompact && overlayOpen;

  const closeOverlay = () => {
    setOverlayOpen(false);
  };

  const handleToggleSidebar = () => {
    if (isCompact) setOverlayOpen(!overlayOpen);
    else toggleSidebar();
  };

  // Volta ao topo ao trocar de página.
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [pathname]);

  // Fecha a sobreposição com a tecla Esc.
  useEffect(() => {
    if (!showOverlay) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOverlayOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showOverlay, setOverlayOpen]);

  return (
    <div className="flex h-screen overflow-hidden">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
      >
        Pular para o conteúdo
      </a>

      <Sidebar collapsed={isCompact || sidebarCollapsed} />

      {showOverlay && (
        <div className="fixed inset-0 z-40 flex">
          <Sidebar collapsed={false} onNavigate={closeOverlay} className="relative z-10 bg-card" />
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={closeOverlay}
            className="flex-1 animate-fade-in cursor-default bg-black/60 backdrop-blur-sm"
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          trail={trail.length > 0 ? trail : NOT_FOUND_TRAIL}
          sidebarExpanded={isCompact ? overlayOpen : !sidebarCollapsed}
          onToggleSidebar={handleToggleSidebar}
        />
        <main ref={mainRef} id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto">
          <div
            key={pathname}
            className="mx-auto flex w-full max-w-7xl animate-fade-in flex-col gap-6 p-6 lg:p-8"
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
