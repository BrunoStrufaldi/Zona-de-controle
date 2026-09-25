import { AppLogo } from "@/components/layout/app-logo";
import { SidebarGroup } from "@/components/layout/sidebar-group";
import { SidebarLink } from "@/components/layout/sidebar-link";
import { navigation } from "@/config/navigation";
import { cn } from "@/lib/cn";
import { useUiStore } from "@/stores/ui-store";

interface SidebarProps {
  collapsed: boolean;
  /** Chamado ao navegar (usado para fechar a sidebar em sobreposição). */
  onNavigate?: () => void;
  className?: string;
}

export function Sidebar({ collapsed, onNavigate, className }: SidebarProps) {
  const collapsedGroups = useUiStore((state) => state.collapsedGroups);
  const toggleGroup = useUiStore((state) => state.toggleGroup);

  return (
    <aside
      aria-label="Navegação principal"
      data-collapsed={collapsed}
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border bg-card/80 backdrop-blur-md",
        "transition-[width] duration-300 ease-out-expo",
        collapsed ? "w-(--zdc-sidebar-width-collapsed)" : "w-(--zdc-sidebar-width)",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-(--zdc-header-height) shrink-0 items-center border-b border-border",
          collapsed ? "justify-center" : "px-4",
        )}
      >
        <AppLogo compact={collapsed} />
      </div>

      <nav className="flex-1 overflow-x-hidden overflow-y-auto p-3">
        <div className="grid gap-1">
          {navigation.main.map((entry) =>
            entry.kind === "link" ? (
              <SidebarLink
                key={entry.id}
                item={entry}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ) : (
              <SidebarGroup
                key={entry.id}
                group={entry}
                collapsed={collapsed}
                expanded={!collapsedGroups[entry.id]}
                onToggle={() => {
                  toggleGroup(entry.id);
                }}
                onNavigate={onNavigate}
              />
            ),
          )}
        </div>
      </nav>

      <div className="grid gap-1 border-t border-border p-3">
        {navigation.footer.map((item) => (
          <SidebarLink key={item.id} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </div>
    </aside>
  );
}
