import { Palette, Settings } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppearanceSection } from "@/pages/settings/sections/appearance-section";

export function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Configurações"
        description="Preferências do aplicativo, dados locais e informações do sistema."
        icon={Settings}
      />
      <Tabs defaultValue="appearance">
        <TabsList>
          <TabsTrigger value="appearance">
            <Palette aria-hidden="true" />
            Aparência
          </TabsTrigger>
        </TabsList>
        <TabsContent value="appearance">
          <AppearanceSection />
        </TabsContent>
      </Tabs>
    </>
  );
}
