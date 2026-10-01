import { useCallback, useEffect, useState } from 'react';
import type { Settings, SettingsPatch } from '@mixboard/shared';
import { getSettings, putSettings } from './api/client';

/**
 * Loads and updates the server-side settings.
 * Precondition: called from a component.
 * Postcondition: `settings` is null until loaded; `update(patch)` saves and replaces it with the server's merged result (rejects on failure, leaving the old value).
 */
export function useSettings(): { settings: Settings | null; update(patch: SettingsPatch): Promise<void> } {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    getSettings().then(setSettings).catch(() => undefined);
  }, []);
  const update = useCallback(async (patch: SettingsPatch) => {
    setSettings(await putSettings(patch));
  }, []);
  return { settings, update };
}
