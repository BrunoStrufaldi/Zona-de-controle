import { CircleCheck, Cpu, HardDrive, MemoryStick, type LucideIcon } from "lucide-react";

import { WidgetCard } from "@/components/shared/widget-card";
import { Badge } from "@/components/ui/badge";
import { FindingItem } from "@/features/system/diagnostics/components/finding-item";
import {
  type CheckResult,
  checkCriteria,
  checkLabels,
  checkSummary,
  type DiagnosticCheckId,
} from "@/features/system/diagnostics/domain/findings";
import { type DiagnosticReport } from "@/features/system/diagnostics/types";
import { healthBadgeVariant } from "@/features/system/components/health-styles";
import { healthLabels } from "@/features/system/domain/health";

const checkIcons: Record<DiagnosticCheckId, LucideIcon> = {
  storage: HardDrive,
  memory: MemoryStick,
  programs: Cpu,
};

interface CheckCardProps {
  result: CheckResult;
  report: DiagnosticReport;
}

export function CheckCard({ result, report }: CheckCardProps) {
  const { check, status, findings } = result;

  return (
    <WidgetCard
      title={checkLabels[check]}
      icon={checkIcons[check]}
      headerExtra={<Badge variant={healthBadgeVariant[status]}>{healthLabels[status]}</Badge>}
      contentClassName="gap-4"
    >
      {findings.length === 0 ? (
        <p className="flex items-start gap-2 text-sm">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          <span>
            <span className="font-medium">Tudo certo.</span>{" "}
            <span className="text-muted-foreground">{checkSummary(check, report)}</span>
          </span>
        </p>
      ) : (
        <ul className="grid gap-4" aria-label={`Alertas de ${checkLabels[check]}`}>
          {findings.map((finding, index) => (
            // Achados não têm id; a ordem vem do Rust e é estável na mesma análise.
            <FindingItem key={index} finding={finding} />
          ))}
        </ul>
      )}
      <p className="mt-auto border-t border-border pt-3 text-xs text-subtle-foreground">
        {checkCriteria(check, report)}
      </p>
    </WidgetCard>
  );
}
