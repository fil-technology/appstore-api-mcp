// Field validation + diffing for App Store Connect metadata.
// Extracted into its own module so it can be unit-tested.

// Apple's documented length limits for editable metadata fields.
export const LIMITS = {
  name: 30,
  subtitle: 30,
  keywords: 100,
  promotionalText: 170,
  description: 4000,
  whatsNew: 4000,
};

/** Warn about fields that exceed Apple's limits. Non-blocking. */
export function validateAttributes(attributes) {
  const warnings = [];
  for (const [field, value] of Object.entries(attributes || {})) {
    const limit = LIMITS[field];
    if (limit && typeof value === "string" && value.length > limit) {
      warnings.push(
        `'${field}' is ${value.length} chars — exceeds Apple's limit of ${limit}.`,
      );
    }
  }
  return warnings;
}

/**
 * Build a field-by-field diff between current attributes and proposed changes,
 * including length/limit info. Used by dry-run mode.
 */
export function buildDiff(current = {}, attributes = {}) {
  const changes = [];
  for (const [field, to] of Object.entries(attributes)) {
    const from = current[field] ?? null;
    const limit = LIMITS[field];
    changes.push({
      field,
      from,
      to,
      changed: from !== to,
      ...(limit
        ? {
            newLength: typeof to === "string" ? to.length : null,
            limit,
            exceedsLimit: typeof to === "string" ? to.length > limit : false,
          }
        : {}),
    });
  }
  return changes;
}
