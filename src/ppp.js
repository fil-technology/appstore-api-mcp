// Purchasing-power-parity (PPP) pricing: country data + pricing math + grid
// snapping. Pure logic only (no network) so it is unit-testable; the App Store
// Connect calls live in index.js.
//
// Logic and the countries.csv dataset are ported from the MIT-licensed
// appstore-ppp-prices by Aleksandr Belousov
// (https://github.com/duceum/appstore-ppp-pricing-agent-skill).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

// Per-tier price floors: premium/usa/high_income can't go below 0.99; the
// lower tiers can drop to 0.49.
export const MINIMUM_PRICE_HIGH = 0.99;
export const MINIMUM_PRICE_LOW = 0.49;
const HIGH_MINIMUM_CATEGORIES = new Set(["premium", "usa", "high_income"]);

// Categories an agent may override a coefficient for (USA is always the 1.0
// base and is excluded from the target set).
export const OVERRIDABLE_CATEGORIES = new Set([
  "premium",
  "high_income",
  "upper_middle",
  "lower_middle",
  "emerging",
]);

/** Floor for a category's price. */
export function minimumPrice(category) {
  return HIGH_MINIMUM_CATEGORIES.has(category)
    ? MINIMUM_PRICE_HIGH
    : MINIMUM_PRICE_LOW;
}

/**
 * Load the embedded country table. Skips USA and any excluded 3-letter codes.
 * Returns [{ code, name, gdpPerCapita, category, defaultCoefficient, minimumPrice }].
 */
export function loadCountries(exclude, csvPath = join(HERE, "ppp-countries.csv")) {
  const excluded = new Set((exclude || []).map((c) => c.trim().toUpperCase()));
  const text = readFileSync(csvPath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  const header = lines[0].split(",");
  const idx = (name) => header.indexOf(name);
  const iCode = idx("country_code");
  const iName = idx("country_name");
  const iGdp = idx("gdp_per_capita");
  const iCat = idx("category");
  const iCoeff = idx("default_coefficient");

  const countries = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const code = (cells[iCode] || "").trim().toUpperCase();
    if (!code || code === "USA" || excluded.has(code)) continue;
    const gdp = parseInt(cells[iGdp], 10);
    const coeff = parseFloat(cells[iCoeff]);
    if (!Number.isFinite(gdp) || !Number.isFinite(coeff)) continue; // skip bad rows
    const category = (cells[iCat] || "").trim();
    countries.push({
      code,
      name: (cells[iName] || "").trim(),
      gdpPerCapita: gdp,
      category,
      defaultCoefficient: coeff,
      minimumPrice: minimumPrice(category),
    });
  }
  return countries;
}

/** Resolve the coefficient for a country: an override for its tier wins. */
export function getCoefficient(country, overrides) {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, country.category))
    return overrides[country.category];
  return country.defaultCoefficient;
}

/**
 * Validate an agent-supplied {category: coefficient} override map.
 * Returns the normalized map or throws a friendly Error.
 */
export function validateCoefficients(overrides) {
  const out = {};
  for (const [rawCat, rawVal] of Object.entries(overrides || {})) {
    const cat = String(rawCat).trim().toLowerCase();
    if (!OVERRIDABLE_CATEGORIES.has(cat))
      throw new Error(
        `Unknown coefficient category '${rawCat}'. Valid: ${[...OVERRIDABLE_CATEGORIES].join(", ")}.`,
      );
    const val = Number(rawVal);
    if (!Number.isFinite(val) || val < 0.1 || val > 2.0)
      throw new Error(`Coefficient for '${cat}' must be in [0.1, 2.0], got ${rawVal}.`);
    out[cat] = Math.round(val * 1000) / 1000;
  }
  return out;
}

/**
 * Target USD prices for all products across all countries.
 *   products: [{ id, name, productId, usPrice }]
 * Ratio preservation: if the cheapest product × coefficient would fall below a
 * country's floor, every product in that country is scaled up by the same
 * factor so price ratios between products are kept intact.
 */
export function calculateTargetPrices(products, countries, overrides) {
  if (!products?.length || !countries?.length) return [];
  const cheapestUs = Math.min(...products.map((p) => p.usPrice));
  const results = [];
  for (const country of countries) {
    const baseCoeff = getCoefficient(country, overrides);
    const coeff = Math.max(baseCoeff, country.minimumPrice / cheapestUs);
    for (const p of products) {
      results.push({
        countryCode: country.code,
        countryName: country.name,
        category: country.category,
        productId: p.id,
        productName: p.name || p.productId,
        usPrice: p.usPrice,
        coefficient: coeff,
        targetPriceUsd: Math.round(p.usPrice * coeff * 100) / 100,
      });
    }
  }
  return results;
}

/**
 * Pick the price point closest to `target`, rounding away from `base`.
 * All three are in the same currency. An exact match wins; above-base targets
 * round up and below-base targets round down, so a market priced above base
 * never slips under its target and a discounted one never creeps over it.
 * Falls back to the nearest point when the chosen direction holds none.
 *   points: [{ id, customerPrice, territory3 }]
 */
export function findPricePoint(points, target, base) {
  if (!points?.length) return null;
  const exact = points.find((p) => Math.abs(p.customerPrice - target) < 0.005);
  if (exact) return exact;
  if (target > base) {
    const higher = points.filter((p) => p.customerPrice > target);
    if (higher.length)
      return higher.reduce((a, b) => (b.customerPrice < a.customerPrice ? b : a));
  } else if (target < base) {
    const lower = points.filter((p) => p.customerPrice < target);
    if (lower.length)
      return lower.reduce((a, b) => (b.customerPrice > a.customerPrice ? b : a));
  }
  return points.reduce((a, b) =>
    Math.abs(b.customerPrice - target) < Math.abs(a.customerPrice - target) ? b : a,
  );
}

/**
 * Decode the 3-letter territory from a base64-encoded price-point id.
 * Apple encodes a JSON blob like {"t":"CHE",...} in the id.
 */
export function decodeTerritory(pricePointId) {
  try {
    const decoded = Buffer.from(pricePointId + "==", "base64").toString("utf8");
    return JSON.parse(decoded).t || "";
  } catch {
    return "";
  }
}

/**
 * Pick the CURRENTLY-EFFECTIVE price from dated price rows.
 *   rows: [{ startDate: string|null, amount: number }]
 * App Store Connect keeps every price a product has ever had: the original
 * (startDate null) plus one row per scheduled change. The price customers pay
 * today is the row with the LATEST startDate that is on or before today; a null
 * startDate is the baseline (effective from the beginning). Future-dated rows
 * (a scheduled upcoming change) are ignored. Returns the amount, or null.
 */
export function currentEffectivePrice(rows, today = new Date().toISOString().slice(0, 10)) {
  let best = null;
  for (const r of rows || []) {
    const amount = Number(r.amount);
    if (!Number.isFinite(amount)) continue;
    const start = r.startDate || null;
    if (start && start > today) continue; // skip not-yet-active scheduled prices
    const key = start || ""; // null baseline sorts earliest
    if (!best || key >= best.key) best = { key, amount };
  }
  return best ? best.amount : null;
}

/** The default coefficient + floor for each tier, for tool docs / previews. */
export function tierSummary() {
  const seen = new Map();
  for (const c of loadCountries()) {
    if (!seen.has(c.category))
      seen.set(c.category, {
        category: c.category,
        defaultCoefficient: c.defaultCoefficient,
        minimumPrice: c.minimumPrice,
      });
  }
  return [...seen.values()];
}
