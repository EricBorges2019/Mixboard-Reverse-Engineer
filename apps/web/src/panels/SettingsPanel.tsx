import { useState } from 'react';
import type { Models, Settings, SettingsPatch } from '@mixboard/shared';

const MODEL_FIELDS: { key: keyof Models; label: string }[] = [
  { key: 'agent', label: 'Agent model' },
  { key: 'caption', label: 'Caption model' },
  { key: 'tagline', label: 'Tagline model' },
  { key: 'image', label: 'Image model' },
];

/**
 * Settings: the Puns switch (D2), the crop switch for Regenerate (D4), the two lineage arrow switches (D5) and the four model ids.
 * Precondition: `settings` are loaded.
 * Postcondition: each switch calls `update` with its setting flipped (`puns`, `cropRegenerated`, `showLineage`, `lineageFade`); `Save models` calls `update({models})` with the edited ids. The OpenRouter key is not editable here: it lives in the server's `.env`.
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
      <div className="row">
        <span id="crop-label">Crop regenerated images</span>
        <button role="switch" aria-checked={settings.cropRegenerated} aria-labelledby="crop-label" className="switch" onClick={() => void update({ cropRegenerated: !settings.cropRegenerated })}>
          {settings.cropRegenerated ? 'On' : 'Off'}
        </button>
      </div>
      <p className="hint">Regenerate makes a square image. On: crop it to the source image's shape, as Mixboard does. Off: show the whole square.</p>
      <div className="row">
        <span id="lineage-label">Show lineage at all times</span>
        <button role="switch" aria-checked={settings.showLineage} aria-labelledby="lineage-label" className="switch" onClick={() => void update({ showLineage: !settings.showLineage })}>
          {settings.showLineage ? 'On' : 'Off'}
        </button>
      </div>
      <div className="row">
        <span id="fade-label">Fade lineage arrows</span>
        <button role="switch" aria-checked={settings.lineageFade} aria-labelledby="fade-label" className="switch" onClick={() => void update({ lineageFade: !settings.lineageFade })}>
          {settings.lineageFade ? 'On' : 'Off'}
        </button>
      </div>
      <p className="hint">Arrows run from each image to the images made from it. Off: hold L on the canvas to see them. Fade: ease them in and out instead of showing them instantly.</p>
      {MODEL_FIELDS.map(({ key, label }) => (
        <label key={key}>{label}<input value={models[key]} onChange={(e) => setModels({ ...models, [key]: e.target.value })} /></label>
      ))}
      <button onClick={() => void update({ models })}>Save models</button>
      <p className="hint">The OpenRouter API key is read from <code>.env</code> on the server and never sent to the browser.</p>
    </div>
  );
}
