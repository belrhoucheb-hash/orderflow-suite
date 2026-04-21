import { useState, useMemo } from "react";
import { Plus, Users, Filter, Mail, Phone, MoreHorizontal, Edit2, Trash2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/SearchInput";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QueryError } from "@/components/QueryError";
import { useDrivers, type Driver } from "@/hooks/useDrivers";
import { useDriverCertifications } from "@/hooks/useDriverCertifications";
import { NewDriverDialog } from "@/components/drivers/NewDriverDialog";
import { DriverCertificationsSection } from "@/components/drivers/DriverCertificationsSection";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  beschikbaar: { label: "Beschikbaar", className: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
  onderweg: { label: "Onderweg", className: "bg-blue-500/10 text-blue-700 border-blue-200" },
  rust: { label: "Rust", className: "bg-amber-500/10 text-amber-700 border-amber-200" },
  ziek: { label: "Ziek", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

export default function Chauffeurs() {
  const { data: drivers = [], isLoading, isError, refetch, deleteDriver } = useDrivers();
  const { data: certifications = [] } = useDriverCertifications();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [certFilter, setCertFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("chauffeurs");
  const [showDialog, setShowDialog] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | undefined>(undefined);

  const activeCertifications = useMemo(
    () => certifications.filter((c) => c.is_active),
    [certifications],
  );

  const certLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of certifications) map[c.code] = c.name;
    return map;
  }, [certifications]);

  const filtered = useMemo(() => {
    return drivers.filter((d) => {
      const matchesSearch = 
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        (d.email?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
        (d.license_number?.toLowerCase().includes(search.toLowerCase()) ?? false);
      
      const matchesStatus = statusFilter === "all" || d.status === statusFilter;
      const matchesCert = certFilter === "all" || d.certifications.includes(certFilter);

      return matchesSearch && matchesStatus && matchesCert;
    });
  }, [drivers, search, statusFilter, certFilter]);

  const stats = useMemo(() => {
    return {
      totaal: drivers.length,
      beschikbaar: drivers.filter((d) => d.status === "beschikbaar").length,
      onderweg: drivers.filter((d) => d.status === "onderweg").length,
    };
  }, [drivers]);

  const handleAdd = () => {
    setSelectedDriver(undefined);
    setShowDialog(true);
  };

  const handleEdit = (driver: Driver) => {
    setSelectedDriver(driver);
    setShowDialog(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Weet je zeker dat je deze chauffeur wilt verwijderen?")) {
      await deleteDriver.mutateAsync(id);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background/50">
      <div className="flex items-center justify-between px-4 md:px-6 py-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight font-display">Chauffeurs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {stats.totaal} chauffeurs, {stats.beschikbaar} beschikbaar
          </p>
        </div>
        {activeTab === "chauffeurs" ? (
          <Button
            onClick={handleAdd}
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 rounded-xl shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Chauffeur Toevoegen
          </Button>
        ) : null}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="px-4 md:px-6">
          <TabsList>
            <TabsTrigger value="chauffeurs">Chauffeurs</TabsTrigger>
            <TabsTrigger value="certificeringen">Certificeringen</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="chauffeurs" className="flex-1 flex flex-col min-h-0 mt-4">

      {/* KPI Section */}
      <div className="px-4 md:px-6 pb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Totaal Chauffeurs", value: stats.totaal, icon: Users, color: "text-blue-600", bg: "bg-blue-500/8" },
          { label: "Beschikbaar", value: stats.beschikbaar, icon: Badge, color: "text-emerald-600", bg: "bg-emerald-500/8" },
          { label: "Momenteel Onderweg", value: stats.onderweg, icon: MoreHorizontal, color: "text-blue-500", bg: "bg-blue-500/8" },
        ].map((stat) => (
          <Card key={stat.label} className="border-border/40 shadow-none bg-card/50 backdrop-blur-sm">
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${stat.bg}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold font-display tracking-tight tabular-nums">{stat.value}</p>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="px-4 md:px-6 pb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Zoek op naam, email of rijbewijs..."
          className="max-w-sm flex-1"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-10 rounded-xl border-border/50 bg-card/30">
            <Filter className="h-3.5 w-3.5 mr-2 text-muted-foreground/50" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-border/50">
            <SelectItem value="all">Alle statussen</SelectItem>
            <SelectItem value="beschikbaar">Beschikbaar</SelectItem>
            <SelectItem value="onderweg">Onderweg</SelectItem>
            <SelectItem value="rust">Rust</SelectItem>
            <SelectItem value="ziek">Ziek</SelectItem>
          </SelectContent>
        </Select>
        <Select value={certFilter} onValueChange={setCertFilter}>
          <SelectTrigger className="w-[180px] h-10 rounded-xl border-border/50 bg-card/30">
            <SelectValue placeholder="Certificering" />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-border/50">
            <SelectItem value="all">Alle cert.</SelectItem>
            {activeCertifications.map((c) => (
              <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Drivers List */}
      <div className="px-4 md:px-6 pb-8 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
             <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
             <p className="text-sm text-muted-foreground italic">Gegevens ophalen...</p>
          </div>
        ) : isError ? (
          <QueryError message="Kan chauffeurs niet laden. Probeer het opnieuw." onRetry={() => refetch()} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-card/30 rounded-3xl border border-dashed border-border/60">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/20 mb-4" />
            <p className="text-muted-foreground font-medium">Geen chauffeurs gevonden die voldoen aan de filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((d) => {
              const statusCfg = STATUS_CONFIG[d.status] || STATUS_CONFIG.beschikbaar;
              return (
                <Card key={d.id} className="group hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 border-border/40 overflow-hidden bg-card/50">
                  <CardContent className="p-0">
                    <div className="p-5 space-y-4">
                      {/* Top Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                            {d.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div>
                            <h3 className="font-semibold text-foreground line-clamp-1">{d.name}</h3>
                            <Badge variant="outline" className={`mt-1 h-5 text-xs px-1.5 font-bold uppercase tracking-wider border-none ${statusCfg.className}`}>
                              {statusCfg.label}
                            </Badge>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-primary/5 transition-colors">
                              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl border-border/50">
                            <DropdownMenuItem 
                              className="gap-2 focus:bg-primary/5 cursor-pointer"
                              onClick={() => handleEdit(d)}
                            >
                              <Edit2 className="h-3.5 w-3.5" /> Bewerken
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="gap-2 text-destructive focus:bg-destructive/5 focus:text-destructive cursor-pointer"
                              onClick={() => handleDelete(d.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Verwijderen
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* Contact Info */}
                      <div className="space-y-2">
                        {d.email && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground group/link cursor-pointer hover:text-primary transition-colors">
                            <Mail className="h-3.5 w-3.5" />
                            <span className="truncate">{d.email}</span>
                          </div>
                        )}
                        {d.phone && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground group/link cursor-pointer hover:text-primary transition-colors">
                            <Phone className="h-3.5 w-3.5" />
                            <span>{d.phone}</span>
                          </div>
                        )}
                        {d.license_number && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Smartphone className="h-3.5 w-3.5" />
                            <span className="font-mono">{d.license_number}</span>
                          </div>
                        )}
                      </div>

                      {/* Certifications */}
                      <div className="flex flex-wrap gap-1.5 min-h-[1.5rem]">
                        {d.certifications.length > 0 ? (
                          d.certifications.map((cert) => (
                            <Badge key={cert} variant="secondary" className="text-xs px-2 py-0 bg-primary/5 text-primary border-none font-medium">
                              {certLabels[cert] ?? cert}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Geen certificeringen</span>
                        )}
                      </div>
                    </div>

                    {/* Footer / Assigned Vehicle */}
                    <div className="px-5 py-3 bg-muted/20 border-t border-border/20 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground font-medium uppercase tracking-widest">Voertuig</span>
                      <span className="font-semibold text-foreground">
                        {d.current_vehicle_id ? "Gekoppeld" : "Geen koppeling"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

        </TabsContent>

        <TabsContent value="certificeringen" className="flex-1 overflow-auto mt-4 px-4 md:px-6 pb-8">
          <DriverCertificationsSection />
        </TabsContent>
      </Tabs>

      <NewDriverDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        driver={selectedDriver}
      />
    </div>
  );
}
