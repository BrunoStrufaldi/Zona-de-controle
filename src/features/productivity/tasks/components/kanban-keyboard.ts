import { type ClientRect, type KeyboardCoordinateGetter } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

interface ColumnRect {
  rect: ClientRect;
}

function contains(rect: ClientRect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function distanceToCenter(rect: ClientRect, x: number, y: number): number {
  return Math.hypot(rect.left + rect.width / 2 - x, rect.top + rect.height / 2 - y);
}

/**
 * Navegação por teclado no Kanban:
 * - ↑/↓ reposicionam dentro da coluna (comportamento padrão do dnd-kit);
 * - ←/→ levam o item para o topo da coluna anterior/seguinte. Colunas são
 *   ordenadas pela posição na tela, então funciona também quando estão
 *   empilhadas em janelas estreitas.
 */
export const kanbanKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const isHorizontal = event.code === "ArrowLeft" || event.code === "ArrowRight";
  if (!isHorizontal) return sortableKeyboardCoordinates(event, args);

  event.preventDefault();
  const { collisionRect, droppableRects, droppableContainers } = args.context;
  if (!collisionRect) return undefined;

  const columns: ColumnRect[] = droppableContainers
    .getEnabled()
    .filter(
      (container) => (container.data.current as { type?: string } | undefined)?.type === "column",
    )
    .flatMap((container) => {
      const rect = droppableRects.get(container.id);
      return rect ? [{ rect }] : [];
    })
    .sort((a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top);
  if (columns.length === 0) return undefined;

  const centerX = collisionRect.left + collisionRect.width / 2;
  const centerY = collisionRect.top + collisionRect.height / 2;
  let currentIndex = columns.findIndex((column) => contains(column.rect, centerX, centerY));
  if (currentIndex === -1) {
    // Fora de qualquer coluna: usa a mais próxima como referência.
    const distances = columns.map((column) => distanceToCenter(column.rect, centerX, centerY));
    currentIndex = distances.indexOf(Math.min(...distances));
  }

  const target = columns[currentIndex + (event.code === "ArrowRight" ? 1 : -1)];
  return target ? { x: target.rect.left, y: target.rect.top } : undefined;
};
