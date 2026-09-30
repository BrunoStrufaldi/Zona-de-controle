import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { categoryDotClass } from "@/features/finance/components/finance-styles";
import { type FinanceAccount } from "@/features/finance/types";
import { cn } from "@/lib/cn";
interface AccountSelectProps {
  id: string;
  accounts: readonly FinanceAccount[];
  value: number | null;
  invalid: boolean;
  onChange: (accountId: number) => void;
}

export function AccountSelect({ id, accounts, value, invalid, onChange }: AccountSelectProps) {
  return (
    <Select
      value={value === null ? "" : String(value)}
      onValueChange={(next) => {
        onChange(Number(next));
      }}
    >
      <SelectTrigger id={id} aria-invalid={invalid || undefined}>
        <SelectValue placeholder="Escolha a conta" />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((account) => (
          <SelectItem key={account.id} value={String(account.id)}>
            <ColorDot className={categoryDotClass[account.color]} />
            {account.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ColorDot({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("mr-2 inline-block size-2 rounded-full align-middle", className)}
    />
  );
}
