import { useAsyncResource } from "@/hooks/use-async-resource";
import { getDisplayName } from "@/services/settings-service";

/**
 * Nome de exibição salvo nas configurações. Retorna `null` enquanto carrega,
 * se não estiver definido ou fora do app desktop.
 */
export function useDisplayName(): string | null {
  const resource = useAsyncResource(getDisplayName);
  return resource.status === "success" ? resource.data : null;
}
