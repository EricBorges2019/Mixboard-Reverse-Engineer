import ReactMarkdown from 'react-markdown';
import { refsToLinks } from './refs';

/**
 * Renders an assistant reply as Markdown, turning block references into clickable chips.
 * Precondition: none.
 * Postcondition: `[[id:..|name:..]]` become buttons that call `onRefClick(blockId)`; ordinary links open in a new tab.
 */
export function Markdown({ text, onRefClick }: { text: string; onRefClick(blockId: string): void }) {
  return (
    <ReactMarkdown
      urlTransform={(url) => url}
      components={{
        /**
         * Renders links: `block:` links as chips, others as external links.
         * Precondition: `href` may be undefined.
         * Postcondition: returns a chip button or an anchor.
         */
        a({ href, children }) {
          return href?.startsWith('block:') ? (
            <button type="button" className="chip" onClick={() => onRefClick(href.slice('block:'.length))}>{children}</button>
          ) : (
            <a href={href} target="_blank" rel="noreferrer">{children}</a>
          );
        },
      }}
    >
      {refsToLinks(text)}
    </ReactMarkdown>
  );
}
