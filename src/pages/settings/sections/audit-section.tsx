import { RotateCw, ScrollText } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { ResourceView } from "@/components/shared/resource-view";
import { Badge } from "@/components/ui/badge";
import { type BadgeVariantProps } from "@/components/ui/badge-variants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { formatDateTime } from "@/lib/format";
import { listAuditEntries } from "@/services/audit-service";
import { type AuditEntry, type AuditOutcome } from "@/types/audit";

const outcomeLabels: Record<AuditOutcome, string> = {
  success: "Sucesso",
  failure: "Falha",
  cancelled: "Cancelado",
};

const outcomeVariants: Record<AuditOutcome, BadgeVariantProps["variant"]> = {
  success: "success",
  failure: "danger",
  cancelled: "default",
};

function loadRecentEntries(): Promise<AuditEntry[]> {
  return listAuditEntries(50);
}

export function AuditSection() {
  const entries = useAsyncResource(loadRecentEntries);

  return (
    <Card>
      <CardHeader>
        <div className="grid gap-1">
          <CardTitle>Log de auditoria</CardTitle>
          <CardDescription>
            Operações sensíveis registradas localmente. O log é somente inserção.
          </CardDescription>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={entries.reload} aria-label="Atualizar log">
          <RotateCw aria-hidden="true" />
        </Button>
      </CardHeader>
      <CardContent>
        <ResourceView resource={entries} className="py-8">
          {(data) =>
            data.length === 0 ? (
              <EmptyState
                icon={ScrollText}
                title="Nenhum registro ainda"
                description="Alterações de configurações aparecerão aqui."
              />
            ) : (
              <AuditTable entries={data} />
            )
          }
        </ResourceView>
      </CardContent>
    </Card>
  );
}

function AuditTable({ entries }: { entries: readonly AuditEntry[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data/hora</TableHead>
          <TableHead>Categoria</TableHead>
          <TableHead>Ação</TableHead>
          <TableHead>Alvo</TableHead>
          <TableHead>Resultado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell className="font-mono text-xs whitespace-nowrap tabular">
              {formatDateTime(entry.occurredAt)}
            </TableCell>
            <TableCell>{entry.category}</TableCell>
            <TableCell className="font-mono text-xs">{entry.action}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              {entry.target ?? "—"}
            </TableCell>
            <TableCell>
              <Badge variant={outcomeVariants[entry.outcome]}>{outcomeLabels[entry.outcome]}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
