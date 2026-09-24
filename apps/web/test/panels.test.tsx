// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { Block, Settings } from '@mixboard/shared';
import { Inspector } from '../src/panels/Inspector';
import { SettingsPanel } from '../src/panels/SettingsPanel';

const block = (caption: Block['resources'][number]['caption']): Block => ({
  id: 'b1', projectId: 'p', boardId: 'bd', type: 'image', name: 'Dragon', rect: { x: 0, y: 0, w: 10, h: 10 }, zIndex: 1,
  prompt: null, aspectRatio: null, status: 'ready', createdAt: '', updatedAt: '',
  resources: [{ id: 'r1', blockId: 'b1', kind: 'image', mimeType: 'image/png', caption, content: null }],
});

describe('Inspector', () => {
  it('shows a hint when no single image is selected', () => {
    render(<Inspector block={null} onSave={async () => {}} />);
    expect(screen.getByText(/Select an image/)).toBeTruthy();
  });
  it('lets the user edit and save the caption (D1)', async () => {
    const onSave = vi.fn(async () => {});
    render(<Inspector block={block({ title: 'Dragon Scholar', description: 'A dragon.', userEdited: false })} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My Dragon' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Mine.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save caption' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('r1', { title: 'My Dragon', description: 'Mine.' }));
  });
  it('explains that a missing caption is still being generated', () => {
    render(<Inspector block={block(null)} onSave={async () => {}} />);
    expect(screen.getByText(/generated in the background/)).toBeTruthy();
  });
});

describe('SettingsPanel', () => {
  const settings: Settings = { puns: false, models: { agent: 'a', caption: 'c', tagline: 't', image: 'i' } };
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
