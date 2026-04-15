import {
  Select as RadixSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Luxe select — shadcn Select wrapper met premium styling.
 * Trigger matcht .field-luxe (gold-tinted border, h-2.625rem),
 * content matcht .cal-pop (gold glow-lijntje, diepere shadow).
 */

interface Option {
  value: string;
  label: React.ReactNode;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

export function LuxeSelect({ value, onChange, options, placeholder, className, ariaLabel }: Props) {
  return (
    <RadixSelect value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          "field-luxe justify-between focus:ring-0 focus:outline-none data-[state=open]:border-[hsl(var(--gold)/0.6)] data-[state=open]:shadow-[0_0_0_3px_hsl(var(--gold)/0.15)]",
          className,
        )}
      >
        <SelectValue placeholder={placeholder || "Selecteer..."} />
      </SelectTrigger>
      <SelectContent
        className="border-[hsl(var(--gold)/0.3)] shadow-[inset_0_1px_0_var(--inset-highlight),0_4px_12px_-2px_hsl(var(--ink)/0.08),0_24px_48px_-12px_hsl(var(--ink)/0.2),0_0_0_1px_hsl(var(--gold)/0.08)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {options.map((opt) => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            className="focus:bg-[hsl(var(--gold-soft)/0.6)] focus:text-[hsl(var(--gold-deep))] data-[state=checked]:text-[hsl(var(--gold-deep))] data-[state=checked]:font-semibold"
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </RadixSelect>
  );
}
