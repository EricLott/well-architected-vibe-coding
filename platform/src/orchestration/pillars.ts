import type { PillarName } from "../shared/types.js";

export const pillarSlugToName: Record<string, PillarName> = {
  reliability: "Reliability",
  security: "Security",
  "cost-optimization": "Cost Optimization",
  "operational-excellence": "Operational Excellence",
  "performance-efficiency": "Performance Efficiency",
};

const pillarNameToFilterMap: Record<PillarName, string> = {
  Reliability: "reliability",
  Security: "security",
  "Cost Optimization": "cost-optimization",
  "Operational Excellence": "operational-excellence",
  "Performance Efficiency": "performance-efficiency",
};

export function getPillarFilterValue(pillar: PillarName): string {
  return pillarNameToFilterMap[pillar];
}

export function normalizePillarInput(value: string): PillarName | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const slug = trimmed.toLowerCase().replace(/\s+/g, "-");
  if (slug in pillarSlugToName) {
    return pillarSlugToName[slug];
  }

  const match = (Object.keys(pillarNameToFilterMap) as PillarName[]).find(
    (pillar) => pillar.toLowerCase() === trimmed.toLowerCase(),
  );
  return match ?? null;
}

export function listPillars(): PillarName[] {
  return [
    "Reliability",
    "Security",
    "Cost Optimization",
    "Operational Excellence",
    "Performance Efficiency",
  ];
}
