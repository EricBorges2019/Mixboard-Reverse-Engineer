import { useState } from 'react';
import type { Models, Settings, SettingsPatch } from '@mixboard/shared';

const MODEL_FIELDS: { key: keyof Models; label: string }[] = [
  { key: 'agent', label: 'Agent model' },
  { key: 'caption', label: 'Caption model' },
  { key: 'tagline', label: 'Tagline model' },
  { key: 'image', label: 'Image model' },
];

/**
 * Settings: the Puns switch (D2) and the four model ids.
 * Precondition: `settings` are loaded.
 * Postcondition: clicking the `Puns` switch calls `update({puns: !current})`; `Save models` calls `update({models})` with the edited ids. The OpenRouter key is not editable here: it lives in the server's `.env`.
 */
export function SettingsPanel({ settings, update }: { settings: Settings; update(patch: SettingsPatch): Promise<void> }) {
  const [models, setModels] = useState<Models>(settings.models);
  return (
    <div className="settings">
      <div className="row">
        <span id="puns-label">Puns</span>
        <button role="switch" aria-checked={settings.puns} aria-labelledby="puns-label" className="switch" onClick={() => void update({ puns: !settings.puns })}>
          {settings.puns ? 'On' : 'Off'}
        </button>
      </div>
      <p className="hint">Show a punny loading tagline while the agent works. Costs one extra small model call per message.</p>
      {MODEL_FIELDS.map(({ key, label }) => (
        <label key={key}>{label}<input value={models[key]} onChange={(e) => setModels({ ...models, [key]: e.target.value })} /></label>
      ))}
      <button onClick={() => void update({ models })}>Save models</button>
      <p className="hint">The OpenRouter API key is read from <code>.env</code> on the server and never sent to the browser.</p>
    </div>
  );
}
