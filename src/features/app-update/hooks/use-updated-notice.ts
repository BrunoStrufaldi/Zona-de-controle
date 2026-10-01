import { useEffect } from "react";
import { toast } from "sonner";

import { getAppInfo } from "@/services/app-service";

/**
 * Na primeira abertura depois de uma atualização, avisa a versão nova. O Rust
 * decide (compara com a versão da última abertura) e audita.
 */
export function useUpdatedNotice(): void {
  useEffect(() => {
    let active = true;
    getAppInfo().then(
      (info) => {
        if (!active || !info.updatedFrom) return;
        toast.success(`Zona de Controle atualizado para a versão ${info.version}`, {
          description: `Versão anterior: ${info.updatedFrom}.`,
        });
      },
      () => {
        // Sem a informação, só não há aviso (ex.: fora do app desktop).
      },
    );
    return () => {
      active = false;
    };
  }, []);
}
