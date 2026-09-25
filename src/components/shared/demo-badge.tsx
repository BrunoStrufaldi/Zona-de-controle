import { FlaskConical } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Indicador obrigatório para qualquer dado fictício exibido na interface.
 * Nunca exiba dados de `src/mocks` sem este selo.
 */
export function DemoBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="cursor-help" aria-label="Dados de demonstração">
          <FlaskConical aria-hidden="true" />
          Demo
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Dados fictícios, apenas para demonstração do layout.</TooltipContent>
    </Tooltip>
  );
}
