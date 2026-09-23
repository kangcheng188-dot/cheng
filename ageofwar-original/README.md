# Age of War: original file edition

Runs the original 2007 `age_of_war.swf` (Louissi / Max Games) in the browser without Flash:

- `js/swf.js`: reads the SWF file (shapes, sprites, fonts, text, bitmaps, sounds, buttons, ActionScript bytecode)
- `js/player.js`: display list, timelines, buttons and an ActionScript 1/2 (AVM1) interpreter
- `js/render.js`: canvas renderer with bitmap caching
- `js/sound.js`: plays the game's own sounds through Web Audio
- `js/main.js`: loading, scaling and touch controls for phones, tablets and PCs

The SWF is not part of this repository. Put `age_of_war.swf` next to `index.html`, or choose the file
when the page asks for it (download it from https://archive.org/details/flash_age_of_war). The browser
keeps a copy, so it only asks once.
