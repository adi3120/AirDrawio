export interface DiagramRepresentation {
  nodes: Array<{ id: string; label: string; x: number; y: number }>;
  edges: Array<{ source: string; target: string }>;
}

/** Future extension point; intentionally not implemented in this MVP. */
export interface DiagramRefiner {
  refine(diagram: DiagramRepresentation): Promise<DiagramRepresentation>;
}
