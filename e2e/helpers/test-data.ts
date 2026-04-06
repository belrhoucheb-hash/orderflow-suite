/** Realistic Dutch transport test data */

export const TEST_CLIENT = {
  name: "Van den Berg Logistics B.V.",
  kvk: "12345678",
  email: "info@vandenberglogistics.nl",
  phone: "+31 20 123 4567",
  address: "Keizersgracht 100, 1015 AA Amsterdam",
} as const;

export const TEST_ORDER = {
  reference: "TEST-ORD-001",
  pickup: {
    company: "Heineken Nederland B.V.",
    address: "Stadhouderskade 78",
    postcode: "1072 AE",
    city: "Amsterdam",
    country: "Nederland",
    date: "2026-04-10",
    timeFrom: "08:00",
    timeTo: "12:00",
  },
  delivery: {
    company: "Jumbo Distributiecentrum",
    address: "Industrieweg 15",
    postcode: "3044 AS",
    city: "Rotterdam",
    country: "Nederland",
    date: "2026-04-10",
    timeFrom: "14:00",
    timeTo: "18:00",
  },
  goods: {
    description: "Pallets dranken",
    quantity: 12,
    weight: 8400,
    loadingMeters: 4.8,
  },
} as const;

export const TEST_INVOICE = {
  number: "FAC-2026-0001",
  client: "Van den Berg Logistics B.V.",
  amount: 1250.0,
  btw: 21,
} as const;

export const TEST_VEHICLE = {
  plate: "AB-123-CD",
  type: "Trekker + oplegger",
  brand: "DAF XF",
} as const;
