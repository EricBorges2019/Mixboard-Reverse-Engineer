import { fileURLToPath } from 'node:url';
import { AspectRatio } from '@mixboard/shared';
import { loadConfig } from '../src/config';
import { readPngSize } from '../src/llm/imageSize';
import { OpenRouterLlm } from '../src/llm/openrouter';

try { process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url))); } catch { /* .env is optional */ }

/**
 * Verifies configured model ids exist on OpenRouter and, with --live, probes image aspect ratios.
 * Precondition: network access; with --live, OPENROUTER_API_KEY is set (spends a few cents).
 * Postcondition: prints a report; sets exit code 1 if any configured model id is missing.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const listed = (await (await fetch(`${config.baseUrl}/models`)).json()) as { data: { id: string }[] };
  const ids = new Set(listed.data.map((m) => m.id));
  for (const [role, id] of Object.entries(config.defaults.models)) {
    const ok = ids.has(id);
    console.log(`${ok ? 'OK     ' : 'MISSING'} ${role}: ${id}`);
    if (!ok) process.exitCode = 1;
  }
  if (!process.argv.includes('--live')) return;
  const llm = new OpenRouterLlm({ apiKey: config.apiKey, baseUrl: config.baseUrl });
  for (const ratio of AspectRatio.options) {
    try {
      const img = await llm.generateImage({ model: config.defaults.models.image, prompt: 'A simple red circle centered on a white background', aspectRatio: ratio });
      const size = readPngSize(img.bytes);
      console.log(`${ratio.padEnd(5)} -> ${img.mimeType}, ${img.bytes.length} bytes, ${size ? `${size.w}x${size.h}` : 'size n/a'}`);
    } catch (err) {
      console.log(`${ratio.padEnd(5)} -> FAILED: ${(err as Error).message}`);
    }
  }
  console.log('\nIf a ratio came back with the wrong shape or failed, remove it from IMAGE_SUPPORTED_RATIOS in .env. The agent then generates at the nearest supported ratio.');
}

await main();
