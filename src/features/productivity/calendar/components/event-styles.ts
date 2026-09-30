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
