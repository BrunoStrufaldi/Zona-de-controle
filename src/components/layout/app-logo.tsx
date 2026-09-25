import { cn } from "@/lib/cn";

interface AppLogoProps {
  /** Exibe apenas o símbolo, sem o nome (sidebar recolhida). */
  compact?: boolean;
  className?: string;
}

export function AppLogo({ compact = false, className }: AppLogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img
        src="/icon.svg"
        alt=""
        aria-hidden="true"
        className="size-9 shrink-0 drop-shadow-[0_0_10px_rgb(var(--zdc-primary-rgb)/0.35)]"
      />
      {!compact && (
        <div className="grid leading-tight">
          <span className="text-sm font-semibold tracking-tight">Zona de Controle</span>
          <span className="font-mono text-[10px] tracking-[0.2em] text-subtle-foreground uppercase">
            local-first
          </span>
        </div>
      )}
    </div>
  );
}
