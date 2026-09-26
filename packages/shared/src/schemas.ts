import { z } from 'zod';

export const AspectRatio = z.enum(['1:1', '4:3', '3:4', '16:9', '9:16']);
export type AspectRatio = z.infer<typeof AspectRatio>;

/** Initial block sizes per ratio. 3:4 is inferred; SPEC.md did not capture it. */
export const ASPECT_SIZES: Record<AspectRatio, { w: number; h: number }> = {
  '1:1': { w: 360, h: 360 },
  '4:3': { w: 450, h: 300 },
  '3:4': { w: 300, h: 450 },
  '16:9': { w: 640, h: 360 },
  '9:16': { w: 360, h: 640 },
};

export const Rect = z.object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() });
export type Rect = z.infer<typeof Rect>;

export const Caption = z.object({ title: z.string(), description: z.string(), userEdited: z.boolean() });
export type Caption = z.infer<typeof Caption>;

export const Resource = z.object({
  id: z.string(),
  blockId: z.string(),
  kind: z.enum(['image', 'text']),
  mimeType: z.string(),
  caption: Caption.nullable(),
  content: z.unknown().nullable(),
});
export type Resource = z.infer<typeof Resource>;

export const BlockStatus = z.enum(['generating', 'ready', 'error']);
export type BlockStatus = z.infer<typeof BlockStatus>;

/**
 * Where an image block came from (D5, a clone addition): the action that made it and the blocks it was made from.
 * `edit` covers the agent's update_image_block; `reference` covers create_image_block with source images.
 */
export const OriginAction = z.enum(['regenerate', 'more-like-this', 'edit', 'reference', 'remove-background']);
export type OriginAction = z.infer<typeof OriginAction>;
export const Origin = z.object({ action: OriginAction, sourceBlockIds: z.array(z.string()).min(1) });
export type Origin = z.infer<typeof Origin>;

export const Block = z.object({
  id: z.string(),
  projectId: z.string(),
  boardId: z.string(),
  type: z.enum(['text', 'image']),
  name: z.string(),
  rect: Rect,
  zIndex: z.number().int(),
  prompt: z.string().nullable(),
  aspectRatio: AspectRatio.nullable(),
  status: BlockStatus,
  /** Null for uploads, text blocks and images generated from a prompt alone. */
  origin: Origin.nullable(),
  resources: z.array(Resource),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Block = z.infer<typeof Block>;

export const NewBlock = z.object({
  type: z.enum(['text', 'image']),
  name: z.string().default(''),
  rect: Rect,
  prompt: z.string().nullable().default(null),
  aspectRatio: AspectRatio.nullable().default(null),
  status: BlockStatus.default('ready'),
  origin: Origin.nullable().default(null),
  zIndex: z.number().int().optional(),
});
export type NewBlockInput = z.input<typeof NewBlock>;

export const BlockPatch = z.object({ name: z.string().optional(), rect: Rect.optional(), zIndex: z.number().int().optional() }).strict();
export type BlockPatch = z.infer<typeof BlockPatch>;

export const Viewport = z.object({ x: z.number(), y: z.number(), zoom: z.number().positive() });
export type Viewport = z.infer<typeof Viewport>;

export const Board = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  viewport: Viewport,
  blocks: z.array(Block),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Board = z.infer<typeof Board>;

export const Project = z.object({
  id: z.string(),
  title: z.string(),
  thumbnailResourceId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof Project>;

export const StyleArtifact = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  content: z.string(),
  hasPreview: z.boolean(),
  createdAt: z.string(),
});
export type StyleArtifact = z.infer<typeof StyleArtifact>;

export const Models = z.object({ agent: z.string(), caption: z.string(), tagline: z.string(), image: z.string() });
export type Models = z.infer<typeof Models>;

/** The on/off settings: taglines (D2), cropping Regenerate's square image to the source's shape (D4), and lineage arrows (D5). */
export const SETTING_FLAGS = ['puns', 'cropRegenerated', 'showLineage', 'lineageFade'] as const;
export type SettingFlag = (typeof SETTING_FLAGS)[number];

/** Placeholder the server sends back in place of a real, already-set API key; the client must never re-submit it as a value. */
export const API_KEY_MASK = '••••••••';

export const Settings = z.object({
  puns: z.boolean(),
  cropRegenerated: z.boolean(),
  showLineage: z.boolean(),
  lineageFade: z.boolean(),
  /** The provider API key. Null when unset (falls back to the server's env var, if any). */
  apiKey: z.string().nullable(),
  /** The chat-completions-style API root (OpenRouter, OpenAI, an OpenAI-compatible localhost server, etc). */
  baseUrl: z.string(),
  models: Models,
});
export type Settings = z.infer<typeof Settings>;

export const SettingsPatch = Settings.omit({ models: true }).partial().extend({ models: Models.partial().optional() });
export type SettingsPatch = z.infer<typeof SettingsPatch>;
