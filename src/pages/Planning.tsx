import { Truck, Package, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { mockVehicles, mockOrders, vehicleStatusColors, statusLabels, statusColors } from "@/data/mockData";

const Planning = () => {
  const unassigned = mockOrders.filter((o) => !o.vehicle && o.status !== "afgeleverd" && o.status !== "geannuleerd");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Truck className="h-6 w-6 text-primary" />Transportplanning
        </h1>
        <p className="text-sm text-muted-foreground">Wijs orders toe aan voertuigen en plan routes</p>
      </div>

      {unassigned.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-display flex items-center gap-2 text-primary">
              <AlertCircle className="h-4 w-4" />{unassigned.length} orders nog niet toegewezen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {unassigned.map((o) => (
                <Badge key={o.id} variant="outline" className="text-xs cursor-pointer hover:bg-primary/10">
                  {o.orderNumber} — {o.customer} ({o.totalWeight} kg)
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {mockVehicles.map((vehicle) => {
          const assignedOrders = mockOrders.filter((o) => o.vehicle === vehicle.name);
          const loadPercentage = (vehicle.currentLoad / vehicle.capacity) * 100;

          return (
            <Card key={vehicle.id} className="border-border/60">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-display flex items-center gap-2">
                    <Truck className="h-4 w-4" />{vehicle.name}
                  </CardTitle>
                  <Badge className={`text-[11px] ${vehicleStatusColors[vehicle.status]}`} variant="secondary">{vehicle.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{vehicle.plate} · {vehicle.type} · {vehicle.driver}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Belading</span>
                    <span className="font-medium">{vehicle.currentLoad} / {vehicle.capacity} kg</span>
                  </div>
                  <Progress value={loadPercentage} className="h-2" />
                </div>

                {assignedOrders.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Toegewezen orders</p>
                    {assignedOrders.map((o) => (
                      <div key={o.id} className="flex items-center justify-between p-2 rounded bg-muted/30 text-xs">
                        <div className="flex items-center gap-2">
                          <Package className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium">{o.orderNumber}</span>
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${statusColors[o.status]}`}>{statusLabels[o.status]}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Geen orders toegewezen</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default Planning;
