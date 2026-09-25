/** Fases do roadmap (ver README → Roadmap). */
export type RoadmapPhase = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Metadados de uma página de módulo ainda não implementada. */
export interface ModuleInfo {
  description: string;
  phase: RoadmapPhase;
  plannedFeatures: readonly string[];
}
