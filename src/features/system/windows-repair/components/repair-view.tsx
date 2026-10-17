import { useState } from "react";

import { ConfirmRepairDialog } from "@/features/system/windows-repair/components/confirm-repair-dialog";
import { RepairCard } from "@/features/system/windows-repair/components/repair-card";
import { RepairHistoryCard } from "@/features/system/windows-repair/components/repair-history-card";
import { RepairRunDialog } from "@/features/system/windows-repair/components/repair-run-dialog";
import { useWindowsRepair } from "@/features/system/windows-repair/hooks/use-windows-repair";
import {
  type RepairHistoryEntry,
  type RepairReadiness,
} from "@/features/system/windows-repair/types";
import { type AsyncResource } from "@/hooks/use-async-resource";

interface RepairViewProps {
  readiness: RepairReadiness;
  history: AsyncResource<RepairHistoryEntry[]>;
  /** Relê a prontidão e o histórico depois de um reparo. */
  onFinished: () => void;
}

/** Aba "Reparo do Windows": explicar → confirmar → UAC → andamento → resultado. */
export function RepairView({ readiness, history, onFinished }: RepairViewProps) {
  const run = useWindowsRepair();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="@container">
      <div className="grid gap-6 @4xl:grid-cols-2 @4xl:items-start">
        <RepairCard
          readiness={readiness}
          busy={run.state.phase === "running"}
          onStart={() => {
            setConfirming(true);
          }}
        />
        <RepairHistoryCard history={history} />
      </div>

      <ConfirmRepairDialog
        open={confirming}
        pendingReboot={readiness.pendingReboot === true}
        onCancel={() => {
          setConfirming(false);
        }}
        onConfirm={() => {
          setConfirming(false);
          run.start();
        }}
      />
      <RepairRunDialog
        state={run.state}
        onCancel={run.cancel}
        onClose={() => {
          run.reset();
          onFinished();
        }}
      />
    </div>
  );
}
