import { useEffect, useState } from "react";
import { Keyboard, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const shortcuts = [
  { section: "Navigatie", items: [
    { keys: ["↑", "↓"], desc: "Vorige / volgende order in inbox" },
    { keys: ["j", "k"], desc: "Vorige / volgende (vim-stijl)" },
    { keys: ["?"], desc: "Sneltoetsen weergeven" },
  ]},
  { section: "Acties", items: [
    { keys: ["Ctrl", "Enter"], desc: "Order goedkeuren / aanmaken" },
    { keys: ["Delete"], desc: "Geselecteerde order verwijderen" },
    { keys: ["Ctrl", "K"], desc: "Zoeken focussen" },
    { keys: ["Escape"], desc: "Dialoog sluiten" },
  ]},
  { section: "Globaal", items: [
    { keys: ["Ctrl", "B"], desc: "Sidebar in-/uitklappen" },
    { keys: ["Ctrl", "D"], desc: "Dark mode wisselen" },
  ]},
];

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="bg-card rounded-xl shadow-2xl border border-border/40 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Sneltoetsen</h2>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {shortcuts.map((section) => (
            <div key={section.section}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{section.section}</h3>
              <div className="space-y-1.5">
                {section.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-1">
                    <span className="text-xs text-foreground/80">{item.desc}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((key, j) => (
                        <span key={j}>
                          <kbd className="inline-flex items-center justify-center h-6 min-w-[24px] px-1.5 rounded bg-muted border border-border/50 text-xs font-mono font-medium text-muted-foreground">{key}</kbd>
                          {j < item.keys.length - 1 && <span className="text-muted-foreground/40 mx-0.5">+</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-border/30 text-center">
          <p className="text-xs text-muted-foreground">Druk op <kbd className="px-1 py-0.5 rounded bg-muted border text-xs font-mono">?</kbd> om te sluiten</p>
        </div>
      </div>
    </div>
  );
}
