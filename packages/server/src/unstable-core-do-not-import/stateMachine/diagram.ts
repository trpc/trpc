/** One arrow in a state diagram. */
export interface DiagramEdge {
  readonly from: string;
  readonly to: string;
  readonly label: string;
}

/**
 * Every edge a transition takes from sample `states` on sample `events`, in
 * that order. `next` returns the state after the event, or `null` where the
 * machine rejects it, which draws no edge.
 */
export function sampleTransitions<TState, TEvent>(opts: {
  states: readonly TState[];
  events: readonly TEvent[];
  next: (state: TState, event: TEvent) => TState | null;
  stateName: (state: TState) => string;
  eventName: (event: TEvent) => string;
}): DiagramEdge[] {
  const edges: DiagramEdge[] = [];
  for (const state of opts.states) {
    for (const event of opts.events) {
      const after = opts.next(state, event);
      if (after === null) continue;
      edges.push({
        from: opts.stateName(state),
        to: opts.stateName(after),
        label: opts.eventName(event),
      });
    }
  }
  return edges;
}

/**
 * A Mermaid `stateDiagram-v2`, with one arrow per pair of states and every
 * label that takes it. Check it in with `toMatchFileSnapshot`, and the
 * diagram can't drift from the transitions.
 */
export function stateDiagram(opts: {
  /** The `[*] -->` arrows. */
  initial: readonly { to: string; label: string | null }[];
  edges: Iterable<DiagramEdge>;
  /** The `--> [*]` arrows. */
  final: readonly string[];
  /**
   * Sorts arrows and labels, for edges found in no fixed order, e.g. by
   * random runs; otherwise they keep the order they came in.
   */
  sort: boolean;
}): string {
  const arrows = new Map<string, Set<string>>();
  for (const { from, to, label } of opts.edges) {
    const arrow = `${from} --> ${to}`;
    const labels = arrows.get(arrow) ?? new Set();
    arrows.set(arrow, labels.add(label));
  }
  const entries = [...arrows].map(([arrow, labels]) => {
    const list = [...labels];
    return [arrow, opts.sort ? list.sort() : list] as const;
  });
  if (opts.sort) entries.sort(([a], [b]) => a.localeCompare(b));
  return [
    'stateDiagram-v2',
    ...opts.initial.map(({ to, label }) =>
      label === null ? `  [*] --> ${to}` : `  [*] --> ${to} : ${label}`,
    ),
    ...entries.map(([arrow, labels]) => `  ${arrow} : ${labels.join(', ')}`),
    ...opts.final.map((state) => `  ${state} --> [*]`),
  ].join('\n');
}
