# UniVOE project page

Static project page for UniVOE. Open `index.html` in a browser to preview, or publish the folder
with GitHub Pages.

- `index.html`, `static/css/style.css`, `static/js/main.js` — the page.
- `static/videos/`, `static/js/cases.js` — generated from the raw results by `tools/build_assets.py`.
- `demo/` — raw results (not published, see `.gitignore`).

## Updating the videos

Put results in the raw folders and run `python tools/build_assets.py` (needs `ffmpeg`).

- Video results (shown as 2 rows, each cycling through its cases, with prev/next arrows; injection tab first):
  - `demo/removal/<case>/` — `input.mp4`, `output.mp4`, `prompt.txt`
  - `demo/injection/<case>/` — `INPUT_bg.mp4`, `NFT_iter_53_P2.mp4`, `p.txt` (only the text after
    "Injection instruction:" is shown)
- Comparisons (one case at a time, all methods side by side):
  - `comprem/<case>/` — `input.mp4`, `prompt.txt`, one `<method>.mp4` per method (`inpainting.mp4` is UniVOE)
  - `compinj/<case>/` — same layout (`ours.mp4` is UniVOE; `gt.mp4` / `ref.mp4` are not shown)
  - Display names and column order are set by `METHOD_NAMES` / `METHOD_ORDER` in
    `tools/build_assets.py`; the build stops on an unknown method file so new methods get a name.

`demo/`, `comprem/` and `compinj/` are raw inputs and are not published (see `.gitignore`).
