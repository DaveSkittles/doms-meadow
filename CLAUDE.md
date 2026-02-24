# Cherry Blossom Meadow — Claude Code Instructions

This is a romantic 3D voxel platformer built as a personal gift. Handle the love letter messages and character identity with care — they are personal and intentional.

## Running the Project

```bash
npm run dev      # Dev server at localhost:5173
npm run build    # Production build → dist/
npm run preview  # Preview production build
```

## Project Structure

```
src/
  Game.jsx    # The entire game — all logic, world, UI in one component
  main.jsx    # React root mount only
index.html    # Entry point
vite.config.js
context.md    # Full design document — read this first for project intent
```

## Architecture

**Single-file game** (`src/Game.jsx`). Everything lives in one file by design — it keeps the game self-contained and easy to reason about. Do not split it into many small files unless there is a compelling reason.

### Key systems (in order they appear in the file)

| Section | What it does |
|---|---|
| Constants | Physics, camera, color palette |
| Geometry/material cache | `_geos` and `_mats` Maps — always use `bx(w,h,d,c)` for opaque meshes; never create `new THREE.BoxGeometry` inline for static world objects |
| Terrain system | `rawH()`, `surfY()` (bilinear interp), `hMap` grid cache |
| Pond system | `pondDefs`, `pondWY` (water floor heights), `inPond()`, `getWaterY()` |
| Collision | `colls[]` AABB array; `addC()` registers boxes; `landY()` vertical sweep; `hColl()` horizontal |
| `LETTERS[]` | The 12 love letter messages and positions — **do not change messages without Dave's input** |
| World builders | `mkCherry`, `mkGreen`, `mkCottage`, `mkFence`, `mkCloud`, `mkLetter`, `mkObstacleCourse`, `mkTerrain` |
| `mkChar()` | Player character — chibi voxel girl. Children indices matter for animation (see below) |
| `Game` component | Start screen wrapper |
| `GC` component | Game core — scene setup, audio, input, animation loop |

### Character children indices (mkChar)

Animation code references these by index — keep in sync if mkChar is changed:

```
[0]  dress torso        [1]  dress skirt (sway)   [2]  waist ribbon
[3]  hem trim           [4]  collar                [5]  skin body
[6]  hair group*        [7]  eye L                 [8]  eye R
[9]  eye shine L        [10] eye shine R            [11] cheek L
[12] cheek R            [13] smile                 [14] armL group*
[15] armR group*        [16] legL group*            [17] legR group*
```
`*` = THREE.Group (rotation at joint)

### Player state (`S` ref object)

```js
{ px, py, pz,       // world position
  vy,               // vertical velocity
  yaw, pitch,       // camera angles
  gnd,              // grounded flag
  inWater,          // on pond water surface
  jumps,            // jump count (0 = on ground)
  coyote,           // coyote time frames remaining
  jumpBuf,          // jump buffer frames
  landSquash,       // landing squash animation (1 → 0)
  walkCycle,        // accumulated walk cycle angle
  sprint, mv, md    // sprint/moving/mouse-down flags
}
```

### Performance notes

- Terrain uses `THREE.InstancedMesh` (~550 pillars → 1 draw call)
- Petals and fireflies use `THREE.Points` (60 + 20 particles → 1 draw call each)
- Geometry and materials are cached in `_geos` / `_mats` Maps — `dispose()` is called on both at cleanup
- Collection particles use **non-cached** geometry (safe to dispose individually)
- Sand materials use `polygonOffset` to prevent z-fighting without changing geometry

### Audio

All sound is synthesized via Tone.js — no audio files. Transport runs at 72 BPM. Key synths:
`pad` (chords), `mb` (melody), `brd` (birds), `wnd` (wind), `wtn` (water proximity),
`fsf` (footsteps), `jsf` (jump), `lsf` (land), `djSf` (double-jump), `splSf` (water splash)

## What NOT to change without asking Dave

- The 12 love letter messages in `LETTERS[]`
- The character appearance (brown skin, dark hair, pink dress — this represents his fiancée)
- The cottage location and design
- The overall world layout and pond positions

## Common Tasks

**Add a new love letter**: Add an entry to `LETTERS[]` with `msg`, `x`, `z`, `y`, `type` (`"ground"` or `"sky"`). Sky letters also need `mkObstacleCourse(sc, x, z, y)` called in the GC setup.

**Tweak physics**: Constants at the top — `SPD`, `SPRINT_SPD`, `JMP`, `GRV`, `MAX_JUMPS`, `COYOTE`, `JUMP_BUF`.

**Add a world object**: Use `bx(w,h,d,color)` for meshes, `addC(x,z,hw,hd,topY)` to register collision. Call `scene.add()`.

**Camera distance/speed**: `CAM_D` (distance), `CAM_S` (lerp speed).
