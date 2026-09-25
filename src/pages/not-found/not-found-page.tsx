import { ArrowLeft, Compass } from "lucide-react";
import { Link } from "react-router";

import { paths } from "@/app/router/paths";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <section className="flex flex-1 animate-slide-up flex-col items-center justify-center gap-6 py-20 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-glow">
        <Compass className="size-7" aria-hidden="true" />
      </div>
      <div className="grid gap-2">
        <p className="font-mono text-sm tracking-[0.3em] text-primary">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">Página não encontrada</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          O endereço acessado não existe ou foi movido. Use o menu lateral ou volte ao dashboard.
        </p>
      </div>
      <Button asChild variant="secondary">
        <Link to={paths.dashboard}>
          <ArrowLeft aria-hidden="true" />
          Voltar ao dashboard
        </Link>
      </Button>
    </section>
  );
}
