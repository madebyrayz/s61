# Retrocausal Ink

Week 2 · Input systems. A drawing tool where every new stroke is sent through a quantum echo
(Moth Quantum `otoc-echo-v1`), and the returned tap map rewrites the strokes drawn before it.

- `app.html`: the whole tool (canvas, echo mapping, witness layer). Edit this one.
- `build.mjs`: `node retrocausal-ink/build.mjs` writes the GitHub Pages copy to `docs/retrocausal-ink/index.html`.
- `proxy/`: a Vercel function that holds the Moth API key. The browser only ever talks to this.

## How a stroke becomes an echo

| Stroke | Moth param |
|---|---|
| length | `depth` 4–16 |
| speed | `theta_x` |
| total turning | `theta_zz` |
| mostly horizontal / vertical | `kick` `"Z"` / `"X"` |

Tap `k` of the returned map reaches the stroke drawn `k` strokes ago (site 0 is the new stroke;
strokes further back than 7 are settled). An echo never erases: each tap adds one new contour to that
stroke, derived from its latest contour by a quantized move. Magnitude sets an offset of whole 5 px units,
the tap's sign sets which side, and its phase sets a rotation in 1.5° steps about the point where the
hand began plus a small scale. Repeated echoes build bands, fans and rings.

Media: **graphite** (hairlines on paper, negative-tap contours in a second ink) and **light**
(additive light on black, each contour coloured by how many echoes ago it was laid down).
Holding **Witness** (W) shows the strokes as originally drawn (dotted), and every stroke you look at
drifts further on the next echo.

Run locally: `npx http-server docs` and open `/retrocausal-ink/`.

## Run the real echo

1. `cd retrocausal-ink/proxy && npx vercel` (any Vercel project works).
2. In the Vercel project settings, add the env var `MOTH_API_KEY` and redeploy.
   Optionally set `ALLOW_ORIGIN=https://madebyrayz.github.io` to lock CORS.
3. In the tool, set **Echo** to *Moth · otoc-echo-v1* and paste `https://<project>.vercel.app/api/echo`.

The docs don't publish the result schema, so `normalizeTaps()` in `app.html` looks for the first
array under a key containing "tap" and accepts numbers, `[re, im]`, `{re, im}` or `{amp, phase}`.
Adjust it once the first real result comes back. `otoc-echo-v1` costs 1 credit per run.
