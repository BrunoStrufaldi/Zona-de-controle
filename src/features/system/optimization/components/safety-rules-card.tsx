import { ShieldAlert } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Regras que toda operação de limpeza deverá seguir (ver CLAUDE.md → Segurança). */
const safetyRules = [
  "Pedir confirmação explícita antes de qualquer remoção",
  "Mostrar exatamente quais arquivos serão removidos e quanto espaço será liberado",
  "Nunca tocar em arquivos críticos do sistema; atuar apenas em locais permitidos",
  "Registrar cada operação no log de auditoria",
  "Permitir cancelamento sempre que possível",
  "Nunca executar comandos shell arbitrários",
  "Rodar sem privilégios de administrador (menor privilégio)",
] as const;

export function SafetyRulesCard() {
  return (
    <Card className="animate-slide-up">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-4 text-primary" aria-hidden="true" />
          <CardTitle>Regras de segurança da otimização</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-2.5">
          {safetyRules.map((rule, index) => (
            <li key={rule} className="flex items-start gap-3 text-sm">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 font-mono text-[10px] text-primary">
                {index + 1}
              </span>
              <span>{rule}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
