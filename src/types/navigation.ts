import { type LucideIcon } from "lucide-react";

export interface NavLinkItem {
  kind: "link";
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
}

export interface NavGroupItem {
  kind: "group";
  id: string;
  label: string;
  icon: LucideIcon;
  items: readonly NavLinkItem[];
}

export type NavEntry = NavLinkItem | NavGroupItem;

export interface NavigationConfig {
  /** Itens principais, no corpo da sidebar. */
  main: readonly NavEntry[];
  /** Itens fixos no rodapé da sidebar. */
  footer: readonly NavLinkItem[];
}
