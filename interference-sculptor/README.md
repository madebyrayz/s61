# Interference Sculptor

Week 2 · Input systems. A drawing tool where every stroke is a slit, and the thing you
sculpt is the interference pattern the slits make in three dimensions.

Live: https://madebyrayz.github.io/s61/interference-sculptor/

## The idea

Young's double slit, in 3D, drawn with a brush of spinning particles.

### Threads (the brush, iteration 2)

Each stroke is a slit; its waves fill the space around it (the sum below). Tiny particles
("threads") are born at the pen tip and ride that wave: they follow the phase gradient of ψ,
as in de Broglie–Bohm, gliding over the wavefront shells and slowing in the dark fringes,
which bunches them into the bright ones. Each carries a spin θ, a Kuramoto oscillator,
θ̇ = ω + K Σ sin(θⱼ − θ), coupled to the spins in its cell and to the local phase of ψ;
neighbours fall into step and their paths braid. Colour is θ through the palette. Every
frame each thread adds one short mark to a canvas that is never cleared, so the drawing
grows while you draw and keeps growing after you stop. Sprout / Drift / Weave along the
bottom are three settings of the same rule; the Threads flyout has the sliders.

### The field (iteration 1: Surface, Volume, Wavefronts)

 Each stroke you draw is cut into a row of pinholes. Each
pinhole sends out a spherical wave, ψ = a·e^{i(kr+φ)}/r. The GPU adds up every wave at
every point of space (a 3D texture, 112³ to 176³ voxels, stretched so it reaches out
in every direction: fine near the strokes, coarser far away) and stores:

| channel | meaning |
| --- | --- |
| r | intensity, I/(1+I) |
| g, b | phase of the coherent sum, as cos and sin |
| a | R/(1+R), where R = \|Σψ\|² / Σ\|ψᵢ\|²: the ratio of what the waves do together to what they would do if they could not interfere. ½ is neutral, above is a bright fringe, below a dark one. |

A ray is then shot through each pixel and the numbers become a picture:

- **Surface**: the isosurface R = level, shaded like a solid. Two pinholes give the nested
  hyperboloids of the textbook; two slits give hyperbolic sheets.
- **Volume**: emission–absorption through the fringes, like glowing fog (ink, on paper).
- **Wavefronts**: the surfaces where the phase passes through zero, one per wavelength,
  as thin shells with the dark fringes punched through them.

Colour is a second reading of the same field through a cosine palette
(a + b·cos(2π(c·t + d)), after Inigo Quilez): by phase, by fringe strength, or by height.

## Gesture → physics

- A slow stroke has a long wavelength, a fast stroke a short one (switch it off and set λ by hand).
- Pinhole spacing: under half a wavelength a stroke is one continuous slit and throws a flat
  fan of light; spread the pinholes and the row also throws cones along itself, one per
  diffraction order (cos θ = mλ/d).
- Which-path marker: tag every stroke as if a detector knew which slit each photon came
  through. Waves from different strokes stop interfering (Σ|ψ|² instead of |Σψ|²). Switch it
  off and the fringes come back: a quantum eraser.
- Threads sprout along the pen while it moves, then slowly along every stroke (pause with
  the button in the dock). Orbiting wipes the picture; it regrows from the strokes.

## How mathematical shaders do this

Notes from the research behind the renderer, for the write-up.

1. **One rule per pixel.** The field is a formula evaluated everywhere, never a mesh. Shadertoy,
   The Book of Shaders and 2swap's gravity basins all work this way: the picture is the
   function.
2. **Raymarching.** A 3D picture of a function is made by walking a ray through it in small
   steps and asking the function at each step (Inigo Quilez's SDF tutorials). Isosurfaces are
   found by a sign change plus a few bisection steps; normals are the gradient; shading is
   Lambert + a little fresnel + a specular dot.
3. **Volume rendering.** The same walk, accumulating emission and absorption instead of
   stopping at a surface (the "emission–absorption model"). A random start offset per pixel
   hides the step banding.
4. **Bake, then look.** When the function is expensive (900 sources × 3 million voxels), compute
   it once into a 3D texture and let the renderer read the texture. This is the TouchDesigner
   compute-shader-on-Texture3D pattern; WebGL2 has no compute shader, so each slice is drawn
   into one layer of the texture with `framebufferTextureLayer`.
5. **Cosine palettes.** `a + b·cos(2π(c·t + d))` gives a smooth, periodic colour ramp from four
   numbers. Periodic suits phase, which wraps too.
6. **Physics → colour.** aorbital's Kuramoto, Bloch-sphere and double-pendulum pieces follow one
   recipe: simulate the real equations, then map a state variable (phase, energy, spin) to colour
   and let the structure of the physics draw itself. Here the state variable is the phase of ψ.

## Files

```
src/sim/field.ts     strokes → sources, the CPU copy of the sum
src/sim/threads.ts   the brush: spin particles on the wave, Kuramoto coupling, the trails
src/sim/shaders.ts   GLSL: bake (one layer per draw) and raymarch (surface / volume / wavefronts)
src/sim/engine.ts    WebGL2, 3D textures, camera, the pen, the stroke overlay
src/params.ts        parameters, palettes, presets
src/copy.ts          every word in the interface
src/components/      the panel, same kit as the week-1 Subdivision Sculptor
```

## Run

```
pnpm install
pnpm dev        # http://localhost:5181
pnpm run deploy # builds into ../docs/interference-sculptor for GitHub Pages
```

Keys: ⌘Z undo, P pen, O orbit, WASD pan, H clean view (esc leaves it). Drag to draw,
right-drag or shift-drag to orbit, shift + right-drag to pan, scroll to zoom. Export (camera button): a PNG at full quality, or a
video recording of the view (MP4 where the browser can write it, otherwise WebM).
`?still` in the URL turns auto-rotate off.
