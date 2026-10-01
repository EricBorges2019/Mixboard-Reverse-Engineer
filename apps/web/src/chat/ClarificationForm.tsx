import { useState } from 'react';
import type { ClarificationQuestion } from '@mixboard/shared';

/**
 * Formats the user's picks as the single message the agent expects.
 * Precondition: `picked[i]` holds the choices for `questions[i]`.
 * Postcondition: returns choices joined by `, ` within a question and questions joined by `; `; questions with no picks are omitted.
 */
export function formatAnswers(questions: ClarificationQuestion[], picked: string[][]): string {
  return questions.map((_, i) => picked[i]?.join(', ') ?? '').filter(Boolean).join('; ');
}

/**
 * Multiple-choice form for the agent's clarification questions.
 * Precondition: `questions` each have suggestions; `disabled` is true once the user has replied.
 * Postcondition: renders one toggle button per suggestion; `Send` (enabled when at least one pick exists) calls `onSubmit` with the formatted answer.
 */
export function ClarificationForm({ questions, disabled = false, onSubmit }: { questions: ClarificationQuestion[]; disabled?: boolean; onSubmit(message: string): void }) {
  const [picked, setPicked] = useState<string[][]>(() => questions.map(() => []));
  /**
   * Toggles one suggestion.
   * Precondition: `q` is a valid question index.
   * Postcondition: the suggestion is added to or removed from that question's picks.
   */
  function toggle(q: number, option: string): void {
    setPicked((prev) => prev.map((list, i) => (i !== q ? list : list.includes(option) ? list.filter((o) => o !== option) : [...list, option])));
  }
  const message = formatAnswers(questions, picked);
  return (
    <form className="clarification" onSubmit={(e) => { e.preventDefault(); onSubmit(message); }}>
      {questions.map((q, qi) => (
        <fieldset key={q.question} disabled={disabled}>
          <legend>{q.question}</legend>
          {q.suggestions.map((s) => (
            <button type="button" key={s} className="suggestion" aria-pressed={picked[qi].includes(s)} disabled={disabled} onClick={() => toggle(qi, s)}>{s}</button>
          ))}
        </fieldset>
      ))}
      <button type="submit" disabled={disabled || !message}>Send</button>
    </form>
  );
}
