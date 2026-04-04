import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Mail, Smartphone, Edit2, Eye, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";
import {
  useNotificationTemplates,
  useUpsertNotificationTemplate,
  useToggleNotificationTemplate,
} from "@/hooks/useNotificationTemplates";
import { renderTemplate } from "@/lib/notificationRenderer";
import type { NotificationTemplate, TriggerEvent, NotificationChannel } from "@/types/notifications";
import {
  TRIGGER_EVENT_LABELS,
  TRIGGER_EVENT_RECIPIENTS,
  AVAILABLE_VARIABLES,
} from "@/types/notifications";

function VariableHelper({ onInsert }: { onInsert: (variable: string) => void }) {
  return (
    <div className="border rounded-lg p-3 bg-gray-50/50">
      <p className="text-xs font-medium text-gray-500 mb-2">Beschikbare variabelen (klik om in te voegen):</p>
      <div className="flex flex-wrap gap-1.5">
        {AVAILABLE_VARIABLES.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => onInsert(`{{${v.key}}}`)}
            className="text-xs px-2 py-1 rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors"
            title={`${v.label} — bijv. "${v.example}"`}
          >
            {"{{"}
            {v.key}
            {"}}"}
          </button>
        ))}
      </div>
    </div>
  );
}

function TemplatePreview({ template, channel }: { template: NotificationTemplate; channel: NotificationChannel }) {
  const sampleVars = Object.fromEntries(
    AVAILABLE_VARIABLES.map((v) => [v.key, v.example])
  );
  const body = renderTemplate(template.body_template, sampleVars);
  const subject = template.subject_template ? renderTemplate(template.subject_template, sampleVars) : null;

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-gray-100 px-4 py-2 border-b flex items-center gap-2">
        {channel === "EMAIL" ? <Mail className="h-3.5 w-3.5 text-gray-500" /> : <Smartphone className="h-3.5 w-3.5 text-gray-500" />}
        <span className="text-xs font-medium text-gray-500">Voorbeeld ({channel})</span>
      </div>
      <div className="p-4 bg-white">
        {subject && (
          <p className="text-sm font-semibold text-gray-900 mb-2">
            {subject}
          </p>
        )}
        <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
          {body}
        </pre>
      </div>
    </div>
  );
}

function TemplateEditor({
  template,
  onSave,
  saving,
}: {
  template: NotificationTemplate;
  onSave: (updates: Partial<NotificationTemplate>) => void;
  saving: boolean;
}) {
  const [subject, setSubject] = useState(template.subject_template ?? "");
  const [body, setBody] = useState(template.body_template);
  const [showPreview, setShowPreview] = useState(false);

  const insertVariable = (variable: string) => {
    setBody((prev) => prev + variable);
  };

  const previewTemplate: NotificationTemplate = {
    ...template,
    subject_template: subject,
    body_template: body,
  };

  return (
    <div className="space-y-4">
      {template.channel === "EMAIL" && (
        <div>
          <Label className="text-sm">Onderwerp</Label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="E-mail onderwerp met {{variabelen}}"
            className="mt-1"
          />
        </div>
      )}

      <div>
        <Label className="text-sm">
          {template.channel === "EMAIL" ? "E-mail body" : "SMS bericht"}
        </Label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={template.channel === "EMAIL" ? 10 : 4}
          placeholder="Berichttekst met {{variabelen}}"
          className="mt-1 font-mono text-sm"
        />
        {template.channel === "SMS" && (
          <p className="text-xs text-gray-400 mt-1">
            {body.length}/160 tekens ({Math.ceil(body.length / 160)} SMS)
          </p>
        )}
      </div>

      <VariableHelper onInsert={insertVariable} />

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPreview(!showPreview)}
          className="gap-1.5"
        >
          <Eye className="h-3.5 w-3.5" />
          {showPreview ? "Verberg voorbeeld" : "Toon voorbeeld"}
        </Button>
        <Button
          size="sm"
          onClick={() =>
            onSave({
              subject_template: template.channel === "EMAIL" ? subject : null,
              body_template: body,
            })
          }
          disabled={saving || !body.trim()}
          className="gap-1.5"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Opslaan
        </Button>
      </div>

      {showPreview && (
        <TemplatePreview template={previewTemplate} channel={template.channel as NotificationChannel} />
      )}
    </div>
  );
}

export function NotificationTemplatesSection() {
  const { tenant } = useTenant();
  const { data: templates, isLoading } = useNotificationTemplates();
  const upsertTemplate = useUpsertNotificationTemplate();
  const toggleTemplate = useToggleNotificationTemplate();
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleToggle = async (id: string, currentActive: boolean) => {
    try {
      await toggleTemplate.mutateAsync({ id, is_active: !currentActive });
      toast.success(!currentActive ? "Template geactiveerd" : "Template gedeactiveerd");
    } catch {
      toast.error("Fout bij wijzigen status");
    }
  };

  const handleSave = async (template: NotificationTemplate, updates: Partial<NotificationTemplate>) => {
    try {
      await upsertTemplate.mutateAsync({
        id: template.id,
        tenant_id: template.tenant_id,
        trigger_event: template.trigger_event as TriggerEvent,
        channel: template.channel as NotificationChannel,
        body_template: updates.body_template ?? template.body_template,
        subject_template: updates.subject_template ?? template.subject_template,
        is_active: template.is_active,
      });
      toast.success("Template opgeslagen");
      setEditingId(null);
    } catch {
      toast.error("Fout bij opslaan template");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  // Group templates by trigger event
  const grouped: Record<string, NotificationTemplate[]> = {};
  for (const tpl of templates ?? []) {
    if (!grouped[tpl.trigger_event]) grouped[tpl.trigger_event] = [];
    grouped[tpl.trigger_event].push(tpl);
  }

  const triggerEvents = Object.keys(TRIGGER_EVENT_LABELS) as TriggerEvent[];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Klantnotificaties</h3>
        <p className="text-sm text-gray-500 mt-1">
          Beheer automatische notificaties die naar klanten en ontvangers worden gestuurd bij statuswijzigingen.
        </p>
      </div>

      {triggerEvents.map((event) => {
        const eventTemplates = grouped[event] ?? [];
        return (
          <Card key={event}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{TRIGGER_EVENT_LABELS[event]}</CardTitle>
                  <CardDescription>
                    Ontvanger: {TRIGGER_EVENT_RECIPIENTS[event]}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {eventTemplates.length === 0 ? (
                <p className="text-sm text-gray-400">Geen templates geconfigureerd voor dit event.</p>
              ) : (
                eventTemplates.map((tpl) => (
                  <div key={tpl.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {tpl.channel === "EMAIL" ? (
                          <Mail className="h-4 w-4 text-blue-500" />
                        ) : (
                          <Smartphone className="h-4 w-4 text-green-500" />
                        )}
                        <span className="text-sm font-medium">{tpl.channel}</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            tpl.is_active
                              ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                              : "border-gray-200 text-gray-500 bg-gray-50"
                          )}
                        >
                          {tpl.is_active ? "Actief" : "Inactief"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={tpl.is_active}
                          onCheckedChange={() => handleToggle(tpl.id, tpl.is_active)}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingId(editingId === tpl.id ? null : tpl.id)}
                          className="gap-1"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          Bewerken
                        </Button>
                      </div>
                    </div>

                    {editingId === tpl.id ? (
                      <TemplateEditor
                        template={tpl}
                        onSave={(updates) => handleSave(tpl, updates)}
                        saving={upsertTemplate.isPending}
                      />
                    ) : (
                      <pre className="text-xs text-gray-500 whitespace-pre-wrap line-clamp-3 font-sans">
                        {tpl.body_template}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
