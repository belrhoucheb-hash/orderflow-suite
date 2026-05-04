// Mapping-templates per connector.
//
// Hardcoded sets van mapping-waarden die een tenant met één klik kan toepassen.
// Templates vullen de mapping-velden van de connector-detail Mapping-tab. De
// keys moeten overeenkomen met ConnectorDefinition.mappingKeys. Waarden zijn
// bron-veld-keys uit sourceFields.ts of vrije strings (bv. grootboek-nummers).

export interface MappingTemplate {
  /** Stabiele id voor de template (gebruikt als chip-key). */
  id: string;
  /** Korte naam voor de chip. */
  label: string;
  /** Eén zin uitleg, getoond als tooltip of subtitel. */
  description: string;
  /** Mapping-keys -> bron-veld-key of vrije waarde. */
  values: Record<string, string>;
}

const SNELSTART_TEMPLATES: MappingTemplate[] = [
  {
    id: "standaard_nl",
    label: "Standaard NL boekhouding",
    description: "Verkoop op 8000, BTW op 1500, debiteuren vanaf 10000.",
    values: {
      default_grootboek: "8000",
      btw_grootboek: "1500",
      debtor_number_start: "10000",
    },
  },
  {
    id: "eu_compliance",
    label: "EU compliance",
    description: "Aparte EU-grootboeken met intracom-btw.",
    values: {
      default_grootboek: "8010",
      btw_grootboek: "1530",
      debtor_number_start: "12000",
    },
  },
];

const EXACT_TEMPLATES: MappingTemplate[] = [
  {
    id: "standaard_nl",
    label: "Standaard NL boekhouding",
    description: "Verkoop op 8000, BTW op 1500, debiteuren vanaf 10000.",
    values: {
      default_grootboek: "8000",
      btw_grootboek: "1500",
      debtor_number_start: "10000",
    },
  },
  {
    id: "eu_compliance",
    label: "EU compliance",
    description: "Aparte EU-grootboeken met intracom-btw.",
    values: {
      default_grootboek: "8020",
      btw_grootboek: "1530",
      debtor_number_start: "12000",
    },
  },
  {
    id: "be_starter",
    label: "Belgisch startpakket",
    description: "Belgische standaard rekeningen en debiteurenreeks.",
    values: {
      default_grootboek: "70000",
      btw_grootboek: "45100",
      debtor_number_start: "40000",
    },
  },
];

const NOSTRADAMUS_TEMPLATES: MappingTemplate[] = [
  {
    id: "standaard",
    label: "Standaard pad-mapping",
    description: "Conventionele paden voor de Nostradamus tijdregistratie.",
    values: {
      response_array_path: "data.records",
      personnel_number_field: "employeeNumber",
      work_date_field: "date",
      hours_field: "workedHours",
      details_path: "details",
      contract_path: "contract",
      hours_path: "hours",
      leave_path: "leave",
      sickness_path: "sickness",
      files_path: "files",
    },
  },
];

const TEMPLATES_BY_PROVIDER: Record<string, MappingTemplate[]> = {
  snelstart: SNELSTART_TEMPLATES,
  exact_online: EXACT_TEMPLATES,
  nostradamus: NOSTRADAMUS_TEMPLATES,
};

export function getMappingTemplates(provider: string): MappingTemplate[] {
  return TEMPLATES_BY_PROVIDER[provider] ?? [];
}
