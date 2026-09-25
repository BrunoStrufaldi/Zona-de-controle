import { ChevronRight } from "lucide-react";
import { useId } from "react";
import { useLocation } from "react-router";

import { SidebarLink } from "@/components/layout/sidebar-link";
import { cn } from "@/lib/cn";
import { normalizePath } from "@/lib/navigation";
import { type NavGroupItem } from "@/types/navigation";

interface SidebarGroupProps {
  group: NavGroupItem;
  collapsed: boolean;
  expanded: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

export function SidebarGroup({
  group,
  collapsed,
  expanded,
  onToggle,
  onNavigate,
}: SidebarGroupProps) {
  const { pathname } = useLocation();
  const contentId = useId();
  const current = normalizePath(pathname);
  const containsActive = group.items.some((item) => item.path === current);
  const Icon = group.icon;

  // Sidebar recolhida: os itens aparecem como ícones, separados por um divisor.
  if (collapsed) {
    return (
      <div role="group" aria-label={group.label} className="grid gap-1">
        <div aria-hidden="true" className="mx-3 my-2 h-px bg-border" />
        {group.items.map((item) => (
          <SidebarLink key={item.id} item={item} collapsed onNavigate={onNavigate} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={contentId}
        className={cn(
          "flex h-9 cursor-pointer items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150 hover:bg-hover",
          containsActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon
          aria-hidden="true"
          className={cn("size-4 shrink-0", containsActive && "text-primary")}
        />
        <span className="flex-1 truncate text-left font-medium">{group.label}</span>
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-subtle-foreground transition-transform duration-200",
            expanded && "rotate-90",
          )}
        />
      </button>
      <div
        id={contentId}
        role="group"
        aria-label={group.label}
        hidden={!expanded}
        className="grid animate-fade-in gap-0.5"
      >
        {group.items.map((item) => (
          <SidebarLink key={item.id} item={item} collapsed={false} nested onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}
