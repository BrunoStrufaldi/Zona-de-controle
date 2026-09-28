import { RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { ResourceView } from "@/components/shared/resource-view";
import { Button } from "@/components/ui/button";
import { CleanupCategoryCard } from "@/features/system/optimization/components/cleanup-category-card";
import { CleanupHistoryCard } from "@/features/system/optimization/components/cleanup-history-card";
import { CleanupItemsDialog } from "@/features/system/optimization/components/cleanup-items-dialog";
import { CleanupRunDialog } from "@/features/system/optimization/components/cleanup-run-dialog";
import { ConfirmCleanupDialog } from "@/features/system/optimization/components/confirm-cleanup-dialog";
import { SafetyRulesCard } from "@/features/system/optimization/components/safety-rules-card";
import {
  type CategoryResult,
  defaultSelection,
  groupByCategory,
  scanTotals,
  selectionTotals,
} from "@/features/system/optimization/domain/cleanup";
import { useCleanupRun } from "@/features/system/optimization/hooks/use-cleanup-run";
import {
  type CleanupScan,
  type CleanupSource,
  type SourceSummary,
} from "@/features/system/optimization/types";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { cn } from "@/lib/cn";
import { formatBytes, formatClockTime, formatNumber } from "@/lib/format";
import { listCleanupHistory, scanCleanup } from "@/services/optimization-service";

interface AnalyzedScan {
  scan: CleanupScan;
  analyzedAt: number;
}

/** Limpezas mostradas no histórico da tela. */
const HISTORY_LIMIT = 20;

function loadHistory() {
  return listCleanupHistory(HISTORY_LIMIT);
}

async function analyze(): Promise<AnalyzedScan> {
  const scan = await scanCleanup();
  return { scan, analyzedAt: Date.now() };
}

export function OptimizationPage() {
  const resource = useAsyncResource(analyze);
  const history = useAsyncResource(loadHistory);
  const run = useCleanupRun();
  const busy = resource.status === "loading" || run.state.phase === "running";

  return (
    <>
      <PageHeader
        title="Otimização"
        description="Encontra arquivos temporários, caches seguros e itens da Lixeira, mostra exatamente o que pode ser removido e limpa só o que você confirmar."
        icon={Sparkles}
        actions={
          <Button variant="secondary" disabled={busy} onClick={resource.reload}>
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
          // Nova análise → seleção padrão de novo.
          <ScanView
            key={scan.id}
            scan={scan}
            analyzedAt={analyzedAt}
            running={run.state.phase === "running"}
            onStart={(sources) => {
              run.start(scan.id, sources);
            }}
          />
        )}
      </ResourceView>

      <div className="@container">
        <div className="grid gap-6 @4xl:grid-cols-2 @4xl:items-start">
          <CleanupHistoryCard history={history} />
          <SafetyRulesCard />
        </div>
      </div>

      <CleanupRunDialog
        state={run.state}
        onCancel={run.cancel}
        onClose={() => {
          run.reset();
          // O plano foi consumido (ou falhou): a análise precisa ser refeita.
          resource.reload();
          history.reload();
        }}
      />
    </>
  );
}

interface ScanViewProps {
  scan: CleanupScan;
  analyzedAt: number;
  running: boolean;
  onStart: (sources: CleanupSource[]) => void;
}

function ScanView({ scan, analyzedAt, running, onStart }: ScanViewProps) {
  const [selected, setSelected] = useState<ReadonlySet<CleanupSource>>(
    () => new Set(defaultSelection(scan)),
  );
  const [viewing, setViewing] = useState<SourceSummary | null>(null);
  const [confirming, setConfirming] = useState(false);
  const selection = selectionTotals(scan, selected);

  const toggle = (source: CleanupSource, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(source);
      else next.delete(source);
      return next;
    });
  };

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground" role="status">
        <Summary scan={scan} /> · Análise das {formatClockTime(analyzedAt)}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <p className="text-sm" aria-live="polite">
          {selection.sources.length === 0 ? (
            <span className="text-muted-foreground">Marque os locais que quer limpar.</span>
          ) : (
            <>
              <span className="font-medium">Selecionado: {formatBytes(selection.totalBytes)}</span>
              <span className="text-muted-foreground">
                {" "}
                · {formatNumber(selection.itemCount)} {selection.itemCount === 1 ? "item" : "itens"}{" "}
                em{" "}
                {selection.sources.length === 1 ? "1 local" : `${selection.sources.length} locais`}
              </span>
            </>
          )}
        </p>
        <Button
          disabled={selection.sources.length === 0 || running}
          onClick={() => {
            setConfirming(true);
          }}
        >
          <Trash2 aria-hidden="true" />
          Limpar selecionados
        </Button>
      </div>

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
                  selected={selected}
                  onToggle={toggle}
                  disabled={running}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <CleanupItemsDialog
        scanId={scan.id}
        summary={viewing}
        onClose={() => {
          setViewing(null);
        }}
      />
      <ConfirmCleanupDialog
        selection={confirming ? selection : null}
        onCancel={() => {
          setConfirming(false);
        }}
        onConfirm={() => {
          setConfirming(false);
          onStart(selection.sources.map((summary) => summary.source));
        }}
      />
    </div>
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
