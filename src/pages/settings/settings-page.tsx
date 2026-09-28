import {
  DatabaseBackup,
  Info,
  Palette,
  ScrollText,
  Settings,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { useSearchParams } from "react-router";

import { SETTINGS_TAB_PARAM } from "@/app/router/paths";

import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AboutSection } from "@/pages/settings/sections/about-section";
import { AppearanceSection } from "@/pages/settings/sections/appearance-section";
import { AuditSection } from "@/pages/settings/sections/audit-section";
import { BackupSection } from "@/pages/settings/sections/backup-section";
import { DiagnosticsSection } from "@/pages/settings/sections/diagnostics-section";
import { ProfileSection } from "@/pages/settings/sections/profile-section";

const TABS = ["general", "appearance", "diagnostics", "data", "audit", "about"] as const;
type SettingsTab = (typeof TABS)[number];

function isSettingsTab(value: string | null): value is SettingsTab {
  return TABS.some((tab) => tab === value);
}

export function SettingsPage() {
  // A aba fica na URL (`?tab=`), para links de outras telas abrirem a aba certa.
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get(SETTINGS_TAB_PARAM);
  const tab: SettingsTab = isSettingsTab(requested) ? requested : "general";

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Preferências do aplicativo, dados locais e informações do sistema."
        icon={Settings}
      />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setSearchParams({ [SETTINGS_TAB_PARAM]: value }, { replace: true });
        }}
      >
        <TabsList>
          <TabsTrigger value="general">
            <UserRound aria-hidden="true" />
            Geral
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette aria-hidden="true" />
            Aparência
          </TabsTrigger>
          <TabsTrigger value="diagnostics">
            <Stethoscope aria-hidden="true" />
            Diagnóstico
          </TabsTrigger>
          <TabsTrigger value="data">
            <DatabaseBackup aria-hidden="true" />
            Dados
          </TabsTrigger>
          <TabsTrigger value="audit">
            <ScrollText aria-hidden="true" />
            Auditoria
          </TabsTrigger>
          <TabsTrigger value="about">
            <Info aria-hidden="true" />
            Sobre
          </TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <ProfileSection />
        </TabsContent>
        <TabsContent value="appearance">
          <AppearanceSection />
        </TabsContent>
        <TabsContent value="diagnostics">
          <DiagnosticsSection />
        </TabsContent>
        <TabsContent value="data">
          <BackupSection />
        </TabsContent>
        <TabsContent value="audit">
          <AuditSection />
        </TabsContent>
        <TabsContent value="about">
          <AboutSection />
        </TabsContent>
      </Tabs>
    </>
  );
}
