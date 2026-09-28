import { ArrowRight, CircleCheck, Stethoscope } from "lucide-react";
import { Link } from "react-router";

import { paths } from "@/app/router/paths";
import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FindingItem } from "@/features/system/diagnostics/components/finding-item";
import { reportHealth } from "@/features/system/diagnostics/domain/findings";
import { type DiagnosticReport } from "@/features/system/diagnostics/types";
import { healthBadgeVariant } from "@/features/system/components/health-styles";
import { healthLabels } from "@/features/system/domain/health";
import { type AsyncResource } from "@/hooks/use-async-resource";

/** Alertas mostrados no dashboard; o restante fica na tela Diagnósticos. */
const MAX_WIDGET_FINDINGS = 3;

interface DiagnosticsWidgetProps {
  report: AsyncResource<DiagnosticReport>;
}

/** Resumo do diagnóstico no dashboard (análise feita ao abrir, sem notificações). */
export function DiagnosticsWidget({ report }: DiagnosticsWidgetProps) {
  return (
    <WidgetCard
      title="Diagnóstico"
      icon={Stethoscope}
      headerExtra={
        <>
          {report.status === "success" && (
            <Badge variant={healthBadgeVariant[reportHealth(report.data)]}>
              {healthLabels[reportHealth(report.data)]}
            </Badge>
          )}
          <Button asChild variant="ghost" size="sm" className="h-7 px-2">
            <Link to={paths.system.diagnostics}>
              Detalhes
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </>
      }
    >
      <ResourceView resource={report} className="py-6" loadingLabel="Analisando…">
        {(data) =>
          data.findings.length === 0 ? (
            <p className="flex items-start gap-2 text-sm">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              <span>
                <span className="font-medium">Nenhum problema encontrado.</span>{" "}
                <span className="text-muted-foreground">
                  Discos, memória e programas estão dentro dos limites.
                </span>
              </span>
            </p>
          ) : (
            <>
              <ul className="grid gap-3" aria-label="Alertas do diagnóstico">
                {data.findings.slice(0, MAX_WIDGET_FINDINGS).map((finding, index) => (
                  // Ordem estável vinda do Rust (críticos primeiro).
                  <FindingItem key={index} finding={finding} compact />
                ))}
              </ul>
              {data.findings.length > MAX_WIDGET_FINDINGS && (
                <p className="mt-3 text-xs text-muted-foreground">
                  e mais {data.findings.length - MAX_WIDGET_FINDINGS} na tela Diagnósticos
                </p>
              )}
            </>
          )
        }
      </ResourceView>
    </WidgetCard>
  );
}
