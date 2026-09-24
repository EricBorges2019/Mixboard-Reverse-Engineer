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
