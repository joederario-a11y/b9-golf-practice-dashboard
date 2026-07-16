const disallowedComparisonTerms = [
  "tour twin",
  "tiger woods",
  "rory mcilroy",
  "scottie scheffler",
  "jon rahm",
  "brooks koepka",
  "justin thomas",
  "jordan spieth",
  "collin morikawa",
  "xander schauffele",
  "viktor hovland",
  "hideki matsuyama",
  "tommy fleetwood",
  "nelly korda",
  "lydia ko",
  "annika sorenstam",
  "lexi thompson",
  "rose zhang",
  "minjee lee",
];

function flattenText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(flattenText).join(" ");
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(flattenText).join(" ");
  }

  return "";
}

export function assertNoDisallowedAnalysisContent(value: unknown) {
  const normalized = flattenText(value).toLowerCase();
  const disallowedTerm = disallowedComparisonTerms.find((term) => normalized.includes(term));

  if (disallowedTerm) {
    throw new Error(`disallowed analysis comparison: ${disallowedTerm}`);
  }
}

