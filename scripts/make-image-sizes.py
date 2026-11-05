#!/usr/bin/env python3
"""Make the smaller image copies the site uses. Run after adding images: npm run images (macOS, uses sips)."""
import json
import pathlib
import re
import shutil
import subprocess
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
FEATURE_WIDTHS = [300, 720, 1200]


def width_of(path):
    out = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)], capture_output=True, text=True, check=True).stdout
    return int(re.search(r"pixelWidth: (\d+)", out).group(1)), int(re.search(r"pixelHeight: (\d+)", out).group(1))


def make(original, width, sized_path):
    sized = SRC / urllib.parse.unquote(sized_path.lstrip("/"))
    if sized.exists():
        return
    sized.parent.mkdir(parents=True, exist_ok=True)
    if width_of(original)[0] <= width:
        shutil.copyfile(original, sized)
    else:
        subprocess.run(["sips", "--resampleWidth", str(width), str(original), "--out", str(sized)], capture_output=True, check=True)


sizes = {}


def index(url, rest):
    """Record a picture's size and make its smaller copies. rest is its path after /content/images."""
    original = SRC / urllib.parse.unquote(url.lstrip("/"))
    width, height = width_of(original)
    sizes[url] = {"width": width, "height": height, "sizes": [w for w in FEATURE_WIDTHS if w < width]}
    for w in sizes[url]["sizes"]:
        make(original, w, f"/content/images/size/w{w}{rest}")


files = list((SRC / "posts").glob("*.md")) + list((SRC / "pages").glob("*.md"))
for md in files:
    text = md.read_text()
    for width, rest in set(re.findall(r"/content/images/size/w(\d+)(?:h\d+)?(/[^\"'\s,)]+)", text)):
        original = SRC / ("content/images" + urllib.parse.unquote(rest)).lstrip("/")
        if original.exists():
            make(original, int(width), f"/content/images/size/w{width}{rest}")
    match = re.search(r'^feature_image: "(/content/images(/[^"]+))"', text, re.M)
    if match:
        index(*match.groups())

# The pictures the home page cover rotates through get the same smaller copies.
site = json.loads((SRC / "_data" / "site.json").read_text())
for cover in site.get("homeCovers", []):
    url = cover["image"]
    index(url, url[len("/content/images"):])

# So do the pictures made for Substack notes and X posts, which the Media page shows.
for note in site.get("media", {}).get("notes", []):
    url = note["image"]
    index(url, url[len("/content/images"):])

(SRC / "_data").mkdir(exist_ok=True)
(SRC / "_data" / "imageSizes.json").write_text(json.dumps(sizes, indent=2, sort_keys=True) + "\n")
print(f"feature and cover images: {len(sizes)}")
