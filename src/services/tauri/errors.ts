/** Categorias de erro. As do backend vêm de `AppError::kind` (src-tauri/src/error.rs). */
export type ServiceErrorKind =
  | "database"
  | "migration"
  | "serialization"
  | "io"
  | "tauri"
  | "validation"
  | "not_found"
  | "internal"
  | "desktop-only"
  | "unknown";

const BACKEND_KINDS: ReadonlySet<string> = new Set([
  "database",
  "migration",
  "serialization",
  "io",
  "tauri",
  "validation",
  "not_found",
  "internal",
]);

/** Erro normalizado de qualquer chamada à camada nativa. */
export class ServiceError extends Error {
  readonly kind: ServiceErrorKind;

  constructor(kind: ServiceErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ServiceError";
    this.kind = kind;
  }
}

function isBackendError(value: unknown): value is { kind: string; message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    "message" in value &&
    typeof value.kind === "string" &&
    typeof value.message === "string"
  );
}

function isKnownBackendKind(kind: string): kind is ServiceErrorKind {
  return BACKEND_KINDS.has(kind);
}

/** Converte o que o `invoke` rejeitar em `ServiceError`. */
export function toServiceError(error: unknown): ServiceError {
  if (error instanceof ServiceError) return error;
  if (isBackendError(error)) {
    const kind = isKnownBackendKind(error.kind) ? error.kind : "unknown";
    return new ServiceError(kind, error.message, { cause: error });
  }
  if (error instanceof Error) return new ServiceError("unknown", error.message, { cause: error });
  return new ServiceError("unknown", typeof error === "string" ? error : "Erro desconhecido.");
}

export const DESKTOP_ONLY_MESSAGE =
  "Este recurso usa o banco local e só está disponível no app desktop (npm run dev).";
