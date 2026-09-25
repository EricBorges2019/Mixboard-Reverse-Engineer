// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { Block, Settings } from '@mixboard/shared';
import { Inspector } from '../src/panels/Inspector';
import { SettingsPanel } from '../src/panels/SettingsPanel';

const block = (caption: Block['resources'][number]['caption']): Block => ({
  id: 'b1', projectId: 'p', boardId: 'bd', type: 'image', name: 'Dragon', rect: { x: 0, y: 0, w: 10, h: 10 }, zIndex: 1,
  prompt: null, aspectRatio: null, status: 'ready', origin: null, createdAt: '', updatedAt: '',
  resources: [{ id: 'r1', blockId: 'b1', kind: 'image', mimeType: 'image/png', caption, content: null }],
});

describe('Inspector', () => {
  it('shows a hint when no single image is selected', () => {
    render(<Inspector block={null} blocks={[]} onSave={async () => {}} onFocusBlock={() => {}} />);
    expect(screen.getByText(/Select an image/)).toBeTruthy();
  });
  it('lets the user edit and save the caption (D1)', async () => {
    const onSave = vi.fn(async () => {});
    render(<Inspector block={block({ title: 'Dragon Scholar', description: 'A dragon.', userEdited: false })} blocks={[]} onSave={onSave} onFocusBlock={() => {}} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My Dragon' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Mine.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save caption' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('r1', { title: 'My Dragon', description: 'Mine.' }));
  });
  it('explains that a missing caption is still being generated', () => {
    render(<Inspector block={block(null)} blocks={[]} onSave={async () => {}} onFocusBlock={() => {}} />);
    expect(screen.getByText(/generated in the background/)).toBeTruthy();
  });
  it('shows what the image was made from, with chips that focus the source', () => {
    const source = { ...block({ title: 'Earth and Moon', description: '', userEdited: false }), id: 'src', name: 'Earth.png' };
    const derived = { ...block(null), id: 'd1', name: '', origin: { action: 'regenerate' as const, sourceBlockIds: ['src', 'gone'] } };
    const onFocusBlock = vi.fn();
    render(<Inspector block={derived} blocks={[source, derived]} onSave={async () => {}} onFocusBlock={onFocusBlock} />);
    expect(screen.getByText('Regenerated from')).toBeTruthy();
    expect(screen.getByText('a deleted image')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Earth and Moon' }));
    expect(onFocusBlock).toHaveBeenCalledWith('src');
  });
  it('lists images made from this one, grouped by how they were made', () => {
    const source = { ...block(null), id: 'src', name: 'Earth.png' };
    const variant = (id: string, name: string) => ({ ...block(null), id, name, origin: { action: 'more-like-this' as const, sourceBlockIds: ['src'] } });
    const regen = { ...block({ title: 'Planet in Space', description: '', userEdited: false }), id: 'r', name: '', origin: { action: 'regenerate' as const, sourceBlockIds: ['src'] } };
    render(<Inspector block={source} blocks={[source, variant('v1', 'Earth Variant 1'), variant('v2', 'Earth Variant 2'), regen]} onSave={async () => {}} onFocusBlock={() => {}} />);
    expect(screen.getByText('Variants').parentElement!.textContent).toContain('Earth Variant 1Earth Variant 2');
    expect(screen.getByText('Regenerated as').parentElement!.textContent).toContain('Planet in Space');
  });
});

describe('SettingsPanel', () => {
  const settings: Settings = { puns: false, cropRegenerated: true, showLineage: false, lineageFade: true, models: { agent: 'a', caption: 'c', tagline: 't', image: 'i' } };
  it('toggles the two lineage arrow settings', () => {
    const update = vi.fn(async () => {});
    render(<SettingsPanel settings={settings} update={update} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Show lineage at all times' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Fade lineage arrows' }));
    expect(update.mock.calls).toEqual([[{ showLineage: true }], [{ lineageFade: false }]]);
  });
  it('toggles cropping of regenerated images', () => {
    const update = vi.fn(async () => {});
    render(<SettingsPanel settings={settings} update={update} />);
    const sw = screen.getByRole('switch', { name: 'Crop regenerated images' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    expect(update).toHaveBeenCalledWith({ cropRegenerated: false });
  });
  it('toggles puns', () => {
    const update = vi.fn(async () => {});
    render(<SettingsPanel settings={settings} update={update} />);
    const sw = screen.getByRole('switch', { name: 'Puns' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(update).toHaveBeenCalledWith({ puns: true });
  });
  it('saves edited model ids', () => {
    const update = vi.fn(async () => {});
    render(<SettingsPanel settings={settings} update={update} />);
    fireEvent.change(screen.getByLabelText('Image model'), { target: { value: 'openai/gpt-image-2.5-flare' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save models' }));
    expect(update).toHaveBeenCalledWith({ models: { agent: 'a', caption: 'c', tagline: 't', image: 'openai/gpt-image-2.5-flare' } });
  });
});
