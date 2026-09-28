import { Info, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { ResourceView } from "@/components/shared/resource-view";
import { Button } from "@/components/ui/button";
import { CleanupCategoryCard } from "@/features/system/optimization/components/cleanup-category-card";
import { CleanupItemsDialog } from "@/features/system/optimization/components/cleanup-items-dialog";
import { SafetyRulesCard } from "@/features/system/optimization/components/safety-rules-card";
import {
  type CategoryResult,
  groupByCategory,
  scanTotals,
} from "@/features/system/optimization/domain/cleanup";
import { type CleanupScan, type SourceSummary } from "@/features/system/optimization/types";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { cn } from "@/lib/cn";
import { formatBytes, formatClockTime } from "@/lib/format";
import { scanCleanup } from "@/services/optimization-service";

interface AnalyzedScan {
  scan: CleanupScan;
  analyzedAt: number;
}

async function analyze(): Promise<AnalyzedScan> {
  const scan = await scanCleanup();
  return { scan, analyzedAt: Date.now() };
}

export function OptimizationPage() {
  const resource = useAsyncResource(analyze);
  const [viewing, setViewing] = useState<SourceSummary | null>(null);

  return (
    <>
      <PageHeader
        title="Otimização"
        description="Encontra arquivos temporários, caches seguros e itens da Lixeira e mostra exatamente o que pode ser removido."
        icon={Sparkles}
        actions={
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
        }
      />

      <ResourceView resource={resource} loadingLabel="Analisando as pastas…">
        {({ scan, analyzedAt }) => (
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground" role="status">
              <Summary scan={scan} /> · Análise das {formatClockTime(analyzedAt)}
            </p>
            <p className="flex items-start gap-2 rounded-md border border-info/30 bg-info/5 p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
              Por enquanto o app só analisa: nada é removido. A limpeza, com confirmação da lista
              exata e registro na auditoria, chega na próxima etapa.
            </p>
            {/* Colunas pela largura da área de conteúdo (container query), não da janela. */}
            <div className="@container">
              {/* Temporários e Lixeira empilhados numa coluna; os caches (lista longa) na outra. */}
              <div className="grid gap-6 @4xl:grid-cols-2 @4xl:items-start">
                {partitionCategories(groupByCategory(scan)).map((column, index) => (
                  <div key={index} className="grid gap-6">
                    {column.map((result) => (
                      <CleanupCategoryCard
                        key={result.category}
                        result={result}
                        tempMinAgeHours={scan.tempMinAgeHours}
                        onViewItems={setViewing}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <SafetyRulesCard />
            <CleanupItemsDialog
              scanId={scan.id}
              summary={viewing}
              onClose={() => {
                setViewing(null);
              }}
            />
          </div>
        )}
      </ResourceView>
    </>
  );
}

function partitionCategories(results: CategoryResult[]): CategoryResult[][] {
  return [
    results.filter((result) => result.category !== "safeCaches"),
    results.filter((result) => result.category === "safeCaches"),
  ];
}

function Summary({ scan }: { scan: CleanupScan }) {
  const { readyBytes, inUseBytes } = scanTotals(scan);
  return (
    <>
      <span className="text-foreground">
        {readyBytes > 0
          ? `${formatBytes(readyBytes)} podem ser liberados`
          : "Nada para liberar agora"}
      </span>
      {inUseBytes > 0 && ` · mais ${formatBytes(inUseBytes)} em caches de navegadores abertos`}
    </>
  );
}
