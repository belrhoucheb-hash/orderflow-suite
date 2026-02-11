import { Package, Truck, MapPin, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockOrders, statusColors, statusLabels, priorityColors } from "@/data/mockData";
import { Link } from "react-router-dom";

const stats = [
  { label: "Totaal orders", value: mockOrders.length, icon: Package, color: "text-foreground" },
  { label: "Onderweg", value: mockOrders.filter((o) => o.status === "onderweg").length, icon: Truck, color: "text-primary" },
  { label: "Nieuw", value: mockOrders.filter((o) => o.status === "nieuw").length, icon: Clock, color: "text-blue-600" },
  { label: "Afgeleverd", value: mockOrders.filter((o) => o.status === "afgeleverd").length, icon: CheckCircle2, color: "text-emerald-600" },
  { label: "Spoed", value: mockOrders.filter((o) => o.priority === "spoed").length, icon: AlertTriangle, color: "text-primary" },
];

const Dashboard = () => {
  const recentOrders = [...mockOrders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overzicht van alle orders en transporten</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <p className="text-2xl font-bold font-display">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="font-display text-lg">Recente orders</CardTitle>
            <Link to="/orders" className="text-sm text-primary hover:underline">Bekijk alles →</Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Order</th>
                  <th className="pb-2 font-medium text-muted-foreground">Klant</th>
                  <th className="pb-2 font-medium text-muted-foreground hidden md:table-cell">Bezorging</th>
                  <th className="pb-2 font-medium text-muted-foreground">Status</th>
                  <th className="pb-2 font-medium text-muted-foreground hidden sm:table-cell">Prioriteit</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors">
                    <td className="py-3">
                      <Link to={`/orders/${order.id}`} className="font-medium text-foreground hover:text-primary">{order.orderNumber}</Link>
                    </td>
                    <td className="py-3 text-muted-foreground">{order.customer}</td>
                    <td className="py-3 text-muted-foreground hidden md:table-cell">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate max-w-[200px]">{order.deliveryAddress}</span>
                      </div>
                    </td>
                    <td className="py-3">
                      <Badge variant="outline" className={`text-[11px] ${statusColors[order.status]}`}>{statusLabels[order.status]}</Badge>
                    </td>
                    <td className="py-3 hidden sm:table-cell">
                      <Badge variant="secondary" className={`text-[11px] ${priorityColors[order.priority]}`}>{order.priority}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
