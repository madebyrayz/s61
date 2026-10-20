# Huygens Pen

Week 2 · Input systems. Every stroke you draw is a slit. Each point on it sends out a wave
(Huygens–Fresnel), and the canvas draws what the light does next. The tool has two directions
that share one wave function ψ:

- **Field**: the interference pattern itself, |ψ|² per pixel in a WebGL shader.
  *Basin*, *Mono* and *Contour* cut it at fixed levels; *Photons* lands detections one at a time,
  sampled from |ψ|² (Born rule).
- **Lines**: the same ψ drawn as lines.
  *Rays* are de Broglie–Bohm trajectories (each line follows the phase gradient ∇S, so lines never
  cross and bunch into the bright fringes). *Fronts* are the wavefronts, lines of constant phase,
  with weight set by the amplitude |ψ|, so the dark fringes cut through them.

Gesture → physics: a slow hand gives a long wavelength, a fast hand a short one; a short stroke acts
like a point-like slit, a long one like a wide, curved slit.

**Quantum eraser.** *Tag path* marks a stroke with which-path information: it stops adding coherently
with the others, its fringes vanish, and its rays only follow its own wave. *Erase tags* removes the
information after the fact and the fringes come back (delayed choice).

**Recursion (depth n).** At depth n the brightest points of generation g become new sources for
generation g + 1, which is Huygens' rule applied to its own output, the same move as week 1.

## Files

- `app.html`: the whole tool. Edit this one.
- `build.mjs`: `node huygens-pen/build.mjs` writes the GitHub Pages copy to `docs/huygens-pen/index.html`.
- `proxy/`: a Vercel function that holds the Moth API key. The browser only talks to this.

Run locally: `npx http-server docs` and open `/huygens-pen/`.
Keys: F field, L lines, D draw, T tag, E erase tags, +/− depth, P photons, C clear.

## Measured photons from Moth

In *Photons*, set **bits** to *Moth QPU*. Each detection position comes from bitstrings of a 12-qubit
`graph-v1` state measured in the Z basis (uniform random bits, 1024 shots per call, 5 credits).

1. `cd huygens-pen/proxy && npx vercel` (any Vercel project works).
2. In the Vercel project settings, add the env var `MOTH_API_KEY` and redeploy.
   Optionally set `ALLOW_ORIGIN=https://madebyrayz.github.io` to lock CORS.
3. Paste `https://<project>.vercel.app/api/moth` into the proxy field.

The Moth docs don't publish the result schema, so `extractCounts()` in `app.html` takes the first object
whose keys are bitstrings. If the proxy fails, the tool says so and falls back to local randomness.
