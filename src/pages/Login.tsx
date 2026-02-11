import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import logo from "@/assets/logo.png";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    navigate("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-foreground via-foreground/95 to-foreground/90 px-4">
      <Card className="w-full max-w-md border-border/20 shadow-2xl bg-card">
        <CardHeader className="text-center pb-2 pt-8">
          <img src={logo} alt="Royalty Cargo Solutions" className="h-20 mx-auto mb-4 object-contain" />
          <h1 className="font-display text-xl font-bold text-foreground">Welkom terug</h1>
          <p className="text-sm text-muted-foreground">Log in op het transportmanagementsysteem</p>
        </CardHeader>
        <CardContent className="pt-4 pb-8">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mailadres</Label>
              <Input id="email" type="email" placeholder="naam@royaltycargo.nl" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Wachtwoord</Label>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full font-semibold">Inloggen</Button>
            <p className="text-center text-xs text-muted-foreground">Wachtwoord vergeten? Neem contact op met de beheerder.</p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
