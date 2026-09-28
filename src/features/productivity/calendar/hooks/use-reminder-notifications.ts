import { useEffect } from "react";
import { toast } from "sonner";

import {
  REMINDER_POLL_MS,
  reminderMessage,
} from "@/features/productivity/calendar/domain/reminders";
import { toIsoDate } from "@/lib/dates";
import { claimDueReminders } from "@/services/calendar-service";
import { showSystemNotification } from "@/services/notifications-service";
import { isDesktopRuntime } from "@/services/tauri/runtime";

/**
 * Enquanto o app está aberto (mesmo minimizado), consulta os lembretes vencidos
 * e mostra cada um como notificação do Windows e também como aviso dentro do
 * app — o Windows pode estar com as notificações desativadas, e o plugin não
 * tem como saber. O backend devolve cada lembrete uma única vez.
 */
export function useReminderNotifications(intervalMs = REMINDER_POLL_MS): void {
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let busy = false;

    const check = async () => {
      if (busy) return;
      busy = true;
      try {
        const today = toIsoDate(new Date());
        for (const reminder of await claimDueReminders()) {
          const { title, body } = reminderMessage(reminder, today);
          toast.info(`Lembrete: ${title}`, { description: body, duration: 30_000 });
          await showSystemNotification(title, body).catch(() => false);
        }
      } catch {
        // Falha pontual (ex.: banco ocupado): tenta de novo no próximo ciclo.
      } finally {
        busy = false;
      }
    };

    void check();
    const timer = setInterval(() => void check(), intervalMs);
    return () => {
      clearInterval(timer);
    };
  }, [intervalMs]);
}
