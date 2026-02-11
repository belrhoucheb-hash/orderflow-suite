import { useParams, Link } from "react-router-dom";
import { ArrowLeft, MapPin, Package, Truck, User, Clock, FileText, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { mockOrders, statusColors, statusLabels, priorityColors } from "@/data/mockData";

const timeline = [
  { time: "08:30", label: "Order ontvangen via e-mail", icon: FileText },
  { time: "08:45", label: "Order verwerkt en gevalideerd", icon: Package },
  { time: "09:00", label: "Voertuig toegewezen", icon: Truck },
  { time: "09:30", label: "Chauffeur gestart met route", icon: MapPin },
];

const OrderDetail = () => {
  const { id } = useParams();
  const order = mockOrders.find((o) => o.id === id);

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Order niet gevonden</p>
        <Link to="/orders"><Button variant="outline">Terug naar orders</Button></Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/orders"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold">{order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">{order.customer}</p>
        </div>
        <Badge variant="outline" className={`text-sm px-3 py-1 ${statusColors[order.status]}`}>{statusLabels[order.status]}</Badge>
        <Badge variant="secondary" className={`text-sm px-3 py-1 ${priorityColors[order.priority]}`}>{order.priority}</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base font-display">Klantgegevens</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <p className="text-muted-foreground">Klant</p>
                <p className="font-medium flex items-center gap-2"><User className="h-3.5 w-3.5" />{order.customer}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">E-mail</p>
                <p className="font-medium">{order.email}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Telefoon</p>
                <p className="font-medium">{order.phone}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base font-display">Adressen</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">Ophaaladres</p>
                <p className="font-medium flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-primary" />{order.pickupAddress}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">Afleveradres</p>
                <p className="font-medium flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-emerald-600" />{order.deliveryAddress}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base font-display">Items</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Item</th>
                    <th className="pb-2 font-medium text-muted-foreground">Aantal</th>
                    <th className="pb-2 font-medium text-muted-foreground">Gewicht</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-2">{item.name}</td>
                      <td className="py-2">{item.quantity}</td>
                      <td className="py-2">{item.weight} kg</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2">Totaal</td>
                    <td className="py-2"></td>
                    <td className="py-2">{order.totalWeight} kg</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          {order.notes && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base font-display flex items-center gap-2"><MessageSquare className="h-4 w-4" />Notities</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">{order.notes}</p></CardContent>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base font-display">Transport</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="space-y-1">
                <p className="text-muted-foreground">Voertuig</p>
                <p className="font-medium flex items-center gap-2"><Truck className="h-3.5 w-3.5" />{order.vehicle || "Niet toegewezen"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Chauffeur</p>
                <p className="font-medium">{order.driver || "Niet toegewezen"}</p>
              </div>
              <Separator />
              <div className="space-y-1">
                <p className="text-muted-foreground">Geschatte levering</p>
                <p className="font-medium flex items-center gap-2"><Clock className="h-3.5 w-3.5" />{new Date(order.estimatedDelivery).toLocaleString("nl-NL")}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base font-display">Tijdlijn</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                {timeline.map((event, i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <div className="flex flex-col items-center">
                      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                        <event.icon className="h-3.5 w-3.5 text-primary" />
                      </div>
                      {i < timeline.length - 1 && <div className="w-px h-full bg-border flex-1 mt-1" />}
                    </div>
                    <div className="pb-4">
                      <p className="font-medium">{event.label}</p>
                      <p className="text-xs text-muted-foreground">{event.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2">
            <Button className="w-full">Status wijzigen</Button>
            <Button variant="outline" className="w-full">Document genereren</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderDetail;
