import { describe, expect, it } from "vitest";
import { getOrderRouteRuleIssues, type OrderRouteLine } from "@/lib/validation/orderRouteRules";

const validRoute: OrderRouteLine[] = [
  {
    id: "pickup",
    activiteit: "Laden",
    locatie: "Willy Sluiterstraat 9, Hendrik-Ido-Ambacht",
    datum: "2026-04-23",
    tijd: "06:00",
    tijdTot: "11:15",
  },
  {
    id: "delivery",
    activiteit: "Lossen",
    locatie: "Timorplein 21, Amsterdam",
    datum: "2026-04-23",
    tijd: "12:00",
    tijdTot: "13:00",
  },
];

describe("getOrderRouteRuleIssues", () => {
  it("accepteert een logische single-leg route", () => {
    expect(getOrderRouteRuleIssues(validRoute)).toEqual([]);
  });

  it("blokkeert levering voor het laadmoment", () => {
    const issues = getOrderRouteRuleIssues([
      { ...validRoute[0], tijd: "10:00", tijdTot: "11:00" },
      { ...validRoute[1], tijd: "09:00", tijdTot: "09:30" },
    ]);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "delivery_time_window",
          message: "Levermoment kan niet eerder zijn dan Laadmoment.",
        }),
      ]),
    );
  });

  it("blokkeert een tijdvenster waarvan eindtijd niet later dan starttijd is", () => {
    const issues = getOrderRouteRuleIssues([
      { ...validRoute[0], tijd: "14:00", tijdTot: "14:00" },
      validRoute[1],
    ]);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "pickup_time_window",
          message: "Laadtijd 'tot' moet later zijn dan laadtijd 'van'.",
        }),
      ]),
    );
  });

  it("controleert multi-leg stops in volgorde", () => {
    const issues = getOrderRouteRuleIssues([
      validRoute[0],
      { ...validRoute[1], id: "stop-1", datum: "2026-04-24", tijd: "10:00" },
      {
        id: "end",
        activiteit: "Lossen",
        locatie: "Dubai Airport",
        datum: "2026-04-24",
        tijd: "09:00",
        tijdTot: "10:00",
      },
    ]);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "delivery_time_window",
          message: "Eindbestemming kan niet eerder zijn dan Stop 1.",
        }),
      ]),
    );
  });

  it("blokkeert dubbele stops", () => {
    const issues = getOrderRouteRuleIssues([
      validRoute[0],
      { ...validRoute[1], locatie: "Willy Sluiterstraat 9, Hendrik-Ido-Ambacht" },
    ]);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "route_duplicate",
          message: "Levermoment gebruikt hetzelfde adres als Laadmoment. Kies een andere locatie.",
        }),
      ]),
    );
  });
});
