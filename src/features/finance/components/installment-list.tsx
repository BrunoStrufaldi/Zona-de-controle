import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { categoryBadgeClass } from "@/features/finance/components/finance-styles";
import { installmentLabel, paidFraction } from "@/features/finance/domain/installments";
import {
  type FinanceAccount,
  type FinanceCategory,
  type InstallmentPurchase,
} from "@/features/finance/types";
import { cn } from "@/lib/cn";
import { formatCents, formatDate, formatMonthYear } from "@/lib/format";

interface InstallmentListProps {
  label: string;
  purchases: readonly InstallmentPurchase[];
  accounts: ReadonlyMap<number, FinanceAccount>;
  categories: ReadonlyMap<number, FinanceCategory>;
}

export function InstallmentList({ label, purchases, accounts, categories }: InstallmentListProps) {
  return (
    <ul className="grid gap-2" aria-label={label}>
      {purchases.map((purchase) => (
        <InstallmentRow
          key={purchase.id}
          purchase={purchase}
          account={accounts.get(purchase.accountId)}
          category={purchase.categoryId === null ? undefined : categories.get(purchase.categoryId)}
        />
      ))}
    </ul>
  );
}

interface InstallmentRowProps {
  purchase: InstallmentPurchase;
  account: FinanceAccount | undefined;
  category: FinanceCategory | undefined;
}

function InstallmentRow({ purchase, account, category }: InstallmentRowProps) {
  const percent = Math.round(paidFraction(purchase) * 100);
  return (
    <li
      className={cn(
        "grid animate-fade-in gap-2 rounded-lg border border-border bg-card px-4 py-3",
        purchase.finished && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <span className="truncate text-sm font-medium">{purchase.description}</span>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Badge
              variant={purchase.finished ? "default" : "primary"}
              aria-label={`Parcela ${installmentLabel(purchase).replace("/", " de ")}`}
            >
              {installmentLabel(purchase)}
            </Badge>
            {category && (
              <Badge className={categoryBadgeClass[category.color]}>{category.name}</Badge>
            )}
            {account && <span>{account.name}</span>}
            {purchase.purchaseDate && <span>· compra em {formatDate(purchase.purchaseDate)}</span>}
            <span>
              ·{" "}
              {purchase.finished
                ? `terminou em ${formatMonthYear(purchase.finalDueDate)}`
                : `última em ${formatMonthYear(purchase.finalDueDate)}`}
            </span>
          </div>
        </div>
        <div className="grid shrink-0 justify-items-end gap-0.5">
          <span className="font-mono text-sm font-semibold tabular">
            {purchase.count}× {formatCents(purchase.installmentAmount)}
          </span>
          <span className="font-mono text-xs text-muted-foreground tabular">
            {purchase.finished
              ? `total ${formatCents(purchase.totalAmount)}`
              : `faltam ${formatCents(purchase.remainingAmount)}`}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Progress
          value={percent}
          tone={purchase.finished ? "success" : "primary"}
          aria-label={`${purchase.paid} de ${purchase.count} parcelas pagas`}
        />
        <span className="w-28 shrink-0 text-right text-xs text-muted-foreground">
          {purchase.finished
            ? "quitada"
            : purchase.remaining === 1
              ? "falta 1 parcela"
              : `faltam ${purchase.remaining} parcelas`}
        </span>
      </div>
    </li>
  );
}
