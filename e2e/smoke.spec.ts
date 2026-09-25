import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const API = 'http://localhost:8788';

test('the agent adds a text block to the canvas and the server stores it', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).click();
  const input = page.getByPlaceholder('Ask Mixboard…');
  await expect(input).toBeVisible();
  await input.fill('Add a note about oil painting');
  await page.keyboard.press('Enter');

  await expect(page.getByText('Added a note. Want an image next?')).toBeVisible();

  await expect.poll(() => page.evaluate(() => (window as any).__mbEditor.getCurrentPageShapes().length)).toBe(1);
  const projectId = new URL(page.url()).hash.split('/').at(-1)!;
  const { boards } = await (await request.get(`${API}/api/projects/${projectId}`)).json();
  const board = await (await request.get(`${API}/api/boards/${boards[0].id}`)).json();
  expect(board.blocks).toHaveLength(1);
  expect(board.blocks[0]).toMatchObject({ type: 'text', name: 'Notes' });
});

test('Regenerate and More like this add new images next to a selected image and keep the original', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page.getByPlaceholder('Ask Mixboard…')).toBeVisible();
  const projectId = new URL(page.url()).hash.split('/').at(-1)!;
  const { boards } = await (await request.get(`${API}/api/projects/${projectId}`)).json();
  const boardId = boards[0].id;

  // Put the Earth image (a 128 px copy from the user's standard test image set) on the board, then reload so the canvas shows it.
  const source = await (await request.post(`${API}/api/boards/${boardId}/blocks`, { data: { type: 'image', name: 'Earth', rect: { x: 0, y: 0, w: 250, h: 256 } } })).json();
  const png = readFileSync(fileURLToPath(new URL('./fixtures/earth.png', import.meta.url)));
  const uploaded = await (await request.put(`${API}/api/blocks/${source.id}/image`, { headers: { 'content-type': 'image/png' }, data: png })).json();
  const sourceResourceId = uploaded.resources[0].id;
  await page.reload();
  const shapeCount = () => page.evaluate(() => (window as any).__mbEditor?.getCurrentPageShapes().length ?? 0);
  const blocks = async () => (await (await request.get(`${API}/api/boards/${boardId}`)).json()).blocks as { id: string; name: string; status: string; rect: unknown; resources: { id: string }[] }[];
  const selectSource = () => page.evaluate((id) => { (window as any).__mbEditor.select(`shape:${id}`); }, source.id);
  await expect.poll(shapeCount).toBe(1);

  await selectSource();
  await page.getByRole('button', { name: /More like this/ }).click();
  await expect.poll(shapeCount).toBe(4);
  await expect.poll(async () => (await blocks()).filter((b) => b.status === 'ready').map((b) => b.name).sort()).toEqual([
    'Earth', 'Earth From Space Variant 1', 'Earth From Space Variant 2', 'Earth From Space Variant 3',
  ]);

  // Lineage (D5): holding L on the canvas shows one arrow per variant; releasing hides them.
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); });
  await page.keyboard.down('l');
  await expect(page.getByTestId('lineage-arrows').locator('line')).toHaveCount(3);
  await page.keyboard.up('l');
  await expect(page.getByTestId('lineage-arrows')).toHaveCount(0);
  // The Inspector names the source of a variant.
  const variantId = (await blocks()).find((b) => b.name === 'Earth From Space Variant 1')!.id;
  await page.evaluate((id) => { (window as any).__mbEditor.select(`shape:${id}`); }, variantId);
  await page.getByRole('button', { name: 'Inspector' }).click();
  await expect(page.getByText('Variant of')).toBeVisible();

  await selectSource();
  await page.getByRole('button', { name: /Regenerate/ }).click();
  await expect.poll(shapeCount).toBe(5);
  await expect.poll(async () => (await blocks()).find((b) => b.name === '')?.status).toBe('ready');
  // Cropping is on by default: the new block has the source's size, offset by (40, 40).
  expect((await blocks()).find((b) => b.name === '')!.rect).toEqual({ x: 40, y: 40, w: 250, h: 256 });
  expect((await blocks()).find((b) => b.id === source.id)).toMatchObject({ status: 'ready', resources: [{ id: sourceResourceId }] });
});

test('the main menu leads back to the project list', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page.getByPlaceholder('Ask Mixboard…')).toBeVisible();
  await page.getByTestId('main-menu.button').click();
  await page.getByRole('menuitem', { name: 'All projects' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible();
});

test('a failed image shows a notice sized to its block, and Try again fills the same block', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page.getByPlaceholder('Ask Mixboard…')).toBeVisible();
  const projectId = new URL(page.url()).hash.split('/').at(-1)!;
  const { boards } = await (await request.get(`${API}/api/projects/${projectId}`)).json();
  const boardUrl = `${API}/api/boards/${boards[0].id}`;
  const failed = await (await request.post(`${boardUrl}/blocks`, {
    data: { type: 'image', name: 'Broken', status: 'error', prompt: 'a small planet', aspectRatio: '4:3', rect: { x: 0, y: 0, w: 400, h: 300 } },
  })).json();
  await page.reload();
  const shape = page.locator('.tl-shape').filter({ hasText: 'Generation failed' });
  const button = shape.getByRole('button', { name: 'Try again' });
  await expect(button).toBeVisible();
  for (const z of [0.5, 1.5]) {
    await page.evaluate((zoom) => { (window as any).__mbEditor.setCamera({ x: 0, y: 0, z: zoom }); }, z);
    const box = (await shape.boundingBox())!;
    const text = (await shape.getByTestId('failure-text').boundingBox())!;
    const btn = (await button.boundingBox())!;
    // The notice is sized from its block, so it scales with zoom: the text reaches almost to the edges, and nothing spills out.
    expect(text.width / box.width).toBeGreaterThan(0.8);
    expect(text.width / box.width).toBeLessThan(1);
    expect(btn.y).toBeGreaterThan(text.y + text.height - 1); // on its own line, below the text
    expect(btn.x + btn.width).toBeLessThanOrEqual(box.x + box.width);
    expect(btn.y + btn.height).toBeLessThanOrEqual(box.y + box.height);
  }

  await button.click();
  await expect.poll(async () => (await (await request.get(boardUrl)).json()).blocks.map((b: { id: string; status: string }) => [b.id, b.status]))
    .toEqual([[failed.id, 'ready']]);
});

test('the Puns switch defaults to off and persists across reloads', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  const puns = page.getByRole('switch', { name: 'Puns' });
  await expect(puns).toHaveAttribute('aria-checked', 'false');
  await puns.click();
  await expect(puns).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('switch', { name: 'Puns' })).toHaveAttribute('aria-checked', 'true');
});
