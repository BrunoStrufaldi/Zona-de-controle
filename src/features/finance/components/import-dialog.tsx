import { FileUp, Info, Repeat, Upload } from "lucide-react";
import { type ChangeEvent, useId, useState } from "react";

import { Field } from "@/components/shared/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { amountToneClass } from "@/features/finance/components/finance-styles";
import { accountKindLabels, transactionKindLabels } from "@/features/finance/domain/labels";
import { categoriesOfKind } from "@/features/finance/domain/categories";
import {
  applyCategory,
  buildCommit,
  changeLineKind,
  chooseRecurring,
  countChoices,
  type ImportChoices,
  importFormatLabels,
  initialChoices,
  kindOptions,
  type LineChoice,
  MAX_IMPORT_BYTES,
  pickAccount,
  reasonLabels,
} from "@/features/finance/domain/import";
import { occurrenceKey } from "@/features/finance/domain/recurring";
import {
  type FinanceAccount,
  type FinanceCategory,
  type ImportCommitInput,
  type ImportPreview,
  type ImportResult,
  type PreviewLine,
  type TransactionKind,
} from "@/features/finance/types";
import { cn } from "@/lib/cn";
import { formatCents, formatDate, formatDayMonth } from "@/lib/format";
import { toServiceError } from "@/services/tauri/errors";

interface ImportDialogProps {
  open: boolean;
  accounts: readonly FinanceAccount[];
  categories: readonly FinanceCategory[];
  /** Lê o arquivo no Rust (nada é gravado). */
  onPreview: (fileName: string, content: string) => Promise<ImportPreview>;
  onImport: (input: ImportCommitInput) => Promise<ImportResult>;
  onImported: (result: ImportResult, preview: ImportPreview) => void;
  onClose: () => void;
}

/** Importação de extrato (OFX) ou fatura do C6 (CSV): escolher o arquivo e revisar. */
export function ImportDialog({
  open,
  accounts,
  categories,
  onPreview,
  onImport,
  onImported,
  onClose,
}: ImportDialogProps) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  const close = () => {
    setPreview(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar extrato</DialogTitle>
          <DialogDescription>
            O arquivo é lido só no seu computador. Nada é gravado antes de você revisar e confirmar,
            e lançamentos já importados são pulados.
          </DialogDescription>
        </DialogHeader>
        {preview === null ? (
          <FilePicker onPreview={onPreview} onLoaded={setPreview} />
        ) : (
          <Review
            key={preview.previewId}
            preview={preview}
            accounts={accounts}
            categories={categories}
            onImport={onImport}
            onBack={() => {
              setPreview(null);
            }}
            onImported={(result) => {
              onImported(result, preview);
              close();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface FilePickerProps {
  onPreview: (fileName: string, content: string) => Promise<ImportPreview>;
  onLoaded: (preview: ImportPreview) => void;
}

function FilePicker({ onPreview, onLoaded }: FilePickerProps) {
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const inputId = useId();

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setError("O arquivo é grande demais (máximo de 5 MB). Exporte um período menor.");
      return;
    }
    setReading(true);
    setError(null);
    try {
      onLoaded(await onPreview(file.name, await file.text()));
    } catch (readError) {
      setError(toServiceError(readError).message);
    } finally {
      setReading(false);
    }
  };

  return (
    <div className="grid gap-4">
      <label
        htmlFor={inputId}
        className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-10 text-center transition-colors hover:border-primary/60"
      >
        <span className="flex size-12 items-center justify-center rounded-full border border-border bg-raised text-muted-foreground">
          <FileUp className="size-5" aria-hidden="true" />
        </span>
        <span className="text-sm font-medium">
          {reading ? "Lendo o arquivo…" : "Escolher arquivo"}
        </span>
        <span className="max-w-md text-sm text-muted-foreground">
          Extrato da conta em <strong className="text-foreground">OFX</strong> ou fatura do cartão
          do C6 em <strong className="text-foreground">CSV</strong>, exportados pelo app ou site do
          banco.
        </span>
        <input
          id={inputId}
          type="file"
          accept=".ofx,.csv"
          className="sr-only"
          aria-label="Arquivo do extrato"
          disabled={reading}
          onChange={(event) => {
            void handleFile(event);
          }}
        />
      </label>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}

interface ReviewProps {
  preview: ImportPreview;
  accounts: readonly FinanceAccount[];
  categories: readonly FinanceCategory[];
  onImport: (input: ImportCommitInput) => Promise<ImportResult>;
  onBack: () => void;
  onImported: (result: ImportResult) => void;
}

function Review({ preview, accounts, categories, onImport, onBack, onImported }: ReviewProps) {
  const [choices, setChoices] = useState<ImportChoices>(() => initialChoices(preview));
  const [accountId, setAccountId] = useState(() => pickAccount(accounts, preview.accountKind));
  const [statementDate, setStatementDate] = useState(preview.statementDate ?? "");
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const ids = { account: useId(), due: useId(), duplicates: useId() };

  const card = preview.format === "c6_card_csv";
  const counts = countChoices(preview, choices);
  const visible = preview.lines.filter((line) => showDuplicates || !line.duplicate);
  const counterparts = accounts.filter((account) => account.id !== accountId);

  const updateLine = (index: number, change: (choice: LineChoice) => LineChoice) => {
    setChoices((current) => {
      const choice = current[index];
      return choice ? { ...current, [index]: change(choice) } : current;
    });
  };

  const chooseCategory = (index: number, categoryId: number | null) => {
    const result = applyCategory(preview, choices, index, categoryId);
    setChoices(result.choices);
    const lines = result.alsoApplied === 1 ? "linha parecida" : "linhas parecidas";
    setNotice(
      result.alsoApplied === 0
        ? null
        : `Categoria aplicada também a ${result.alsoApplied} ${lines} sem categoria.`,
    );
  };

  const submit = async () => {
    const { input, problem } = buildCommit(preview, choices, accountId, statementDate || null);
    setError(problem);
    if (input === null) return;
    setImporting(true);
    try {
      onImported(await onImport(input));
    } catch (importError) {
      setError(toServiceError(importError).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Badge variant="primary">{importFormatLabels[preview.format]}</Badge>
        <span className="truncate font-medium">{preview.fileName}</span>
        <span className="text-muted-foreground">
          {card ? "compras de " : ""}
          {formatDate(preview.firstDate)} a {formatDate(preview.lastDate)}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Conta do arquivo *" htmlFor={ids.account}>
          <Select
            value={accountId === null ? "" : String(accountId)}
            onValueChange={(value) => {
              setAccountId(Number(value));
            }}
          >
            <SelectTrigger id={ids.account}>
              <SelectValue placeholder="Escolha a conta" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={String(account.id)}>
                  {account.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {accountKindLabels[account.kind]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {card && (
          <Field label="Vencimento da fatura *" htmlFor={ids.due}>
            <Input
              id={ids.due}
              type="date"
              value={statementDate}
              onChange={(event) => {
                setStatementDate(event.target.value);
              }}
            />
          </Field>
        )}
      </div>
      {card && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          As compras entram no mês do vencimento; a data da compra e a parcela ficam guardadas em
          cada lançamento.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          <Count value={counts.selected} /> para importar · <Count value={counts.duplicates} /> já
          importados · <Count value={counts.left} /> deixados de fora
          {counts.linked > 0 && (
            <>
              {" "}
              · <Count value={counts.linked} /> pagando recorrentes
            </>
          )}
        </p>
        {counts.duplicates > 0 && (
          <div className="flex items-center gap-2">
            <Checkbox
              id={ids.duplicates}
              checked={showDuplicates}
              onCheckedChange={(checked) => {
                setShowDuplicates(checked === true);
              }}
            />
            <label htmlFor={ids.duplicates} className="cursor-pointer text-sm">
              Mostrar já importados
            </label>
          </div>
        )}
      </div>

      <ul
        className="grid max-h-[50vh] gap-1.5 overflow-y-auto pr-1"
        aria-label="Lançamentos do arquivo"
      >
        {visible.map((line) => (
          <ReviewRow
            key={line.index}
            line={line}
            choice={choices[line.index]}
            card={card}
            categories={categories}
            counterparts={counterparts}
            onChange={(change) => {
              updateLine(line.index, change);
            }}
            onCategory={(categoryId) => {
              chooseCategory(line.index, categoryId);
            }}
          />
        ))}
      </ul>

      <p className="min-h-4 text-xs text-info" aria-live="polite">
        {notice}
      </p>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={onBack} disabled={importing}>
          Escolher outro arquivo
        </Button>
        <Button
          disabled={importing || counts.selected === 0}
          onClick={() => {
            void submit();
          }}
        >
          <Upload aria-hidden="true" />
          {importing
            ? "Importando…"
            : `Importar ${counts.selected} ${counts.selected === 1 ? "lançamento" : "lançamentos"}`}
        </Button>
      </DialogFooter>
    </div>
  );
}

const nativeSelectClass =
  "h-8 w-full min-w-0 rounded-md border border-input bg-background/60 px-2 text-xs text-foreground focus-visible:border-primary/70 focus-visible:outline-none disabled:opacity-50";

interface ReviewRowProps {
  line: PreviewLine;
  choice: LineChoice | undefined;
  card: boolean;
  categories: readonly FinanceCategory[];
  counterparts: readonly FinanceAccount[];
  onChange: (change: (choice: LineChoice) => LineChoice) => void;
  /** Escolha de categoria (vale também para as linhas parecidas). */
  onCategory: (categoryId: number | null) => void;
}

/**
 * Uma linha da revisão. Os seletores são nativos: com centenas de linhas, o
 * `Select` do Radix por linha pesaria na abertura.
 */
function ReviewRow({
  line,
  choice,
  card,
  categories,
  counterparts,
  onChange,
  onCategory,
}: ReviewRowProps) {
  if (!choice) return null;
  const disabled = line.duplicate || !choice.include;
  const reason = line.suggestion.reason;
  const kindCategories = categoriesOfKind(categories, choice.kind);
  const linkable = line.recurringCandidates.length > 0 && choice.kind !== "transfer";

  return (
    <li
      className={cn(
        "grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 rounded-md border border-border bg-card px-3 py-2 sm:grid-cols-[auto_minmax(0,1fr)_7rem_8rem_11rem]",
        (line.duplicate || !choice.include) && "opacity-60",
      )}
    >
      <Checkbox
        checked={choice.include && !line.duplicate}
        disabled={line.duplicate}
        aria-label={`Importar “${line.description}”`}
        onCheckedChange={(checked) => {
          onChange((current) => ({ ...current, include: checked === true }));
        }}
      />
      <div className="grid min-w-0 gap-0.5">
        <span className="truncate text-sm">
          <span className="mr-2 font-mono text-xs text-muted-foreground tabular">
            {formatDayMonth(line.date)}
          </span>
          {line.description}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {card && <span>compra</span>}
          {line.installment && (
            <Badge variant="outline">
              {line.installment.number}/{line.installment.count}
            </Badge>
          )}
          {line.sourceCategory && <span>{line.sourceCategory}</span>}
          {reason && (
            <span className={cn(reason === "duplicate" ? "text-warning" : "text-info")}>
              {reasonLabels[reason]}
            </span>
          )}
        </span>
      </div>
      <span
        className={cn(
          "col-start-2 text-right font-mono text-sm tabular sm:col-start-auto",
          amountToneClass[line.inflow ? "income" : "expense"],
        )}
      >
        {line.inflow ? "+" : "−"} {formatCents(line.amount)}
      </span>
      <select
        aria-label={`Tipo de “${line.description}”`}
        className={cn(nativeSelectClass, "col-start-2 sm:col-start-auto")}
        value={choice.kind}
        disabled={disabled}
        onChange={(event) => {
          const kind = event.target.value as TransactionKind;
          onChange((current) => changeLineKind(current, kind));
        }}
      >
        {kindOptions(line).map((kind) => (
          <option key={kind} value={kind}>
            {transactionKindLabels[kind]}
          </option>
        ))}
      </select>
      {choice.kind === "transfer" ? (
        <select
          aria-label={`${line.inflow ? "Conta de origem" : "Conta de destino"} de “${line.description}”`}
          className={cn(nativeSelectClass, "col-start-2 sm:col-start-auto")}
          value={choice.counterpartAccountId ?? ""}
          disabled={disabled}
          onChange={(event) => {
            const value = event.target.value;
            onChange((current) => ({
              ...current,
              counterpartAccountId: value === "" ? null : Number(value),
            }));
          }}
        >
          <option value="">{line.inflow ? "Vindo de…" : "Indo para…"}</option>
          {counterparts.map((account) => (
            <option key={account.id} value={account.id}>
              {line.inflow ? "De " : "Para "}
              {account.name}
            </option>
          ))}
        </select>
      ) : (
        <select
          aria-label={`Categoria de “${line.description}”`}
          className={cn(nativeSelectClass, "col-start-2 sm:col-start-auto")}
          value={choice.categoryId ?? ""}
          disabled={disabled}
          onChange={(event) => {
            const value = event.target.value;
            onCategory(value === "" ? null : Number(value));
          }}
        >
          <option value="">Sem categoria</option>
          {kindCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      )}
      {linkable && (
        <div className="col-start-2 flex items-center gap-2 sm:col-span-4">
          <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <select
            aria-label={`Recorrente de “${line.description}”`}
            className={cn(nativeSelectClass, "sm:w-auto")}
            value={choice.recurring ? occurrenceKey(choice.recurring) : ""}
            disabled={disabled}
            onChange={(event) => {
              const picked = line.recurringCandidates.find(
                (candidate) => occurrenceKey(candidate) === event.target.value,
              );
              onChange((current) => chooseRecurring(line, current, picked ?? null));
            }}
          >
            <option value="">Não é de uma recorrente</option>
            {line.recurringCandidates.map((candidate) => (
              <option key={occurrenceKey(candidate)} value={occurrenceKey(candidate)}>
                Paga “{candidate.description}” · vence {formatDate(candidate.occurrenceDate)} ·{" "}
                {formatCents(candidate.amount)}
              </option>
            ))}
          </select>
        </div>
      )}
    </li>
  );
}

function Count({ value }: { value: number }) {
  return <span className="font-mono font-medium text-foreground tabular">{value}</span>;
}
