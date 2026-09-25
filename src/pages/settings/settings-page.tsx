import { DatabaseBackup, Info, Palette, ScrollText, Settings, UserRound } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AboutSection } from "@/pages/settings/sections/about-section";
import { AppearanceSection } from "@/pages/settings/sections/appearance-section";
import { AuditSection } from "@/pages/settings/sections/audit-section";
import { BackupSection } from "@/pages/settings/sections/backup-section";
import { ProfileSection } from "@/pages/settings/sections/profile-section";

export function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Configurações"
        description="Preferências do aplicativo, dados locais e informações do sistema."
        icon={Settings}
      />
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">
            <UserRound aria-hidden="true" />
            Geral
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette aria-hidden="true" />
            Aparência
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
