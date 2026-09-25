import { useState } from 'react';
import { API_KEY_MASK, type Models, type Settings, type SettingsPatch } from '@mixboard/shared';

const MODEL_FIELDS: { key: keyof Models; label: string }[] = [
  { key: 'agent', label: 'Agent model' },
  { key: 'caption', label: 'Caption model' },
  { key: 'tagline', label: 'Tagline model' },
  { key: 'image', label: 'Image model' },
];

/**
 * Settings: the Puns switch (D2), the crop switch for Regenerate (D4), the two lineage arrow switches (D5), the four model ids, and the provider API key/base URL.
 * Precondition: `settings` are loaded.
 * Postcondition: each switch calls `update` with its setting flipped (`puns`, `cropRegenerated`, `showLineage`, `lineageFade`); `Save models` calls `update({models})` with the edited ids; `Save connection` calls `update({apiKey, baseUrl})`, leaving `apiKey` out of the patch when the field was left untouched so the stored key is kept; `Clear key` sends `apiKey: null`.
 */
export function SettingsPanel({ settings, update }: { settings: Settings; update(patch: SettingsPatch): Promise<void> }) {
  const [models, setModels] = useState<Models>(settings.models);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
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

      <label>
        API key
        <input
          type="password"
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
          placeholder={settings.apiKey === API_KEY_MASK ? 'Key is set — leave blank to keep it' : 'sk-...'}
        />
      </label>
      <label>
        Base URL
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://openrouter.ai/api/v1"
        />
      </label>
      <div className="row">
        <button
          onClick={() => {
            const patch: SettingsPatch = { baseUrl };
            if (apiKeyInput) patch.apiKey = apiKeyInput;
            void update(patch).then(() => setApiKeyInput(''));
          }}
        >
          Save connection
        </button>
        {settings.apiKey && (
          <button onClick={() => void update({ apiKey: null }).then(() => setApiKeyInput(''))}>Clear key</button>
        )}
      </div>
      <p className="hint">
        The key and base URL are stored on the server, not the browser. Falls back to <code>OPENROUTER_API_KEY</code>/<code>OPENROUTER_BASE_URL</code> from
        <code>.env</code> when unset here. Any OpenAI-compatible chat-completions endpoint works — OpenRouter, OpenAI, or a local server (e.g. Ollama, LM Studio).
        Anthropic's native API uses a different wire format and is not supported by this base URL.
      </p>
    </div>
  );
}
