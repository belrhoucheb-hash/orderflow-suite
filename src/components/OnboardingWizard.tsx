import { useState, useEffect } from "react";
import { Truck, Building2, Users, Package, CheckCircle2, ArrowRight, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { DEFAULT_COMPANY } from "@/lib/companyConfig";

const steps = [
  {
    icon: Sparkles,
    title: `Welkom bij ${DEFAULT_COMPANY.name} TMS`,
    description: "Uw transport management platform is klaar voor gebruik. Laten we uw account instellen.",
    action: null,
  },
  {
    icon: Building2,
    title: "Klanten toevoegen",
    description: "Voeg uw eerste klant toe zodat u orders kunt aanmaken en factureren.",
    action: { label: "Ga naar Klanten", path: "/klanten" },
  },
  {
    icon: Truck,
    title: "Vloot configureren",
    description: "Registreer uw voertuigen met capaciteiten en kenmerken (ADR, koeling, etc).",
    action: { label: "Ga naar Vloot", path: "/vloot" },
  },
  {
    icon: Users,
    title: "Chauffeurs toewijzen",
    description: "Voeg chauffeurs toe en koppel ze aan voertuigen voor planning.",
    action: { label: "Ga naar Chauffeurs", path: "/chauffeurs" },
  },
  {
    icon: Package,
    title: "Eerste order aanmaken",
    description: "Maak uw eerste transportopdracht aan — handmatig of via de AI e-mail inbox.",
    action: { label: "Nieuwe order", path: "/orders/nieuw" },
  },
];

export function OnboardingWizard() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const dismissed = localStorage.getItem("onboarding_dismissed");
    if (!dismissed) setIsOpen(true);
  }, []);

  const dismiss = () => {
    setIsOpen(false);
    localStorage.setItem("onboarding_dismissed", "true");
  };

  if (!isOpen) return null;

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl border border-border/40 w-full max-w-lg mx-4 overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Stap {step + 1} van {steps.length}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={dismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="px-6 py-8 text-center">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
            <current.icon className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">{current.title}</h2>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">{current.description}</p>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex items-center justify-between gap-3">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={cn("h-1.5 rounded-full transition-all", i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/20")}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {current.action && (
              <Button variant="outline" size="sm" onClick={() => { dismiss(); navigate(current.action!.path); }}>
                {current.action.label}
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={dismiss} className="gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Aan de slag
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep(step + 1)} className="gap-1.5">
                Volgende <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
