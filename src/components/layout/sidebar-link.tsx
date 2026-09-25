import { NavLink } from "react-router";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { type NavLinkItem } from "@/types/navigation";

interface SidebarLinkProps {
  item: NavLinkItem;
  collapsed: boolean;
  /** Item filho de um grupo (recuado quando a sidebar está expandida). */
  nested?: boolean;
  onNavigate?: () => void;
}

export function SidebarLink({ item, collapsed, nested = false, onNavigate }: SidebarLinkProps) {
  const { icon: Icon, label, path } = item;

  const link = (
    <NavLink
      to={path}
      end
      onClick={onNavigate}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          "group relative flex h-9 items-center gap-3 rounded-md text-sm transition-colors duration-150",
          collapsed ? "justify-center px-0" : "px-3",
          nested && !collapsed && "pl-9",
          isActive
            ? "bg-primary/10 font-medium text-foreground"
            : "text-muted-foreground hover:bg-hover hover:text-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-primary shadow-glow-sm transition-opacity duration-200",
              isActive ? "opacity-100" : "opacity-0",
            )}
          />
          <Icon
            aria-hidden="true"
            className={cn(
              "size-4 shrink-0 transition-colors",
              isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
            )}
          />
          {!collapsed && <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
