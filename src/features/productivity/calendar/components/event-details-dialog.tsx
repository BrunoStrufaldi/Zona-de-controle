import { Bell, CalendarClock, MapPin, Pencil, Repeat, Trash2 } from "lucide-react";
import { type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { timeRangeLabel } from "@/features/productivity/calendar/domain/agenda";
import {
  describeEventRecurrence,
  reminderLabel,
} from "@/features/productivity/calendar/domain/input";
import { type CalendarEvent, type EventOccurrence } from "@/features/productivity/calendar/types";
import { cn } from "@/lib/cn";
import { formatDate, formatFullDate } from "@/lib/format";
import { categoryDotClass } from "@/lib/palette";

interface EventDetailsDialogProps {
  /** Ocorrência exibida; `null` fecha o diálogo. */
  occurrence: EventOccurrence | null;
  /** Série da ocorrência (regra de repetição). */
  event: CalendarEvent | null;
  onEditOccurrence: (occurrence: EventOccurrence) => void;
  onEditSeries: (event: CalendarEvent, occurrence: EventOccurrence) => void;
  onDelete: (occurrence: EventOccurrence) => void;
  onClose: () => void;
}

function Detail({ icon: Icon, children }: { icon: typeof Bell; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </li>
  );
}

/** Detalhes de um evento, com editar (ocorrência ou série) e excluir. */
export function EventDetailsDialog({
  occurrence,
  event,
  onEditOccurrence,
  onEditSeries,
  onDelete,
  onClose,
}: EventDetailsDialogProps) {
  const sameDay = occurrence !== null && occurrence.startDate === occurrence.endDate;
  return (
    <Dialog
      open={occurrence !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {occurrence && (
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn("size-3 shrink-0 rounded-full", categoryDotClass[occurrence.color])}
              />
              <span className="min-w-0 break-words">{occurrence.title}</span>
            </DialogTitle>
            <DialogDescription className="first-letter:uppercase">
              {sameDay
                ? formatFullDate(occurrence.startDate)
                : `${formatDate(occurrence.startDate)} a ${formatDate(occurrence.endDate)}`}
            </DialogDescription>
          </DialogHeader>

          <ul className="grid gap-3">
            <Detail icon={CalendarClock}>{timeRangeLabel(occurrence)}</Detail>
            {occurrence.recurring && event?.recurrence && (
              <Detail icon={Repeat}>
                {describeEventRecurrence(event.recurrence)}
                {occurrence.modified && (
                  <Badge variant="outline" className="ml-2">
                    Ocorrência alterada
                  </Badge>
                )}
              </Detail>
            )}
            {occurrence.reminderMinutes !== null && (
              <Detail icon={Bell}>
                {reminderLabel(occurrence.reminderMinutes, occurrence.allDay)}
              </Detail>
            )}
            {occurrence.location !== "" && (
              <Detail icon={MapPin}>
                <span className="break-words">{occurrence.location}</span>
              </Detail>
            )}
          </ul>
          {occurrence.description !== "" && (
            <p className="rounded-lg border border-border bg-raised/40 px-3 py-2 text-sm break-words whitespace-pre-wrap text-muted-foreground">
              {occurrence.description}
            </p>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="ghost"
              className="text-danger hover:text-danger"
              onClick={() => {
                onDelete(occurrence);
              }}
            >
              <Trash2 aria-hidden="true" />
              Excluir
            </Button>
            {occurrence.recurring && event ? (
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    onEditOccurrence(occurrence);
                  }}
                >
                  <Pencil aria-hidden="true" />
                  Editar ocorrência
                </Button>
                <Button
                  onClick={() => {
                    onEditSeries(event, occurrence);
                  }}
                >
                  <Repeat aria-hidden="true" />
                  Editar série
                </Button>
              </div>
            ) : (
              <Button
                disabled={!event}
                onClick={() => {
                  if (event) onEditSeries(event, occurrence);
                }}
              >
                <Pencil aria-hidden="true" />
                Editar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
