import { CalendarCheck, Check, Flame, MoreHorizontal, Pencil, Trash2, Trophy } from "lucide-react";
import { type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import {
  describeSchedule,
  isDayComplete,
  isMarkable,
  todayProgress,
} from "@/features/productivity/routines/domain/routines";
import { type Routine, type RoutineDay } from "@/features/productivity/routines/types";
import { cn } from "@/lib/cn";
import { dayOfMonth, weekdayOf } from "@/lib/dates";
import { formatDate, formatPercent } from "@/lib/format";
import { safeRatio } from "@/lib/math";
import { weekdayShort } from "@/lib/weekdays";

interface RoutineCardProps {
  routine: Routine;
  onToggleHabit: (habitId: number, date: string, done: boolean) => void;
  onEdit: (routine: Routine) => void;
  onDelete: (routine: Routine) => void;
}

export function RoutineCard({ routine, onToggleHabit, onEdit, onDelete }: RoutineCardProps) {
  const today = todayProgress(routine);
  const days = routine.recentDays;
  const lastIndex = days.length - 1;

  return (
    <article
      aria-label={`Rotina ${routine.name}`}
      className="grid animate-fade-in gap-4 rounded-xl border border-border bg-card p-5 shadow-card"
    >
      <header className="flex flex-wrap items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 className="truncate text-base font-semibold">{routine.name}</h2>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarCheck className="size-3.5" aria-hidden="true" />
            {describeSchedule(routine.weekdays)}
          </p>
        </div>
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Stat icon={Flame} label="Sequência" iconClass="text-primary">
            {routine.currentStreak} {routine.currentStreak === 1 ? "dia" : "dias"}
          </Stat>
          <Stat icon={Trophy} label="Recorde" iconClass="text-warning">
            {routine.bestStreak} {routine.bestStreak === 1 ? "dia" : "dias"}
          </Stat>
          <Stat icon={Check} label="Consistência (30 dias)" iconClass="text-success">
            {routine.consistency === null ? "—" : formatPercent(routine.consistency, 0)}
          </Stat>
        </dl>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Ações da rotina “${routine.name}”`}>
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              onSelect={() => {
                onEdit(routine);
              }}
            >
              <Pencil aria-hidden="true" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-danger focus:text-danger [&_svg]:text-danger"
              onSelect={() => {
                onDelete(routine);
              }}
            >
              <Trash2 aria-hidden="true" />
              Excluir…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {today.scheduled ? (
        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Hoje</span>
            <span>
              <span className="font-mono font-medium tabular">{today.done}</span>
              <span className="text-muted-foreground">
                {" "}
                de {today.total} {today.total === 1 ? "hábito" : "hábitos"}
              </span>
            </span>
          </div>
          <Progress
            value={safeRatio(today.done, today.total) * 100}
            aria-label={`Progresso de hoje em ${routine.name}`}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Hoje não está na agenda desta rotina.</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-separate border-spacing-y-1 text-sm">
          <caption className="sr-only">
            Hábitos de {routine.name} nos últimos {days.length} dias
          </caption>
          <thead>
            <tr>
              <th scope="col" className="pr-3 text-left text-xs font-medium text-muted-foreground">
                Hábito
              </th>
              {days.map((day, index) => (
                <th
                  key={day.date}
                  scope="col"
                  title={formatDate(day.date)}
                  className={cn(
                    "w-12 rounded-t-md px-1 pt-1 text-center text-[11px] font-medium text-muted-foreground",
                    index === lastIndex && "bg-primary/10 text-primary",
                  )}
                >
                  {index === lastIndex ? (
                    "Hoje"
                  ) : (
                    <>
                      <span className="block">{weekdayShort(weekdayOf(day.date))}</span>
                      <span className="font-mono tabular">{dayOfMonth(day.date)}</span>
                    </>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {routine.habits.map((habit) => (
              <tr key={habit.id}>
                <th scope="row" className="max-w-56 truncate pr-3 text-left font-normal">
                  {habit.name}
                </th>
                {days.map((day, index) => (
                  <td
                    key={day.date}
                    className={cn("text-center", index === lastIndex && "bg-primary/10")}
                  >
                    <HabitCell
                      day={day}
                      habitId={habit.id}
                      label={`${habit.name} em ${formatDate(day.date)}`}
                      onToggle={onToggleHabit}
                    />
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th
                scope="row"
                className="pt-1 pr-3 text-left text-xs font-medium text-muted-foreground"
              >
                Dia completo
              </th>
              {days.map((day, index) => (
                <td
                  key={day.date}
                  className={cn(
                    "rounded-b-md pt-1 text-center",
                    index === lastIndex && "bg-primary/10",
                  )}
                >
                  <DayStatus day={day} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  );
}

function Stat({
  icon: Icon,
  label,
  iconClass,
  children,
}: {
  icon: typeof Flame;
  label: string;
  iconClass: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5" title={label}>
      <Icon className={cn("size-3.5", iconClass)} aria-hidden="true" />
      <dt className="sr-only">{label}</dt>
      <dd className="font-medium text-foreground">{children}</dd>
    </div>
  );
}

interface HabitCellProps {
  day: RoutineDay;
  habitId: number;
  label: string;
  onToggle: (habitId: number, date: string, done: boolean) => void;
}

function HabitCell({ day, habitId, label, onToggle }: HabitCellProps) {
  if (!isMarkable(day, habitId)) {
    return (
      <span
        className="text-subtle-foreground"
        title={day.scheduled ? "O hábito não existia neste dia" : "Fora da agenda"}
        aria-label={`${label}: fora da agenda`}
      >
        —
      </span>
    );
  }
  const done = day.completedHabitIds.includes(habitId);
  return (
    <Checkbox
      checked={done}
      aria-label={label}
      className="mx-auto"
      onCheckedChange={(checked) => {
        onToggle(habitId, day.date, checked === true);
      }}
    />
  );
}

function DayStatus({ day }: { day: RoutineDay }) {
  if (!day.scheduled || day.habitIds.length === 0) {
    return <span className="sr-only">Fora da agenda</span>;
  }
  const complete = isDayComplete(day);
  return (
    <span
      className={cn(
        "mx-auto block size-2 rounded-full",
        complete ? "bg-success" : "border border-border-strong",
      )}
      title={complete ? "Dia completo" : "Dia incompleto"}
      aria-label={complete ? "Completo" : "Incompleto"}
      role="img"
    />
  );
}
