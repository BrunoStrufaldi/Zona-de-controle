import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router";

import { ErrorState } from "@/components/shared/error-state";

function describeError(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} — ${error.statusText}`;
  if (error instanceof Error) return error.message;
  return "Erro desconhecido.";
}

/** Exibido quando uma página lança erro durante a renderização ou carregamento. */
export function RouteErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();

  return (
    <ErrorState
      title="Não foi possível exibir esta página"
      message={describeError(error)}
      onRetry={() => {
        void navigate(0);
      }}
      className="my-10"
    />
  );
}
