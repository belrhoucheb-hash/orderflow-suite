import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Settings as SettingsIcon,
  Database,
  Palette,
  Bell,
  Smartphone,
  Plug,
  Inbox,
  Tag,
  Receipt,
  Plus,
  CornerDownLeft,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type CommandKind = "tab" | "action";

interface CommandItem {
  id: string;
  label: string;
  description: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  group: string;
  kind: CommandKind;
  path: string;
}

const COMMANDS: CommandItem[] = [
  {
    id: "tab-algemeen",
    label: "Algemeen",
    description: "Taal en algemene voorkeuren.",
    keywords: "algemeen general taal language home overzicht",
    icon: SettingsIcon,
    group: "Tabbladen",
    kind: "tab",
    path: "/settings",
  },
  {
    id: "tab-stamgegevens",
    label: "Stamgegevens",
    description: "Voertuigtypes, ladingeenheden en vereisten.",
    keywords: "stamgegevens master data voertuigtype ladingeenheid eenheden vereisten requirements",
    icon: Database,
    group: "Tabbladen",
    kind: "tab",
    path: "/settings/stamgegevens",
  },
  {
    id: "tab-branding",
    label: "Branding",
    description: "Logo, kleuren en bedrijfsidentiteit.",
    keywords: "branding logo kleur kleuren primary color huisstijl identiteit",
    icon: Palette,
    group: "Tabbladen",
    kind: "tab",
    path: "/settings/branding",
  },
  {
    id: "tab-notificaties",
    label: "Notificaties",
    description: "E-mailmeldingen en samenvattingen.",
    keywords: "notificaties notifications email meldingen samenvatting rapport alert",
    icon: Bell,
    group: "Tabbladen",
    kind: "tab",
    path: "/settings/notificaties",
  },
  {
    id: "tab-sms",
    label: "SMS",
    description: "Twilio of MessageBird en SMS-templates.",
    keywords: "sms twilio messagebird bericht text template afzender",
    icon: Smartphone,
    group: "Tabbladen",
    kind: "tab",
    path: "/settings/sms",
  },
  {
    id: "tab-integraties",
    label: "Integraties",
    description: "Exact Online, Twinfield en Samsara.",
    keywords: "integraties integrations exact twinfield samsara koppeling api boekhouding",
    icon: Plug,
    group: "Tabbladen",
    kind: "tab",
    path: "/settings/integraties",
  },
  {
    id: "tab-inboxen",
    label: "Inboxen",
    description: "IMAP-mailboxen voor automatische orders.",
    keywords: "inboxen inbox mailbox imap email mail orderintake",
    icon: Inbox,
    group: "Tabbladen",
    kind: "tab",
    path: "/settings/inboxen",
  },
  {
    id: "tab-tarieven",
    label: "Tarieven",
    description: "Tariefkaarten, toeslagen en pricing-preview.",
    keywords: "tarieven tarief tariefkaart pricing prijzen toeslag toeslagen rate card",
    icon: Tag,
    group: "Tabbladen",
    kind: "tab",
    path: "/settings/tarieven",
  },
  {
    id: "tab-kosten",
    label: "Kosten",
    description: "Brandstofprijzen en kostentypes.",
    keywords: "kosten kost cost diesel brandstof fuel kostentype",
    icon: Receipt,
    group: "Tabbladen",
    kind: "tab",
    path: "/settings/kosten",
  },
  {
    id: "action-new-ratecard",
    label: "Nieuwe tariefkaart toevoegen",
    description: "Spring naar de Tarieven-tab om een tariefkaart aan te maken.",
    keywords: "nieuwe tariefkaart toevoegen tarief pricing rate card aanmaken",
    icon: Plus,
    group: "Snelle acties",
    kind: "action",
    path: "/settings/tarieven",
  },
  {
    id: "action-new-surcharge",
    label: "Nieuwe toeslag toevoegen",
    description: "Spring naar de Tarieven-tab om een toeslag aan te maken.",
    keywords: "nieuwe toeslag surcharge toevoegen extra kosten",
    icon: Plus,
    group: "Snelle acties",
    kind: "action",
    path: "/settings/tarieven",
  },
  {
    id: "action-new-fuel-price",
    label: "Brandstofprijs bijwerken",
    description: "Spring naar de Kosten-tab om de dieselprijs te wijzigen.",
    keywords: "brandstof diesel fuel prijs price bijwerken update",
    icon: Plus,
    group: "Snelle acties",
    kind: "action",
    path: "/settings/kosten",
  },
  {
    id: "action-new-inbox",
    label: "Nieuwe inbox koppelen",
    description: "Spring naar de Inboxen-tab om een IMAP-mailbox toe te voegen.",
    keywords: "nieuwe inbox mailbox imap koppelen toevoegen",
    icon: Plus,
    group: "Snelle acties",
    kind: "action",
    path: "/settings/inboxen",
  },
];

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform || "";
  const ua = navigator.userAgent || "";
  return /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS X/i.test(ua);
}

function scoreCommand(item: CommandItem, query: string): number {
  if (!query) return 1;
  const q = query.toLowerCase().trim();
  const label = item.label.toLowerCase();
  const keywords = item.keywords.toLowerCase();
  const description = item.description.toLowerCase();

  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.includes(q)) return 60;
  if (keywords.includes(q)) return 40;
  if (description.includes(q)) return 20;
  return 0;
}

export function SettingsCommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isMac = useMemo(isMacPlatform, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isMac]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    const scored = COMMANDS.map((item) => ({ item, score: scoreCommand(item, query) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.map((entry) => entry.item);
  }, [query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!listRef.current) return;
    const node = listRef.current.querySelector<HTMLElement>(`[data-cmd-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, filtered.length]);

  const runCommand = useCallback(
    (item: CommandItem) => {
      setOpen(false);
      navigate(item.path);
    },
    [navigate],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (filtered.length === 0 ? 0 : (prev + 1) % filtered.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (filtered.length === 0 ? 0 : (prev - 1 + filtered.length) % filtered.length));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[activeIndex];
      if (item) runCommand(item);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  const grouped = useMemo(() => {
    const groups = new Map<string, { item: CommandItem; flatIndex: number }[]>();
    filtered.forEach((item, flatIndex) => {
      if (!groups.has(item.group)) groups.set(item.group, []);
      groups.get(item.group)!.push({ item, flatIndex });
    });
    return Array.from(groups.entries());
  }, [filtered]);

  const placeholder = `${isMac ? "Cmd" : "Ctrl"}+K zoek in instellingen...`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="card--luxe max-w-xl gap-0 border-[hsl(var(--gold)/0.3)] bg-[hsl(var(--card))] p-0 shadow-2xl"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="flex items-center gap-2 border-b border-[hsl(var(--gold)/0.18)] px-4 py-3">
          <Search className="h-4 w-4 text-[hsl(var(--gold-deep))]" strokeWidth={1.5} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label="Zoek in instellingen"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-[hsl(var(--gold)/0.25)] bg-[hsl(var(--gold-soft)/0.4)] px-1.5 py-0.5 text-[10px] font-medium text-[hsl(var(--gold-deep))]">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Geen resultaten voor "{query}".
            </p>
          ) : (
            grouped.map(([groupName, entries]) => (
              <div key={groupName} className="mb-2 last:mb-0">
                <p className="px-4 pb-1 pt-2 text-[10px] font-display font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]">
                  {groupName}
                </p>
                <div className="px-2">
                  {entries.map(({ item, flatIndex }) => {
                    const Icon = item.icon;
                    const active = flatIndex === activeIndex;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-cmd-index={flatIndex}
                        onMouseEnter={() => setActiveIndex(flatIndex)}
                        onClick={() => runCommand(item)}
                        className={cn(
                          "group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
                          active
                            ? "bg-[hsl(var(--gold-soft)/0.55)] text-[hsl(var(--gold-deep))]"
                            : "text-foreground hover:bg-[hsl(var(--gold-soft)/0.3)]",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                            active
                              ? "border-[hsl(var(--gold-deep))] bg-[hsl(var(--gold-soft)/0.7)]"
                              : "border-[hsl(var(--gold)/0.25)] bg-[hsl(var(--gold-soft)/0.35)]",
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-4 w-4",
                              active ? "text-[hsl(var(--gold-deep))]" : "text-[hsl(var(--gold-deep))]",
                            )}
                            strokeWidth={1.5}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block truncate text-sm font-medium",
                              active ? "text-[hsl(var(--gold-deep))]" : "text-foreground",
                            )}
                          >
                            {item.label}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        </span>
                        {active && (
                          <CornerDownLeft
                            className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]"
                            strokeWidth={1.5}
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[hsl(var(--gold)/0.18)] bg-[hsl(var(--gold-soft)/0.2)] px-4 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-[hsl(var(--gold)/0.25)] bg-[hsl(var(--card))] px-1.5 py-0.5 font-medium text-[hsl(var(--gold-deep))]">
                {String.fromCharCode(0x2191)}
              </kbd>
              <kbd className="rounded border border-[hsl(var(--gold)/0.25)] bg-[hsl(var(--card))] px-1.5 py-0.5 font-medium text-[hsl(var(--gold-deep))]">
                {String.fromCharCode(0x2193)}
              </kbd>
              navigeer
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-[hsl(var(--gold)/0.25)] bg-[hsl(var(--card))] px-1.5 py-0.5 font-medium text-[hsl(var(--gold-deep))]">
                Enter
              </kbd>
              open
            </span>
          </div>
          <span>{filtered.length} resultaten</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SettingsCommandPalette;
