import { useCallback, useEffect, useMemo, useState } from "react";

import { type ViewRange, viewRange } from "@/features/productivity/calendar/domain/range";
import {
  type CalendarAgenda,
  type CalendarEvent,
  type CalendarView,
  type EventInput,
  type OccurrenceInput,
} from "@/features/productivity/calendar/types";
import { type AsyncResource, type AsyncResourceState } from "@/hooks/use-async-resource";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  deleteEventOccurrence,
  listCalendar,
  updateCalendarEvent,
  updateEventOccurrence,
} from "@/services/calendar-service";
import { toServiceError } from "@/services/tauri/errors";
import { type IsoDate } from "@/types/common";

export interface CalendarActions {
  /** Cria (`id` nulo) ou edita toda a série. */
  saveEvent: (id: number | null, input: EventInput) => Promise<CalendarEvent>;
  saveOccurrence: (
    eventId: number,
    occurrenceDate: IsoDate,
    input: OccurrenceInput,
  ) => Promise<void>;
  /** Exclusões definitivas — chame apenas após confirmação do usuário. */
  removeEvent: (id: number) => Promise<void>;
  removeOccurrence: (eventId: number, occurrenceDate: IsoDate) => Promise<void>;
}

/**
 * Agenda do período exibido (`view` + `anchor`). Trocar de período recarrega;
 * depois de cada alteração a agenda é recarregada sem voltar ao estado de
 * carregamento. Erros viram `ServiceError`.
 */
export function useCalendar(
  view: CalendarView,
  anchor: IsoDate,
): { range: ViewRange; resource: AsyncResource<CalendarAgenda>; actions: CalendarActions } {
  const range = useMemo(() => viewRange(view, anchor), [view, anchor]);
  const { from, to } = range;
  const [state, setState] = useState<AsyncResourceState<CalendarAgenda>>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const [loadedRange, setLoadedRange] = useState(`${from}/${to}`);

  // Novo período: mostra o carregamento em vez da agenda do período anterior.
  if (loadedRange !== `${from}/${to}`) {
    setLoadedRange(`${from}/${to}`);
    setState({ status: "loading" });
  }

  useEffect(() => {
    let active = true;
    listCalendar(from, to).then(
      (agenda) => {
        if (active) setState({ status: "success", data: agenda });
      },
      (error: unknown) => {
        if (active) setState({ status: "error", error: toServiceError(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [from, to, reloadToken]);

  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    refresh();
  }, [refresh]);

  const actions = useMemo<CalendarActions>(() => {
    /** Executa a alteração e recarrega a agenda (mesmo se falhar). */
    const mutate = async <T>(operation: () => Promise<T>): Promise<T> => {
      try {
        return await operation();
      } catch (error) {
        throw toServiceError(error);
      } finally {
        refresh();
      }
    };
    return {
      saveEvent: (id, input) =>
        mutate(() => (id === null ? createCalendarEvent(input) : updateCalendarEvent(id, input))),
      saveOccurrence: (eventId, occurrenceDate, input) =>
        mutate(() => updateEventOccurrence(eventId, occurrenceDate, input)),
      removeEvent: (id) => mutate(() => deleteCalendarEvent(id)),
      removeOccurrence: (eventId, occurrenceDate) =>
        mutate(() => deleteEventOccurrence(eventId, occurrenceDate)),
    };
  }, [refresh]);

  const resource = useMemo(() => ({ ...state, reload }), [state, reload]);
  return { range, resource, actions };
}
