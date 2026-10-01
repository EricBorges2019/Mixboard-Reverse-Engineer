// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ClarificationForm, formatAnswers } from '../src/chat/ClarificationForm';

const questions = [
  { question: 'Focus?', suggestions: ['Portraits', 'Towns', 'Maps', 'Ships'] },
  { question: 'Style?', suggestions: ['Oil', 'Concept art', 'Anime', 'Ink'] },
];

describe('formatAnswers', () => {
  it('joins picks with commas and questions with semicolons, like the original', () => {
    expect(formatAnswers(questions, [['Portraits', 'Towns'], ['Oil']])).toBe('Portraits, Towns; Oil');
  });
  it('skips questions without picks', () => {
    expect(formatAnswers(questions, [[], ['Oil']])).toBe('Oil');
  });
});

describe('ClarificationForm', () => {
  it('sends the picks as one message', () => {
    const onSubmit = vi.fn();
    render(<ClarificationForm questions={questions} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Portraits' }));
    fireEvent.click(screen.getByRole('button', { name: 'Towns' }));
    fireEvent.click(screen.getByRole('button', { name: 'Oil' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).toHaveBeenCalledWith('Portraits, Towns; Oil');
  });
  it('disables Send until something is picked and lets a pick be undone', () => {
    render(<ClarificationForm questions={questions} onSubmit={() => {}} />);
    const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    const pick = screen.getByRole('button', { name: 'Maps' });
    fireEvent.click(pick);
    expect(pick.getAttribute('aria-pressed')).toBe('true');
    expect(send.disabled).toBe(false);
    fireEvent.click(pick);
    expect(send.disabled).toBe(true);
  });
  it('is inert once answered', () => {
    render(<ClarificationForm questions={questions} disabled onSubmit={() => {}} />);
    expect((screen.getByRole('button', { name: 'Maps' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
