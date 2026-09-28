import { toast } from "sonner";

import { ResourceView } from "@/components/shared/resource-view";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThresholdsForm } from "@/features/system/diagnostics/components/thresholds-form";
import { type DiagnosticThresholds } from "@/features/system/diagnostics/types";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { getDiagnosticThresholds, setDiagnosticThresholds } from "@/services/diagnostics-service";

export function DiagnosticsSection() {
  const settings = useAsyncResource(getDiagnosticThresholds);

  const save = async (thresholds: DiagnosticThresholds) => {
    const result = await setDiagnosticThresholds(thresholds);
    toast.success("Limites salvos", {
      description: "Valem na próxima análise. A alteração foi registrada na auditoria.",
    });
    return result;
  };

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <div className="grid gap-1">
          <CardTitle>Limites do diagnóstico</CardTitle>
          <CardDescription>
            Quando o diagnóstico deve alertar. Valem para a tela Diagnósticos e o card do dashboard;
            as cores do Monitoramento continuam fixas.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ResourceView resource={settings} className="py-6">
          {(data) => <ThresholdsForm settings={data} onSave={save} />}
        </ResourceView>
      </CardContent>
    </Card>
  );
}
