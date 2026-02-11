import { useState } from "react";
import { Package, Search, Plus, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mockOrders, statusColors, statusLabels, priorityColors } from "@/data/mockData";
import { Link } from "react-router-dom";

const Orders = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");

  const filtered = mockOrders.filter((o) => {
    const matchesSearch = o.orderNumber.toLowerCase().includes(search.toLowerCase()) || o.customer.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "alle" || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />Orders
          </h1>
          <p className="text-sm text-muted-foreground">{mockOrders.length} orders in totaal</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Nieuwe order
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Zoek op ordernummer of klant..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {["alle", "nieuw", "in_behandeling", "onderweg", "afgeleverd"].map((s) => (
            <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)} className="text-xs capitalize">
              {s === "alle" ? "Alle" : statusLabels[s as keyof typeof statusLabels]}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left">
                  <th className="p-3 font-medium text-muted-foreground">Order</th>
                  <th className="p-3 font-medium text-muted-foreground">Klant</th>
                  <th className="p-3 font-medium text-muted-foreground hidden lg:table-cell">Ophaaladres</th>
                  <th className="p-3 font-medium text-muted-foreground hidden md:table-cell">Afleveradres</th>
                  <th className="p-3 font-medium text-muted-foreground">Gewicht</th>
                  <th className="p-3 font-medium text-muted-foreground">Status</th>
                  <th className="p-3 font-medium text-muted-foreground hidden sm:table-cell">Prioriteit</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr key={order.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="p-3">
                      <Link to={`/orders/${order.id}`} className="font-medium text-foreground hover:text-primary">{order.orderNumber}</Link>
                    </td>
                    <td className="p-3 text-muted-foreground">{order.customer}</td>
                    <td className="p-3 text-muted-foreground hidden lg:table-cell truncate max-w-[180px]">{order.pickupAddress}</td>
                    <td className="p-3 text-muted-foreground hidden md:table-cell truncate max-w-[180px]">{order.deliveryAddress}</td>
                    <td className="p-3 text-muted-foreground">{order.totalWeight} kg</td>
                    <td className="p-3">
                      <Badge variant="outline" className={`text-[11px] ${statusColors[order.status]}`}>{statusLabels[order.status]}</Badge>
                    </td>
                    <td className="p-3 hidden sm:table-cell">
                      <Badge variant="secondary" className={`text-[11px] ${priorityColors[order.priority]}`}>{order.priority}</Badge>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Geen orders gevonden</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Orders;
