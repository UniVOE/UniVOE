#!/usr/bin/env python3
"""Build the page's video assets and case list from the raw demo folder.

    python tools/build_assets.py            # run from anywhere

Reads  demo/  (raw results, not published) and writes
  static/videos/...      H.264 copies with +faststart (stream copy, no re-encode, audio dropped),
                         plus a first-frame poster <name>.jpg for each
  static/js/cases.js     case lists consumed by static/js/main.js (a <script>, so the page also
                         works when opened directly from disk via file://)

Raw layout:
  demo/removal/<case>/{input,output}.mp4 + prompt.txt
  demo/injection/<case>/{INPUT_bg,NFT_iter_53_P2}.mp4 + p.txt
      p.txt holds "Description of reference image: ... Injection instruction: <instr>";
      only <instr> is shown
  comprem/<case>/   removal comparison: input.mp4, prompt.txt, one <method>.mp4 per method
                    (inpainting.mp4 = ours)
  compinj/<case>/   injection comparison: same layout (ours.mp4 = ours; gt.mp4 / ref.mp4 unused)
      Methods are shown in METHOD_ORDER (the order of the paper's tables) with the display
      names in METHOD_NAMES; a method missing for a case is skipped for that case, except the
      ones in REQUIRED_METHODS, which get a black placeholder box with a message.
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
DEMO = SITE / "demo"
OUT = SITE / "static" / "videos"
OURS = "UniVOE (Ours)"

# raw file stem (lower-cased) -> display name
METHOD_NAMES = {
    "videopainter": "VideoPainter",
    "vace": "VACE",
    "univideo": "UniVideo",
    "minimax": "Minimax-Remover",
    "effecterase": "EffectErase",
    "bernini": "Bernini",
    "kling": "Kling3.0-Omni",
    "sd2": "Seedance2.0",
    "inpainting": OURS,
    "ours": OURS,
}
METHOD_ORDER = ["videopainter", "vace", "univideo", "minimax", "effecterase",
                "bernini", "kling", "sd2", "inpainting", "ours"]
COMPARISON_DIRS = {"removal": "comprem", "injection": "compinj"}
# Methods every case of a task must show; a missing video becomes a black placeholder
# box with this text (the provider refused to process the clip).
REQUIRED_METHODS = {"removal": {"sd2": "Security Interception"}}


def copy_video(src: Path, dst: Path) -> str:
    """Copy one video and write its first frame next to it as <name>.jpg (the poster that
    the page shows until the video is loaded)."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-c", "copy", "-an",
                    "-movflags", "+faststart", str(dst)], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-frames:v", "1", "-q:v", "5",
                    str(dst.with_suffix(".jpg"))], check=True)
    return dst.relative_to(SITE).as_posix()


def injection_instruction(text: str) -> str:
    m = re.search(r"Injection instruction:\s*(.*)$", text, re.S)
    return (m.group(1) if m else text).strip()


def demo_cases():
    removal, injection = [], []
    rem = sorted(d for d in (DEMO / "removal").iterdir() if d.is_dir())
    for i, d in enumerate(rem, 1):
        cid = f"removal_{i:02d}"
        removal.append({
            "id": cid,
            "prompt": (d / "prompt.txt").read_text(encoding="utf-8").strip(),
            "input": copy_video(d / "input.mp4", OUT / "removal" / cid / "input.mp4"),
            "output": copy_video(d / "output.mp4", OUT / "removal" / cid / "output.mp4"),
        })
    inj = sorted(d for d in (DEMO / "injection").iterdir() if d.is_dir())
    for i, d in enumerate(inj, 1):
        cid = f"injection_{i:02d}"
        injection.append({
            "id": cid,
            "prompt": injection_instruction((d / "p.txt").read_text(encoding="utf-8")),
            "input": copy_video(d / "INPUT_bg.mp4", OUT / "injection" / cid / "input.mp4"),
            "output": copy_video(d / "NFT_iter_53_P2.mp4", OUT / "injection" / cid / "output.mp4"),
        })
    return removal, injection


def comparison_cases():
    result = {}
    for task, dirname in COMPARISON_DIRS.items():
        root = SITE / dirname
        if not root.is_dir():
            continue
        cases = []
        for i, d in enumerate(sorted(p for p in root.iterdir() if p.is_dir()), 1):
            cid = f"{task}_{i:02d}"
            files = {p.stem.lower(): p for p in d.glob("*.mp4")}
            unknown = set(files) - set(METHOD_ORDER) - {"input", "gt", "ref"}
            if unknown:
                raise SystemExit(f"{d}: unknown method video(s) {sorted(unknown)}; add them to METHOD_NAMES")
            required = REQUIRED_METHODS.get(task, {})
            methods = []
            for m in METHOD_ORDER:
                if m in files:
                    methods.append({"name": METHOD_NAMES[m],
                                    "video": copy_video(files[m], OUT / "comparison" / task / cid / f"{m}.mp4")})
                elif m in required:
                    methods.append({"name": METHOD_NAMES[m], "placeholder": required[m]})
            prompt = (d / "prompt.txt").read_text(encoding="utf-8")
            cases.append({
                "id": cid,
                "prompt": injection_instruction(prompt) if task == "injection" else prompt.strip(),
                "input": copy_video(files["input"], OUT / "comparison" / task / cid / "input.mp4"),
                "methods": methods,
            })
        result[task] = cases
    return result


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    removal, injection = demo_cases()
    comparison = comparison_cases()
    js = SITE / "static" / "js" / "cases.js"
    js.parent.mkdir(parents=True, exist_ok=True)
    dump = lambda x: json.dumps(x, indent=2, ensure_ascii=False)
    js.write_text(
        "// Generated by tools/build_assets.py, do not edit by hand.\n"
        f"window.DEMO_CASES = {dump({'removal': removal, 'injection': injection})};\n"
        f"window.COMPARISON_CASES = {dump(comparison)};\n", encoding="utf-8")
    print(f"demos: {len(removal)} removal, {len(injection)} injection; "
          f"comparisons: { {k: len(v) for k, v in comparison.items()} }")


if __name__ == "__main__":
    main()
