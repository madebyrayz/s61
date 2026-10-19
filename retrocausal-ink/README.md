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

Tap `k` of the returned map acts on the stroke drawn `k` strokes ago (site 0 is the new stroke).
Magnitude sets how far it moves, phase sets its wave and rotation, and a negative tap
inverts, reverses or rotates it. Strokes older than the chain inherit the far end, fading.
Holding **Witness** (W) shows the strokes as originally drawn, and every stroke you look at
is rewritten more strongly by the next echo.

## Run the real echo

1. `cd retrocausal-ink/proxy && npx vercel` (any Vercel project works).
2. In the Vercel project settings, add the env var `MOTH_API_KEY` and redeploy.
   Optionally set `ALLOW_ORIGIN=https://madebyrayz.github.io` to lock CORS.
3. In the tool, set **Echo** to *Moth · otoc-echo-v1* and paste `https://<project>.vercel.app/api/echo`.

The docs don't publish the result schema, so `normalizeTaps()` in `app.html` looks for the first
array under a key containing "tap" and accepts numbers, `[re, im]`, `{re, im}` or `{amp, phase}`.
Adjust it once the first real result comes back. `otoc-echo-v1` costs 1 credit per run.
