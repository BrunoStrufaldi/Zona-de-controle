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
