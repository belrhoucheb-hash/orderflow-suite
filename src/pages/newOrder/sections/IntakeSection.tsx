import type { Dispatch, MutableRefObject, ReactNode, SetStateAction } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Client } from "@/hooks/useClients";
import type { ClientContact } from "@/hooks/useClientContacts";
import type { Warehouse } from "@/hooks/useWarehouses";

type IntakeActiveQuestion = 1 | 2 | 3 | 4;
type ContactChoiceMode = "existing" | "manual";
type TransportFlowChoice = "import" | "export" | "direct";

export interface IntakeSectionProps {
  // Wizard step state
  intakeActiveQuestion: IntakeActiveQuestion;
  setIntakeActiveQuestion: Dispatch<SetStateAction<IntakeActiveQuestion>>;
  setIntakeManualBack: Dispatch<SetStateAction<boolean>>;

  // Client state
  clientName: string;
  setClientName: Dispatch<SetStateAction<string>>;
  clientId: string | null;
  setClientId: Dispatch<SetStateAction<string | null>>;
  setClientQuestionConfirmed: Dispatch<SetStateAction<boolean>>;
  clientOpen: boolean;
  setClientOpen: Dispatch<SetStateAction<boolean>>;
  clientListOpen: boolean;
  clientListToggleUntilRef: MutableRefObject<number>;
  clientSuggestions: Client[];
  selectedClient: Client | null | undefined;
  clientLocations: unknown[];
  warehouses: Warehouse[];
  clientAnswered: boolean;
  clientInputReady: boolean;
  clientNeedsConfirmation: boolean;
  missingClient: boolean;

  // Contact state
  contactpersoon: string;
  setContactpersoon: Dispatch<SetStateAction<string>>;
  contactChoiceMode: ContactChoiceMode;
  setContactChoiceMode: Dispatch<SetStateAction<ContactChoiceMode>>;
  selectedContactId: string | null;
  setSelectedContactId: Dispatch<SetStateAction<string | null>>;
  manualContactName: string;
  setManualContactName: Dispatch<SetStateAction<string>>;
  manualContactEmail: string;
  setManualContactEmail: Dispatch<SetStateAction<string>>;
  manualContactPhone: string;
  setManualContactPhone: Dispatch<SetStateAction<string>>;
  activeClientContacts: ClientContact[];
  contactAnswered: boolean;
  contactRoleLabel: (role?: string | null) => string;

  // Reference + flow
  klantReferentie: string;
  setKlantReferentie: Dispatch<SetStateAction<string>>;
  transportFlowChoice: TransportFlowChoice | "";
  chooseTransportFlow: (flow: TransportFlowChoice) => void;
  afdeling: string;

  // Errors
  errors: Record<string, string>;
  setErrors: Dispatch<SetStateAction<Record<string, string>>>;
  clearError: (field: string) => void;

  // Render helpers + class strings
  uberFlowShellClass: string;
  conversationalCardClass: (level?: number) => string;
  flowLabelClass: string;
  flowInputClass: string;
  requiredFieldClass: (missing: boolean) => string;
  requiredTextClass: (missing: boolean) => string;
  renderUberStepHeader: (label: string, title: string, hint: string) => ReactNode;
  renderCollapsedAnswer: (
    label: string,
    value: string,
    onEdit: () => void,
    mutedValue?: string,
  ) => ReactNode;
  renderQuestionPrompt: (
    question: { step: string; title: string; hint: string },
    complete?: boolean,
    ready?: boolean,
  ) => ReactNode;
  renderWizardFooter: () => ReactNode;
}

export function IntakeSection(props: IntakeSectionProps): JSX.Element {
  const {
    intakeActiveQuestion,
    setIntakeActiveQuestion,
    setIntakeManualBack,
    clientName,
    setClientName,
    clientId,
    setClientId,
    setClientQuestionConfirmed,
    clientOpen,
    setClientOpen,
    clientListOpen,
    clientListToggleUntilRef,
    clientSuggestions,
    selectedClient,
    clientLocations,
    warehouses,
    clientAnswered,
    clientInputReady,
    clientNeedsConfirmation,
    missingClient,
    contactpersoon,
    setContactpersoon,
    contactChoiceMode,
    setContactChoiceMode,
    selectedContactId,
    setSelectedContactId,
    manualContactName,
    setManualContactName,
    manualContactEmail,
    setManualContactEmail,
    manualContactPhone,
    setManualContactPhone,
    activeClientContacts,
    contactAnswered,
    contactRoleLabel,
    klantReferentie,
    setKlantReferentie,
    transportFlowChoice,
    chooseTransportFlow,
    afdeling,
    errors,
    setErrors,
    clearError,
    uberFlowShellClass,
    conversationalCardClass,
    flowLabelClass,
    flowInputClass,
    requiredFieldClass,
    requiredTextClass,
    renderUberStepHeader,
    renderCollapsedAnswer,
    renderQuestionPrompt,
    renderWizardFooter,
  } = props;

  return (
    <>
      <section className={uberFlowShellClass}>
        {renderUberStepHeader("01 · Opdracht", "Start met de opdrachtgever", "Een keuze tegelijk. Zodra dit klopt, schuift de volgende vraag erin.")}
        <div className="space-y-4">
          {(
          <div className={conversationalCardClass(0)}>
            {renderQuestionPrompt(
              { step: "Klant", title: "Voor welke klant is deze order?", hint: "Typ minimaal 2 tekens. Druk Enter of kies een klant uit de lijst." },
              !missingClient,
              clientNeedsConfirmation,
            )}
            <label className={cn(
              flowLabelClass,
              clientNeedsConfirmation ? "text-[hsl(var(--gold-deep))]" : requiredTextClass(missingClient),
            )}>Klant <span className={clientNeedsConfirmation ? "text-[hsl(var(--gold-deep))]" : "text-red-600"}>*</span></label>
          <Popover
            open={clientListOpen}
            onOpenChange={(open) => {
              if (open && Date.now() < clientListToggleUntilRef.current) return;
              setClientOpen(open);
            }}
          >
              <PopoverAnchor asChild>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={clientName}
                    onChange={e => {
                      setClientName(e.target.value);
                      setClientQuestionConfirmed(false);
                      if (clientId) setClientId(null);
                      setContactpersoon("");
                      setSelectedContactId(null);
                      setManualContactName("");
                      setManualContactEmail("");
                      setManualContactPhone("");
                      setClientOpen(true);
                      clearError("client_name");
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (clientInputReady) {
                          setClientQuestionConfirmed(true);
                          setIntakeManualBack(false);
                          setIntakeActiveQuestion(2);
                          setClientOpen(false);
                          clearError("client_name");
                        } else {
                          setErrors(prev => ({ ...prev, client_name: "Typ minimaal 2 tekens of kies een klant uit de lijst." }));
                        }
                      }
                    }}
                    onFocus={() => {
                      if (Date.now() < clientListToggleUntilRef.current) return;
                      if (clientSuggestions.length > 0) setClientOpen(true);
                    }}
                    placeholder="Typ klantnaam of kies uit lijst…"
                    className={cn(
                      flowInputClass,
                      "pl-11 pr-11",
                      missingClient && !clientNeedsConfirmation && requiredFieldClass(true),
                      clientNeedsConfirmation && "border-[hsl(var(--gold)_/_0.45)] bg-white",
                      errors.client_name && !clientNeedsConfirmation && "border-red-500",
                    )}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    aria-label={clientListOpen ? "Verberg klantenlijst" : "Toon klantenlijst"}
                    aria-expanded={clientListOpen}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const nextOpen = !clientListOpen;
                      clientListToggleUntilRef.current = Date.now() + (nextOpen ? 0 : 350);
                      setClientOpen(nextOpen);
                    }}
                    className="absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  >
                    <ChevronDown className={cn("h-4 w-4 transition-transform", clientListOpen && "rotate-180")} />
                  </button>
                </div>
              </PopoverAnchor>
              <PopoverContent
                align="start"
                onOpenAutoFocus={e => e.preventDefault()}
                className="p-1 w-[--radix-popover-trigger-width] max-h-64 overflow-y-auto"
              >
                {clientSuggestions.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setClientName(c.name);
                      setClientId(c.id);
                      setClientQuestionConfirmed(true);
                      setContactpersoon(c.contact_person ?? "");
                      setSelectedContactId(null);
                      setContactChoiceMode("existing");
                      setClientOpen(false);
                      clearError("client_name");
                      setIntakeManualBack(false);
                      setIntakeActiveQuestion(2);
                    }}
                    className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent focus:bg-accent focus:outline-none"
                  >
                    <div className="font-medium">{c.name}</div>
                    {(c.city || c.email) && (
                      <div className="text-[11px] text-muted-foreground">
                        {[c.city, c.email].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            {(errors.client_name || missingClient) && (
              <span className={cn("mt-1 block text-[11px]", clientNeedsConfirmation ? "text-[hsl(var(--gold-deep))]" : "text-red-500")}>
                {clientNeedsConfirmation
                  ? "Klantnaam staat klaar. Druk Enter om de volgende vraag te openen."
                  : errors.client_name || "Typ minimaal 2 tekens of kies een klant uit de lijst."}
              </span>
            )}
          </div>
          )}

          {intakeActiveQuestion >= 2 && clientAnswered && renderCollapsedAnswer(
            "Klant",
            clientName,
            () => {
              setIntakeManualBack(true);
              setIntakeActiveQuestion(1);
            },
          )}

          {intakeActiveQuestion === 2 && (
            <div className={conversationalCardClass(0)}>
              {renderQuestionPrompt(
                {
                  step: "Contactpersoon",
                  title: "Welke contactpersoon hoort bij deze order?",
                  hint: "Kies de juiste contactpersoon van de klant, of voeg direct een nieuwe toe.",
                },
                contactAnswered,
                true,
              )}
              <div className="grid max-w-3xl gap-5">
                {activeClientContacts.length > 0 && (
                  <div>
                    <label className={flowLabelClass}>Contactpersoon van {clientName || "klant"}</label>
                    <Select
                      value={selectedContactId ?? ""}
                      onValueChange={(id) => {
                        const contact = activeClientContacts.find((ct) => ct.id === id);
                        setSelectedContactId(id);
                        setContactChoiceMode("existing");
                        setContactpersoon(contact?.name ?? "");
                      }}
                    >
                      <SelectTrigger className={cn(flowInputClass, "justify-between")}>
                        <SelectValue placeholder="Kies contactpersoon" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeClientContacts.map(ct => (
                          <SelectItem key={ct.id} value={ct.id}>
                            {[ct.name, contactRoleLabel(ct.role), ct.email].filter(Boolean).join(" - ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="rounded-2xl border border-[hsl(var(--gold)_/_0.16)] bg-white/80 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
                        Nieuwe contactpersoon
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Wordt na aanmaken bij de klantcontacten opgeslagen.</p>
                    </div>
                    {activeClientContacts.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setContactChoiceMode("manual");
                          setSelectedContactId(null);
                        }}
                        className="rounded-full border border-[hsl(var(--gold)_/_0.24)] bg-white px-3 py-1.5 text-xs font-semibold text-[hsl(var(--gold-deep))] transition hover:bg-[hsl(var(--gold-soft)_/_0.32)]"
                      >
                        Handmatig invullen
                      </button>
                    )}
                  </div>
                  {(contactChoiceMode === "manual" || activeClientContacts.length === 0) && (
                    <div className="grid gap-3">
                      <Input value={manualContactName} onChange={e => { setManualContactName(e.target.value); setContactpersoon(e.target.value); }} placeholder="Naam contactpersoon" className={flowInputClass} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input value={manualContactEmail} onChange={e => setManualContactEmail(e.target.value)} placeholder="E-mail" className="h-12 rounded-2xl text-sm" />
                        <Input value={manualContactPhone} onChange={e => setManualContactPhone(e.target.value)} placeholder="Telefoon" className="h-12 rounded-2xl text-sm" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {intakeActiveQuestion >= 3 && renderCollapsedAnswer(
            "Contactpersoon",
            contactpersoon.trim() || manualContactName.trim(),
            () => {
              setIntakeManualBack(true);
              setIntakeActiveQuestion(2);
            },
          )}

          {intakeActiveQuestion === 3 && (
            <div className={conversationalCardClass(0)}>
              {renderQuestionPrompt(
                {
                  step: "Referentie",
                  title: "Welke referentie hoort bij deze order?",
                  hint: "Optioneel. Vul een PO-nummer in en druk Enter, of sla deze vraag over.",
                },
                Boolean(klantReferentie.trim()),
                true,
              )}
              <div className="max-w-xl">
                <label className={flowLabelClass}>Klant-referentie</label>
                <Input
                  value={klantReferentie}
                  onChange={e => setKlantReferentie(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setIntakeManualBack(false);
                      setIntakeActiveQuestion(4);
                    }
                  }}
                  placeholder="PO-nummer of bestelreferentie"
                  className={flowInputClass}
                />
              </div>
            </div>
          )}

          {intakeActiveQuestion >= 4 && renderCollapsedAnswer(
            "Referentie",
            klantReferentie.trim() || "Geen referentie",
            () => {
              setIntakeManualBack(true);
              setIntakeActiveQuestion(3);
            },
          )}

          {intakeActiveQuestion === 4 && (
            <div className={conversationalCardClass(0)}>
              {renderQuestionPrompt(
                {
                  step: "Routeflow",
                  title: "Is dit export, import of direct A-B?",
                  hint: "Deze keuze vult alvast de afdeling en, waar ingesteld, het juiste warehouse als laad- of losadres.",
                },
                Boolean(transportFlowChoice),
                true,
              )}
              <div className="grid gap-3 md:grid-cols-3">
                {([
                  {
                    value: "export" as const,
                    title: "Export",
                    label: "Warehouse als laadadres",
                    description: "Gebruik het exportwarehouse uit instellingen en zet de afdeling op Export.",
                  },
                  {
                    value: "import" as const,
                    title: "Import",
                    label: "Warehouse als losadres",
                    description: "Gebruik het importwarehouse uit instellingen en zet de afdeling op Import.",
                  },
                  {
                    value: "direct" as const,
                    title: "Direct A-B",
                    label: "Geen warehouse ertussen",
                    description: "Plan rechtstreeks van ophaaladres naar eindbestemming via Operations.",
                  },
                ]).map((option) => {
                  const active = transportFlowChoice === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => chooseTransportFlow(option.value)}
                      className={cn(
                        "min-h-[150px] rounded-2xl border bg-white p-4 text-left shadow-[0_14px_34px_-30px_hsl(var(--gold-deep)_/_0.65)] transition hover:border-[hsl(var(--gold)_/_0.46)] hover:bg-[hsl(var(--gold-soft)_/_0.20)]",
                        active
                          ? "border-[hsl(var(--gold)_/_0.68)] bg-[hsl(var(--gold-soft)_/_0.26)] shadow-[inset_0_0_0_1px_hsl(var(--gold)_/_0.20)]"
                          : "border-[hsl(var(--gold)_/_0.16)]",
                      )}
                    >
                      <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-[hsl(var(--gold-soft))] px-3 text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(var(--gold-deep))]">
                        {option.title}
                      </span>
                      <span className="mt-4 block text-base font-semibold text-foreground">{option.label}</span>
                      <span className="mt-2 block text-sm leading-6 text-muted-foreground">{option.description}</span>
                    </button>
                  );
                })}
              </div>
              {transportFlowChoice && (
                <div className="mt-4 rounded-2xl border border-[hsl(var(--gold)_/_0.16)] bg-[hsl(var(--gold-soft)_/_0.18)] px-4 py-3 text-sm text-muted-foreground">
                  Afdeling staat op <span className="font-semibold text-foreground">{afdeling || "Operations"}</span>.
                  {transportFlowChoice === "direct"
                    ? " Je vult laad- en losadres zelf in."
                    : " Het passende warehouse is alvast toegepast wanneer het in instellingen beschikbaar is."}
                </div>
              )}
            </div>
          )}

        </div>
        {selectedClient && (
          <div className="mt-4 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            {[
              clientLocations.length > 0 ? `${clientLocations.length} vaste klantlocaties` : null,
              warehouses.length > 0 ? `${warehouses.length} warehouses uit instellingen` : null,
            ].filter(Boolean).join(" en ") || "Handmatige adressen en adresboek blijven beschikbaar."}
            {" "}Adreskeuze hoeft niet aan deze klant gekoppeld te zijn.
          </div>
        )}
        {renderWizardFooter()}
      </section>
    </>
  );
}
