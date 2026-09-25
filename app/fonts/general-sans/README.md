# General Sans

Designed by Indian Type Foundry, distributed through [Fontshare](https://www.fontshare.com/fonts/general-sans).

## What ships

| File | Weight | Style | Used for |
| --- | --- | --- | --- |
| `GeneralSans-Regular.woff2` | 400 | normal | body, headings |
| `GeneralSans-Italic.woff2` | 400 | italic | placeholder and quoted text |
| `GeneralSans-Medium.woff2` | 500 | normal | labels, titles, buttons |
| `GeneralSans-Semibold.woff2` | 600 | normal | emphasis; also serves `bold` |

Loaded by `next/font/local` in `app/layout.tsx`, which fingerprints the files,
serves them from our own origin under `/_next/static/media/`, preloads them
and generates a metric-matched fallback.

## How they were made

Converted from the supplied OpenType files with
`node scripts/fonts/otf-to-woff2.mjs <in.otf> <out.woff2>`, which writes
WOFF2 with Brotli in font mode and checks that every table decodes back
byte-identical. The glyph set is complete (no subsetting), about 24 KB per
style. To add a style, convert its `.otf` the same way and add it to the
`src` list in `app/layout.tsx`.

## Limits worth knowing

- No tabular figures (no `tnum`): digits are proportional.
- No arrow (U+2192) or check mark (U+2713) glyphs; those fall back to the
  next face. Use icons for both.

## Licence

General Sans is published under the ITF Free Font License, which allows
commercial use and web embedding. The licence text was not in the supplied
archive; download it from the Fontshare page above and keep it in this folder.
