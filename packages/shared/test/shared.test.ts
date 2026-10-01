import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  AgentEvent, AgentRunRequest, ASPECT_SIZES, NewBlock, blockRef, docToPlainText,
  nearestRatio, nearestRatioForSize, plainTextToDoc, splitBlockRefs, unwrapTextContent, wrapTextContent,
} from '../src/index';

describe('aspect', () => {
  it('returns the target when supported', () => {
    expect(nearestRatio('16:9', ['1:1', '16:9'])).toBe('16:9');
  });
  it('falls back to the numerically closest ratio', () => {
    expect(nearestRatio('4:3', ['1:1', '16:9'])).toBe('1:1');
    expect(nearestRatio('3:4', ['1:1', '9:16'])).toBe('1:1');
  });
  it('picks the supported ratio closest to a pixel size', () => {
    expect(nearestRatioForSize(367, 500, ['1:1', '4:3', '3:4', '16:9', '9:16'])).toBe('3:4');
    expect(nearestRatioForSize(1920, 1080, ['1:1', '4:3', '3:4', '16:9', '9:16'])).toBe('16:9');
    expect(nearestRatioForSize(367, 500, ['1:1', '16:9'])).toBe('1:1');
  });
  it('has a size for every ratio', () => {
    expect(ASPECT_SIZES['4:3']).toEqual({ w: 450, h: 300 });
  });
});

describe('richtext', () => {
  it('round-trips plain text through a doc', () => {
    const doc = plainTextToDoc('one\n\ntwo');
    expect(doc.content).toHaveLength(3);
    expect(docToPlainText(doc)).toBe('one\n\ntwo');
  });
  it('reads bare and wrapped content, writes wrapped', () => {
    const doc = plainTextToDoc('hi');
    const wrapped = wrapTextContent(doc);
    expect(wrapped).toEqual({ richText: doc, scale: 1, autoSize: false });
    expect(unwrapTextContent(wrapped)).toEqual(doc);
    expect(unwrapTextContent(doc)).toEqual(doc);
    expect(unwrapTextContent({ nope: 1 })).toBeNull();
  });
});

describe('block refs', () => {
  it('formats and splits references', () => {
    expect(blockRef('abc', 'Dragon Elder')).toBe('[[id:abc|name:Dragon Elder]]');
    expect(splitBlockRefs('Made [[id:abc|name:Dragon Elder]] and [[id:d|name:X]]. Next?')).toEqual([
      { type: 'text', text: 'Made ' },
      { type: 'ref', id: 'abc', name: 'Dragon Elder' },
      { type: 'text', text: ' and ' },
      { type: 'ref', id: 'd', name: 'X' },
      { type: 'text', text: '. Next?' },
    ]);
  });
});

describe('schemas', () => {
  it('applies NewBlock defaults', () => {
    const b = NewBlock.parse({ type: 'text', rect: { x: 0, y: 0, w: 10, h: 10 } });
    expect(b).toMatchObject({ name: '', prompt: null, aspectRatio: null, status: 'ready' });
  });
  it('rejects blank chat messages', () => {
    expect(AgentRunRequest.safeParse({ projectId: 'p', boardId: 'b', message: '   ' }).success).toBe(false);
  });
  it('parses stream events by type and can emit JSON schema', () => {
    expect(AgentEvent.parse({ type: 'text', text: 'hi' })).toEqual({ type: 'text', text: 'hi' });
    expect(() => AgentEvent.parse({ type: 'nope' })).toThrow();
    expect(z.toJSONSchema(z.object({ a: z.string() })).type).toBe('object');
  });
});
