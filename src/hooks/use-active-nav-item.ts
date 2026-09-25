import { useLocation } from "react-router";

import { navigation } from "@/config/navigation";
import { findNavigationItem } from "@/lib/navigation";
import { type NavLinkItem } from "@/types/navigation";

/** Item da navegação da rota atual (título e ícone consistentes com a sidebar). */
export function useActiveNavItem(): NavLinkItem | undefined {
  const { pathname } = useLocation();
  return findNavigationItem(navigation, pathname);
}
