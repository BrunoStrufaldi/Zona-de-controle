import { useCallback } from "react";
import { toast } from "sonner";

import {
  type PendingChange,
  summarizeResults,
} from "@/features/system/system-settings/domain/tweaks";
import { type TweakRecord } from "@/features/system/system-settings/types";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { formatNumber } from "@/lib/format";
import { toServiceError } from "@/services/tauri/errors";
import {
  applySystemTweaks,
  listSystemTweaks,
  undoSystemTweak,
} from "@/services/system-settings-service";

/** Ajustes mostrados no histórico da aba. */
export const TWEAK_HISTORY_LIMIT = 20;

function loadHistory() {
  return listSystemTweaks(TWEAK_HISTORY_LIMIT);
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${formatNumber(count)} ${count === 1 ? singular : pluralForm}`;
}

/**
 * Aplicar e desfazer ajustes, com o histórico. `onChanged` relê as
 * configurações depois de cada mudança (o Windows é a fonte da verdade).
 */
export function useSystemTweaks(onChanged: () => void) {
  const history = useAsyncResource(loadHistory);
  const reloadHistory = history.reload;

  const apply = useCallback(
    async (changes: PendingChange[]) => {
      try {
        const summary = summarizeResults(
          await applySystemTweaks(changes.map((change) => change.request)),
        );
        if (summary.applied > 0) {
          toast.success(plural(summary.applied, "ajuste aplicado", "ajustes aplicados"));
        }
        if (summary.unchanged > 0) {
          toast.info(
            `${plural(summary.unchanged, "item já estava", "itens já estavam")} no valor escolhido.`,
          );
        }
        for (const failure of summary.failed) {
          toast.error(`${failure.label}: ${failure.message}`);
        }
      } catch (error) {
        toast.error(toServiceError(error).message);
      }
      reloadHistory();
      onChanged();
    },
    [onChanged, reloadHistory],
  );

  const undo = useCallback(
    async (record: TweakRecord) => {
      try {
        await undoSystemTweak(record.id);
        toast.success(`Ajuste desfeito: ${record.label}`);
      } catch (error) {
        toast.error(toServiceError(error).message);
      }
      reloadHistory();
      onChanged();
    },
    [onChanged, reloadHistory],
  );

  return { history, apply, undo };
}
