export interface Order {
  id: string;
  orderNumber: string;
  customer: string;
  email: string;
  phone: string;
  pickupAddress: string;
  deliveryAddress: string;
  status: "nieuw" | "in_behandeling" | "onderweg" | "afgeleverd" | "geannuleerd";
  priority: "laag" | "normaal" | "hoog" | "spoed";
  items: { name: string; quantity: number; weight: number }[];
  totalWeight: number;
  vehicle?: string;
  driver?: string;
  createdAt: string;
  estimatedDelivery: string;
  notes: string;
}

export interface Vehicle {
  id: string;
  name: string;
  plate: string;
  type: string;
  capacity: number;
  currentLoad: number;
  status: "beschikbaar" | "onderweg" | "onderhoud";
  driver: string;
}

export const mockOrders: Order[] = [
  {
    id: "1",
    orderNumber: "RCS-2026-0001",
    customer: "Van den Berg Logistics",
    email: "info@vdberg.nl",
    phone: "+31 6 12345678",
    pickupAddress: "Havenstraat 45, Rotterdam",
    deliveryAddress: "Industrieweg 12, Utrecht",
    status: "onderweg",
    priority: "hoog",
    items: [
      { name: "Pallets elektronica", quantity: 4, weight: 320 },
      { name: "Dozen accessoires", quantity: 12, weight: 80 },
    ],
    totalWeight: 400,
    vehicle: "Truck A1",
    driver: "Jan de Vries",
    createdAt: "2026-02-10T08:30:00",
    estimatedDelivery: "2026-02-11T14:00:00",
    notes: "Fragiel — voorzichtig behandelen",
  },
  {
    id: "2",
    orderNumber: "RCS-2026-0002",
    customer: "Bakker & Zonen BV",
    email: "orders@bakker.nl",
    phone: "+31 6 98765432",
    pickupAddress: "Keizersgracht 100, Amsterdam",
    deliveryAddress: "Markt 5, Eindhoven",
    status: "nieuw",
    priority: "normaal",
    items: [{ name: "Meubels", quantity: 8, weight: 600 }],
    totalWeight: 600,
    createdAt: "2026-02-11T06:15:00",
    estimatedDelivery: "2026-02-12T16:00:00",
    notes: "",
  },
  {
    id: "3",
    orderNumber: "RCS-2026-0003",
    customer: "TechWorld NL",
    email: "shipping@techworld.nl",
    phone: "+31 6 55544433",
    pickupAddress: "Schiphol Cargo, Haarlemmermeer",
    deliveryAddress: "Brainpark III, Rotterdam",
    status: "in_behandeling",
    priority: "spoed",
    items: [
      { name: "Servers", quantity: 2, weight: 150 },
      { name: "Netwerkapparatuur", quantity: 6, weight: 50 },
    ],
    totalWeight: 200,
    vehicle: "Bestelbus B3",
    driver: "Pieter Smit",
    createdAt: "2026-02-11T07:00:00",
    estimatedDelivery: "2026-02-11T12:00:00",
    notes: "Temperatuurgevoelig, max 25°C",
  },
  {
    id: "4",
    orderNumber: "RCS-2026-0004",
    customer: "Bloemen Direct",
    email: "verzending@bloemendirect.nl",
    phone: "+31 6 11122233",
    pickupAddress: "Aalsmeer Bloemenveiling",
    deliveryAddress: "Grote Markt 1, Groningen",
    status: "afgeleverd",
    priority: "hoog",
    items: [{ name: "Bloemen (gekoeld)", quantity: 20, weight: 300 }],
    totalWeight: 300,
    vehicle: "Koelwagen C2",
    driver: "Maria Jansen",
    createdAt: "2026-02-09T05:00:00",
    estimatedDelivery: "2026-02-09T18:00:00",
    notes: "Koeltransport vereist",
  },
  {
    id: "5",
    orderNumber: "RCS-2026-0005",
    customer: "Bouwmarkt XL",
    email: "logistiek@bouwmarktxl.nl",
    phone: "+31 6 77788899",
    pickupAddress: "Havengebied 200, Rotterdam",
    deliveryAddress: "Bedrijvenpark 44, Tilburg",
    status: "nieuw",
    priority: "laag",
    items: [
      { name: "Bouwmaterialen", quantity: 30, weight: 2000 },
      { name: "Gereedschap", quantity: 5, weight: 100 },
    ],
    totalWeight: 2100,
    createdAt: "2026-02-11T09:45:00",
    estimatedDelivery: "2026-02-13T10:00:00",
    notes: "Zware lading, kraan op locatie beschikbaar",
  },
  {
    id: "6",
    orderNumber: "RCS-2026-0006",
    customer: "FreshFood BV",
    email: "transport@freshfood.nl",
    phone: "+31 6 44455566",
    pickupAddress: "Distributiecentrum 8, Venlo",
    deliveryAddress: "Supermarkt Plaza 15, Den Haag",
    status: "onderweg",
    priority: "spoed",
    items: [{ name: "Verse producten (gekoeld)", quantity: 50, weight: 800 }],
    totalWeight: 800,
    vehicle: "Koelwagen C1",
    driver: "Ahmed El Amrani",
    createdAt: "2026-02-11T04:00:00",
    estimatedDelivery: "2026-02-11T11:00:00",
    notes: "Koelketen niet onderbreken!",
  },
];

export const mockVehicles: Vehicle[] = [
  { id: "v1", name: "Truck A1", plate: "AB-123-CD", type: "Vrachtwagen", capacity: 5000, currentLoad: 400, status: "onderweg", driver: "Jan de Vries" },
  { id: "v2", name: "Truck A2", plate: "EF-456-GH", type: "Vrachtwagen", capacity: 5000, currentLoad: 0, status: "beschikbaar", driver: "Kees Bakker" },
  { id: "v3", name: "Bestelbus B3", plate: "IJ-789-KL", type: "Bestelbus", capacity: 1500, currentLoad: 200, status: "onderweg", driver: "Pieter Smit" },
  { id: "v4", name: "Koelwagen C1", plate: "MN-012-OP", type: "Koelwagen", capacity: 3000, currentLoad: 800, status: "onderweg", driver: "Ahmed El Amrani" },
  { id: "v5", name: "Koelwagen C2", plate: "QR-345-ST", type: "Koelwagen", capacity: 3000, currentLoad: 0, status: "beschikbaar", driver: "Maria Jansen" },
  { id: "v6", name: "Bestelbus B4", plate: "UV-678-WX", type: "Bestelbus", capacity: 1500, currentLoad: 0, status: "onderhoud", driver: "Tom Visser" },
];

export const statusColors: Record<Order["status"], string> = {
  nieuw: "bg-blue-500/10 text-blue-700 border-blue-200",
  in_behandeling: "bg-amber-500/10 text-amber-700 border-amber-200",
  onderweg: "bg-primary/10 text-primary border-primary/20",
  afgeleverd: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  geannuleerd: "bg-muted text-muted-foreground border-border",
};

export const priorityColors: Record<Order["priority"], string> = {
  laag: "bg-muted text-muted-foreground",
  normaal: "bg-blue-500/10 text-blue-700",
  hoog: "bg-amber-500/10 text-amber-700",
  spoed: "bg-primary/10 text-primary font-semibold",
};

export const statusLabels: Record<Order["status"], string> = {
  nieuw: "Nieuw",
  in_behandeling: "In behandeling",
  onderweg: "Onderweg",
  afgeleverd: "Afgeleverd",
  geannuleerd: "Geannuleerd",
};

export const vehicleStatusColors: Record<Vehicle["status"], string> = {
  beschikbaar: "bg-emerald-500/10 text-emerald-700",
  onderweg: "bg-primary/10 text-primary",
  onderhoud: "bg-amber-500/10 text-amber-700",
};
