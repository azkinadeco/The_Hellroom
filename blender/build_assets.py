"""THE HELLROOM - asset build entry point.

Usage (from project root):
  "/Applications/Blender.app/Contents/MacOS/Blender" -b --factory-startup \
      -P blender/build_assets.py -- [asset names...] [--no-preview]

With no names every asset is built. Names are the output basenames, e.g.
  school_locker entity_monitor floor_tile title_bg
Groups: props, items, entities, textures, ui
"""
import os
import sys
import time
import importlib

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import hr_lib  # noqa: E402
import props  # noqa: E402
import props2  # noqa: E402
import items  # noqa: E402
import entities  # noqa: E402
import entities2  # noqa: E402
import textures  # noqa: E402
import title  # noqa: E402

GROUPS = {
    "textures": textures.ASSETS,
    "props": {**props.ASSETS, **props2.ASSETS},
    "items": items.ASSETS,
    "entities": {**entities.ASSETS, **entities2.ASSETS},
    "ui": title.ASSETS,
}


def main():
    if "--" in sys.argv:
        argv = sys.argv[sys.argv.index("--") + 1:]
    else:
        # `npm run assets -- name` passes names straight after the script path
        # (no "--" separator); take them and exit before Blender tries to
        # open them as .blend files.
        i = next((k for k, a in enumerate(sys.argv) if a.endswith("build_assets.py")), len(sys.argv))
        argv = sys.argv[i + 1:]
    flags = {a for a in argv if a.startswith("--")}
    names = [a for a in argv if not a.startswith("--")]
    hr_lib.DO_PREVIEW = "--no-preview" not in flags
    registry = {}
    for g in GROUPS.values():
        registry.update(g)
    todo = []
    if not names:
        todo = list(registry)
    for n in names:
        if n in GROUPS:
            todo += list(GROUPS[n])
        elif n in registry:
            todo.append(n)
        else:
            print(f"!! unknown asset '{n}'. Known: {', '.join(registry)}")
            sys.exit(1)
    report = []
    failed = []
    t_all = time.time()
    for n in todo:
        t0 = time.time()
        print(f"\n==== building {n} ====")
        try:
            hr_lib.reset()
            info = registry[n]() or {}
            report.append((n, info, time.time() - t0))
        except Exception:
            import traceback
            traceback.print_exc()
            failed.append(n)
    print("\n==== SUMMARY ====")
    for n, info, dt in report:
        extra = " ".join(f"{k}={v}" for k, v in info.items())
        print(f"  {n:22s} {dt:6.1f}s  {extra}")
    if failed:
        print("  FAILED:", ", ".join(failed))
    print(f"  total {time.time() - t_all:.1f}s")
    sys.exit(1 if failed else 0)


main()
