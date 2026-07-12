/**
 * Shared energy heat scale for the graph surfaces.
 *
 * The source heatmap buckets on absolute energy, which works because a single
 * source line carries a handful of instructions. Blocks and AST subtrees span
 * whole loop bodies, so their energies are orders of magnitude larger and vary
 * with the program — they are bucketed relative to the hottest node instead.
 */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export function heatLevel(value: number, max: number): HeatLevel {
  if (value <= 0 || max <= 0) {
    return 0;
  }

  const ratio = value / max;
  if (ratio >= 0.66) return 4;
  if (ratio >= 0.33) return 3;
  if (ratio >= 0.12) return 2;
  return 1;
}

/** Fill for a node body — kept translucent so node text stays readable. */
export function heatBackground(level: HeatLevel): string {
  if (level === 0) {
    return "var(--card)";
  }
  const opacity = [0, 0.14, 0.2, 0.28, 0.36][level];
  return `color-mix(in oklch, var(--heat-${level}) ${opacity * 100}%, var(--card))`;
}

export function heatBorder(level: HeatLevel): string {
  if (level === 0) {
    return "var(--border)";
  }
  return `color-mix(in oklch, var(--heat-${level}) 70%, var(--border))`;
}

/** Solid ramp color, for bars and legends. */
export function heatColor(level: HeatLevel): string {
  return level === 0 ? "var(--muted)" : `var(--heat-${level})`;
}

export const HEAT_LEGEND: { level: HeatLevel; label: string }[] = [
  { level: 0, label: "none" },
  { level: 1, label: "cool" },
  { level: 2, label: "warm" },
  { level: 3, label: "hot" },
  { level: 4, label: "hottest" },
];
