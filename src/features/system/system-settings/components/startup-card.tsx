import { Rocket } from "lucide-react";

import { WidgetCard } from "@/components/shared/widget-card";
import { Badge } from "@/components/ui/badge";
import {
  packagedEnabled,
  packagedStateLabels,
  startupCounts,
  startupLocationLabels,
  startupStateLabels,
} from "@/features/system/system-settings/domain/settings";
import {
  type StartupItem,
  type StartupReport,
  type StartupState,
} from "@/features/system/system-settings/types";
import { formatDate, formatNumber } from "@/lib/format";

const stateVariant: Record<StartupState, "success" | "default" | "outline"> = {
  enabled: "success",
  disabled: "default",
  unknown: "outline",
};

function ItemRow({ item }: { item: StartupItem }) {
  return (
    <li className="grid gap-1 border-b border-border pb-3 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium break-all">{item.name}</span>
        <Badge variant={stateVariant[item.state]}>{startupStateLabels[item.state]}</Badge>
        {item.targetExists === false && <Badge variant="warning">Arquivo não encontrado</Badge>}
      </div>
      <span className="text-xs text-subtle-foreground">
        {startupLocationLabels[item.location]}
        {item.state === "disabled" &&
          item.disabledAtMs !== null &&
          ` · desligado em ${formatDate(item.disabledAtMs)}`}
        {!item.editable && " · só com administrador (Gerenciador de Tarefas)"}
      </span>
      {item.command && (
        <span className="font-mono text-xs break-all text-muted-foreground">{item.command}</span>
      )}
    </li>
  );
}

/**
 * Programas que abrem com o Windows, como no Gerenciador de Tarefas. Só
 * leitura nesta etapa; o app não diz quais desligar (não tem como medir o
 * impacto de cada um).
 */
export function StartupCard({ report }: { report: StartupReport }) {
  const counts = startupCounts(report);
  return (
    <WidgetCard
      title="Programas na inicialização"
      icon={Rocket}
      headerExtra={
        <span className="text-xs text-muted-foreground">
          {formatNumber(counts.enabled)} ligados · {formatNumber(counts.disabled)} desligados
        </span>
      }
      contentClassName="gap-4"
    >
      {report.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum programa no registro ou nas pastas Inicializar.
        </p>
      ) : (
        <ul className="grid gap-3" aria-label="Programas na inicialização">
          {report.items.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}
      <div className="grid gap-2 border-t border-border pt-3">
        <span className="text-xs font-medium text-muted-foreground">Apps da Microsoft Store</span>
        {!report.packagedAvailable ? (
          <p className="text-sm text-muted-foreground">Não disponível.</p>
        ) : report.packaged.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum app da Store pede para iniciar com o Windows.
          </p>
        ) : (
          <ul className="grid gap-2" aria-label="Apps da Microsoft Store na inicialização">
            {report.packaged.map((task) => (
              <li
                key={`${task.package}:${task.taskId}`}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="break-all">{task.package}</span>
                <Badge variant={packagedEnabled(task.state) ? "success" : "default"}>
                  {packagedStateLabels[task.state]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-subtle-foreground">
          Os apps da Store são ligados e desligados em Configurações &gt; Aplicativos &gt;
          Inicialização.
        </p>
      </div>
    </WidgetCard>
  );
}
