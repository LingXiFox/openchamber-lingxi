import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Persisted trace roots for the git graph dialog, keyed by directory.
 *
 * Only the root commit hash is persisted — never the trace result — so a
 * restore re-runs the read-only trace against current history instead of
 * replaying a stale ancestor set. This keeps the provenance highlight alive
 * across reloads; switching directories intentionally preserves other
 * directories' roots.
 */
type GraphTraceStore = {
  rootsByDirectory: Record<string, string>;
  setTraceRoot: (directory: string, hash: string) => void;
  clearTraceRoot: (directory: string) => void;
};

export const useGraphTraceStore = create<GraphTraceStore>()(
  persist(
    (set) => ({
      rootsByDirectory: {},
      setTraceRoot: (directory, hash) =>
        set((state) => ({ rootsByDirectory: { ...state.rootsByDirectory, [directory]: hash } })),
      clearTraceRoot: (directory) =>
        set((state) => {
          if (!(directory in state.rootsByDirectory)) return state;
          const next = { ...state.rootsByDirectory };
          delete next[directory];
          return { rootsByDirectory: next };
        }),
    }),
    {
      name: 'openchamber.graph-trace-roots',
    },
  ),
);
