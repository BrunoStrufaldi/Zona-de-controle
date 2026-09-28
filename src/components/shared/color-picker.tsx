import { cn } from "@/lib/cn";
import { categoryColorLabels, categoryDotClass } from "@/lib/palette";
import { CATEGORY_COLORS, type CategoryColor } from "@/types/palette";

interface ColorPickerProps {
  /** Nome acessível do grupo (ex.: "Cor da categoria"). */
  label: string;
  value: CategoryColor;
  onChange: (color: CategoryColor) => void;
}

/** Escolha de uma cor da paleta (grupo de rádios acessível). */
export function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {CATEGORY_COLORS.map((color) => {
        const selected = color === value;
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={categoryColorLabels[color]}
            title={categoryColorLabels[color]}
            onClick={() => {
              onChange(color);
            }}
            className={cn(
              "flex size-6 cursor-pointer items-center justify-center rounded-full border-2 transition-[border-color,transform] duration-150 hover:scale-110",
              selected ? "border-foreground" : "border-transparent",
            )}
          >
            <span className={cn("size-4 rounded-full", categoryDotClass[color])} />
          </button>
        );
      })}
    </div>
  );
}
