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

| Gesture | What happens |
|---|---|
| ✊ Fist (hold briefly) | pen on / pen off for you. A ripple and a pill at the top confirm it; your fingertip gets a coloured dot |
| ☝️ Point (pen on) | draw from the index fingertip. Relax the hand to lift the pen and move; point again for the next line |
| ✌️ Two fingers | eraser: rub out lines, unfinished or alive. Erase a whole drawing and it's gone |
| 👍 Thumbs up | finish: the AI names your drawing and it comes alive |
| Sweep a hand fast past a drawing | it gets startled (flinches, jumps, flies off, darts) and then calms down. Your hand never pushes it |

Several people can draw at once: each person is tracked and gets their own ink colour, pen and drawing.

| Key / button | |
|---|---|
| **Enter** / ✨ | finish (for mouse drawing) |
| **E** / eraser button | mouse eraser |
| **Space** / ❙❙ | pause / play all animation |
| **V** / Sight | what the AI sees: hand skeletons + gesture, body points, landing spots, each drawing's name, confidence and intention, the recognizer's 28×28 input and top guesses |
| **P** / Paper | dark ink on a faded camera (Runway-style look) |
| **D** | depth parallax (drawings shift as you move your head), off by default |
| Click a drawing, then **Delete** | delete it (click again to cycle the AI's other guesses) |
| **Z** / **C** / **H** | undo / clear / hide the interface |

The mouse also draws, so it works without a camera too.

## The plan (how it works)

1. **See** (`js/vision.js`): Google MediaPipe finds 21 points on each hand and 33 on each body (up to 3 people), live, on your laptop's GPU. Gestures are read from the hand's real 3D shape (how straight each finger is) and must hold for a few frames before they count. Hands are matched to the nearest body, so each person gets a colour. Hand size = depth. From the body points we build *anchors*: top of head, eyes, upper lip, neck, both shoulders.
2. **Draw** (`js/ink.js`): every point has x, y and z. A small perspective camera draws them, and it follows your eyes, so lines in front of the screen move differently from lines behind it.
3. **Name** (`js/recognize.js`): when you give a 👍, your strokes are painted into a 28×28 picture and fed to *DoodleNet*, a small neural network trained on Google's *Quick, Draw!* doodles (345 categories). It runs locally with TensorFlow.js. No internet, no API key.
4. **Live** (`js/creatures.js`, `js/effects.js`): each drawing lives where you drew it. Its category gives it a tiny agent brain, reactions (startled → calm) and generated effects drawn in your ink (water from a hydrant, drips from ice cream, steam, flames, smoke, notes, rain, bubbles…). Brains: *flutter* (wander, choose a free landing spot on you, land, rest, take off when startled), *wear* (glue to your face and follow its tilt), *swim*, *sky*, *grow*, *fall*, *crawl*, *dangle*, *buzz*, *cruise*. Your own strokes are bent in 3D: wings fold towards you, bodies wave, stems sway. Anything else (345 things!) floats and slowly turns.
5. **Show what it sees** (`js/sight.js`): the overlay draws the machine's perception and its intentions on top of the camera.

Everything is stored in this folder (`lib/`, `models/`) so it runs offline. No build step.

## Credits

- MediaPipe Tasks Vision 0.10.35 (hand + pose landmarkers), Google, Apache 2.0
- DoodleNet (Yining Shi, ml5.js), trained on Google's Quick, Draw! dataset (CC BY 4.0)
- TensorFlow.js 4.22, Apache 2.0
