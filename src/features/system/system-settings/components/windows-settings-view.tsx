import { Check } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmTweaksDialog } from "@/features/system/system-settings/components/confirm-tweaks-dialog";
import {
  type FindingEntry,
  FindingsCard,
} from "@/features/system/system-settings/components/findings-card";
import {
  StartupCard,
  type StartupSelection,
} from "@/features/system/system-settings/components/startup-card";
import { TweakHistoryCard } from "@/features/system/system-settings/components/tweak-history-card";
import { WindowsStatusCard } from "@/features/system/system-settings/components/windows-status-card";
import { describeSettingsFinding } from "@/features/system/system-settings/domain/settings";
import {
  findingChange,
  type PendingChange,
  startupChange,
} from "@/features/system/system-settings/domain/tweaks";
import { useSystemTweaks } from "@/features/system/system-settings/hooks/use-system-tweaks";
import { type WindowsSettingsReport } from "@/features/system/system-settings/types";
import { formatNumber } from "@/lib/format";

interface WindowsSettingsViewProps {
  report: WindowsSettingsReport;
  /** Relê as configurações depois de aplicar ou desfazer. */
  onChanged: () => void;
}

/**
 * Aba "Ajustes do Windows": o que dá para melhorar, as leituras atuais e os
 * ajustes que o app faz (marcar → confirmar → histórico com Desfazer).
 */
export function WindowsSettingsView({ report, onChanged }: WindowsSettingsViewProps) {
  const { history, apply, undo } = useSystemTweaks(onChanged);
  const [selected, setSelected] = useState<ReadonlyMap<string, PendingChange>>(() => new Map());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = (change: PendingChange, checked: boolean) => {
    setSelected((current) => {
      const next = new Map(current);
      if (checked) next.set(change.key, change);
      else next.delete(change.key);
      return next;
    });
  };

  const findings: FindingEntry[] = report.findings.map((finding) => {
    const change = findingChange(finding);
    return {
      level: finding.level,
      text: describeSettingsFinding(finding),
      change: change
        ? {
            checked: selected.has(change.key),
            disabled: busy,
            onToggle: (checked) => {
              toggle(change, checked);
            },
          }
        : undefined,
    };
  });

  const startupSelection: StartupSelection = {
    selected: new Set(selected.keys()),
    disabled: busy,
    onToggle: (item, checked) => {
      const change = startupChange(item);
      if (change) toggle(change, checked);
    },
  };

  const changes = [...selected.values()];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <p className="text-sm" aria-live="polite">
          {changes.length === 0 ? (
            <span className="text-muted-foreground">
              Marque o que quer mudar: sugestões e programas da inicialização.
            </span>
          ) : (
            <span className="font-medium">
              {changes.length === 1
                ? "1 ajuste selecionado"
                : `${formatNumber(changes.length)} ajustes selecionados`}
            </span>
          )}
        </p>
        <Button
          disabled={changes.length === 0 || busy}
          onClick={() => {
            setConfirming(true);
          }}
        >
          <Check aria-hidden="true" />
          Revisar e aplicar
        </Button>
      </div>

      <div className="@container">
        <div className="grid gap-6 @4xl:grid-cols-2 @4xl:items-start">
          <div className="grid gap-6">
            <FindingsCard
              findings={findings}
              emptyMessage="Plano de energia, Modo de Jogo e atualizações conferidos."
            />
            <WindowsStatusCard report={report} />
            <TweakHistoryCard
              history={history}
              disabled={busy}
              onUndo={async (record) => {
                setBusy(true);
                try {
                  await undo(record);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </div>
          <StartupCard report={report.startup} selection={startupSelection} />
        </div>
      </div>

      <ConfirmTweaksDialog
        changes={confirming ? changes : null}
        onCancel={() => {
          setConfirming(false);
        }}
        onConfirm={async (confirmed) => {
          setBusy(true);
          try {
            await apply(confirmed);
          } finally {
            setBusy(false);
            setConfirming(false);
            setSelected(new Map());
          }
        }}
      />
    </div>
  );
}
