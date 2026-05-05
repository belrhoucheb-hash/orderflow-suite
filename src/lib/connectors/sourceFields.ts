// Bron-velden per connector.
//
// Dit zijn de OrderFlow-velden die naar een doel-veld gemapt kunnen worden in
// de drag-and-drop mapping-UI. Per connector verschillen ze omdat een
// boekhoudkoppeling andere velden nodig heeft dan een tijdregistratie.
//
// Bewust hardcoded zodat de UI direct render zonder DB-call. De runtime in
// supabase/functions/_shared/connectors/runtime.ts gebruikt dezelfde sleutels
// (zie mappingValue en de connector-impl bestanden) om de mapping te
// resolven.

export interface ConnectorSourceField {
  /** Stabiele key, gebruikt als waarde in mapping-veld. */
  key: string;
  /** Label in UI. */
  label: string;
  /** Korte hint (1 zin) over wat dit veld bevat. */
  hint?: string;
  /** Voorbeeldwaarde voor de live preview. */
  example?: string;
}

const ORDER_FIELDS: ConnectorSourceField[] = [
  { key: "orderNumber", label: "Ordernummer", hint: "Uniek nummer per order", example: "OR-2026-1042" },
  { key: "clientName", label: "Klantnaam", hint: "Naam van de opdrachtgever", example: "Royal Cargo BV" },
  { key: "clientNumber", label: "Klantnummer", hint: "Debiteurnummer in OrderFlow", example: "10042" },
  { key: "totalAmount", label: "Totaalbedrag", hint: "Bedrag inclusief btw", example: "1.250,00" },
  { key: "subtotal", label: "Subtotaal", hint: "Bedrag exclusief btw", example: "1.033,06" },
  { key: "vatAmount", label: "BTW-bedrag", hint: "BTW-bedrag op de factuur", example: "216,94" },
  { key: "vatRate", label: "BTW-percentage", hint: "Standaard 21%", example: "21" },
  { key: "currency", label: "Valuta", hint: "ISO 4217 valuta-code", example: "EUR" },
  { key: "invoiceDate", label: "Factuurdatum", hint: "Datum waarop de factuur is uitgereikt", example: "2026-05-04" },
  { key: "dueDate", label: "Vervaldatum", hint: "Uiterste betaaldatum", example: "2026-06-03" },
  { key: "reference", label: "Referentie", hint: "Externe referentie van de klant", example: "PO-9981" },
  { key: "description", label: "Omschrijving", hint: "Vrij tekstveld op orderniveau", example: "Vervoer Schiphol -> Antwerpen" },
];

const DRIVER_FIELDS: ConnectorSourceField[] = [
  { key: "driverName", label: "Chauffeursnaam", example: "Jan de Vries" },
  { key: "personnelNumber", label: "Personeelsnummer", example: "P-1042" },
  { key: "workDate", label: "Werkdatum", example: "2026-05-04" },
  { key: "hoursWorked", label: "Gewerkte uren", example: "8.5" },
  { key: "shiftStart", label: "Start dienst", example: "06:30" },
  { key: "shiftEnd", label: "Einde dienst", example: "15:00" },
  { key: "vehiclePlate", label: "Kenteken", example: "12-ABC-3" },
];

const SOURCE_FIELDS_BY_PROVIDER: Record<string, ConnectorSourceField[]> = {
  snelstart: ORDER_FIELDS,
  exact_online: ORDER_FIELDS,
  twinfield: ORDER_FIELDS,
  afas: ORDER_FIELDS,
  yuki: ORDER_FIELDS,
  moneybird: ORDER_FIELDS,
  e_boekhouden: ORDER_FIELDS,
  visma: ORDER_FIELDS,
  nostradamus: DRIVER_FIELDS,
};

export function getSourceFields(provider: string): ConnectorSourceField[] {
  return SOURCE_FIELDS_BY_PROVIDER[provider] ?? [];
}

export function findSourceField(provider: string, key: string): ConnectorSourceField | undefined {
  return getSourceFields(provider).find((f) => f.key === key);
}
