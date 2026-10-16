# Case portrait art

Mode: **built-in image generation**, one generation per portrait. These are
illustrated interpretations, not archival photographs or forensic likenesses.
No downloaded portrait photographs are distributed. Final assets are 512 × 512
WebP files under `public/portraits/`. The map, introduction, result, and newspaper
all use the same case illustration. The newspaper derives a transparent mask
in memory; it never changes the original ivory-backed map assets.
Newspaper typography is composed in
`src/poster-renderer.ts`; its arrest scene is a separate editorial illustration.

## Prompt set

Shared art direction: a single square historical editorial head portrait, full
head and short neck facing forward, centred for a circular crop. Warm newspaper
ink, restrained natural colours, engraved detail and subtle halftone on ivory.
Keep a consistent scale and style. No body, scene, props, lettering, or watermark.

Subject briefs for the shared direction:

| Saved asset | Subject brief |
| --- | --- |
| [bulger.webp](../public/portraits/bulger.webp) | James Whitey Bulger, older man, receding silver hair, stern face. |
| [kelly.webp](../public/portraits/kelly.webp) | George Machine Gun Kelly, 1930s, dark slicked hair, broad face. |
| [karpis.webp](../public/portraits/karpis.webp) | Alvin Karpis, 1930s, dark slicked hair, long narrow face. |
| [dillinger.webp](../public/portraits/dillinger.webp) | John Dillinger, 1930s, dark side-parted hair, clean-shaven. |
| [barrow.webp](../public/portraits/barrow.webp) | Clyde Barrow, young 1930s man, dark slicked side-parted hair. |
| [nelson.webp](../public/portraits/nelson.webp) | Baby Face Nelson, young-looking round face, short dark hair. |
| [veerappan.webp](../public/portraits/veerappan.webp) | Veerappan, weathered South Indian man with a very large curled moustache. |
| [sobhraj.webp](../public/portraits/sobhraj.webp) | Charles Sobhraj, 1980s, dark wavy hair and distinctive glasses. |
| [phoolan.webp](../public/portraits/phoolan.webp) | Phoolan Devi, young Indian woman, dark hair and red headband. |
| [raghav.webp](../public/portraits/raghav.webp) | Raman Raghav, lean middle-aged Indian man, short hair and weathered face. |
| [tomar.webp](../public/portraits/tomar.webp) | Paan Singh Tomar, Indian man with dark hair and moustache. |
| [malkhan.webp](../public/portraits/malkhan.webp) | Malkhan Singh, Indian man with a prominent moustache and dark hair. |
| [ambrus.webp](../public/portraits/ambrus.webp) | Attila Ambrus, 1990s Hungarian man, short dark hair and strong features. |
| [rozsa.webp](../public/portraits/rozsa.webp) | Sándor Rózsa, nineteenth-century Hungarian outlaw, dark hair and large moustache. |
| [savanyu.webp](../public/portraits/savanyu.webp) | Jóska Savanyú, nineteenth-century Hungarian outlaw, dark hair and moustache. |
| [matuska.webp](../public/portraits/matuska.webp) | Szilveszter Matuska, 1930s middle-aged Hungarian man, receding dark hair. |
| [milfajt.webp](../public/portraits/milfajt.webp) | Ferkó Milfajt, young nineteenth-century Hungarian outlaw, dark hair and moustache. |
| [sobri.webp](../public/portraits/sobri.webp) | Jóska Sobri, young nineteenth-century Hungarian outlaw, wavy dark hair and moustache. |

Historical text and links are maintained separately in `src/game/case-files.ts`.
Changing an illustration does not change the sourced historical account.

## Newspaper scene, second version

Built-in image generation produced these two new assets. The street is a generic
fictional setting, not a photograph of the real arrest. Both fugitive wrists are
handcuffed; the officer holds the cuffs. Blank head slots are replaced at runtime
with the player's cropped portrait (or the fictional default officer) and the
same case portrait used on the map. Print rendering uses monochrome ink and a
light halftone screen. Crop coordinates remain temporary; only the final player
head crop is persisted.

- [Arrest scene](../public/newspaper/arrest-scene.webp): 1536 × 1024, WebP.
- [Fictional default officer](../public/newspaper/officer-portrait.webp): 512 × 512,
  WebP.

The original generated PNGs were converted to WebP for delivery. The scene's
head centres and radii are documented in `PLAYTEST_CONFIG.poster.artwork`.
Artwork and the masthead font load only when the newspaper editor opens.

## Newspaper clipping, third version

The shared USA/Hungary scene is [arrest-scene-v3.webp](../public/newspaper/arrest-scene-v3.webp),
1536 × 1024, saved with **built-in imagegen edit mode** and converted to WebP at
quality 88. The older scene remains available as the edit source. The two blank
head disks were inpainted with street detail so transparent portrait edges reveal
the scene rather than another ivory circle. Bodies, necks and handcuffs retain
their original composition; head placements remain in the tuning configuration.

The renderer removes only pixels close to the corner ivory and connected to an
image edge. Dark outlines and enclosed highlights remain opaque. Masks are cached
per decoded image during editing. Player-uploaded circular crops retain their
chosen content. A deterministic canvas paper stock supplies grain, ageing, folds,
uneven cut edges and transparency around the clipping without an additional asset.
Headlines, stamp, statistics, historical copy and the prominent classified-style
invitation are drawn as crisp export-resolution text, not baked into artwork.

Exact edit prompt (input image: `public/newspaper/arrest-scene.webp`):

```text
Use case: precise-object-edit.
Asset type: reusable arrest-scene background for the Patrol newspaper compositor.
Input image 1 is the edit target. Remove ONLY the two large blank ivory circular head placeholders and their thin dark circular outlines. Inpaint those circles with a seamless continuation of the street, masonry facades, windows, distant trees and soft light directly behind them. There must be no head, face, hair, hat, circle, silhouette, light disk or empty slot in either removed area; runtime portraits will be placed here later.
Preserve everything outside the two circles exactly: the officer's and fugitive's bodies, visible necks below the circles, collars, uniform, jacket, both cuffed wrists, hands, handcuffs, pose, sizes, positions, street, car, composition, cross-hatching, warm grey editorial ink style and lighting. Do not add people, text, watermark or props. Keep the original landscape 3:2 framing at 1536 by 1024. Opaque background. This is a compositing plate, so the two necks may end naturally where the removed circles used to overlap.
```

Original second-version scene prompt:

```text
Use case: illustration-story.
Asset type: reusable arrest-scene illustration for a personalized newspaper front page in the web game Patrol.
Primary request: a sophisticated semi-realistic editorial illustration of a uniformed patrol officer handcuffing a captured fugitive, with a convincing urban street background. More realistic proportions, cloth folds, hands, handcuffs and lighting than a simple cartoon; retain a charming drawn newspaper-illustration style.
Scene: a quiet old city street with masonry facades, a distant patrol car, pavement, soft early-morning light and a little atmospheric depth. Generic location, no national flags or recognisable landmark, so this can illustrate cases in USA, India or Hungary.
Composition: landscape 3:2 image, waist-up two-person scene. Officer on the left, fugitive on the right, both facing almost straight toward the viewer, shoulders naturally angled toward the central handcuffing action. Officer holds the cuffs while BOTH of the fugitive's wrists are together in front, visibly handcuffed. The officer is not handcuffed. Show natural anatomically correct hands. Officer wears a detailed dark patrol uniform with a small plain badge; fugitive wears a light civilian jacket over a plain shirt, no prison stripes. Do not crop either head.
CRITICAL COMPOSITING CONSTRAINT: both heads must be identical blank ivory circular placeholders with no facial features, hair or ears, for personalized portraits to be overlaid later. The circles should be centred at approximately 32 percent and 68 percent of image width and 26 percent of image height, with radius 9 percent of image width. Bodies, shirt collars and necks meet these circles naturally. Do not draw hats or objects across the circular face areas. Keep all expressive detail below the heads, in body language and the handcuff action.
Style: richly detailed ink and graphite editorial drawing with restrained warm-grey washes, fine cross-hatching and realistic human anatomy. Mostly monochrome, suitable for newspaper reproduction. Subtle paper grain, controlled highlights, convincing depth. No flat vector shapes, no stick figures, no exaggerated giant heads, no thick cartoon outlines, no comic speech balloons.
No text, lettering, watermark, labels, inset panels, borders or newspaper page layout in this asset. Full opaque background.
```

Exact officer portrait prompt:

```text
Use case: illustration-story. Asset type: default officer head portrait for a customizable newspaper arrest illustration in the web game Patrol.
Create a single square editorial head-and-short-neck portrait of a fictional adult patrol officer, centred, directly facing the viewer, with realistic facial proportions, short neatly kept dark hair, a calm capable expression, and no hat. Androgynous appearance, medium skin tone. Full head fully inside the frame with generous margin, suitable for a circular crop. Detailed graphite and fine ink cross-hatching with subtle warm-grey washes on clean ivory, like a sophisticated newspaper illustrator's portrait, mostly monochrome. No broad cartoon outlines, no exaggerated features, no body below the short neck, no props, no text, no watermark. This person is fictional and should not resemble a celebrity.
```

The masthead uses locally hosted
[UnifrakturCook](https://github.com/google/fonts/tree/main/ofl/unifrakturcook),
distributed under the SIL Open Font License. The complete copyright/license is
included in [UnifrakturCook-OFL.txt](../public/fonts/UnifrakturCook-OFL.txt).
Body copy uses system serif fonts. If the masthead font cannot load, export uses
a serif fallback.

## India-specific newspaper illustration

USA and Hungary share the existing `shared_v3` artwork. India uses `india_v1`:

- [Indian arrest scene](../public/newspaper/arrest-scene-india-v1.webp): 1536 × 1024 WebP.
- [Fictional Indian default officer](../public/newspaper/officer-portrait-india-v1.webp): 512 × 512 WebP.

Both were created with **built-in imagegen edit mode**, using the shared scene
and officer portrait as composition references, then converted to WebP at quality
88 (the officer output was resized to 512 pixels). The khaki police shirt,
epaulettes and trousers, cotton kurta, utility jeep, auto-rickshaw, shop shutters,
awnings and overhead wires distinguish the Indian street scene. It remains an
imagined illustration, not an archival arrest photograph or a specific police
force's uniform. The same six original Indian case portraits are composited
without their ivory backgrounds; a saved player head crop still replaces the
default officer.

`PLAYTEST_CONFIG.poster.artwork` contains each preset's paths and calibrated head
positions. Assets are selected from the capture report's country, loaded only
when the editor opens, and cached by artwork ID. USA and Hungary share one cache
entry; India's scene and officer have a separate entry. A failed preset load can
be retried without clearing the other preset. The masthead font is shared.

Exact India scene edit prompt:

```text
Use case: precise-object-edit.
Asset type: India-specific newspaper arrest-scene compositing plate for the web game Patrol.
Input image 1 is the edit target. Adapt this exact scene into an everyday Indian setting. Replace the officer's American dark tactical uniform with a neatly worn khaki Indian police shirt and khaki trousers, shoulder epaulettes, two buttoned chest pockets, a simple brown leather waist belt and a small unlettered badge. Remove the American shield patch, heavy tactical equipment and large holster. Replace the fugitive's American zip jacket and T-shirt with a rumpled light cotton kurta, rolled sleeves and loose plain trousers; keep the body shape neutral enough for different fugitive portraits. Both people have medium-brown Indian skin on their visible necks and hands.
Replace the European/American masonry street, American patrol car and decorative street lamps with a convincing ordinary Indian town lane: weathered plaster and brick shopfronts, closed steel shutters, simple fabric awnings, overhead utility wires, uneven paved roadside, a small parked auto-rickshaw and an older plain utility jeep in the distance. Subtle everyday local detail, no tourist landmark or dramatic poverty imagery. No American cars, uniforms or architecture.
CRITICAL: preserve the exact 1536 x 1024 landscape 3:2 framing, two-person scale, shoulder positions, body poses, visible neck endpoints and central handcuffing action. Officer remains left, fugitive right. Both fugitive wrists are cuffed together in front; officer's wrists are free and officer holds the cuffs. Preserve natural anatomically correct hands.
This is a compositing plate: keep BOTH heads absent, exactly as in the reference. Do NOT draw faces, hair, hats, head silhouettes, blank circles or pale head placeholders. The original head areas at x=32.36%, y=18.07% and x=65.4%, y=18.85% must show continuous street background above the preserved necks. Runtime portraits will be composited there.
Preserve the detailed graphite and fine ink cross-hatching, realistic proportions, warm grey monochrome newspaper illustration style and soft daylight. Full opaque background. No text, lettering, labels, flags, watermark or newspaper layout.
```

Exact Indian officer edit prompt:

```text
Use case: identity-preserve.
Asset type: default Indian police officer portrait for the Patrol newspaper compositor.
Input image 1 is the edit target and composition reference. Create a fictional Indian adult police officer with medium-brown skin, short neatly kept dark hair, and a calm capable expression. Keep a neutral androgynous appearance and do not resemble a celebrity. Replace the dark shirt shoulders with khaki police shirt shoulders and simple epaulettes. No hat.
Preserve exactly the square 512 x 512 composition, front-facing head size and placement, generous margin around the complete head, short neck, and ivory background. Match the original detailed graphite and fine ink cross-hatching with restrained warm-grey washes, realistic proportions and mostly monochrome newspaper rendering. The head must fit inside the same circular crop. No body below the short neck and shoulder tops, no props, text or watermark.
```
