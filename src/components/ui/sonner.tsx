import { type CSSProperties } from "react";
import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

/** Mapeia as variáveis do sonner para os tokens do tema. */
const toasterStyle = {
  "--normal-bg": "var(--color-popover)",
  "--normal-text": "var(--color-popover-foreground)",
  "--normal-border": "var(--color-border)",
  "--success-bg": "var(--color-popover)",
  "--success-text": "var(--color-success)",
  "--success-border": "var(--color-border)",
  "--error-bg": "var(--color-popover)",
  "--error-text": "var(--color-danger)",
  "--error-border": "var(--color-border)",
  "--border-radius": "var(--radius-lg)",
} as CSSProperties;

/**
 * Toaster global. Para disparar notificações, use `toast` de "sonner":
 * `toast.success("Configuração salva")`.
 */
export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      closeButton
      style={toasterStyle}
      toastOptions={{ className: "font-sans" }}
      {...props}
    />
  );
}
