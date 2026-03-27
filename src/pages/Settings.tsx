import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { 
  Settings as SettingsIcon, 
  Database, 
  Users, 
  Palette, 
  Bell, 
  ShieldCheck,
  ChevronRight
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MasterDataSection } from "@/components/settings/MasterDataSection";

const Settings = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Determine active tab based on URL
  const getActiveTab = () => {
    if (location.pathname.includes("/stamgegevens")) return "stamgegevens";
    if (location.pathname.includes("/gebruikers")) return "gebruikers";
    if (location.pathname.includes("/branding")) return "branding";
    return "algemeen";
  };

  const handleTabChange = (value: string) => {
    if (value === "algemeen") navigate("/settings");
    else navigate(`/settings/${value}`);
  };

  return (
    <div className="flex flex-col gap-6 h-full pb-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-display font-bold tracking-tight text-foreground flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <SettingsIcon className="h-5 w-5 text-primary" />
          </div>
          Instellingen
        </h1>
        <p className="text-sm text-muted-foreground ml-13">
          Beheer uw TMS platform configuratie en stamgegevens.
        </p>
      </div>

      <Tabs 
        defaultValue={getActiveTab()} 
        onValueChange={handleTabChange}
        className="space-y-6"
      >
        <div className="border-b border-border/40 pb-px">
          <TabsList className="bg-transparent h-12 w-full justify-start gap-8 p-0">
            <TabsTrigger 
              value="algemeen" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground rounded-none px-1 h-full text-sm font-medium transition-all"
            >
              Algemeen
            </TabsTrigger>
            <TabsTrigger 
              value="stamgegevens" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground rounded-none px-1 h-full text-sm font-medium transition-all"
            >
              Stamgegevens
            </TabsTrigger>
            <TabsTrigger 
              value="branding" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground rounded-none px-1 h-full text-sm font-medium transition-all"
            >
              Branding
            </TabsTrigger>
            <TabsTrigger 
              value="notificaties" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground text-muted-foreground rounded-none px-1 h-full text-sm font-medium transition-all"
            >
              Notificaties
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="algemeen" className="space-y-6 outline-none">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="rounded-2xl border-border/40 hover:shadow-md transition-all cursor-pointer group" onClick={() => handleTabChange("stamgegevens")}>
              <CardHeader className="pb-3">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <Database className="h-5 w-5 text-amber-600" />
                </div>
                <CardTitle className="text-base font-semibold">Stamgegevens</CardTitle>
                <CardDescription className="text-[11px] leading-relaxed">
                  Beheer voertuigtypes, eenheden en transportvereisten.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 flex items-center justify-end">
                <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/40 hover:shadow-md transition-all cursor-pointer group" onClick={() => navigate("/users")}>
              <CardHeader className="pb-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <CardTitle className="text-base font-semibold">Gebruikersbeheer</CardTitle>
                <CardDescription className="text-[11px] leading-relaxed">
                  Beheer medewerkers en toegangsrechten.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 flex items-center justify-end">
                <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/40 hover:shadow-md transition-all cursor-pointer group" onClick={() => handleTabChange("branding")}>
              <CardHeader className="pb-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <Palette className="h-5 w-5 text-emerald-600" />
                </div>
                <CardTitle className="text-base font-semibold">Branding & Kleuren</CardTitle>
                <CardDescription className="text-[11px] leading-relaxed">
                  Pas het thema, logo en kleuren van uw platform aan.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 flex items-center justify-end">
                <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="stamgegevens" className="outline-none">
          <MasterDataSection />
        </TabsContent>

        <TabsContent value="branding" className="outline-none">
           <Card className="rounded-2xl border-border/40">
             <CardHeader>
               <CardTitle>Branding</CardTitle>
               <CardDescription>Configureer uw bedrijfsidentiteit.</CardDescription>
             </CardHeader>
             <CardContent className="py-12 text-center text-muted-foreground">
               <Palette className="h-12 w-12 mx-auto mb-4 opacity-10" />
               <p className="text-sm">Branding instellingen komen binnenkort beschikbaar.</p>
             </CardContent>
           </Card>
        </TabsContent>

        <TabsContent value="notificaties" className="outline-none">
           <Card className="rounded-2xl border-border/40">
             <CardHeader>
               <CardTitle>Notificaties</CardTitle>
               <CardDescription>Beheer hoe en wanneer u meldingen ontvangt.</CardDescription>
             </CardHeader>
             <CardContent className="py-12 text-center text-muted-foreground">
               <Bell className="h-12 w-12 mx-auto mb-4 opacity-10" />
               <p className="text-sm">Notificatievoorkeuren komen binnenkort beschikbaar.</p>
             </CardContent>
           </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
