import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useFleetVehicles } from "@/hooks/useFleet";
import { useAddressSuggestions } from "@/hooks/useAddressSuggestions";
import { type ClientRecord, type OrderDraft, type FormState } from "@/components/inbox/types";
import {
  orderToForm,
  normaliseRequirements,
  TEST_SCENARIOS,
  getDeadlineInfo,
  findDuplicates,
  getCapacityWarning,
  tryEnrichAddress,
  getFormErrors,
} from "@/components/inbox/utils";
import { saveCorrection } from "@/hooks/useAIFeedback";
import { useTenant } from "@/contexts/TenantContext";

export function useInbox() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  // ─── State ───
  const [selectedId, setSelectedId] = useState<string>("");
  const [formData, setFormData] = useState<Record<string, FormState>>({});
  const [search, setSearch] = useState("");
  const [sidebarFilter, setSidebarFilter] = useState<"alle" | "actie" | "klaar" | "verzonden" | "concepten">("alle");
  const [filterDate, setFilterDate] = useState("");
  const [filterClient, setFilterClient] = useState("");
  const [filterType, setFilterType] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "source" | "detail">("list");
  const [showTestPanel, setShowTestPanel] = useState(false);
  const [groupByClient, setGroupByClient] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [showPickupSuggestions, setShowPickupSuggestions] = useState(false);
  const [showDeliverySuggestions, setShowDeliverySuggestions] = useState(false);
  const [loadingScenario, setLoadingScenario] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Fleet / Capacity ───
  const { data: vehicles = [] } = useFleetVehicles();
  const capacityWarning = useMemo(() => getCapacityWarning(vehicles), [vehicles]);

  // ─── Clients (addressbook) ───
  const { data: clients = [] } = useQuery({
    queryKey: ["clients-addressbook"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name, address, zipcode, city, country");
      if (error) throw error;
      return data as ClientRecord[];
    },
  });

  // ─── Address enrichment ───
  const enrichAddresses = useCallback(
    (formState: Partial<FormState>): { result: Partial<FormState>; enrichments: string[] } => {
      const enrichments: string[] = [];
      const result = { ...formState };
      if (result.pickupAddress) {
        const pickup = tryEnrichAddress(result.pickupAddress, clients);
        if (pickup.matchedClient) {
          result.pickupAddress = pickup.enriched;
          enrichments.push(`Ophaaladres verrijkt via "${pickup.matchedClient}"`);
        }
      }
      if (result.deliveryAddress) {
        const delivery = tryEnrichAddress(result.deliveryAddress, clients);
        if (delivery.matchedClient) {
          result.deliveryAddress = delivery.enriched;
          enrichments.push(`Afleveradres verrijkt via "${delivery.matchedClient}"`);
        }
      }
      return { result, enrichments };
    },
    [clients],
  );

  // ─── Email Import ───
  const handleImportEmail = async (file: File) => {
    setIsImporting(true);
    try {
      const text = await file.text();
      const headerEnd = text.indexOf("\n\n") || text.indexOf("\r\n\r\n");
      const headerPart = text.slice(0, headerEnd);
      const bodyPart = text.slice(headerEnd).trim();

      const getHeader = (name: string) => {
        const match = headerPart.match(new RegExp(`^${name}:\\s*(.+)$`, "mi"));
        return match ? match[1].trim() : "";
      };

      const from = getHeader("From");
      const subject = getHeader("Subject");
      const emailFrom = from.match(/<(.+?)>/)?.[1] || from;
      const clientName = from.replace(/<.*>/, "").replace(/"/g, "").trim() || emailFrom;

      let emailBody = bodyPart;
      if (emailBody.startsWith("Content-Type:") || emailBody.startsWith("--")) {
        const plainMatch = emailBody.match(
          /Content-Type:\s*text\/plain[^]*?\n\n([\s\S]*?)(?=\n--|\n\nContent-Type:|$)/i,
        );
        if (plainMatch) emailBody = plainMatch[1].trim();
        else emailBody = bodyPart.replace(/Content-[A-Za-z-]+:.*\n/g, "").trim();
      }

      const tenantId = tenant?.id || "00000000-0000-0000-0000-000000000001";
      const { data: newOrder, error } = await supabase
        .from("orders")
        .insert({
          tenant_id: tenantId,
          status: "DRAFT",
          source_email_from: emailFrom,
          source_email_subject: subject,
          source_email_body: emailBody,
          client_name: clientName,
        })
        .select()
        .single();

      if (error) throw error;
      toast.success("E-mail geïmporteerd", { description: `"${subject}" van ${clientName}` });
      queryClient.invalidateQueries({ queryKey: ["draft-orders"] });
      setSelectedId(newOrder.id);
    } catch (e: any) {
      console.error("Import error:", e);
      toast.error("Import mislukt", { description: e.message || "Probeer het opnieuw" });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ─── Load Test Scenario ───
  const handleLoadTestScenario = useCallback(
    async (scenarioIndex: number) => {
      setLoadingScenario(scenarioIndex);
      try {
        const scenario = TEST_SCENARIOS[scenarioIndex];
        const subjectLine = scenario.subject || `Test: ${scenario.label}`;
        const fromEmail = scenario.from || "test@royaltycargo.nl";
        const clientName = scenario.client || "Test Scenario";

        const { data: existing } = await supabase
          .from("orders")
          .select("id")
          .eq("status", "DRAFT")
          .eq("source_email_subject", subjectLine)
          .limit(1);

        if (existing && existing.length > 0) {
          setSelectedId(existing[0].id);
          toast.success("Al aanwezig", { description: `"${scenario.label}" staat al in de inbox.` });
          setLoadingScenario(null);
          return;
        }

        const tenantId = tenant?.id || "00000000-0000-0000-0000-000000000001";
        const { data: newOrder, error } = await supabase
          .from("orders")
          .insert({
            tenant_id: tenantId,
            status: "DRAFT",
            source_email_from: fromEmail,
            source_email_subject: subjectLine,
            source_email_body: scenario.email,
            client_name: clientName,
          })
          .select()
          .single();
        if (error) throw error;
        await queryClient.invalidateQueries({ queryKey: ["draft-orders"] });
        setSelectedId(newOrder.id);
        toast.success("Test data geladen", { description: `${scenario.label} - AI analyse wordt gestart...` });

        const { data: parseResponse, error: parseError } = await supabase.functions.invoke("parse-order", {
          body: { emailBody: scenario.email, pdfUrls: [], threadContext: null, tenantId },
        });
        if (parseError) throw new Error(`Parse-order fout: ${parseError.message}`);
        const parseData = parseResponse;
        const ext = parseData?.extracted || parseData;

        const parsedForm: FormState = {
          transportType: ext.transport_type || "direct",
          pickupAddress: ext.pickup_address || "",
          deliveryAddress: ext.delivery_address || "",
          quantity: ext.quantity || 0,
          unit: ext.unit || "Pallets",
          weight: ext.weight_kg?.toString() || "",
          dimensions: ext.dimensions || "",
          requirements: normaliseRequirements(ext.requirements || []),
          perUnit: ext.is_weight_per_unit || false,
          internalNote: "",
          fieldSources: {},
          fieldConfidence: ext.field_confidence || {},
        };
        const { result: enriched, enrichments } = enrichAddresses(parsedForm);
        setFormData((prev) => ({ ...prev, [newOrder.id]: enriched as FormState }));
        if (enrichments.length > 0) toast.success("Adresboek verrijking", { description: enrichments.join(". ") });
        const enrichedForm = enriched as FormState;
        // Normalise confidence: AI may return 0-1 float instead of 0-100
        const normalizedConfidence =
          typeof ext.confidence_score === "number" && ext.confidence_score > 0 && ext.confidence_score <= 1
            ? Math.round(ext.confidence_score * 100)
            : ext.confidence_score;

        await supabase
          .from("orders")
          .update({
            confidence_score: normalizedConfidence,
            client_name: ext.client_name || clientName,
            transport_type: ext.transport_type,
            pickup_address: enrichedForm.pickupAddress,
            delivery_address: enrichedForm.deliveryAddress,
            quantity: ext.quantity,
            unit: ext.unit,
            weight_kg: ext.weight_kg,
            is_weight_per_unit: ext.is_weight_per_unit,
            dimensions: ext.dimensions,
            requirements: ext.requirements,
            missing_fields: parseData.missing_fields || [],
            follow_up_draft: parseData.follow_up_draft || null,
          })
          .eq("id", newOrder.id);
        await queryClient.invalidateQueries({ queryKey: ["draft-orders"] });
        toast.success("AI Extractie voltooid", { description: `Confidence: ${normalizedConfidence}%` });
      } catch (e: any) {
        console.error("Test scenario error:", e);
        toast.error("Test scenario fout", { description: e.message });
      } finally {
        setLoadingScenario(null);
      }
    },
    [queryClient, toast, enrichAddresses, tenant],
  );

  // ─── Queries ───
  const { data: drafts = [], isLoading } = useQuery({
    queryKey: ["draft-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("status", "DRAFT")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as OrderDraft[];
    },
  });

  const { data: sentOrders = [] } = useQuery({
    queryKey: ["sent-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .not("follow_up_sent_at", "is", null)
        .order("follow_up_sent_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as OrderDraft[];
    },
    enabled: sidebarFilter === "verzonden",
  });

  const { data: conceptOrders = [] } = useQuery({
    queryKey: ["concept-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("status", "DRAFT")
        .not("follow_up_draft", "is", null)
        .is("follow_up_sent_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as OrderDraft[];
    },
    enabled: sidebarFilter === "concepten",
  });

  // ─── Sync formData with drafts ───
  useEffect(() => {
    if (drafts.length > 0) {
      const map: Record<string, FormState> = {};
      drafts.forEach((d) => {
        if (!formData[d.id]) map[d.id] = orderToForm(d);
      });
      if (Object.keys(map).length > 0) setFormData((prev) => ({ ...prev, ...map }));
      if (!selectedId || !drafts.find((d) => d.id === selectedId)) setSelectedId(drafts[0].id);
    }
  }, [drafts]);

  // ─── Mutations ───
  const createOrderMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: FormState }) => {
      const { error } = await supabase
        .from("orders")
        .update({
          status: "PENDING",
          transport_type: form.transportType.toUpperCase().replace("-", "_"),
          pickup_address: form.pickupAddress,
          delivery_address: form.deliveryAddress,
          quantity: form.quantity,
          unit: form.unit,
          weight_kg: form.weight ? Number(form.weight) : null,
          is_weight_per_unit: form.perUnit,
          dimensions: form.dimensions || null,
          requirements: form.requirements,
          internal_note: form.internalNote || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_, { id }) => {
      const order = drafts.find((d) => d.id === id);
      toast.success("Order aangemaakt", { description: `Order #${order?.order_number} is nu actief` });
      queryClient.invalidateQueries({ queryKey: ["draft-orders"] });

      if (order?.source_email_from) {
        try {
          const { data, error: confirmError } = await supabase.functions.invoke("send-confirmation", {
            body: { orderId: id },
          });
          if (confirmError) throw confirmError;
          if (data?.error && !data?.skipped) throw new Error(data.error);
          if (data?.success) {
            toast.success("Bevestiging verzonden", { description: `Gestuurd naar ${order.source_email_from}` });
          }
        } catch (e: any) {
          console.error("Confirmation email error:", e);
        }
      }
    },
    onError: (error: any) => {
      console.error("Create order error:", error);
      toast.error("Order aanmaken mislukt", { description: error.message || "Controleer de gegevens en probeer opnieuw" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["draft-orders"] });
    },
  });

  const saveNoteMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { error } = await supabase.from("orders").update({ internal_note: note || null }).eq("id", id);
      if (error) throw error;
    },
  });

  const saveFormMutation = useMutation({
    mutationFn: async ({ id, form: f }: { id: string; form: FormState }) => {
      const { error } = await supabase
        .from("orders")
        .update({
          transport_type: f.transportType.toUpperCase().replace("-", "_"),
          pickup_address: f.pickupAddress,
          delivery_address: f.deliveryAddress,
          quantity: f.quantity,
          unit: f.unit,
          weight_kg: f.weight ? Number(f.weight) : null,
          is_weight_per_unit: f.perUnit,
          dimensions: f.dimensions || null,
          requirements: f.requirements,
          internal_note: f.internalNote || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
  });

  // ─── Derived State ───
  const selected = drafts.find((d) => d.id === selectedId);
  const form = selected ? formData[selected.id] : null;

  const { data: addressSuggestions } = useAddressSuggestions(selected?.client_name || null);

  const sourceOrders =
    sidebarFilter === "verzonden" ? sentOrders : sidebarFilter === "concepten" ? conceptOrders : drafts;

  const filtered = useMemo(
    () =>
      sourceOrders.filter((d) => {
        const matchesSearch =
          !search ||
          (d.client_name || "").toLowerCase().includes(search.toLowerCase()) ||
          (d.source_email_subject || "").toLowerCase().includes(search.toLowerCase());
        if (!matchesSearch) return false;

        if (filterDate) {
          const orderDate = d.received_at ? new Date(d.received_at) : null;
          if (!orderDate) return false;
          const now = new Date();
          if (filterDate === "today" && orderDate.toDateString() !== now.toDateString()) return false;
          if (filterDate === "week") {
            const weekAgo = new Date(now);
            weekAgo.setDate(weekAgo.getDate() - 7);
            if (orderDate < weekAgo) return false;
          }
          if (filterDate === "month") {
            const monthAgo = new Date(now);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            if (orderDate < monthAgo) return false;
          }
        }

        if (filterClient && d.client_name !== filterClient) return false;
        if (filterType && d.thread_type !== filterType) return false;

        if (sidebarFilter === "alle" || sidebarFilter === "verzonden" || sidebarFilter === "concepten") return true;
        const hasMissing = (d.missing_fields || []).length > 0;
        const score = d.confidence_score || 0;
        const isReady = !hasMissing && score >= 80;
        if (sidebarFilter === "klaar") return isReady;
        return !isReady;
      }),
    [sourceOrders, search, filterDate, filterClient, filterType, sidebarFilter],
  );

  const groupedByClient = useMemo(() => {
    if (!groupByClient) return null;
    const groups: Record<string, OrderDraft[]> = {};
    filtered.forEach((d) => {
      const key = d.client_name || "Onbekend";
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    });
    return groups;
  }, [filtered, groupByClient]);

  const needsAction = filtered.filter((d) => {
    const hasMissing = (d.missing_fields || []).length > 0;
    const lc = (d.confidence_score || 0) > 0 && (d.confidence_score || 0) < 80;
    const noScore = !d.confidence_score;
    return hasMissing || lc || noScore;
  });

  const readyToGo = filtered.filter((d) => {
    const hasMissing = (d.missing_fields || []).length > 0;
    const score = d.confidence_score || 0;
    return !hasMissing && score >= 80;
  });

  const highConf = drafts.filter((d) => (d.confidence_score || 0) >= 80).length;
  const lowConf = drafts.filter((d) => (d.confidence_score || 0) > 0 && (d.confidence_score || 0) < 80).length;
  const noConf = drafts.filter((d) => !d.confidence_score).length;

  const duplicateMap = useMemo(() => findDuplicates(drafts), [drafts]);

  const mostUrgentId = useMemo(() => {
    let best: { id: string; min: number } | null = null;
    for (const d of filtered) {
      const dl = getDeadlineInfo(d.received_at);
      if (dl.urgency === "red" && (best === null || dl.minutesLeft < best.min)) {
        best = { id: d.id, min: dl.minutesLeft };
      }
    }
    return best?.id || null;
  }, [filtered]);

  const formHasErrors = !form?.pickupAddress || !form?.deliveryAddress || !form?.quantity || !form?.weight;

  // ─── Handlers ───
  const toggleBulkSelect = (id: string) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllSimilar = (clientName: string) => {
    const similar = drafts.filter((d) => d.client_name === clientName).map((d) => d.id);
    setBulkSelected(new Set(similar));
    toast.success("Selectie", { description: `${similar.length} orders van ${clientName} geselecteerd` });
  };

  const handleBulkApprove = () => {
    const ids = Array.from(bulkSelected);
    ids.forEach((id) => {
      const f = formData[id];
      if (f) createOrderMutation.mutate({ id, form: f });
    });
    setBulkSelected(new Set());
  };

  const updateField = (field: keyof FormState, value: any) => {
    if (!selected) return;
    if (selected.confidence_score && selected.confidence_score > 0 && form) {
      const oldValue = String((form as any)[field] || "");
      const newValue = String(value || "");
      if (oldValue && newValue && oldValue !== newValue) {
        saveCorrection(selected.id, selected.client_name || "", field, oldValue, newValue);
      }
    }
    setFormData((prev) => ({ ...prev, [selected.id]: { ...prev[selected.id], [field]: value } }));
  };

  const toggleRequirement = (req: string) => {
    if (!form) return;
    const reqs = form.requirements.includes(req)
      ? form.requirements.filter((r) => r !== req)
      : [...form.requirements, req];
    updateField("requirements", reqs);
  };

  const handleAutoSave = useCallback(() => {
    if (!selected || !formData[selected.id]) return;
    saveFormMutation.mutate({ id: selected.id, form: formData[selected.id] });
  }, [selected, formData]);

  const handleDelete = () => {
    if (!selected) return;
    deleteMutation.mutate(selected.id);
  };

  const handleCreateOrder = () => {
    if (!selected || !form || formHasErrors) return;
    const currentIdx = filtered.findIndex((d) => d.id === selected.id);
    createOrderMutation.mutate(
      { id: selected.id, form },
      {
        onSuccess: () => {
          toast.success("Order aangemaakt", { description: `Order #${selected.order_number} is goedgekeurd` });
          const nextItem = filtered[currentIdx + 1] || filtered[currentIdx - 1];
          if (nextItem) setSelectedId(nextItem.id);
          else setSelectedId("");
        },
      },
    );
  };

  const handleMerge = (clientName: string, orders: OrderDraft[]) => {
    if (orders.length < 2) return;
    toast.success("Orders samenvoegen", { description: `${orders.length} orders van ${clientName} worden samengevoegd tot 1 multi-stop transportopdracht (komt in volgende versie)` });
  };

  const handleBulkDelete = () => {
    Array.from(bulkSelected).forEach((id) => deleteMutation.mutate(id));
    setBulkSelected(new Set());
  };

  const handleBulkApproveChecked = () => {
    Array.from(bulkSelected).forEach((id) => {
      const f = formData[id];
      if (f && !getFormErrors(f)) createOrderMutation.mutate({ id, form: f });
    });
    setBulkSelected(new Set());
  };

  // ─── Auto-extract AI when selecting unprocessed email ───
  const [autoExtracting, setAutoExtracting] = useState(false);
  useEffect(() => {
    if (!selected) return;
    if (selected.status !== "DRAFT") return;
    // Already extracted — has confidence or form data
    if (selected.confidence_score && selected.confidence_score > 0) return;
    if (formData[selected.id]?.pickupAddress || formData[selected.id]?.deliveryAddress) return;
    // No email body to parse
    if (!selected.source_email_body) return;
    // Prevent re-trigger
    if (autoExtracting) return;

    const runExtraction = async () => {
      setAutoExtracting(true);
      try {
        const tenantId = tenant?.id || "00000000-0000-0000-0000-000000000001";
        const { data: parseResponse, error: parseError } = await supabase.functions.invoke("parse-order", {
          body: { emailBody: selected.source_email_body, pdfUrls: [], threadContext: null, tenantId },
        });
        if (parseError) throw new Error(parseError.message);
        const parseData = parseResponse;
        const ext = parseData?.extracted || parseData;

        const normalizedConfidence =
          typeof ext.confidence_score === "number" && ext.confidence_score > 0 && ext.confidence_score <= 1
            ? Math.round(ext.confidence_score * 100)
            : ext.confidence_score;

        const parsedForm: FormState = {
          transportType: ext.transport_type || "direct",
          pickupAddress: ext.pickup_address || "",
          deliveryAddress: ext.delivery_address || "",
          quantity: ext.quantity || 0,
          unit: ext.unit || "Pallets",
          weight: ext.weight_kg?.toString() || "",
          dimensions: ext.dimensions || "",
          requirements: normaliseRequirements(ext.requirements || []),
          perUnit: ext.is_weight_per_unit || false,
          internalNote: "",
          fieldSources: ext.field_sources || {},
          fieldConfidence: ext.field_confidence || {},
        };
        const { result: enriched, enrichments } = enrichAddresses(parsedForm);
        setFormData((prev) => ({ ...prev, [selected.id]: enriched as FormState }));

        await supabase
          .from("orders")
          .update({
            confidence_score: normalizedConfidence,
            client_name: ext.client_name || selected.client_name,
            transport_type: ext.transport_type,
            pickup_address: (enriched as FormState).pickupAddress,
            delivery_address: (enriched as FormState).deliveryAddress,
            quantity: ext.quantity,
            unit: ext.unit,
            weight_kg: ext.weight_kg,
            is_weight_per_unit: ext.is_weight_per_unit,
            dimensions: ext.dimensions,
            requirements: ext.requirements,
            missing_fields: parseData.missing_fields || [],
            follow_up_draft: parseData.follow_up_draft || null,
          })
          .eq("id", selected.id);

        await queryClient.invalidateQueries({ queryKey: ["draft-orders"] });
        if (enrichments.length > 0) toast.success("Adresboek verrijking", { description: enrichments.join(". ") });
        toast.success("AI Extractie voltooid", { description: `Confidence: ${normalizedConfidence}%` });
      } catch (e: any) {
        console.error("Auto-extraction error:", e);
        toast.error("AI extractie mislukt", { description: e.message });
      } finally {
        setAutoExtracting(false);
      }
    };

    runExtraction();
  }, [selected?.id]); // Only trigger on selection change

  // ─── Keyboard Navigation ───
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const list = filteredRef.current;
      if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        const idx = list.findIndex((d) => d.id === selectedId);
        if (idx > 0) setSelectedId(list[idx - 1].id);
      } else if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        const idx = list.findIndex((d) => d.id === selectedId);
        if (idx < list.length - 1) setSelectedId(list[idx + 1].id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId]);

  // ─── Return ───
  return {
    // State
    selectedId,
    setSelectedId,
    formData,
    search,
    setSearch,
    sidebarFilter,
    setSidebarFilter,
    filterDate,
    setFilterDate,
    filterClient,
    setFilterClient,
    filterType,
    setFilterType,
    isImporting,
    mobileView,
    setMobileView,
    showTestPanel,
    setShowTestPanel,
    groupByClient,
    setGroupByClient,
    bulkSelected,
    setBulkSelected,
    loadingScenario,
    autoExtracting,
    fileInputRef,

    // Data
    drafts,
    isLoading,
    selected,
    form,
    filtered,
    groupedByClient,
    needsAction,
    readyToGo,
    highConf,
    lowConf,
    noConf,
    duplicateMap,
    mostUrgentId,
    capacityWarning,
    addressSuggestions,
    formHasErrors,
    tenant,

    // Mutations state
    isCreatePending: createOrderMutation.isPending,

    // Handlers
    handleImportEmail,
    handleLoadTestScenario,
    handleCreateOrder,
    handleDelete,
    handleAutoSave,
    handleMerge,
    handleBulkApprove,
    handleBulkApproveChecked,
    handleBulkDelete,
    updateField,
    toggleRequirement,
    toggleBulkSelect,
    selectAllSimilar,
    enrichAddresses,
    setFormData,

    // Mutations (for direct access if needed)
    createOrderMutation,
    deleteMutation,
  };
}
