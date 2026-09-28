import { type CategoryColor } from "@/types/palette";

/** Chip de evento (visão mensal e faixa de dia inteiro). Classes literais para o Tailwind. */
export const eventChipClass: Record<CategoryColor, string> = {
  red: "border-category-red bg-category-red/15 hover:bg-category-red/25",
  orange: "border-category-orange bg-category-orange/15 hover:bg-category-orange/25",
  amber: "border-category-amber bg-category-amber/15 hover:bg-category-amber/25",
  green: "border-category-green bg-category-green/15 hover:bg-category-green/25",
  teal: "border-category-teal bg-category-teal/15 hover:bg-category-teal/25",
  blue: "border-category-blue bg-category-blue/15 hover:bg-category-blue/25",
  violet: "border-category-violet bg-category-violet/15 hover:bg-category-violet/25",
  pink: "border-category-pink bg-category-pink/15 hover:bg-category-pink/25",
  slate: "border-category-slate bg-category-slate/15 hover:bg-category-slate/25",
};

/** Bloco de evento na grade de horários (fundo opaco para ficar legível sobre as linhas). */
export const eventBlockClass: Record<CategoryColor, string> = {
  red: "border-category-red bg-[color-mix(in_oklab,var(--color-category-red)_22%,var(--color-card))]",
  orange:
    "border-category-orange bg-[color-mix(in_oklab,var(--color-category-orange)_22%,var(--color-card))]",
  amber:
    "border-category-amber bg-[color-mix(in_oklab,var(--color-category-amber)_22%,var(--color-card))]",
  green:
    "border-category-green bg-[color-mix(in_oklab,var(--color-category-green)_22%,var(--color-card))]",
  teal: "border-category-teal bg-[color-mix(in_oklab,var(--color-category-teal)_22%,var(--color-card))]",
  blue: "border-category-blue bg-[color-mix(in_oklab,var(--color-category-blue)_22%,var(--color-card))]",
  violet:
    "border-category-violet bg-[color-mix(in_oklab,var(--color-category-violet)_22%,var(--color-card))]",
  pink: "border-category-pink bg-[color-mix(in_oklab,var(--color-category-pink)_22%,var(--color-card))]",
  slate:
    "border-category-slate bg-[color-mix(in_oklab,var(--color-category-slate)_22%,var(--color-card))]",
};
