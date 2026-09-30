import { ArrowRight, Link2, Unlink } from "lucide-react";

import { WidgetCard } from "@/components/shared/widget-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { movementKindLabels } from "@/features/finance/domain/investments";
import { type FinanceAccount, type UnlinkedTransfer } from "@/features/finance/types";
import { formatCents, formatDate } from "@/lib/format";

interface UnlinkedTransfersCardProps {
  transfers: readonly UnlinkedTransfer[];
  accounts: ReadonlyMap<number, FinanceAccount>;
  onLink: (transfer: UnlinkedTransfer) => void;
}

/**
 * Transferências para/de contas de investimentos (ex.: importadas do extrato)
 * que ainda não viraram aplicação ou resgate de um ativo.
 */
export function UnlinkedTransfersCard({ transfers, accounts, onLink }: UnlinkedTransfersCardProps) {
  return (
    <WidgetCard title="Aplicações e resgates sem ativo" icon={Unlink}>
      <p className="mb-3 text-sm text-muted-foreground">
        Transferências com as contas de investimentos que ainda não foram ligadas a um ativo.
        Enquanto isso, o valor aparece como dinheiro parado na conta.
      </p>
      <ul className="grid gap-1.5" aria-label="Transferências sem ativo">
        {transfers.map((transfer) => {
          const from =
            transfer.kind === "contribution"
              ? transfer.otherAccountId
              : transfer.investmentAccountId;
          const to =
            transfer.kind === "contribution"
              ? transfer.investmentAccountId
              : transfer.otherAccountId;
          return (
            <li
              key={transfer.transactionId}
              className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground tabular">
                {formatDate(transfer.date)}
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate">{transfer.description}</span>
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge variant={transfer.kind === "contribution" ? "primary" : "info"}>
                    {movementKindLabels[transfer.kind]}
                  </Badge>
                  {accounts.get(from)?.name}
                  <ArrowRight className="size-3" aria-label="para" />
                  {accounts.get(to)?.name}
                </span>
              </span>
              <span className="shrink-0 font-mono tabular">{formatCents(transfer.amount)}</span>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 px-2"
                aria-label={`Vincular “${transfer.description}” de ${formatDate(transfer.date)} a um ativo`}
                onClick={() => {
                  onLink(transfer);
                }}
              >
                <Link2 aria-hidden="true" />
                Vincular
              </Button>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}
