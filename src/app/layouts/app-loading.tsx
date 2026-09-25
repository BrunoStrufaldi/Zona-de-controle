import { LoadingState } from "@/components/shared/loading-state";

/** Tela exibida enquanto a primeira rota é carregada. */
export function AppLoading() {
  return <LoadingState label="Iniciando Zona de Controle…" className="h-screen" />;
}
