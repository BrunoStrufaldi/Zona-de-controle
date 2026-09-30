import { type CategoryColor } from "@/types/palette";

export const categoryColorLabels: Record<CategoryColor, string> = {
  red: "Vermelho",
  orange: "Laranja",
  amber: "Âmbar",
  green: "Verde",
  teal: "Turquesa",
  blue: "Azul",
  violet: "Violeta",
  pink: "Rosa",
  slate: "Cinza",
};

/** Classes por cor (literais, para o Tailwind gerar os utilitários). */
export const categoryDotClass: Record<CategoryColor, string> = {
  red: "bg-category-red",
  orange: "bg-category-orange",
  amber: "bg-category-amber",
  green: "bg-category-green",
  teal: "bg-category-teal",
  blue: "bg-category-blue",
  violet: "bg-category-violet",
  pink: "bg-category-pink",
  slate: "bg-category-slate",
};

export const categoryBadgeClass: Record<CategoryColor, string> = {
  red: "border-category-red/35 bg-category-red/10 text-category-red",
  orange: "border-category-orange/35 bg-category-orange/10 text-category-orange",
  amber: "border-category-amber/35 bg-category-amber/10 text-category-amber",
  green: "border-category-green/35 bg-category-green/10 text-category-green",
  teal: "border-category-teal/35 bg-category-teal/10 text-category-teal",
  blue: "border-category-blue/35 bg-category-blue/10 text-category-blue",
  violet: "border-category-violet/35 bg-category-violet/10 text-category-violet",
  pink: "border-category-pink/35 bg-category-pink/10 text-category-pink",
  slate: "border-category-slate/35 bg-category-slate/10 text-category-slate",
};

/** Bloco na grade de horários (calendário e planejamento semanal) (fundo opaco para ficar legível sobre as linhas). */
export const categoryBlockClass: Record<CategoryColor, string> = {
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
