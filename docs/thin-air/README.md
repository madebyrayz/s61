# thin air

Week assignment: *"Use an image or video as input to make a drawing (using computer vision), or create a code based drawing tool that augments or extends the movements of the human body."*

The webcam feed is the canvas. You draw in the air with your fingers, your lines float in 3D in front of you, the computer works out what you drew, and the drawing comes alive and reacts to your body. A butterfly lands on your shoulder, a hat sits on your head, a fish swims away from your hand.

## Run it

```bash
cd ~/code/courses/mas-s61/site/docs/thin-air     # or wherever this folder is
python3 -m http.server 5201
```

Open <http://localhost:5201> in Chrome, click **Start camera**, allow the camera.
Live version (once merged): <https://madebyrayz.github.io/s61/thin-air/>

| Do this | What happens |
|---|---|
| Pinch thumb + index and move | draw (hand nearer the camera = line comes towards you in 3D) |
| Open your fingers | stop the line |
| Wait ~1 second | the AI names the drawing and it comes alive |
| Point one finger up | a butterfly or parrot may land on it |
| Wave fast near a creature | it gets startled; fish flee, flowers blow in your "wind" |
| Lean left/right | the drawings shift in depth (head-coupled parallax) |
| Click a creature (mouse) | cycle through the AI's other guesses |
| **V** / Sight | see what the AI sees: hand skeleton, body points, landing spots, labels with confidence, each creature's intention, the 28×28 picture the recognizer looked at |
| **P** / Paper | black ink on a faded camera (Runway-style look) |
| **Z** / **C** / **H** | undo / clear / hide the interface |

The mouse also draws, so it works without a camera too.

## The plan (how it works)

1. **See** (`js/vision.js`): Google MediaPipe finds 21 points on your hand and 33 on your body, live, on your laptop's GPU. Pinch = pen down. Hand size = depth. From the body points we build *anchors*: top of head, eyes, upper lip, neck, both shoulders.
2. **Draw** (`js/ink.js`): every point has x, y and z. A small perspective camera draws them, and it follows your eyes, so lines in front of the screen move differently from lines behind it.
3. **Name** (`js/recognize.js`): when you pause, your strokes are painted into a 28×28 picture and fed to *DoodleNet*, a small neural network trained on Google's *Quick, Draw!* doodles (345 categories). It runs locally with TensorFlow.js. No internet, no API key.
4. **Live** (`js/creatures.js`): each category gets a tiny agent brain: *flutter* (wander, choose a free landing spot on you, land, rest, take off when startled), *wear* (glue to your face and follow its tilt), *swim*, *sky*, *grow*, *fall*, *crawl*, *dangle*, *buzz*, *cruise*. Your own strokes are bent in 3D: wings fold towards you, bodies wave, stems sway. Anything else (345 things!) floats and slowly turns.
5. **Show what it sees** (`js/sight.js`): the overlay draws the machine's perception and its intentions on top of the camera.

Everything is stored in this folder (`lib/`, `models/`) so it runs offline. No build step.

## Credits

- MediaPipe Tasks Vision 0.10.35 (hand + pose landmarkers), Google, Apache 2.0
- DoodleNet (Yining Shi, ml5.js), trained on Google's Quick, Draw! dataset (CC BY 4.0)
- TensorFlow.js 4.22, Apache 2.0
