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

export const Settings = z.object({ puns: z.boolean(), models: Models });
export type Settings = z.infer<typeof Settings>;

export const SettingsPatch = z.object({ puns: z.boolean().optional(), models: Models.partial().optional() });
export type SettingsPatch = z.infer<typeof SettingsPatch>;
