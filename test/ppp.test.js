import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadCountries,
  getCoefficient,
  validateCoefficients,
  calculateTargetPrices,
  findPricePoint,
  decodeTerritory,
  minimumPrice,
  tierSummary,
  currentEffectivePrice,
  MINIMUM_PRICE_HIGH,
  MINIMUM_PRICE_LOW,
} from "../src/ppp.js";
import { isWriteTool, writeBlockReason } from "../src/guardrails.js";

// ---- Country data ----

test("loadCountries excludes USA and returns the full table", () => {
  const all = loadCountries();
  assert.ok(all.length > 150, `expected 150+ countries, got ${all.length}`);
  assert.ok(!all.some((c) => c.code === "USA"), "USA must be excluded");
});

test("loadCountries honors the exclude list (case-insensitive)", () => {
  const all = loadCountries();
  const filtered = loadCountries(["rus", "BLR"]);
  assert.equal(filtered.length, all.length - 2);
  assert.ok(!filtered.some((c) => c.code === "RUS" || c.code === "BLR"));
});

test("minimumPrice: high tiers 0.99, low tiers 0.49", () => {
  assert.equal(minimumPrice("premium"), MINIMUM_PRICE_HIGH);
  assert.equal(minimumPrice("high_income"), MINIMUM_PRICE_HIGH);
  assert.equal(minimumPrice("emerging"), MINIMUM_PRICE_LOW);
  assert.equal(minimumPrice("lower_middle"), MINIMUM_PRICE_LOW);
});

// ---- Coefficients ----

test("getCoefficient: override wins over the country default", () => {
  const c = { category: "emerging", defaultCoefficient: 0.4 };
  assert.equal(getCoefficient(c, { emerging: 0.7 }), 0.7);
  assert.equal(getCoefficient(c, { premium: 1.1 }), 0.4);
  assert.equal(getCoefficient(c, null), 0.4);
});

test("validateCoefficients accepts valid tiers, rejects bad ones", () => {
  assert.deepEqual(validateCoefficients({ emerging: 0.55, PREMIUM: 1.1 }), {
    emerging: 0.55,
    premium: 1.1,
  });
  assert.throws(() => validateCoefficients({ usa: 1.0 }), /Unknown coefficient category/);
  assert.throws(() => validateCoefficients({ emerging: 5 }), /\[0\.1, 2\.0\]/);
  assert.throws(() => validateCoefficients({ emerging: 0 }), /\[0\.1, 2\.0\]/);
});

// ---- Pricing math ----

test("calculateTargetPrices multiplies US price by coefficient", () => {
  const countries = [
    { code: "IND", name: "India", category: "emerging", defaultCoefficient: 0.4, minimumPrice: 0.49 },
  ];
  const r = calculateTargetPrices([{ id: "1", productId: "p", usPrice: 10 }], countries);
  assert.equal(r.length, 1);
  assert.equal(r[0].targetPriceUsd, 4.0);
  assert.equal(r[0].coefficient, 0.4);
});

test("ratio preservation: cheapest hits the floor, all products scale by the same factor", () => {
  const countries = [
    { code: "IND", name: "India", category: "emerging", defaultCoefficient: 0.3, minimumPrice: 0.49 },
  ];
  // cheapest 0.99 × 0.3 = 0.30 < 0.49 floor → coeff becomes 0.49/0.99 ≈ 0.4949 for ALL
  const r = calculateTargetPrices(
    [
      { id: "a", productId: "cheap", usPrice: 0.99 },
      { id: "b", productId: "pricey", usPrice: 4.99 },
    ],
    countries,
  );
  assert.equal(r[0].coefficient, r[1].coefficient, "same scaled coefficient for both");
  assert.ok(r[0].coefficient > 0.3, "scaled up from the default");
  assert.ok(Math.abs(r[0].targetPriceUsd - 0.49) < 0.01, "cheapest lands on the floor");
  // ratio preserved: pricey/cheap ≈ 4.99/0.99
  assert.ok(Math.abs(r[1].targetPriceUsd / r[0].targetPriceUsd - 4.99 / 0.99) < 0.05);
});

// ---- Grid snapping ----

const grid = [
  { id: "1", customerPrice: 1.0, territory3: "CHE" },
  { id: "2", customerPrice: 2.0, territory3: "CHE" },
  { id: "3", customerPrice: 3.0, territory3: "CHE" },
  { id: "4", customerPrice: 5.0, territory3: "CHE" },
];

test("findPricePoint: exact match wins", () => {
  assert.equal(findPricePoint(grid, 2.0, 5.0).id, "2");
});

test("findPricePoint: below base rounds down (never creeps over target)", () => {
  // base 5, target 2.4 → choose the highest point below 2.4 → 2.0
  assert.equal(findPricePoint(grid, 2.4, 5.0).id, "2");
});

test("findPricePoint: above base rounds up (never slips under target)", () => {
  // base 1, target 2.6 → choose the lowest point above 2.6 → 3.0
  assert.equal(findPricePoint(grid, 2.6, 1.0).id, "3");
});

test("findPricePoint: falls back to nearest when no point in the rounding direction", () => {
  // base 1, target 9 (above base) but nothing above 9 → nearest is 5.0
  assert.equal(findPricePoint(grid, 9.0, 1.0).id, "4");
  assert.equal(findPricePoint([], 1, 1), null);
});

// ---- Territory decode ----

test("decodeTerritory reads the territory from a base64 price-point id", () => {
  const id = Buffer.from(JSON.stringify({ t: "CHE", p: "x" })).toString("base64");
  assert.equal(decodeTerritory(id), "CHE");
  assert.equal(decodeTerritory("!!!not-base64!!!"), "");
});

// ---- Current-effective price selection (the SpeakerMate Weekly bug) ----

test("currentEffectivePrice: picks the dated price over the null base", () => {
  // SpeakerMate Weekly: base $0.99 (startDate null) raised to $2.99 on 2026-06-06
  const rows = [
    { startDate: null, amount: "0.99" },
    { startDate: "2026-06-06", amount: "2.99" },
  ];
  assert.equal(currentEffectivePrice(rows, "2026-10-08"), 2.99);
});

test("currentEffectivePrice: only a null base returns the base", () => {
  assert.equal(currentEffectivePrice([{ startDate: null, amount: "4.99" }], "2026-10-08"), 4.99);
});

test("currentEffectivePrice: ignores a future-scheduled change", () => {
  const rows = [
    { startDate: null, amount: "0.99" },
    { startDate: "2026-06-06", amount: "2.99" },
    { startDate: "2027-01-01", amount: "3.99" }, // scheduled, not yet active
  ];
  assert.equal(currentEffectivePrice(rows, "2026-10-08"), 2.99);
});

test("currentEffectivePrice: latest active among several past changes", () => {
  const rows = [
    { startDate: null, amount: "0.99" },
    { startDate: "2025-01-01", amount: "1.99" },
    { startDate: "2026-06-06", amount: "2.99" },
  ];
  assert.equal(currentEffectivePrice(rows, "2026-10-08"), 2.99);
});

test("currentEffectivePrice: empty / all-future returns null", () => {
  assert.equal(currentEffectivePrice([], "2026-10-08"), null);
  assert.equal(
    currentEffectivePrice([{ startDate: "2099-01-01", amount: "9.99" }], "2026-10-08"),
    null,
  );
});

test("tierSummary lists every tier with its default + floor", () => {
  const tiers = tierSummary();
  const cats = tiers.map((t) => t.category);
  for (const c of ["premium", "high_income", "upper_middle", "lower_middle", "emerging"])
    assert.ok(cats.includes(c), `missing tier ${c}`);
});

// ---- Guardrails ----

test("apply_ppp_prices is a gated write; preview/list are not", () => {
  assert.ok(isWriteTool("apply_ppp_prices"));
  assert.equal(isWriteTool("preview_ppp_prices"), false);
  assert.equal(isWriteTool("list_purchasable_products"), false);
});

test("apply_ppp_prices blocked by read-only and by the price-changes flag", () => {
  assert.match(
    writeBlockReason("apply_ppp_prices", {}, { APPSTORE_MCP_READ_ONLY: "true" }),
    /READ-ONLY/,
  );
  assert.match(
    writeBlockReason("apply_ppp_prices", {}, { APPSTORE_MCP_ALLOW_PRICE_CHANGES: "false" }),
    /changing prices is disabled/,
  );
  assert.equal(writeBlockReason("apply_ppp_prices", {}, {}), null);
});
