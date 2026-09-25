import {
  ArrowLeftRight,
  CalendarPlus,
  ListPlus,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "lucide-react";
import { useNavigate } from "react-router";

import { newTaskHref } from "@/app/router/paths";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatLongDate } from "@/lib/format";

interface HeaderProps {
  trail: readonly string[];
  sidebarExpanded: boolean;
  onToggleSidebar: () => void;
}

/** Ações rápidas. Itens sem `href` ficam desabilitados até o módulo existir. */
const quickActions: readonly {
  id: string;
  label: string;
  icon: typeof ListPlus;
  href?: string;
}[] = [
  { id: "task", label: "Nova tarefa", icon: ListPlus, href: newTaskHref },
  { id: "note", label: "Nova nota", icon: NotebookPen },
  { id: "event", label: "Novo evento", icon: CalendarPlus },
  { id: "transaction", label: "Novo lançamento", icon: ArrowLeftRight },
];

export function Header({ trail, sidebarExpanded, onToggleSidebar }: HeaderProps) {
  const navigate = useNavigate();
  const toggleLabel = sidebarExpanded ? "Recolher menu" : "Expandir menu";
  const ToggleIcon = sidebarExpanded ? PanelLeftClose : PanelLeftOpen;

  return (
    <header className="sticky top-0 z-30 flex h-(--zdc-header-height) shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md lg:px-6">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" onClick={onToggleSidebar} aria-label={toggleLabel}>
            <ToggleIcon aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{toggleLabel}</TooltipContent>
      </Tooltip>

      <div aria-hidden="true" className="h-5 w-px bg-border" />
      <Breadcrumb trail={trail} className="flex-1" />

      <span className="hidden text-xs text-muted-foreground first-letter:uppercase md:inline-block">
        {formatLongDate(new Date())}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm">
            <Plus aria-hidden="true" />
            Criar
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Ações rápidas</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {quickActions.map(({ id, label, icon: Icon, href }) => (
            <DropdownMenuItem
              key={id}
              disabled={href === undefined}
              onSelect={() => {
                if (href) void navigate(href);
              }}
            >
              <Icon aria-hidden="true" />
              {label}
              {href === undefined && <DropdownMenuShortcut>em breve</DropdownMenuShortcut>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
