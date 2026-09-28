import { CalendarDays, Plus } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

import { NEW_EVENT_PARAM } from "@/app/router/paths";
import { PageHeader } from "@/components/shared/page-header";
import { ResourceView } from "@/components/shared/resource-view";
import { Button } from "@/components/ui/button";
import { CalendarToolbar } from "@/features/productivity/calendar/components/calendar-toolbar";
import {
  DeleteEventDialog,
  type DeleteScope,
} from "@/features/productivity/calendar/components/delete-event-dialog";
import { EventDetailsDialog } from "@/features/productivity/calendar/components/event-details-dialog";
import {
  EventFormDialog,
  type EventFormMode,
} from "@/features/productivity/calendar/components/event-form-dialog";
import { MonthView } from "@/features/productivity/calendar/components/month-view";
import { TimeGridView } from "@/features/productivity/calendar/components/time-grid-view";
import { itemsByDay } from "@/features/productivity/calendar/domain/agenda";
import {
  type EventDraft,
  toEventInput,
  toOccurrenceInput,
} from "@/features/productivity/calendar/domain/input";
import { shiftAnchor } from "@/features/productivity/calendar/domain/range";
import { useCalendar } from "@/features/productivity/calendar/hooks/use-calendar";
import { type EventOccurrence } from "@/features/productivity/calendar/types";
import { toIsoDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { toServiceError } from "@/services/tauri/errors";
import { useUiStore } from "@/stores/ui-store";
import { type IsoDate } from "@/types/common";

function notifyError(title: string, error: unknown) {
  toast.error(title, { description: toServiceError(error).message });
}

export function CalendarPage() {
  const today = toIsoDate(new Date());
  const view = useUiStore((state) => state.calendarView);
  const setView = useUiStore((state) => state.setCalendarView);
  const [anchor, setAnchor] = useState<IsoDate>(today);
  const { range, resource, actions } = useCalendar(view, anchor);
  const [formMode, setFormMode] = useState<EventFormMode | null>(null);
  const [selected, setSelected] = useState<EventOccurrence | null>(null);
  const [deleting, setDeleting] = useState<EventOccurrence | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const createRequested = searchParams.get(NEW_EVENT_PARAM) === "1";
  const activeForm: EventFormMode | null =
    formMode ?? (createRequested ? { kind: "create", date: anchor } : null);
  const agenda = resource.status === "success" ? resource.data : null;
  const selectedEvent =
    selected && agenda
      ? (agenda.events.find((event) => event.id === selected.eventId) ?? null)
      : null;

  const closeForm = () => {
    setFormMode(null);
    if (createRequested) {
      setSearchParams(
        (params) => {
          params.delete(NEW_EVENT_PARAM);
          return params;
        },
        { replace: true },
      );
    }
  };

  const openDay = (date: IsoDate) => {
    setAnchor(date);
    setView("day");
  };

  // Erros sobem para o formulário, que os exibe sem fechar.
  const submitForm = async (draft: EventDraft) => {
    if (!activeForm) return;
    if (activeForm.kind === "occurrence") {
      await actions.saveOccurrence(
        activeForm.event.id,
        activeForm.occurrence.occurrenceDate,
        toOccurrenceInput(draft),
      );
      toast.success("Ocorrência atualizada", {
        description: `“${draft.title.trim()}” em ${formatDate(draft.startDate)}`,
      });
    } else {
      const editing = activeForm.kind === "series";
      const saved = await actions.saveEvent(
        editing ? activeForm.event.id : null,
        toEventInput(draft),
      );
      toast.success(editing ? "Evento atualizado" : "Evento criado", {
        description: `“${saved.title}” em ${formatDate(saved.startDate)}`,
      });
      // Mostra o evento criado mesmo que esteja fora do período exibido.
      if (!editing && (saved.startDate < range.from || saved.startDate > range.to)) {
        setAnchor(saved.startDate);
      }
    }
    closeForm();
  };

  const confirmDelete = async (occurrence: EventOccurrence, scope: DeleteScope) => {
    try {
      if (scope === "occurrence") {
        await actions.removeOccurrence(occurrence.eventId, occurrence.occurrenceDate);
        toast.success("Ocorrência excluída", {
          description: `“${occurrence.title}” em ${formatDate(occurrence.startDate)}`,
        });
      } else {
        await actions.removeEvent(occurrence.eventId);
        toast.success("Evento excluído", { description: `“${occurrence.title}”` });
      }
    } catch (error) {
      notifyError("Não foi possível excluir o evento", error);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Calendário"
        description="Eventos, lembretes e tarefas com vencimento em um só lugar."
        icon={CalendarDays}
        actions={
          <Button
            onClick={() => {
              const showsToday = range.from <= today && today <= range.to;
              setFormMode({ kind: "create", date: showsToday ? today : anchor });
            }}
          >
            <Plus aria-hidden="true" />
            Novo evento
          </Button>
        }
      />

      <div className="grid gap-4">
        <CalendarToolbar
          view={view}
          anchor={anchor}
          onViewChange={setView}
          onNavigate={(direction) => {
            setAnchor((current) => shiftAnchor(view, current, direction));
          }}
          onToday={() => {
            setAnchor(today);
          }}
        />

        <ResourceView resource={resource} loadingLabel="Carregando calendário…">
          {(data) => {
            const byDay = itemsByDay(data, range.days);
            return view === "month" ? (
              <MonthView
                days={range.days}
                anchor={anchor}
                today={today}
                byDay={byDay}
                onOpenDay={openDay}
                onCreate={(date) => {
                  setFormMode({ kind: "create", date });
                }}
                onOpen={setSelected}
              />
            ) : (
              <TimeGridView
                key={view}
                days={range.days}
                today={today}
                byDay={byDay}
                {...(view === "week" ? { onOpenDay: openDay } : {})}
                onCreate={(date, hour) => {
                  setFormMode({ kind: "create", date, hour });
                }}
                onOpen={setSelected}
              />
            );
          }}
        </ResourceView>

        <p className="text-xs text-muted-foreground">
          Tarefas com vencimento aparecem no dia; clique para abri-las em Tarefas. Os lembretes
          aparecem como notificação do Windows enquanto o app estiver aberto (mesmo minimizado).
        </p>
      </div>

      <EventDetailsDialog
        occurrence={selected}
        event={selectedEvent}
        onEditOccurrence={(occurrence) => {
          if (!selectedEvent) return;
          setSelected(null);
          setFormMode({ kind: "occurrence", event: selectedEvent, occurrence });
        }}
        onEditSeries={(event) => {
          setSelected(null);
          setFormMode({ kind: "series", event });
        }}
        onDelete={(occurrence) => {
          setSelected(null);
          setDeleting(occurrence);
        }}
        onClose={() => {
          setSelected(null);
        }}
      />
      <EventFormDialog mode={activeForm} onSubmit={submitForm} onClose={closeForm} />
      <DeleteEventDialog
        occurrence={deleting}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleting(null);
        }}
      />
    </>
  );
}
