import { BaseBoxShapeUtil, HTMLContainer, T, type RecordProps, type TLShape } from 'tldraw';
import { blockIdFromShapeId } from './mapping';

// tldraw 4.3 requires custom shapes to be registered on this map so BaseBoxShapeUtil accepts them.
declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'mb-image': { w: number; h: number; src: string; title: string; status: 'generating' | 'ready' | 'error' };
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
  };

  /**
   * Default props for a new image shape.
   * Precondition: none.
   * Postcondition: returns a 360x360 shape in the `generating` state.
   */
  getDefaultProps(): MbImageShape['props'] {
    return { w: 360, h: 360, src: '', title: '', status: 'generating' };
  }

  /**
   * Renders the block: the image (title on hover), a "Creating image..." placeholder, or an error state with a Regenerate button.
   * Precondition: `shape.props.status` is one of the three states.
   * Postcondition: returns the shape's DOM. The Regenerate button dispatches `mb:regenerate` on `window` with the block id and name; it does not start a run itself.
   */
  component(shape: MbImageShape) {
    const { w, h, src, title, status } = shape.props;
    return (
      <HTMLContainer style={{ width: w, height: h, pointerEvents: 'all', overflow: 'hidden', borderRadius: 8, background: '#e9e7e2', display: 'grid', placeItems: 'center' }}>
        {status === 'ready' && src ? (
          <img src={src} alt={title} title={title} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : status === 'error' ? (
          <div style={{ textAlign: 'center', color: '#8a1f1f', padding: 12 }}>
            <div>Generation failed</div>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => window.dispatchEvent(new CustomEvent('mb:regenerate', { detail: { blockId: (shape.meta.blockId as string | undefined) ?? blockIdFromShapeId(shape.id), name: title } }))}
            >
              Regenerate
            </button>
          </div>
        ) : (
          <div style={{ color: '#666' }}>Creating image...</div>
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
