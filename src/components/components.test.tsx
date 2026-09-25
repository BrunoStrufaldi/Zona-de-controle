import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { DemoBadge } from "@/components/shared/demo-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingState } from "@/components/shared/loading-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TooltipProvider } from "@/components/ui/tooltip";

describe("componentes base", () => {
  it("Button dispara onClick e usa type=button por padrão", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Salvar</Button>);

    const button = screen.getByRole("button", { name: "Salvar" });
    expect(button).toHaveAttribute("type", "button");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("Button com asChild renderiza o elemento filho", () => {
    render(
      <MemoryRouter>
        <Button asChild>
          <a href="/destino">Ir</a>
        </Button>
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Ir" })).toHaveAttribute("href", "/destino");
  });

  it("Badge e Progress renderizam", () => {
    render(
      <>
        <Badge variant="success">Ativo</Badge>
        <Progress value={150} aria-label="Uso" />
      </>,
    );
    expect(screen.getByText("Ativo")).toBeInTheDocument();
    // O valor é limitado a 100.
    expect(screen.getByRole("progressbar", { name: "Uso" })).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  });

  it("PageHeader exibe título, descrição e ações", () => {
    render(
      <PageHeader title="Tarefas" description="Organize o dia" actions={<Button>Nova</Button>} />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Tarefas" })).toBeInTheDocument();
    expect(screen.getByText("Organize o dia")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova" })).toBeInTheDocument();
  });

  it("DemoBadge identifica dados de demonstração", () => {
    render(
      <TooltipProvider>
        <DemoBadge />
      </TooltipProvider>,
    );
    expect(screen.getByLabelText("Dados de demonstração")).toHaveTextContent("Demo");
  });

  it("estados vazio, carregando e erro são anunciados", async () => {
    const onRetry = vi.fn();
    render(
      <>
        <EmptyState title="Nada aqui" />
        <LoadingState />
        <ErrorState message="Falhou" onRetry={onRetry} />
      </>,
    );

    expect(screen.getByText("Nada aqui")).toBeInTheDocument();
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Falhou");
    await userEvent.click(screen.getByRole("button", { name: /Tentar novamente/ }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
