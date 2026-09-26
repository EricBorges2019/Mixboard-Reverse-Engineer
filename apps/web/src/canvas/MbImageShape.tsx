import { useContext, useLayoutEffect, useRef, useState } from 'react';
import { BaseBoxShapeUtil, HTMLContainer, T, type RecordProps, type TLShape } from 'tldraw';
import { imageShapeTarget } from './imageActions';
import { ImageActionContext } from './ImageToolbar';

// tldraw 4.3 requires custom shapes to be registered on this map so BaseBoxShapeUtil accepts them.
declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'mb-image': { w: number; h: number; src: string; title: string; status: 'generating' | 'ready' | 'error'; retryable: boolean };
  }
}

export type MbImageShape = TLShape<'mb-image'>;

export class MbImageShapeUtil extends BaseBoxShapeUtil<MbImageShape> {
  static override type = 'mb-image' as const;
  static override props: RecordProps<MbImageShape> = {
    w: T.number,
    h: T.number,
    src: T.string,
    title: T.string,
    status: T.literalEnum('generating', 'ready', 'error'),
    retryable: T.boolean,
  };

  /**
   * Default props for a new image shape.
   * Precondition: none.
   * Postcondition: returns a 360x360 shape in the `generating` state.
   */
  getDefaultProps(): MbImageShape['props'] {
    return { w: 360, h: 360, src: '', title: '', status: 'generating', retryable: false };
  }

  /**
   * Renders the block: the image (title on hover), a "Creating image..." placeholder, or the failure notice.
   * Precondition: `shape.props.status` is one of the three states.
   * Postcondition: returns the shape's DOM. The container is a CSS size container, so the placeholder and failure text are sized relative to the block and scale with it (and so with zoom).
   */
  component(shape: MbImageShape) {
    const { w, h, src, title, status } = shape.props;
    return (
      <HTMLContainer style={{ width: w, height: h, pointerEvents: 'all', overflow: 'hidden', borderRadius: 8, background: '#e9e7e2', display: 'grid', placeItems: 'center', containerType: 'size' }}>
        {status === 'ready' && src ? (
          <img src={src} alt={title} title={title} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : status === 'error' ? (
          <FailureNotice shape={shape} />
        ) : (
          // "Creating image..." is about 6.8em wide in the UI font: 13cqw spans ~90% of the block; 40cqh caps it on short blocks.
          <div style={{ color: '#666', fontSize: 'min(13cqw, 40cqh)', whiteSpace: 'nowrap' }}>Creating image...</div>
        )}
      </HTMLContainer>
    );
  }

  /**
   * Selection outline.
   * Precondition: none.
   * Postcondition: returns a rounded rect matching the shape's size.
   */
  indicator(shape: MbImageShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />;
  }
}

const FAILURE_TEXT = 'Generation failed';
/** Width of FAILURE_TEXT in em, by font family, so each family is measured once. */
const failureTextEm = new Map<string, number>();

/**
 * Measures FAILURE_TEXT in a font family, since the UI font varies by platform (system-ui is much wider on Linux than on macOS).
 * Precondition: `fontFamily` is a CSS font-family value.
 * Postcondition: returns the text's width in em; falls back to 7.2 (macOS's system font) when canvas text measurement is unavailable, as in jsdom.
 */
function measureFailureTextEm(fontFamily: string): number {
  const cached = failureTextEm.get(fontFamily);
  if (cached !== undefined) return cached;
  let em = 7.2;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      ctx.font = `100px ${fontFamily}`;
      const width = ctx.measureText(FAILURE_TEXT).width;
      if (width > 0) em = width / 100;
    }
  } catch {
    // Keep the fallback.
  }
  failureTextEm.set(fontFamily, em);
  return em;
}

/**
 * The notice on a failed image: "Generation failed" and, when there is something to replay, a Try again button.
 * Precondition: rendered inside the shape's size container, under an ImageActionContext provider.
 * Postcondition: text and button are sized from the block (the text spans ~90% of the width in whatever font the platform uses, bounded by the height), so they stay proportional at any block size and zoom. Try again starts the `retry` action for this block, which regenerates it in place.
 */
function FailureNotice({ shape }: { shape: MbImageShape }) {
  const runAction = useContext(ImageActionContext);
  const target = imageShapeTarget(shape, 'error')!;
  const ref = useRef<HTMLDivElement>(null);
  const [textEm, setTextEm] = useState(7.2);
  useLayoutEffect(() => {
    if (ref.current) setTextEm(measureFailureTextEm(getComputedStyle(ref.current).fontFamily));
  }, []);
  return (
    // 90cqw / textEm makes the text span ~90% of the block; 26cqh keeps text and button inside short blocks.
    <div ref={ref} style={{ textAlign: 'center', color: '#8a1f1f', fontSize: `min(${(90 / textEm).toFixed(2)}cqw, 26cqh)`, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
      <div data-testid="failure-text" style={{ width: 'fit-content', margin: '0 auto' }}>{FAILURE_TEXT}</div>
      {shape.props.retryable && (
        <button
          style={{ font: 'inherit', marginTop: '0.3em', padding: '0.15em 0.6em', borderRadius: '0.3em' }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => runAction('retry', target)}
        >
          Try again
        </button>
      )}
    </div>
  );
}
