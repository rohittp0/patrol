# Case portrait art

Mode: **built-in image generation**, one generation per portrait. These are
illustrated interpretations, not archival photographs or forensic likenesses.
No downloaded portrait photographs are distributed. Final assets are 512 × 512
WebP files under `public/portraits/`. The map, introduction, result, and newspaper
all use the same case asset. Newspaper typography is composed in
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
head centres and radii are documented in `PLAYTEST_CONFIG.poster.sceneHeads`.
Artwork and the masthead font load only when the newspaper editor opens.

Exact scene prompt:

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
