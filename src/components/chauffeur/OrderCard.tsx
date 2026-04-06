import {
  Truck,
  MapPin,
  Package,
  Check,
  Image,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface OrderCardProps {
  order: any;
  index: number;
  onClick: () => void;
}

export function OrderCard({ order, index, onClick }: OrderCardProps) {
  const isDelivered = order.status === "DELIVERED";

  return (
    <Card
      onClick={onClick}
      className={`rounded-2xl border-none shadow-sm transition-all active:scale-[0.98] ${
        isDelivered
          ? "bg-emerald-50/80 ring-1 ring-emerald-200"
          : "bg-white ring-1 ring-slate-200"
      }`}
    >
      <CardContent className="p-0">
        <div className="p-5 flex gap-4">
          <div className="flex flex-col items-center gap-2">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm shadow-sm ${
                isDelivered
                  ? "bg-emerald-500 text-white"
                  : "bg-primary text-white"
              }`}
            >
              {isDelivered ? <Check className="h-4 w-4" /> : index + 1}
            </div>
          </div>

          <div className="flex-1 pb-1">
            <div className="flex justify-between items-start mb-1">
              <h3
                className={`font-semibold ${
                  isDelivered ? "text-emerald-700" : "text-slate-900"
                }`}
              >
                {order.client_name || `Order #${order.order_number}`}
              </h3>
              {isDelivered && order.pod_signature_url && (
                <Badge className="bg-emerald-100 text-emerald-700 text-xs border-0">
                  PoD &#10003;
                </Badge>
              )}
            </div>
            <div className="flex items-start gap-2 text-slate-500 text-sm mt-1">
              <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" />
              <span className="line-clamp-2 leading-relaxed">
                {order.delivery_address}
              </span>
            </div>

            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100/80">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Package className="h-3.5 w-3.5" />
                {order.quantity} {order.unit || "Colli"}
              </div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Truck className="h-3.5 w-3.5" />
                {order.weight_kg} kg
              </div>
              {isDelivered && (
                <div className="flex items-center gap-1 text-xs text-emerald-600 ml-auto">
                  <Image className="h-3 w-3" />
                  Bekijk PoD
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
