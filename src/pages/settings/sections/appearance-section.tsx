import { Bell, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingState } from "@/components/shared/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatCurrency, formatDate } from "@/lib/format";

const colorTokens = [
  { label: "Background", token: "--zdc-background", className: "bg-background" },
  { label: "Card", token: "--zdc-surface", className: "bg-card" },
  { label: "Border", token: "--zdc-border", className: "bg-border" },
  { label: "Primary", token: "--zdc-primary", className: "bg-primary" },
  { label: "Primary strong", token: "--zdc-primary-strong", className: "bg-primary-strong" },
  { label: "Texto", token: "--zdc-text", className: "bg-foreground" },
  { label: "Texto secundário", token: "--zdc-text-muted", className: "bg-muted-foreground" },
] as const;

/** Linhas ilustrativas da tabela (texto de exemplo do componente, não dados do usuário). */
const sampleRows = [
  { id: "1", label: "Exemplo A", date: "2026-09-01", amount: 1234.56 },
  { id: "2", label: "Exemplo B", date: "2026-09-15", amount: -89.9 },
] as const;

/** Vitrine do design system: tokens e componentes base. */
export function AppearanceSection() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="grid gap-1">
            <CardTitle>Tema · Dark / Red</CardTitle>
            <CardDescription>Definido em src/styles/tokens.css</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            {colorTokens.map((color) => (
              <li key={color.token} className="grid gap-2">
                <div
                  className={cn("h-14 rounded-md border border-border-strong", color.className)}
                  aria-hidden="true"
                />
                <div className="grid">
                  <span className="text-xs font-medium">{color.label}</span>
                  <code className="font-mono text-[10px] text-subtle-foreground">
                    {color.token}
                  </code>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Botões e selos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <Button>
              <Plus aria-hidden="true" />
              Primário
            </Button>
            <Button variant="secondary">Secundário</Button>
            <Button variant="outline">Contorno</Button>
            <Button variant="ghost">Fantasma</Button>
            <Button variant="destructive">Destrutivo</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>Padrão</Badge>
            <Badge variant="primary">Primário</Badge>
            <Badge variant="success">Sucesso</Badge>
            <Badge variant="warning">Atenção</Badge>
            <Badge variant="danger">Perigo</Badge>
            <Badge variant="info">Info</Badge>
          </div>
          <div className="grid gap-2">
            <Progress value={72} aria-label="Exemplo de progresso primário" />
            <Progress value={45} tone="warning" aria-label="Exemplo de progresso de atenção" />
            <Progress value={92} tone="danger" aria-label="Exemplo de progresso crítico" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Formulários e feedback</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="preview-input">Campo de texto</Label>
            <Input id="preview-input" placeholder="Digite algo…" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="preview-select">Seleção</Label>
            <Select defaultValue="monthly">
              <SelectTrigger id="preview-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="yearly">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                toast.success("Tudo certo!", { description: "Exemplo de notificação." });
              }}
            >
              <Bell aria-hidden="true" />
              Mostrar toast
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Trash2 aria-hidden="true" />
                  Abrir diálogo
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirmar operação</DialogTitle>
                  <DialogDescription>
                    Exemplo do padrão de confirmação que operações sensíveis deverão usar. Nada será
                    executado.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="ghost">Cancelar</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button variant="destructive">Entendi</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tabela</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sampleRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.label}</TableCell>
                  <TableCell className="font-mono text-xs tabular">
                    {formatDate(row.date)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular">
                    {formatCurrency(row.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estados</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <LoadingState className="py-4" />
          <EmptyState title="Nenhum item" description="Exemplo de estado vazio." className="py-6" />
          <ErrorState message="Exemplo de mensagem de erro." className="py-6" />
        </CardContent>
      </Card>
    </div>
  );
}
