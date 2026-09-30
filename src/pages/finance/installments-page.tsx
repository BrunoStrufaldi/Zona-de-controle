import { Layers } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { ResourceView } from "@/components/shared/resource-view";
import { InstallmentsView } from "@/features/finance/components/installments-view";
import { useInstallments } from "@/features/finance/hooks/use-finance";

export function InstallmentsPage() {
  const resource = useInstallments();

  return (
    <>
      <PageHeader
        title="Parcelamentos"
        description="Compras parceladas das faturas importadas: parcela atual, quanto falta, quando termina e quanto das próximas faturas já está comprometido."
        icon={Layers}
      />
      <ResourceView resource={resource} loadingLabel="Carregando parcelamentos…">
        {(data) => <InstallmentsView data={data} />}
      </ResourceView>
    </>
  );
}
