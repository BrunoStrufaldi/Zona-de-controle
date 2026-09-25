import { type NavigationConfig, type NavLinkItem } from "@/types/navigation";

/** Lista plana de todos os links navegáveis (grupos expandidos). */
export function flattenNavigation(config: NavigationConfig): NavLinkItem[] {
  const mainLinks = config.main.flatMap((entry) =>
    entry.kind === "group" ? [...entry.items] : [entry],
  );
  return [...mainLinks, ...config.footer];
}

/**
 * Trilha de rótulos (breadcrumb) para um caminho. Ex.: "/finance/recurring"
 * → ["Finanças", "Recorrentes"]. Retorna lista vazia se o caminho não existir.
 */
export function findNavigationTrail(config: NavigationConfig, pathname: string): string[] {
  const normalized = normalizePath(pathname);

  for (const entry of config.main) {
    if (entry.kind === "link" && entry.path === normalized) return [entry.label];
    if (entry.kind === "group") {
      const item = entry.items.find((link) => link.path === normalized);
      if (item) return [entry.label, item.label];
    }
  }

  const footerItem = config.footer.find((link) => link.path === normalized);
  return footerItem ? [footerItem.label] : [];
}

/** Remove a barra final (exceto na raiz) para comparar caminhos. */
export function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/** Item de navegação correspondente ao caminho, se existir. */
export function findNavigationItem(
  config: NavigationConfig,
  pathname: string,
): NavLinkItem | undefined {
  const normalized = normalizePath(pathname);
  return flattenNavigation(config).find((item) => item.path === normalized);
}
