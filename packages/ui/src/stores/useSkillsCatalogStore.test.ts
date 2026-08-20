import { beforeEach, describe, expect, mock, test } from 'bun:test';

let runtimeKey = 'runtime-a';
let directory = '/repo-a';

type CatalogResponse = {
  ok: boolean;
  json: () => Promise<{ ok: true; items: Array<{ skillName: string }> }>;
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
};

const requests: Array<ReturnType<typeof deferred<CatalogResponse>>> = [];

mock.module('@/lib/runtime-switch', () => ({ getRuntimeKey: () => runtimeKey }));
mock.module('@/lib/runtime-fetch', () => ({
  runtimeFetch: () => {
    const request = deferred<CatalogResponse>();
    requests.push(request);
    return request.promise;
  },
}));
mock.module('@/lib/opencode/client', () => ({ opencodeClient: { getDirectory: () => directory } }));
mock.module('@/stores/useProjectsStore', () => ({ useProjectsStore: { getState: () => ({ getActiveProject: () => null }) } }));
mock.module('@/stores/useSkillsStore', () => ({
  invalidateSkillsLoadCache: () => {},
  refreshSkillsAfterOpenCodeRestart: async () => {},
  useSkillsStore: { getState: () => ({ loadSkills: async () => {} }) },
}));
mock.module('@/lib/configUpdate', () => ({ startConfigUpdate: () => {} }));
mock.module('@/lib/opencode/deferredRestart', () => ({ noteDeferredRestartFromPayload: () => false }));

const { useSkillsCatalogStore } = await import('./useSkillsCatalogStore');

const response = (skillName: string): CatalogResponse => ({
  ok: true,
  json: async () => ({ ok: true, items: [{ skillName }] }),
});

describe('Skills Catalog runtime isolation', () => {
  beforeEach(() => {
    runtimeKey = 'runtime-a';
    directory = '/repo-a';
    requests.length = 0;
    useSkillsCatalogStore.getState().resetForRuntimeSwitch();
  });

  test('rejects an old runtime source response after a switch', async () => {
    const first = useSkillsCatalogStore.getState().loadSource('anthropic');
    await Promise.resolve();

    runtimeKey = 'runtime-b';
    directory = '/repo-b';
    useSkillsCatalogStore.getState().resetForRuntimeSwitch();
    const second = useSkillsCatalogStore.getState().loadSource('anthropic');
    await Promise.resolve();

    expect(requests).toHaveLength(2);
    requests[0].resolve(response('from-runtime-a'));
    expect(await first).toBe(false);
    expect(useSkillsCatalogStore.getState().itemsBySource.anthropic).toBe(undefined);

    requests[1].resolve(response('from-runtime-b'));
    expect(await second).toBe(true);
    expect(useSkillsCatalogStore.getState().itemsBySource.anthropic).toEqual([{ skillName: 'from-runtime-b' }]);
  });

  test('does not share an in-flight source request across directories', async () => {
    const first = useSkillsCatalogStore.getState().loadSource('anthropic');
    await Promise.resolve();

    directory = '/repo-b';
    const second = useSkillsCatalogStore.getState().loadSource('anthropic');
    await Promise.resolve();

    expect(requests).toHaveLength(2);
    requests[0].resolve(response('from-repo-a'));
    expect(await first).toBe(false);
    expect(useSkillsCatalogStore.getState().itemsBySource.anthropic).toBe(undefined);

    requests[1].resolve(response('from-repo-b'));
    expect(await second).toBe(true);
    expect(useSkillsCatalogStore.getState().itemsBySource.anthropic).toEqual([{ skillName: 'from-repo-b' }]);
  });

  test('still shares an in-flight source request in the same runtime and directory', async () => {
    const first = useSkillsCatalogStore.getState().loadSource('anthropic');
    const second = useSkillsCatalogStore.getState().loadSource('anthropic');
    await Promise.resolve();

    expect(requests).toHaveLength(1);
    requests[0].resolve(response('shared'));
    expect(await first).toBe(true);
    expect(await second).toBe(true);
  });
});
