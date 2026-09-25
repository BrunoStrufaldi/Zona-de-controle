import { MonitorSmartphone } from "lucide-react";
import { type ReactNode } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingState } from "@/components/shared/loading-state";
import { type AsyncResource } from "@/hooks/use-async-resource";

interface ResourceViewProps<T> {
  resource: AsyncResource<T>;
  children: (data: T) => ReactNode;
  loadingLabel?: string;
  className?: string;
}

/**
 * Renderiza os estados de um recurso assíncrono: carregando, erro (com nova
 * tentativa), indisponível no navegador (`dev:web`) e sucesso.
 */
export function ResourceView<T>({
  resource,
  children,
  loadingLabel,
  className,
}: ResourceViewProps<T>) {
  if (resource.status === "loading") {
    return <LoadingState label={loadingLabel} className={className} />;
  }

  if (resource.status === "error") {
    if (resource.error.kind === "desktop-only") {
      return (
        <EmptyState
          icon={MonitorSmartphone}
          title="Disponível apenas no app desktop"
          description={resource.error.message}
          className={className}
        />
      );
    }
    return (
      <ErrorState
        message={resource.error.message}
        onRetry={resource.reload}
        className={className}
      />
    );
  }

  return <>{children(resource.data)}</>;
}
