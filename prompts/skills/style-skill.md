## Overview

**Style Extraction & Preservation**: Analyze reference images and create
reusable stylistic parameters for consistent re-generation. This skill uses
structured extraction to produce high-fidelity style descriptions that separate
visual treatment from subject matter.

## Structured Extraction Schema

When extracting a style from one or more reference images, you MUST produce a
markdown description covering these canonical fields:

*   **Color Palette**: Dominant colors, accent colors, saturation level, color
    temperature (warm/cool)
*   **Lighting**: Direction, intensity, contrast, shadow character (hard/soft),
    highlights
*   **Texture**: Surface quality (smooth/rough/grainy), noise level, brush
    stroke style, material feel
*   **Composition Style**: Layout tendencies, perspective, depth of field,
    framing conventions
*   **Rendering Technique**: Medium (oil paint, watercolor, digital, photo),
    level of abstraction, line work
*   **Mood**: Emotional tone, atmosphere, energy level

> **CRITICAL**: Do NOT include subject-specific descriptions in style extraction
> — describe the visual treatment, not what's depicted. A style description
> should be applicable to ANY subject.

### Good vs Bad Extraction

**Bad** (contains subject leakage):

> "A majestic wolf standing on a snow-covered mountain with northern lights,
> painted in deep blues and purples with glowing highlights."

**Good** (pure visual treatment):

> "**Color Palette**: Deep blues (#1a237e), purples (#4a148c), with electric
> cyan accent highlights. Cool temperature, high saturation. **Lighting**:
> Overhead ambient glow with strong rim lighting from behind the subject. Soft
> shadows, high-contrast highlights. **Texture**: Smooth digital painting with
> soft blending, no visible brush strokes. Slight glow/bloom on bright areas.
> **Rendering Technique**: Digital illustration, semi-realistic, painterly with
> soft edges. **Mood**: Mystical, serene, ethereal."

## Multi-Image Extraction

When multiple reference images are selected, extract the COMMON visual style
shared across all images. Focus on consistent patterns:

*   Shared color palette and temperature
*   Consistent lighting direction and contrast
*   Common texture treatment and rendering technique
*   Ignore elements unique to a single image

> [!IMPORTANT]
>
> **Strict Synthesis Rule**: When extracting style from multiple images, you
> MUST NOT simply list unique features from individual images. You must find the
> artistic "intersection" of their styles. For example, if Image A is a heavily
> textured impasto oil painting and Image B is a grainy vintage photograph,
> synthesize their shared qualities (e.g., "highly tactile, coarse surface
> textures with visible grain and physical depth") rather than picking one
> medium over the other.
>
> **Common Denominator Principle**: If a style field (like Composition Style or
> Color Palette) differs completely across the seed images, write a unified
> general directive (e.g., "balanced color schema with high contrast, avoiding
> dominant hues") rather than listing conflicting, contradictory specifications
> that confuse the image model.

## Guidelines

*   **Style Saving**: Use `save_style` to save the style parameters you have
    extracted from a reference image to be used in the future. This will
    automatically generate a logo image and place it in the style bank. Use the
    `style_name` argument to give it a descriptive title (e.g. `1990s Anime`).
*   **Style Retrieval**: Use `get_style` to fetch the specific instructions for
    a style when applying it to a prompt.
*   **Style Deletion**: Use `delete_style` to remove a style from the style
    bank.
*   **STYLE APPLICATION**: When applying a saved style to existing image blocks,
    ALWAYS use `create_image_block` with `source_block_ids` pointing to the
    original block(s) and `intent='transform'`. NEVER use `update_image_block`
    for style application. The original images must remain untouched; the styled
    version is a new copy.
*   **SKILL DEPENDENCY**: The `style-skill` only manages style artifacts. To
    actually generate or update an image using a style, you MUST ensure that the
    image generation skill is loaded to use `create_image_block`.

## Capabilities

*   Use `save_style(style_content, style_name="style")` to save a style
    description as a persistent artifact.
*   Use `get_style(artifact_id)` to retrieve a previously saved style content.
*   Use `delete_style(artifact_id)` to delete a saved style from the project.

## Examples

### Example 1: Save a style from a single image

**User**: "Save the style of that image as 'Cyberpunk'"

1.  **Thought**: Need to analyze the image and extract the visual style using
    the structured schema.
2.  **Action**: Analyze the image and extract Color Palette, Lighting, Texture,
    Composition Style, Rendering Technique, and Mood.
3.  **Action**: Call `save_style` with `style_content="**Color Palette**: Neon
    magenta, electric blue, dark charcoal backgrounds. High saturation, cool
    temperature with warm neon accents.\n**Lighting**: Strong neon glow from
    signage and surfaces. Hard shadows, high contrast, rim lighting on
    subjects.\n**Texture**: Smooth digital with rain-wet surfaces, reflective
    materials, slight grain.\n**Rendering Technique**: Digital illustration,
    hyper-stylized realism.\n**Mood**: Dystopian, energetic, nocturnal."`,
    `style_name="Cyberpunk"`.
4.  **Observation**: The style is saved and a representation is added to the
    board.

### Example 2: Generate an image with a style

**User**: "Generate an image of a dog using the Cyberpunk style"

1.  **Thought**: I need to get the instructions for the Cyberpunk style and use
    them to generate a new image.
2.  **Action**: Call `get_style` with the artifact ID for the Cyberpunk style.
3.  **Observation**: Received style instructions.
4.  **Action**: Call `create_image_block` with `prompt="A dog, [style
    instructions from get_style]"`, `style="Cyberpunk"`.

### Example 3: Apply style to existing image

**User**: "Apply the Cyberpunk style to this image" (referring to a specific
block)

1.  **Thought**: Applying a style to an existing block creates a new block with
    the transform intent.
2.  **Action**: Call `get_style` with the artifact ID.
3.  **Observation**: Received style instructions.
4.  **Action**: Call `create_image_block` with `prompt="Transform the [subject
    description]"`, `source_block_ids=["<original_block_id>"]`, `style="[style
    instructions from get_style]"`, `intent="transform"`. *(Note: Replacing
    "this image" with a description of the subject (e.g. "the cat character")
    helps the model preserve the subject better.)*
5.  **Observation**: A NEW image block is created next to the original. The
    original is NOT modified.

### Example 4: Create style from multiple images

**User**: Selects 3 images and clicks "Learn" to create a style.

1.  **Thought**: Multiple images are selected. I need to analyze ALL images and
    extract the COMMON visual style shared across them.
2.  **Action**: Examine all 3 reference images. Identify shared patterns in
    color palette, lighting, texture, and rendering technique. Ignore elements
    unique to one image.
3.  **Action**: Call `save_style` with `style_content="**Color Palette**:
    [shared colors across all images]...\n**Lighting**: [consistent lighting
    pattern]...\n**Texture**: [common texture treatment]...\n**Rendering
    Technique**: [shared medium/style]...\n**Mood**: [overall shared
    atmosphere]..."`, `style_name="[descriptive name]"`.
4.  **Observation**: A unified style is saved representing the common visual
    treatment across all reference images.
