import { RefreshCw, SlidersHorizontal, Stethoscope } from "lucide-react";
import { Link } from "react-router";

import { diagnosticThresholdsHref } from "@/app/router/paths";
import { PageHeader } from "@/components/shared/page-header";
import { ResourceView } from "@/components/shared/resource-view";
import { Button } from "@/components/ui/button";
import { CheckCard } from "@/features/system/diagnostics/components/check-card";
import { groupByCheck, reportHealth } from "@/features/system/diagnostics/domain/findings";
import { type DiagnosticReport } from "@/features/system/diagnostics/types";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { cn } from "@/lib/cn";
import { formatClockTime } from "@/lib/format";
import { runDiagnostics } from "@/services/diagnostics-service";

interface AnalyzedReport {
  report: DiagnosticReport;
  analyzedAt: number;
}

async function analyze(): Promise<AnalyzedReport> {
  const report = await runDiagnostics();
  return { report, analyzedAt: Date.now() };
}

export function DiagnosticsPage() {
  const resource = useAsyncResource(analyze);

  return (
    <>
      <PageHeader
        title="Diagnósticos"
        description="Verifica discos, memória e programas com a leitura atual e sugere o que fazer. Nada é alterado no sistema."
        icon={Stethoscope}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link to={diagnosticThresholdsHref}>
                <SlidersHorizontal aria-hidden="true" />
                Ajustar limites
              </Link>
            </Button>
            <Button
              variant="secondary"
              disabled={resource.status === "loading"}
              onClick={resource.reload}
            >
              <RefreshCw
                className={cn(resource.status === "loading" && "animate-spin")}
                aria-hidden="true"
              />
              Analisar de novo
            </Button>
          </>
        }
      />

      <ResourceView resource={resource} loadingLabel="Analisando o sistema…">
        {({ report, analyzedAt }) => (
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground" role="status">
              <Summary report={report} /> · Análise das {formatClockTime(analyzedAt)}
            </p>
            {/* Colunas pela largura da área de conteúdo (container query), não da janela. */}
            <div className="@container">
              <div className="grid gap-6 @4xl:grid-cols-3">
                {groupByCheck(report).map((result) => (
                  <CheckCard key={result.check} result={result} report={report} />
                ))}
              </div>
            </div>
          </div>
        )}
      </ResourceView>
    </>
  );
}

function Summary({ report }: { report: DiagnosticReport }) {
  const count = report.findings.length;
  if (count === 0) {
    return <span className="text-foreground">Nenhum problema encontrado</span>;
  }
  const critical = reportHealth(report) === "critical";
  return (
    <span className={critical ? "text-danger" : "text-warning"}>
      {count === 1 ? "1 alerta" : `${count} alertas`}
    </span>
  );
}
