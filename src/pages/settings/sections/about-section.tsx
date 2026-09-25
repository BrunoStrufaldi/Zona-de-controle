import { ResourceView } from "@/components/shared/resource-view";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { getAppInfo } from "@/services/app-service";
import { type AppInfo } from "@/types/app";

export function AboutSection() {
  const appInfo = useAsyncResource(getAppInfo);

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <div className="grid gap-1">
          <CardTitle>Sobre</CardTitle>
          <CardDescription>
            Local-first: seus dados ficam apenas neste computador, sem nuvem nem APIs externas.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ResourceView resource={appInfo} className="py-6">
          {(info) => <AppInfoList info={info} />}
        </ResourceView>
      </CardContent>
    </Card>
  );
}

function AppInfoList({ info }: { info: AppInfo }) {
  const rows = [
    { label: "Aplicativo", value: info.name },
    { label: "Versão", value: info.version },
    { label: "Identificador", value: info.identifier },
    { label: "Versão do schema", value: String(info.schemaVersion) },
    { label: "Banco de dados", value: info.databasePath },
  ];

  return (
    <dl className="grid gap-3">
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid gap-1 border-b border-border pb-3 last:border-0 last:pb-0 sm:grid-cols-[10rem_1fr]"
        >
          <dt className="text-sm text-muted-foreground">{row.label}</dt>
          <dd className="font-mono text-sm break-all" data-selectable>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
