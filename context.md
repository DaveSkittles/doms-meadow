# Cherry Blossom Meadow — Context & Design Document

## What This Is

A romantic 3D voxel platformer built as a personal gift from Dave to his fiancée. The game is a small explorable world — a meadow filled with cherry blossom trees, ponds, a cottage, and scattered love letters — that she can wander through, discovering handwritten messages hidden throughout the landscape. Some are easy to find on the ground; others require climbing parkour obstacle courses to reach sky-high platforms.

It's not a commercial project. It's a love letter disguised as a video game.

## Inspirations

The game draws from three primary sources:

- **Stardew Valley** — The pastoral, cozy environmental aesthetic. Warm color palette, small-scale world that feels handcrafted rather than procedural, the sense that every flower and fence post was placed intentionally. The meadow is meant to feel like a place you'd want to sit in, not just move through.

- **Astro Bot** — The gameplay feel. Tight 3rd-person platforming, satisfying jumps, collectible-driven exploration. The parkour obstacle courses leading to sky letters are directly inspired by Astro Bot's approach to rewarding vertical exploration with something meaningful at the top.

- **Cherry blossom (sakura) aesthetic** — The dominant visual motif. Pink and white blossom clusters on branching trees, petals drifting through the air, soft pastels against green terrain. This is the visual identity of the entire world — romantic, gentle, distinctly Japanese-garden-influenced without being a literal recreation.

## The World

The meadow is a ~36×36 unit terrain grid with gentle rolling hills generated from layered sine waves, flattened near the center to create a natural clearing. The world contains:

- **Cherry blossom trees** in four sizes (small, med, large, giant) with procedurally branching trunks and blossom clusters in pinks, whites, and magentas
- **Evergreen trees** for variety and depth
- **A cottage** near the center with a peaked roof, door, windows, and chimney — a home base anchor point
- **Fences** around the cottage yard
- **Four ponds** with water surfaces, sandy shorelines, and lily pads
- **Rock formations** with moss, scattered across the terrain
- **Flower patches** in multiple colors (pink, yellow, purple, red) with stems and centers
- **Grass tufts** for ground-level detail
- **Clouds** in five shapes (puffy, long, small, big, tower) drifting slowly across the sky
- **Falling cherry blossom petals** that drift and respawn around the player

The sky uses a custom shader with horizon gradient, sun glow, and subtle color animation.

## The Character

The player character is a small voxel girl in a pink dress — representing Dave's fiancée. She has:

- Dark brown hair with highlights and volume
- A pink dress with accent trim
- Brown skin, dark eyes with white highlights, rosy cheeks
- A small smile
- Arms, legs with walking animation, and brown shoes
- The character is scaled to 0.5× and positioned so her feet sit on the terrain surface

## Love Letters (Core Mechanic)

12 collectible love letters are scattered throughout the world. Each is a floating envelope with a heart seal that rotates and bobs gently, surrounded by a pulsing pink glow. When collected, a message appears on screen and is recorded in the player's journal.

**Ground letters (7)** — placed on the meadow surface at various locations, discoverable through normal exploration. Messages are everyday romantic sentiments.

**Sky letters (5)** — placed at the tops of parkour obstacle courses, requiring the player to jump up ascending platforms to reach them. Messages reward the effort of climbing.

The journal (opened via a button in the HUD) tracks all collected letters, shows progress by category (Meadow vs Sky), and displays a special completion message when all 12 are found.

The collection sound is a rising arpeggio (E5 → G5 → B5 → E6) played on a triangle wave synth.

## Obstacle Courses

Each sky letter has a procedurally generated ascending platform course below it. Platforms spiral upward from the terrain to the target height, varying in size and color (pinks, whites, wood tones). Some platforms have decorative fence posts or blossom accents. The final platform at each course's peak is larger, pink-glowing, and framed by a heart arch.

## Audio

The game has a layered ambient soundtrack built entirely with Tone.js synthesis (no audio files):

- **Pad chords** — Slow sine wave polyphonic chords cycling through Cmaj7 → Am7 → Fmaj7 → G7, with long attack/release envelopes and reverb. Creates the harmonic foundation.
- **Melody** — Triangle wave playing a pentatonic melody (E, G, A, B, D, E pattern) with delay and humanized timing. Probabilistic note triggering so it feels organic, not mechanical.
- **Bird calls** — High sine pips (E6-D7 range) with short envelopes, sporadic timing, occasionally doubled for realism.
- **Wind** — Pink noise through an auto-filter for ambient atmosphere.
- **Water proximity** — White noise through a bandpass filter, volume tied to distance from the nearest pond. Gets louder as you approach water.
- **Footsteps** — Brown noise bursts triggered rhythmically while walking on ground.
- **Jump sound** — Short sine pip on takeoff.
- **Landing sound** — Brown noise thump on ground contact.

Transport runs at 72 BPM. Everything is routed through reverb and a master volume.

## Controls

- **WASD / Arrow Keys** — Movement relative to camera facing
- **Mouse** — Camera orbit (with pointer lock on click)
- **Space** — Jump
- Movement uses camera-relative forward/strafe calculation with collision sliding against objects

## Technical Architecture

**Rendering**: Three.js with Lambert materials throughout (no PBR — keeps the voxel aesthetic consistent). PCF soft shadow maps from a single directional sun light, plus fill lights for ambient blue and warm rim. Fog for depth.

**Terrain system**: Height map generated from layered sine functions, stored in a grid-snapped Map. Player terrain height uses bilinear interpolation across the 4 nearest grid cells for smooth movement (earlier versions snapped to grid centers, causing visible height discontinuities).

**Collision system**: Two-layer approach:
- `landY(px, pz, py, prevY)` — Finds the highest collidable surface the player can land on, using sweep detection between the previous and current frame positions to prevent tunneling through thin platforms.
- `hColl(px, pz, py)` — Horizontal collision that prevents walking through solid objects (trees, rocks, cottage walls, fences). Allows sliding along surfaces.

All collidable objects register axis-aligned bounding boxes via `addC(x, z, halfWidth, halfDepth, topY)`.

**Character physics**: Simple Euler integration. Gravity accumulates velocity downward each frame. Ground detection snaps position to the highest valid surface. Jump applies an instantaneous upward velocity. The `CHAR_FOOT` offset (0.17 units) compensates for the character mesh's shoe geometry so feet visually sit on surfaces rather than clipping through.

**State management**: Player state lives in a `useRef` mutable object (position, velocity, yaw, pitch, grounded flag) to avoid React re-renders during the game loop. Collected letters use both a `useRef(Set)` for frame-level checks and `useState` for UI rendering.

**Framework**: React functional component with the entire Three.js scene built and torn down inside a single `useEffect`. Cleanup disposes the renderer, cancels animation frames, removes all event listeners, stops the Tone.js transport, and exits pointer lock.

## Who Built This

Dave — CIO at ERISA Recovery Group, McKinney TX. Builds production AI systems by day (multi-agent orchestration, RAG pipelines, voice agents processing 80M+ healthcare claims). Builds a voxel love letter for his fiancée by night. She teaches colorguard and competes in NTCA — he wanted to make something for her that was as personal and handcrafted as the routines she builds for her students.

## Status & Next Steps

The game is playable: you can explore the meadow, collect all 12 letters, open the journal, and hear the full ambient soundtrack. Active areas of development include:

- Terrain foot-placement polish (bilinear interpolation is in, but edge cases remain around steep transitions)
- Platform collision reliability (sweep detection added to prevent fall-through, needs playtesting)
- Potential additions: more environmental storytelling, animated elements, day/night cycle, additional collectible types, NPC butterflies or fireflies, a final "completion scene" when all letters are found