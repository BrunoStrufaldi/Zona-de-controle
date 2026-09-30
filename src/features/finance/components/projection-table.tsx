import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { estimatedNet, knownFlows } from "@/features/finance/domain/projection";
import { firstDayOf } from "@/features/finance/domain/period";
import { type ProjectedFlows, type ProjectionMonth } from "@/features/finance/types";
import { cn } from "@/lib/cn";
import { formatCents, formatMonthYear } from "@/lib/format";

/**
 * De onde vem o total: "recorrentes R$ X · parcelas R$ Y"; com uma origem só,
 * basta o nome ("recorrentes").
 */
function breakdown(flows: ProjectedFlows): string {
  const parts: [string, number][] = [
    ["recorrentes", flows.recurring],
    ["parcelas", flows.installments],
    ["lançados", flows.scheduled],
  ];
  const present = parts.filter(([, amount]) => amount > 0);
  if (present.length === 1) return present[0]?.[0] ?? "";
  return present.map(([label, amount]) => `${label} ${formatCents(amount)}`).join(" · ");
}

function signed(cents: number): string {
  return cents > 0 ? `+${formatCents(cents)}` : formatCents(cents);
}

/**
 * Mês a mês: o que já se sabe (entradas e saídas), a estimativa separada e o
 * saldo no fim do mês com e sem ela.
 */
export function ProjectionTable({ months }: { months: readonly ProjectionMonth[] }) {
  return (
    <div className="overflow-x-auto">
      <Table aria-label="Projeção mês a mês">
        <TableHeader>
          <TableRow>
            <TableHead>Mês</TableHead>
            <TableHead className="text-right">Entradas previstas</TableHead>
            <TableHead className="text-right">Saídas previstas</TableHead>
            <TableHead className="text-right">
              <span className="inline-flex items-center gap-1.5">
                Avulsos
                <Badge variant="info">estimativa</Badge>
              </span>
            </TableHead>
            <TableHead className="text-right">Saldo só com conhecidos</TableHead>
            <TableHead className="text-right">Saldo com a estimativa</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {months.map((month, index) => {
            const income = breakdown(month.income);
            const expenses = breakdown(month.expenses);
            return (
              <TableRow key={month.month}>
                <TableCell className="whitespace-nowrap">
                  <span className="grid gap-0.5">
                    <span className="font-medium">{formatMonthYear(firstDayOf(month.month))}</span>
                    {index === 0 && (
                      <span className="text-xs text-muted-foreground">o que falta do mês</span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="grid gap-0.5">
                    <span className="font-mono tabular">
                      {formatCents(knownFlows(month.income))}
                    </span>
                    {income && <span className="text-xs text-muted-foreground">{income}</span>}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="grid gap-0.5">
                    <span className="font-mono tabular">
                      {formatCents(knownFlows(month.expenses))}
                    </span>
                    {expenses && <span className="text-xs text-muted-foreground">{expenses}</span>}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground italic tabular">
                  {signed(estimatedNet(month))}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono tabular",
                    month.balanceKnown < 0 && "text-danger",
                  )}
                >
                  {formatCents(month.balanceKnown)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono font-semibold tabular",
                    month.balance < 0 && "text-danger",
                  )}
                >
                  {formatCents(month.balance)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
