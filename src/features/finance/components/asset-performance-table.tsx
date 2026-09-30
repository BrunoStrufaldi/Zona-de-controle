import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { gainToneClass } from "@/features/finance/components/finance-styles";
import { assetClassLabels, formatGainWithRate } from "@/features/finance/domain/investments";
import { type AssetPerformance } from "@/features/finance/types";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/format";

/** Resultado de cada ativo no período: início, aplicado, proventos, fim e resultado. */
export function AssetPerformanceTable({ assets }: { assets: readonly AssetPerformance[] }) {
  return (
    <div className="overflow-x-auto">
      <Table aria-label="Resultado por ativo">
        <TableHeader>
          <TableRow>
            <TableHead>Ativo</TableHead>
            <TableHead className="text-right">Início</TableHead>
            <TableHead className="text-right">Aplicado − resgatado</TableHead>
            <TableHead className="text-right">Proventos</TableHead>
            <TableHead className="text-right">Fim</TableHead>
            <TableHead className="text-right">Resultado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets.map((asset) => (
            <TableRow key={asset.assetId}>
              <TableCell>
                <span className="grid gap-0.5">
                  <span className="flex items-center gap-1.5 font-medium">
                    {asset.name}
                    {!asset.exact && (
                      <Badge
                        variant="warning"
                        title="Sem valor informado recente no início ou no fim do período: considera só o que foi aplicado."
                      >
                        aproximado
                      </Badge>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {assetClassLabels[asset.class]}
                  </span>
                </span>
              </TableCell>
              <TableCell className="text-right font-mono tabular">
                {formatCents(asset.startValue)}
              </TableCell>
              <TableCell className="text-right font-mono tabular">
                {formatCents(asset.contributed - asset.withdrawn)}
              </TableCell>
              <TableCell className="text-right font-mono tabular">
                {formatCents(asset.income)}
              </TableCell>
              <TableCell className="text-right font-mono tabular">
                {formatCents(asset.endValue)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-mono whitespace-nowrap tabular",
                  gainToneClass(asset.gain),
                )}
              >
                {formatGainWithRate({ gain: asset.gain, gainRate: asset.rate })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
