import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { type BadgeVariantProps } from "@/components/ui/badge-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supportLevelLabels } from "@/features/system/devices/domain/battery";
import { type SupportLevel } from "@/features/system/devices/types";

const levels: readonly {
  level: SupportLevel;
  variant: BadgeVariantProps["variant"];
  description: string;
}[] = [
  {
    level: "supported",
    variant: "success",
    description: "O dispositivo informa o percentual exato de bateria por uma API padrão.",
  },
  {
    level: "partial",
    variant: "warning",
    description:
      "Apenas uma faixa aproximada (ex.: vazia, baixa, média, cheia) ou só o status de carga.",
  },
  {
    level: "unsupported",
    variant: "default",
    description: "Não há API disponível. A bateria aparece como “Não disponível” — nunca estimada.",
  },
];

export function SupportLevelsCard() {
  return (
    <Card className="animate-slide-up">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          <CardTitle>Níveis de suporte</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4">
          {levels.map(({ level, variant, description }) => (
            <div key={level} className="grid gap-1.5">
              <dt>
                <Badge variant={variant}>{supportLevelLabels[level]}</Badge>
              </dt>
              <dd className="text-sm text-muted-foreground">{description}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
