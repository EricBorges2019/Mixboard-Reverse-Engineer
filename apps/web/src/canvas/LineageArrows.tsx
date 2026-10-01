import { createContext, useContext, useEffect, useState } from 'react';
import { useEditor, useValue } from 'tldraw';
import { arrowBetween, isHoldKey, isTypingTarget, type LineageEdge } from './lineage';
import { shapeIdFor } from './mapping';

/** What the arrows need from the board: which pairs to connect, and the two lineage settings (D5). */
export interface LineageOptions {
  edges: LineageEdge[];
  always: boolean;
  fade: boolean;
}

export const LineageContext = createContext<LineageOptions>({ edges: [], always: false, fade: true });

const FADE_MS = 150;
const NO_SEGMENTS: never[] = [];

/**
 * Arrows from each image to the images made from it, drawn under the images (D5).
 * Precondition: rendered inside <Tldraw> as the OnTheCanvas component (which lives in the camera-transformed page layer, before the shapes) under a LineageContext provider.
 * Postcondition: with `always` on the arrows always show; otherwise they show only while L is held (not while typing or editing a text block, and released when the window loses focus). With `fade` they ease in and out over 150 ms, otherwise they appear and vanish at once. While hidden nothing is rendered or computed. While shown, arrow geometry is recomputed only when a connected image moves or resizes or the edges change; panning and zooming move the page layer and cost no re-render.
 */
export function LineageArrows() {
  const editor = useEditor();
  const { edges, always, fade } = useContext(LineageContext);
  const held = useHoldKey(!always);
  const wanted = always || held;
  const [mounted, setMounted] = useState(wanted);
  const [opaque, setOpaque] = useState(wanted);

  useEffect(() => {
    if (!fade) {
      setMounted(wanted);
      setOpaque(wanted);
      return;
    }
    if (wanted) {
      setMounted(true);
      // Paint once at opacity 0 before turning opaque, so the transition has a start state.
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setOpaque(true)));
      return () => cancelAnimationFrame(frame);
    }
    setOpaque(false);
    const timer = setTimeout(() => setMounted(false), FADE_MS);
    return () => clearTimeout(timer);
  }, [wanted, fade]);

  // Reading page bounds inside useValue subscribes to exactly those shapes, so only their changes recompute this.
  const segments = useValue('mb lineage arrows', () => {
    if (!mounted) return NO_SEGMENTS;
    return edges.flatMap(({ from, to }) => {
      const a = editor.getShapePageBounds(shapeIdFor(from) as never);
      const b = editor.getShapePageBounds(shapeIdFor(to) as never);
      const seg = a && b ? arrowBetween(a, b) : null;
      return seg ? [{ key: `${from}>${to}`, ...seg }] : [];
    });
  }, [editor, edges, mounted]);

  if (!mounted) return null;
  return (
    <svg
      className="mb-lineage"
      data-testid="lineage-arrows"
      style={{
        position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', pointerEvents: 'none', zIndex: -1,
        opacity: opaque ? 1 : 0, transition: fade ? `opacity ${FADE_MS}ms ease` : 'none',
      }}
    >
      <defs>
        <marker id="mb-lineage-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="#8a8578" />
        </marker>
      </defs>
      {segments.map(({ key, x1, y1, x2, y2 }) => (
        <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#8a8578" strokeOpacity={0.75} strokeWidth={4} markerEnd="url(#mb-lineage-head)" />
      ))}
    </svg>
  );
}

/**
 * Tracks whether the lineage key is held.
 * Precondition: none.
 * Postcondition: returns true between a plain L keydown (outside text fields and text editing) and its keyup or a window blur; always false while `enabled` is false. Listens in the capture phase so tldraw's own handlers cannot swallow the key.
 */
function useHoldKey(enabled: boolean): boolean {
  const editor = useEditor();
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setHeld(false);
      return;
    }
    /**
     * Starts showing on a plain L.
     * Precondition: none.
     * Postcondition: `held` is true unless the user is typing or editing a text block.
     */
    function down(e: KeyboardEvent): void {
      if (isHoldKey(e) && !isTypingTarget(e.target) && !editor.getEditingShapeId()) setHeld(true);
    }
    /**
     * Stops showing when L is released, whatever modifiers are down by then.
     * Precondition: none.
     * Postcondition: `held` is false after an L keyup.
     */
    function up(e: KeyboardEvent): void {
      if (e.key.toLowerCase() === 'l') setHeld(false);
    }
    /**
     * Stops showing when the window loses focus, since the keyup would never arrive.
     * Precondition: none.
     * Postcondition: `held` is false.
     */
    function release(): void {
      setHeld(false);
    }
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', release);
    };
  }, [editor, enabled]);
  return held;
}
