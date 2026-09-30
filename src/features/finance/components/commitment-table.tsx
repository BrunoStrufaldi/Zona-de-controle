import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  commitmentTotal,
  endingDescriptions,
  monthLongLabel,
  reliefFromPrevious,
} from "@/features/finance/domain/installments";
import { type CommitmentMonth, type InstallmentPurchase } from "@/features/finance/types";
import { formatCents } from "@/lib/format";

interface CommitmentTableProps {
  months: readonly CommitmentMonth[];
  purchases: readonly InstallmentPurchase[];
}

/** Mês a mês: parcelas, recorrentes no cartão, total, quanto alivia e o que encerra. */
export function CommitmentTable({ months, purchases }: CommitmentTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table aria-label="Compromisso das faturas mês a mês">
        <TableHeader>
          <TableRow>
            <TableHead>Mês</TableHead>
            <TableHead className="text-right">Parcelas</TableHead>
            <TableHead className="text-right">Recorrentes</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Encerram</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {months.map((month, index) => {
            const relief = reliefFromPrevious(months, index);
            const ending = endingDescriptions(month, purchases);
            return (
              <TableRow key={month.month}>
                <TableCell className="whitespace-nowrap first-letter:uppercase">
                  {monthLongLabel(month.month)}
                </TableCell>
                <TableCell className="text-right font-mono tabular">
                  {formatCents(month.installments)}
                  <span className="ml-1 text-xs text-muted-foreground">({month.parcels})</span>
                </TableCell>
                <TableCell className="text-right font-mono tabular">
                  {formatCents(month.recurring)}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold tabular">
                  {formatCents(commitmentTotal(month))}
                  {relief !== null && relief > 0 && (
                    <span className="ml-1 text-xs font-normal text-success">
                      −{formatCents(relief)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="max-w-64 truncate text-xs text-muted-foreground">
                  {ending.length > 0 ? ending.join(", ") : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
