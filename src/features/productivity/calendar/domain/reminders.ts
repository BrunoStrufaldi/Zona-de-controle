import { type DueReminder } from "@/features/productivity/calendar/types";
import { addDays } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { type IsoDate } from "@/types/common";

/** Intervalo entre as consultas de lembretes vencidos (o backend tolera 15 min de atraso). */
export const REMINDER_POLL_MS = 30_000;

/** Título e texto da notificação de um lembrete. */
export function reminderMessage(
  reminder: DueReminder,
  today: IsoDate,
): { title: string; body: string } {
  const day =
    reminder.startDate === today
      ? "Hoje"
      : reminder.startDate === addDays(today, 1)
        ? "Amanhã"
        : formatDate(reminder.startDate);
  const when =
    reminder.allDay || reminder.startTime === null
      ? `${day}, dia inteiro`
      : `${day} às ${reminder.startTime}`;
  const location = reminder.location.trim();
  return { title: reminder.title, body: location === "" ? when : `${when} · ${location}` };
}
