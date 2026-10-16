import { useState } from "react";

import { BiosGuideDialog } from "@/features/system/system-settings/components/bios-guide-dialog";
import { FindingsCard } from "@/features/system/system-settings/components/findings-card";
import { FirmwareCard } from "@/features/system/system-settings/components/firmware-card";
import { MemoryCard } from "@/features/system/system-settings/components/memory-card";
import { describeHardwareFinding } from "@/features/system/system-settings/domain/hardware";
import { type GuideTopic } from "@/features/system/system-settings/domain/settings";
import { type HardwareReport } from "@/features/system/system-settings/types";

/** Aba "Hardware e BIOS": recomendações (a BIOS nunca é alterada) e leituras. */
export function HardwareView({ report }: { report: HardwareReport }) {
  const [guide, setGuide] = useState<GuideTopic | null>(null);
  return (
    <div className="@container">
      <div className="grid gap-6 @4xl:grid-cols-2 @4xl:items-start">
        <div className="grid gap-6">
          <FindingsCard
            findings={report.findings.map((finding) => ({
              level: finding.level,
              text: describeHardwareFinding(finding),
            }))}
            emptyMessage="BIOS, Secure Boot, TPM, processador e memória conferidos."
            onGuide={setGuide}
          />
          <FirmwareCard report={report} />
        </div>
        <MemoryCard report={report} />
      </div>
      <BiosGuideDialog
        topic={guide}
        report={report}
        onClose={() => {
          setGuide(null);
        }}
      />
    </div>
  );
}
