import React from 'react';
import {
  canUseElectronDesktopIPC,
  invokeDesktop,
  isDesktopLocalOriginActive,
} from '@/lib/desktop';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';

export type DesktopBackgroundReadability = 'weak' | 'standard' | 'strong';
export type DesktopBackgroundFit = 'cover' | 'contain';
export type DesktopBackgroundPosition = 'center' | 'top' | 'bottom' | 'left' | 'right';

interface DesktopBackgroundAppearance {
  panelOpacity: number;
  readability: DesktopBackgroundReadability;
  blur: boolean;
  fit: DesktopBackgroundFit;
  position: DesktopBackgroundPosition;
  assetId?: string;
  assetUrl: string | null;
  fileName?: string;
  width?: number;
  height?: number;
}

export type DesktopBackgroundPatch = Partial<Pick<
  DesktopBackgroundAppearance,
  'panelOpacity' | 'readability' | 'blur' | 'fit' | 'position'
>>;

type AppearanceListener = (scopeKey: string, appearance: DesktopBackgroundAppearance) => void;
const listeners = new Set<AppearanceListener>();
const appearances = new Map<string, DesktopBackgroundAppearance>();

export const canUseDesktopBackgroundAppearance = (): boolean =>
  canUseElectronDesktopIPC() && isDesktopLocalOriginActive();

const currentScope = () => {
  const runtimeKey = getRuntimeKey();
  return { runtimeKey, key: JSON.stringify([runtimeKey]) };
};

const publish = (scopeKey: string, appearance: DesktopBackgroundAppearance) => {
  appearances.set(scopeKey, appearance);
  for (const listener of listeners) listener(scopeKey, appearance);
};

const invokeBackground = async (
  command: 'desktop_background_get' | 'desktop_background_update' | 'desktop_background_import' | 'desktop_background_clear',
  patch?: DesktopBackgroundPatch,
): Promise<DesktopBackgroundAppearance | null> => {
  if (!canUseDesktopBackgroundAppearance()) return null;
  const scope = currentScope();
  const args = {
    runtimeKey: scope.runtimeKey,
    appearance: patch,
  };
  const appearance = await invokeDesktop<DesktopBackgroundAppearance>(command, args);
  if (appearance) publish(scope.key, appearance);
  return appearance;
};

export const importDesktopBackground = () => invokeBackground('desktop_background_import');
export const clearDesktopBackground = () => invokeBackground('desktop_background_clear');
export const updateDesktopBackground = (patch: DesktopBackgroundPatch) =>
  invokeBackground('desktop_background_update', patch);

export const previewDesktopBackground = (patch: DesktopBackgroundPatch) => {
  const scope = currentScope();
  const appearance = appearances.get(scope.key);
  if (appearance) publish(scope.key, { ...appearance, ...patch });
};

export const useDesktopBackgroundAppearance = (): DesktopBackgroundAppearance | null => {
  const [runtimeEpoch, setRuntimeEpoch] = React.useState(0);
  const [appearance, setAppearance] = React.useState<DesktopBackgroundAppearance | null>(null);

  React.useEffect(() => subscribeRuntimeEndpointChanged(() => setRuntimeEpoch((value) => value + 1)), []);

  React.useEffect(() => {
    if (!canUseDesktopBackgroundAppearance()) {
      setAppearance(null);
      return;
    }
    const scope = currentScope();
    let cancelled = false;
    const listener: AppearanceListener = (scopeKey, next) => {
      if (scopeKey === scope.key) setAppearance(next);
    };
    listeners.add(listener);
    const cached = appearances.get(scope.key);
    setAppearance(cached ?? {
      panelOpacity: 0.84,
      readability: 'standard',
      blur: false,
      fit: 'cover',
      position: 'center',
      assetUrl: null,
    });
    void invokeDesktop<DesktopBackgroundAppearance>('desktop_background_get', {
      runtimeKey: scope.runtimeKey,
    }).then((next) => {
      if (!cancelled && next) {
        publish(scope.key, next);
      }
    }).catch(() => {});
    return () => {
      cancelled = true;
      listeners.delete(listener);
    };
  }, [runtimeEpoch]);

  return appearance;
};
