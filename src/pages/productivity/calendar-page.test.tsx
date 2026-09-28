import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { newEventHref, paths, taskHref } from "@/app/router/paths";
import { addDays, toIsoDate, weekdayOf } from "@/lib/dates";
import { formatDate, formatFullDate } from "@/lib/format";
import { weekdayLong } from "@/lib/weekdays";
import { showSystemNotification } from "@/services/notifications-service";
import { useUiStore } from "@/stores/ui-store";
import { mockCalendarBackend } from "@/test/fake-calendar-backend";
import { renderRoute } from "@/test/render";

vi.mock("@/services/notifications-service", () => ({
  showSystemNotification: vi.fn(() => Promise.resolve(true)),
}));

const DAILY = {
  frequency: "daily" as const,
  interval: 1,
  weekdays: [],
  until: null,
  count: null,
};

/** Célula do dia na visão mensal. */
async function dayCell(date: string) {
  return within(await screen.findByRole("listitem", { name: formatFullDate(date) }));
}

describe("página do Calendário", () => {
  beforeEach(() => {
    useUiStore.setState({ calendarView: "month" });
  });

  it("cria um evento mantendo a duração ao mudar o horário de início", async () => {
    const user = userEvent.setup();
    const backend = mockCalendarBackend();
    renderRoute(paths.productivity.calendar);

    await screen.findByRole("list", { name: "Dias do mês" });
    await user.click(screen.getByRole("button", { name: "Novo evento" }));
    const dialog = await screen.findByRole("dialog", { name: "Novo evento" });

    await user.click(within(dialog).getByRole("button", { name: /Criar evento/ }));
    expect(await within(dialog).findByText("Informe um título.")).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Título *"), "Dentista");
    fireEvent.change(within(dialog).getByLabelText("Horário de início"), {
      target: { value: "14:30" },
    });
    expect(within(dialog).getByLabelText("Horário de término")).toHaveValue("15:30");
    await user.type(within(dialog).getByLabelText("Local"), "Clínica");
    await user.click(within(dialog).getByRole("button", { name: /Criar evento/ }));

    await waitFor(() => {
      expect(backend.handlers.create_calendar_event).toHaveBeenCalledWith({
        input: {
          title: "Dentista",
          description: "",
          location: "Clínica",
          allDay: false,
          startDate: backend.today,
          startTime: "14:30",
          endDate: backend.today,
          endTime: "15:30",
          reminderMinutes: null,
          color: "blue",
          recurrence: null,
        },
      });
    });
    const cell = await dayCell(backend.today);
    expect(await cell.findByRole("button", { name: "Dentista, 14:30 – 15:30" })).toBeVisible();
  });

  it("abre o formulário pelo link do menu Criar", async () => {
    mockCalendarBackend();
    renderRoute(newEventHref);

    expect(await screen.findByRole("dialog", { name: "Novo evento" })).toBeInTheDocument();
  });

  it("edita só uma ocorrência de um evento recorrente", async () => {
    const user = userEvent.setup();
    const backend = mockCalendarBackend([
      { title: "Daily", dayOffset: -1, recurrence: DAILY, reminderMinutes: 10 },
    ]);
    renderRoute(paths.productivity.calendar);

    const cell = await dayCell(backend.today);
    await user.click(await cell.findByRole("button", { name: "Daily, 10:00 – 11:00" }));
    const details = await screen.findByRole("dialog", { name: "Daily" });
    expect(within(details).getByText("Todo dia")).toBeInTheDocument();
    expect(within(details).getByText("10 minutos antes")).toBeInTheDocument();

    await user.click(within(details).getByRole("button", { name: /Editar ocorrência/ }));
    const form = await screen.findByRole("dialog", { name: "Editar esta ocorrência" });
    // Sem repetição nem cor: valem para a série.
    expect(within(form).queryByLabelText("Repetir")).not.toBeInTheDocument();
    const title = within(form).getByLabelText("Título *");
    await user.clear(title);
    await user.type(title, "Daily longa");
    await user.click(within(form).getByRole("button", { name: /Salvar alterações/ }));

    await waitFor(() => {
      expect(backend.handlers.update_event_occurrence).toHaveBeenCalledWith({
        eventId: 1,
        occurrenceDate: backend.today,
        input: {
          title: "Daily longa",
          description: "",
          location: "",
          allDay: false,
          startDate: backend.today,
          startTime: "10:00",
          endDate: backend.today,
          endTime: "11:00",
          reminderMinutes: 10,
        },
      });
    });
    expect(await cell.findByRole("button", { name: "Daily longa, 10:00 – 11:00" })).toBeVisible();
    // O dia seguinte continua com a série.
    const tomorrow = await dayCell(addDays(backend.today, 1));
    expect(tomorrow.getByRole("button", { name: "Daily, 10:00 – 11:00" })).toBeVisible();
  });

  it("exclui uma ocorrência ou a série inteira com confirmação", async () => {
    const user = userEvent.setup();
    const backend = mockCalendarBackend([{ title: "Aula", dayOffset: -1, recurrence: DAILY }]);
    renderRoute(paths.productivity.calendar);

    // Só esta ocorrência (padrão).
    let cell = await dayCell(backend.today);
    await user.click(await cell.findByRole("button", { name: "Aula, 10:00 – 11:00" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Aula" })).getByRole("button", {
        name: /Excluir/,
      }),
    );
    let confirm = await screen.findByRole("alertdialog", { name: "Excluir evento?" });
    expect(confirm).toHaveTextContent("log de auditoria");
    await user.click(within(confirm).getByRole("button", { name: /Excluir ocorrência/ }));
    await waitFor(() => {
      expect(backend.handlers.delete_event_occurrence).toHaveBeenCalledWith({
        eventId: 1,
        occurrenceDate: backend.today,
      });
    });
    await waitFor(() => {
      expect(cell.queryByRole("button", { name: /Aula/ })).not.toBeInTheDocument();
    });

    // Toda a série.
    cell = await dayCell(addDays(backend.today, 1));
    await user.click(cell.getByRole("button", { name: "Aula, 10:00 – 11:00" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Aula" })).getByRole("button", {
        name: /Excluir/,
      }),
    );
    confirm = await screen.findByRole("alertdialog", { name: "Excluir evento?" });
    await user.click(within(confirm).getByRole("radio", { name: /Toda a série/ }));
    expect(confirm).toHaveTextContent("com todas as ocorrências");
    await user.click(within(confirm).getByRole("button", { name: /Excluir evento/ }));
    await waitFor(() => {
      expect(backend.handlers.delete_calendar_event).toHaveBeenCalledWith({ id: 1 });
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Aula,/ })).not.toBeInTheDocument();
    });
  });

  it("mostra tarefas com vencimento como link para a tarefa", async () => {
    const today = toIsoDate(new Date());
    mockCalendarBackend([], {
      tasks: [{ id: 7, title: "Pagar conta", dueDate: today, status: "todo", priority: "high" }],
    });
    renderRoute(paths.productivity.calendar);

    const cell = await dayCell(today);
    expect(await cell.findByRole("link", { name: "Tarefa: Pagar conta" })).toHaveAttribute(
      "href",
      taskHref(7),
    );
  });

  it("alterna entre as visões semanal e diária", async () => {
    const user = userEvent.setup();
    const backend = mockCalendarBackend([
      { title: "Reunião", startTime: "09:00", endTime: "10:00" },
    ]);
    renderRoute(paths.productivity.calendar);

    await screen.findByRole("list", { name: "Dias do mês" });
    await user.click(screen.getByRole("tab", { name: /Semana/ }));
    const column = await screen.findByRole("group", {
      name: `Horários de ${formatFullDate(backend.today)}`,
    });
    expect(within(column).getByRole("button", { name: "Reunião, 09:00 – 10:00" })).toBeVisible();

    await user.click(
      screen.getByRole("button", {
        name: `Abrir ${weekdayLong(weekdayOf(backend.today))}, ${formatDate(backend.today)}`,
      }),
    );
    expect(
      await screen.findByRole("heading", { name: formatFullDate(backend.today) }),
    ).toBeInTheDocument();
    expect(useUiStore.getState().calendarView).toBe("day");

    await user.click(screen.getByRole("button", { name: "Próximo dia" }));
    const tomorrow = addDays(backend.today, 1);
    expect(await screen.findByRole("heading", { name: formatFullDate(tomorrow) })).toBeVisible();
    await waitFor(() => {
      expect(backend.handlers.list_calendar).toHaveBeenLastCalledWith({
        from: tomorrow,
        to: tomorrow,
      });
    });
  });

  it("mostra os lembretes vencidos como notificação do sistema", async () => {
    const today = toIsoDate(new Date());
    const backend = mockCalendarBackend([], {
      reminders: [
        {
          eventId: 1,
          occurrenceDate: today,
          title: "Dentista",
          location: "Clínica",
          allDay: false,
          startDate: today,
          startTime: "14:30",
          remindAt: `${today}T14:20`,
        },
      ],
    });
    renderRoute(paths.productivity.calendar);

    await waitFor(() => {
      expect(showSystemNotification).toHaveBeenCalledWith("Dentista", "Hoje às 14:30 · Clínica");
    });
    expect(backend.handlers.claim_due_reminders).toHaveBeenCalled();
  });
});
