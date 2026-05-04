import { Download, Plus, Printer, Upload, Copy, SlidersHorizontal } from "lucide-react";
import { SearchInput } from "@/components/ui/SearchInput";
import { StatusBadge, type OrderStatus } from "@/components/ui/StatusBadge";

const metrics = [
  { label: "Operationeel", value: "0", caption: "Onderweg of ingepland, live tracking actief", unit: "dossiers", lead: true },
  { label: "Nieuw", value: "4", caption: "Te plannen" },
  { label: "Oud concept", value: "4", caption: "Draft > 2 uur" },
  { label: "In behandeling", value: "0", caption: "Open dossier" },
  { label: "Wacht op info", value: "0", caption: "Dossier incompleet" },
  { label: "Afgeleverd", value: "0", caption: "POD ontvangen" },
  { label: "Met prioriteit", value: "0", caption: "Spoed of hoog" },
];

const orders: Array<{
  order: string;
  client: string;
  pickup: string;
  delivery: string;
  weight: string;
  status: OrderStatus;
  priority: string;
  date: string;
}> = [
  {
    order: "RCS-2026-0088",
    client: "FreightNed Air B.V.",
    pickup: "Incheonweg 7, 1437 EK Rozenburg",
    delivery: "Contour Avenue 91, 2133 LD Hoofddorp",
    weight: "1 kg",
    status: "DRAFT",
    priority: "Standaard",
    date: "2 dagen geleden",
  },
  {
    order: "RCS-2026-0057",
    client: "FreightNed Air B.V.",
    pickup: "Newtonweg 9, 3208 KD Spijkenisse",
    delivery: "Bijlmermeerstraat 28, 2131 HG Hoofddorp",
    weight: "18 kg",
    status: "DRAFT",
    priority: "Standaard",
    date: "22 apr. 2026",
  },
  {
    order: "RCS-2026-0056",
    client: "EMO Trans Netherlands B.V.",
    pickup: "Sojadijk 4 6, 5704 RL Helmond",
    delivery: "Bijlmermeerstraat 28, 2131 HG Hoofddorp",
    weight: "117 kg",
    status: "DRAFT",
    priority: "Standaard",
    date: "22 apr. 2026",
  },
  {
    order: "RCS-2026-0054",
    client: "EMO Trans Netherlands B.V.",
    pickup: "Distributieweg 10, 4906 AD Oosterhout",
    delivery: "Bijlmermeerstraat 28, 2131 HG Hoofddorp",
    weight: "100 kg",
    status: "DRAFT",
    priority: "Standaard",
    date: "22 apr. 2026",
  },
];

export default function StylePreview() {
  return (
    <div className="page-container">
      <header className="rounded-2xl border border-[hsl(var(--gold)/0.14)] bg-[linear-gradient(135deg,hsl(42_36%_98%),hsl(var(--card))_48%,hsl(var(--gold-soft)/0.28))] px-5 py-5 shadow-[0_18px_60px_-52px_hsl(32_35%_28%/0.35)]">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
              <span className="h-px w-6 bg-[hsl(var(--gold)/0.55)]" />
              Operatie
              <span className="text-muted-foreground">4 orders</span>
            </div>
            <h1 className="text-[2rem] font-semibold leading-none tracking-tight text-foreground" style={{ fontFamily: "var(--font-display)" }}>
              Orders
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-luxe">
              <Download className="h-4 w-4" />
              Export
            </button>
            <button className="btn-luxe">
              <Upload className="h-4 w-4" />
              Import
            </button>
            <button className="btn-luxe btn-luxe--primary">
              <Plus className="h-4 w-4" />
              Nieuwe order
            </button>
          </div>
        </div>
      </header>

      <section
        className="overflow-hidden rounded-2xl border border-[hsl(var(--gold)/0.14)] bg-card shadow-[0_20px_70px_-60px_hsl(var(--ink)/0.45)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-[1.1fr_repeat(6,1fr)]">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="min-h-[11.25rem] border-b border-r border-[hsl(var(--gold)/0.10)] px-6 py-6 xl:border-b-0"
            >
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-[hsl(var(--gold-deep))]">
                {metric.lead && <span className="h-px w-5 bg-[hsl(var(--gold)/0.55)]" />}
                {metric.label}
              </div>
              <div className={metric.lead ? "flex items-end gap-3" : ""}>
                <span className={metric.lead ? "text-[3.75rem] font-semibold leading-none tracking-tight text-foreground tabular-nums" : "text-[2rem] font-semibold leading-none tracking-tight text-foreground tabular-nums"}>
                  {metric.value}
                </span>
                {metric.unit && (
                  <span className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    {metric.unit}
                  </span>
                )}
              </div>
              <p className={metric.lead ? "mt-5 max-w-[12rem] text-sm leading-5 text-muted-foreground" : "mt-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground"}>
                {metric.caption}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <SearchInput
          value=""
          onChange={() => undefined}
          placeholder="Zoek op ordernummer (bijv. RCS-2026-0001), klant of adres"
          className="w-full md:max-w-[28rem]"
        />
        <button className="btn-luxe h-10 w-10 p-0" aria-label="Filters">
          <SlidersHorizontal className="h-4 w-4" />
        </button>
        <button className="btn-luxe h-10 px-4">Alle afdelingen</button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[hsl(var(--gold)/0.14)] bg-card shadow-[0_28px_90px_-72px_hsl(var(--ink)/0.5)]">
        <div className="overflow-x-auto">
          <table className="data-table w-full table-fixed">
            <colgroup>
              <col className="w-10" />
              <col className="w-[11%]" />
              <col className="w-[13%]" />
              <col className="w-[20%]" />
              <col className="w-[20%]" />
              <col className="w-[8%]" />
              <col className="w-[10%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-16" />
            </colgroup>
            <thead>
              <tr
                className="border-b border-[hsl(var(--gold)/0.14)] bg-[hsl(var(--gold-soft)/0.14)] [&>th]:px-4 [&>th]:py-4 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-[0.16em] [&>th]:text-[hsl(var(--gold-deep))]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                <th className="w-10">
                  <input type="checkbox" aria-label="Alles selecteren" className="h-3.5 w-3.5 accent-[hsl(var(--gold-deep))]" />
                </th>
                <th>Order</th>
                <th>Klant</th>
                <th>Ophaaladres</th>
                <th>Afleveradres</th>
                <th className="text-right">Gewicht</th>
                <th>Status</th>
                <th>Prioriteit</th>
                <th>Datum</th>
                <th className="text-center">Label</th>
              </tr>
            </thead>
            <tbody
              className="divide-y divide-[hsl(var(--border)/0.7)] [&>tr>td]:px-4 [&>tr>td]:py-4 [&>tr>td]:align-middle"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {orders.map((order) => (
                <tr key={order.order} className="table-row">
                  <td>
                    <input type="checkbox" aria-label={`Selecteer ${order.order}`} className="h-3.5 w-3.5 accent-[hsl(var(--gold-deep))]" />
                  </td>
                  <td className="whitespace-nowrap text-[13px] font-semibold tabular-nums tracking-[0.01em] text-foreground">{order.order}</td>
                  <td className="truncate font-semibold text-foreground/90">{order.client}</td>
                  <td className="truncate text-muted-foreground">{order.pickup}</td>
                  <td className="truncate text-muted-foreground">{order.delivery}</td>
                  <td className="text-right font-semibold tabular-nums text-foreground/90">{order.weight}</td>
                  <td>
                    <StatusBadge status={order.status} variant="luxe" />
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                      {order.priority}
                    </span>
                  </td>
                  <td className="truncate text-muted-foreground/80 tabular-nums">{order.date}</td>
                  <td className="text-center">
                    <div className="inline-flex items-center gap-0.5 text-muted-foreground">
                      <button className="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-muted/50 hover:text-foreground" aria-label={`Dupliceer ${order.order}`}>
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button className="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-muted/50 hover:text-foreground" aria-label={`Print label ${order.order}`}>
                        <Printer className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="flex flex-col gap-3 border-t border-[hsl(var(--gold)/0.14)] px-5 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <span className="rounded-full border border-[hsl(var(--gold)/0.18)] bg-[hsl(var(--gold-soft)/0.24)] px-3 py-1 text-[hsl(var(--gold-deep))]">4 orders</span>
            <span>4 getoond</span>
            <span>25 per pagina</span>
          </div>
          <div className="flex items-center gap-8 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <span>Pagina 1</span>
            <span>Gewicht <strong className="ml-2 text-foreground">236 kg</strong></span>
          </div>
        </footer>
      </section>
    </div>
  );
}
