import { CalendarClock } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { WidgetCard } from "@/components/shared/widget-card";
import { Badge } from "@/components/ui/badge";
import { maturityText } from "@/features/finance/domain/performance";
import { type Maturity } from "@/features/finance/types";
import { formatCents, formatDate } from "@/lib/format";

/** Renda fixa com vencimento: o que vence e o que já venceu sem resgate registrado. */
export function MaturitiesCard({ maturities }: { maturities: readonly Maturity[] }) {
  return (
    <WidgetCard title="Vencimentos da renda fixa" icon={CalendarClock}>
      {maturities.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nenhum vencimento cadastrado"
          description="Informe o vencimento ao cadastrar CDBs, Tesouro e outros títulos."
          className="border-0 py-6"
        />
      ) : (
        <ul className="grid gap-2" aria-label="Vencimentos da renda fixa">
          {maturities.map((maturity) => (
            <li key={maturity.assetId} className="flex items-center gap-3 text-sm">
              <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground tabular">
                {formatDate(maturity.date)}
              </span>
              <span className="grid min-w-0 flex-1">
                <span className="truncate">{maturity.name}</span>
                <span className="text-xs text-muted-foreground">{maturityText(maturity.days)}</span>
              </span>
              {maturity.days < 0 && (
                <Badge variant="warning" title="Registre o resgate ou atualize o vencimento.">
                  Registrar resgate
                </Badge>
              )}
              <span className="shrink-0 font-mono tabular">{formatCents(maturity.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
