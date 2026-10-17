import { CircleCheck, Lightbulb, ListChecks, OctagonAlert, TriangleAlert } from "lucide-react";

import { WidgetCard } from "@/components/shared/widget-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { levelBadgeVariant } from "@/features/system/system-settings/components/system-settings-styles";
import {
  type FindingText,
  type GuideTopic,
  levelLabels,
} from "@/features/system/system-settings/domain/settings";
import { type FindingLevel } from "@/features/system/system-settings/types";
import { cn } from "@/lib/cn";

/** Ajuste que o app pode aplicar para resolver o achado (4.6). */
export interface FindingChangeControl {
  checked: boolean;
  disabled?: boolean;
  onToggle: (checked: boolean) => void;
}

export interface FindingEntry {
  level: FindingLevel;
  text: FindingText;
  change?: FindingChangeControl;
}

const levelIcons = {
  suggestion: Lightbulb,
  attention: TriangleAlert,
  critical: OctagonAlert,
} as const;

const levelIconClass: Record<FindingLevel, string> = {
  suggestion: "text-info",
  attention: "text-warning",
  critical: "text-danger",
};

interface FindingsCardProps {
  findings: FindingEntry[];
  /** Resumo do que foi verificado, quando não há nada a melhorar. */
  emptyMessage: string;
  onGuide?: (topic: GuideTopic) => void;
}

/** Lista do que dá para melhorar: ícone + selo (nunca só a cor), dados e recomendação. */
export function FindingsCard({ findings, emptyMessage, onGuide }: FindingsCardProps) {
  return (
    <WidgetCard title="O que dá para melhorar" icon={ListChecks} contentClassName="gap-4">
      {findings.length === 0 ? (
        <p className="flex items-start gap-2 text-sm">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          <span>
            <span className="font-medium">Nada a melhorar.</span>{" "}
            <span className="text-muted-foreground">{emptyMessage}</span>
          </span>
        </p>
      ) : (
        <ul className="grid gap-4" aria-label="Sugestões e alertas">
          {findings.map(({ level, text, change }, index) => {
            const Icon = levelIcons[level];
            const guide = text.guide;
            return (
              // Achados não têm id; a ordem vem do Rust e é estável na mesma leitura.
              <li key={index} className="flex gap-3">
                <Icon
                  className={cn("mt-0.5 size-4 shrink-0", levelIconClass[level])}
                  aria-hidden="true"
                />
                <div className="grid min-w-0 gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium break-words">{text.title}</span>
                    <Badge variant={levelBadgeVariant[level]}>{levelLabels[level]}</Badge>
                  </div>
                  <span className="font-mono text-xs break-words text-muted-foreground tabular">
                    {text.detail}
                  </span>
                  <p className="text-sm text-muted-foreground">{text.recommendation}</p>
                  {change && (
                    <label className="flex w-fit items-center gap-2 text-sm font-medium">
                      <Checkbox
                        aria-label={`Aplicar: ${text.title}`}
                        checked={change.checked}
                        disabled={change.disabled}
                        onCheckedChange={(checked) => {
                          change.onToggle(checked === true);
                        }}
                      />
                      Aplicar pelo app
                    </label>
                  )}
                  {guide && onGuide && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-fit"
                      onClick={() => {
                        onGuide(guide);
                      }}
                    >
                      Ver o passo a passo
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}
