import { describe, it, expect } from "vitest";
import { fuzzySearch, highlightSegments } from "../fuzzy";

interface Item {
  name: string;
  description: string;
}

const items: Item[] = [
  { name: "Snelstart", description: "Boekhouding NL" },
  { name: "Exact Online", description: "Boekhouding NL/BE" },
  { name: "Moneybird", description: "Push facturen" },
  { name: "Slack", description: "Notificaties via Slack-kanalen" },
  { name: "Webfleet", description: "Voertuigposities" },
];

describe("fuzzySearch", () => {
  it("geeft lege array bij lege query", () => {
    const r = fuzzySearch(items, "", {
      fields: [{ name: "name", get: (i) => i.name }],
    });
    expect(r).toEqual([]);
  });

  it("vindt exacte substring met lage score", () => {
    const r = fuzzySearch(items, "snel", {
      fields: [{ name: "name", get: (i) => i.name }],
    });
    expect(r).toHaveLength(1);
    expect(r[0].item.name).toBe("Snelstart");
    expect(r[0].score).toBe(0);
    expect(r[0].matchedIndices).toEqual([0, 1, 2, 3]);
  });

  it("vindt subsequence-match (typo's)", () => {
    const r = fuzzySearch(items, "exct", {
      fields: [{ name: "name", get: (i) => i.name }],
    });
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].item.name).toBe("Exact Online");
  });

  it("respecteert limit", () => {
    const r = fuzzySearch(items, "e", {
      fields: [{ name: "name", get: (i) => i.name }],
      limit: 2,
    });
    expect(r.length).toBeLessThanOrEqual(2);
  });

  it("zoekt over meerdere velden en pakt de beste", () => {
    const r = fuzzySearch(items, "boekhouding", {
      fields: [
        { name: "name", get: (i) => i.name },
        { name: "description", get: (i) => i.description },
      ],
    });
    expect(r.length).toBe(2);
    expect(r.map((m) => m.item.name).sort()).toEqual(["Exact Online", "Snelstart"]);
  });

  it("filtert onder threshold weg", () => {
    const r = fuzzySearch(items, "xyz", {
      fields: [{ name: "name", get: (i) => i.name }],
    });
    expect(r).toEqual([]);
  });

  it("sorteert beste match eerst", () => {
    const r = fuzzySearch(items, "sla", {
      fields: [
        { name: "name", get: (i) => i.name },
        { name: "description", get: (i) => i.description },
      ],
    });
    expect(r[0].item.name).toBe("Slack");
  });
});

describe("highlightSegments", () => {
  it("splitst in match en non-match segmenten", () => {
    const segs = highlightSegments("Snelstart", [0, 1, 2, 3]);
    expect(segs).toEqual([
      { text: "Snel", match: true },
      { text: "start", match: false },
    ]);
  });

  it("hanteert lege indices", () => {
    const segs = highlightSegments("Snelstart", []);
    expect(segs).toEqual([{ text: "Snelstart", match: false }]);
  });

  it("hanteert niet-aaneengesloten matches", () => {
    const segs = highlightSegments("Exact", [0, 2, 4]);
    expect(segs).toEqual([
      { text: "E", match: true },
      { text: "x", match: false },
      { text: "a", match: true },
      { text: "c", match: false },
      { text: "t", match: true },
    ]);
  });
});
