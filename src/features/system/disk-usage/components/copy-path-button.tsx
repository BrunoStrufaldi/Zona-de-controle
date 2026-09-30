import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

interface CopyPathButtonProps {
  path: string;
  className?: string;
}

/** Copia o caminho para a área de transferência (a tela não abre nem altera nada). */
export function CopyPathButton({ path, className }: CopyPathButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("size-7 shrink-0", className)}
      aria-label={`Copiar o caminho ${path}`}
      title="Copiar caminho"
      onClick={() => {
        navigator.clipboard.writeText(path).then(
          () => {
            toast.success("Caminho copiado", { description: path });
          },
          () => {
            toast.error("Não foi possível copiar o caminho");
          },
        );
      }}
    >
      <Copy aria-hidden="true" />
    </Button>
  );
}
