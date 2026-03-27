import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";
import defaultLogo from "@/assets/logo.png";

const Login = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(false);

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register state
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regName, setRegName] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    setLoading(false);

    if (error) {
      toast({ title: "Inloggen mislukt", description: error.message, variant: "destructive" });
    } else {
      navigate("/");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: regEmail,
      password: regPassword,
      options: {
        emailRedirectTo: window.location.origin,
        data: { display_name: regName },
      },
    });
    setLoading(false);

    if (error) {
      toast({ title: "Registratie mislukt", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "Verificatie verstuurd",
        description: "Controleer je inbox voor een bevestigingslink.",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-foreground via-foreground/95 to-foreground/90 px-4">
      <Card className="w-full max-w-md border-border/20 shadow-2xl bg-card">
        <CardHeader className="text-center pb-2 pt-8">
          <img 
            src={tenant?.logoUrl || defaultLogo} 
            alt={tenant?.name || "Royalty Cargo Solutions"} 
            className="h-20 mx-auto mb-4 object-contain" 
          />
          <h1 className="font-display text-xl font-bold text-foreground">
            {tenant?.name || "Royalty Cargo Solutions"}
          </h1>
          <p className="text-sm text-muted-foreground">Transportmanagementsysteem</p>
        </CardHeader>
        <CardContent className="pt-4 pb-8">
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="login">Inloggen</TabsTrigger>
              <TabsTrigger value="register">Registreren</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">E-mailadres</Label>
                  <Input id="login-email" type="email" placeholder="naam@royaltycargo.nl" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Wachtwoord</Label>
                  <Input id="login-password" type="password" placeholder="••••••••" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full font-semibold" disabled={loading}>
                  {loading ? "Bezig..." : "Inloggen"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-name">Naam</Label>
                  <Input id="reg-name" type="text" placeholder="Jan Jansen" value={regName} onChange={(e) => setRegName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-email">E-mailadres</Label>
                  <Input id="reg-email" type="email" placeholder="naam@royaltycargo.nl" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password">Wachtwoord</Label>
                  <Input id="reg-password" type="password" placeholder="Min. 6 tekens" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} required minLength={6} />
                </div>
                <Button type="submit" className="w-full font-semibold" disabled={loading}>
                  {loading ? "Bezig..." : "Account aanmaken"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Na registratie ontvang je een verificatiemail.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
