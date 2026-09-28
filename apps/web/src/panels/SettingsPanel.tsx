import { useState } from 'react';
import { BaseUrl, type Models, type Settings, type SettingsPatch } from '@mixboard/shared';

const MODEL_FIELDS: { key: keyof Models; label: string }[] = [
  { key: 'agent', label: 'Agent model' },
  { key: 'caption', label: 'Caption model' },
  { key: 'tagline', label: 'Tagline model' },
  { key: 'image', label: 'Image model' },
];

/**
 * Settings: the Puns switch (D2), the crop switch for Regenerate (D4), the two lineage arrow switches (D5), the four model ids and the API base URL.
 * Precondition: `settings` are loaded.
 * Postcondition: each switch calls `update` with its setting flipped (`puns`, `cropRegenerated`, `showLineage`, `lineageFade`); `Save models` calls `update({models})` with the edited ids; `Save base URL` calls `update({baseUrl})` when the URL is valid (empty resets to the server default) and shows an error otherwise. The API key is not editable here: it lives in the server's `.env`.
 */
export function SettingsPanel({ settings, update }: { settings: Settings; update(patch: SettingsPatch): Promise<void> }) {
  const [models, setModels] = useState<Models>(settings.models);
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [baseUrlError, setBaseUrlError] = useState<string | null>(null);
  /**
   * Validates and saves the base URL.
   * Precondition: none.
   * Postcondition: calls `update` with the normalized URL (or '' to reset) and clears the error, or sets the error without calling `update`.
   */
  const saveBaseUrl = () => {
    const parsed = baseUrl.trim() === '' ? { success: true as const, data: '' } : BaseUrl.safeParse(baseUrl);
    if (!parsed.success) return setBaseUrlError(parsed.error.issues[0].message);
    setBaseUrlError(null);
    void update({ baseUrl: parsed.data });
  };
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
      <label>API base URL<input value={baseUrl} placeholder="https://openrouter.ai/api/v1" onChange={(e) => setBaseUrl(e.target.value)} /></label>
      <button onClick={saveBaseUrl}>Save base URL</button>
      {baseUrlError && <p className="hint" role="alert">{baseUrlError}</p>}
      <p className="hint">Any OpenAI-compatible API: OpenRouter, <code>https://api.openai.com/v1</code>, <code>https://api.anthropic.com/v1</code>, or a local server such as <code>http://localhost:11434/v1</code> (no key needed). Model ids must match that provider. Leave empty and save to go back to the default.</p>
      <p className="hint">The API key is read from <code>.env</code> on the server and never sent to the browser.</p>
    </div>
  );
}
