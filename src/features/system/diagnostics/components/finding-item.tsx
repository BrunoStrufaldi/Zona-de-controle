import { OctagonAlert, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { describeFinding, severityLabels } from "@/features/system/diagnostics/domain/findings";
import { type DiagnosticFinding } from "@/features/system/diagnostics/types";
import { healthBadgeVariant } from "@/features/system/components/health-styles";
import { cn } from "@/lib/cn";

interface FindingItemProps {
  finding: DiagnosticFinding;
  /** Sem a recomendação (resumo do dashboard). */
  compact?: boolean;
}

/** Um achado: ícone + selo de gravidade (nunca só a cor), título, números e recomendação. */
export function FindingItem({ finding, compact = false }: FindingItemProps) {
  const text = describeFinding(finding);
  const critical = finding.severity === "critical";
  const Icon = critical ? OctagonAlert : TriangleAlert;

  return (
    <li className="flex gap-3">
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", critical ? "text-danger" : "text-warning")}
        aria-hidden="true"
      />
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium break-words">{text.title}</span>
          <Badge variant={healthBadgeVariant[finding.severity]}>
            {severityLabels[finding.severity]}
          </Badge>
        </div>
        <span className="font-mono text-xs text-muted-foreground tabular">{text.detail}</span>
        {!compact && <p className="text-sm text-muted-foreground">{text.recommendation}</p>}
      </div>
    </li>
  );
}
