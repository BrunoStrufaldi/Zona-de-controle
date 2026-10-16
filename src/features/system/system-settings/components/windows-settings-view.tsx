import { FindingsCard } from "@/features/system/system-settings/components/findings-card";
import { StartupCard } from "@/features/system/system-settings/components/startup-card";
import { WindowsStatusCard } from "@/features/system/system-settings/components/windows-status-card";
import { describeSettingsFinding } from "@/features/system/system-settings/domain/settings";
import { type WindowsSettingsReport } from "@/features/system/system-settings/types";

/** Aba "Ajustes do Windows": o que dá para melhorar e as leituras atuais. */
export function WindowsSettingsView({ report }: { report: WindowsSettingsReport }) {
  return (
    <div className="@container">
      <div className="grid gap-6 @4xl:grid-cols-2 @4xl:items-start">
        <div className="grid gap-6">
          <FindingsCard
            findings={report.findings.map((finding) => ({
              level: finding.level,
              text: describeSettingsFinding(finding),
            }))}
            emptyMessage="Plano de energia, Modo de Jogo e atualizações conferidos."
          />
          <WindowsStatusCard report={report} />
        </div>
        <StartupCard report={report.startup} />
      </div>
    </div>
  );
}
