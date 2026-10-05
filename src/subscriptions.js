// Subscription-offer helpers. Pure logic (no network) so it is unit-testable.
//
// Overlapping introductory/promotional offers on the same subscription make
// StoreKit drop the product (seen as a sandbox `countMismatch`). This finds
// offers whose active date ranges intersect so a tool can flag them.

/** Parse a YYYY-MM-DD date to a comparable number; null/undefined = open-ended. */
function toTime(d, openEndedValue) {
  if (d == null || d === "") return openEndedValue;
  const t = Date.parse(d);
  return Number.isNaN(t) ? openEndedValue : t;
}

/**
 * Given offers [{ id, startDate, endDate, kind? }], return the pairs whose
 * [startDate, endDate] ranges overlap. A missing startDate is treated as "from
 * the beginning of time" and a missing endDate as "forever" (open-ended), which
 * is how an always-on introductory offer behaves — so two open-ended offers
 * always overlap.
 */
export function detectOverlappingOffers(offers) {
  const ranges = (offers || []).map((o) => ({
    id: o.id,
    kind: o.kind,
    startDate: o.startDate ?? null,
    endDate: o.endDate ?? null,
    start: toTime(o.startDate, -Infinity),
    end: toTime(o.endDate, Infinity),
  }));
  const overlaps = [];
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i];
      const b = ranges[j];
      // Half-open overlap: they share at least one instant.
      if (a.start <= b.end && b.start <= a.end) {
        overlaps.push({
          a: { id: a.id, kind: a.kind, startDate: a.startDate, endDate: a.endDate },
          b: { id: b.id, kind: b.kind, startDate: b.startDate, endDate: b.endDate },
        });
      }
    }
  }
  return overlaps;
}
