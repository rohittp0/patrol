"""Original Patrol tutorial artwork. Requires Pillow; no map keys or remote art.

Run through npm run prepare:tutorial to use the central playtest configuration.
The PNG posters show a representative end state for reduced-motion visitors.
"""
import json
import math
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFont

CONFIG = json.load(sys.stdin)
WIDTH, HEIGHT = CONFIG["widthPx"], CONFIG["heightPx"]
FPS, SECONDS = CONFIG["framesPerSecond"], CONFIG["durationSeconds"]
SCALE = 2
BG, GRID, LAND = "#0c1c22", "#183039", "#203c3a"
MUTED, LIME, BLUE, RED, WHITE = "#627d75", "#d8f879", "#559eeb", "#f06278", "#eef5df"
OUT = Path("public/tutorial")
OUT.mkdir(parents=True, exist_ok=True)


def font(size, mono=False):
    candidates = [
        "/System/Library/Fonts/Menlo.ttc" if mono else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf" if mono else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, round(size * SCALE))
    return ImageFont.load_default(size=round(size * SCALE))


class Scene:
    def __init__(self):
        self.image = Image.new("RGB", (640 * SCALE, 360 * SCALE), BG)
        self.d = ImageDraw.Draw(self.image)
        for x in range(0, 640, 32):
            self.line([(x, 0), (x, 360)], GRID, 0.5)
        for y in range(0, 360, 32):
            self.line([(0, y), (640, y)], GRID, 0.5)
        for x, y in [(20, 20), (620, 20), (20, 340), (620, 340)]:
            self.line([(x-4, y), (x+4, y)], MUTED, 0.7)
            self.line([(x, y-4), (x, y+4)], MUTED, 0.7)

    def line(self, points, fill, width=2):
        self.d.line([(round(x*SCALE), round(y*SCALE)) for x, y in points], fill=fill, width=max(1, round(width*SCALE)), joint="curve")

    def polygon(self, points, fill=LAND):
        self.d.polygon([(round(x*SCALE), round(y*SCALE)) for x, y in points], fill=fill)

    def rect(self, box, fill, outline=None, radius=5, width=1):
        self.d.rounded_rectangle(tuple(round(p*SCALE) for p in box), radius=round(radius*SCALE), fill=fill, outline=outline, width=round(width*SCALE))

    def circle(self, x, y, radius, fill=None, outline=None, width=1):
        self.d.ellipse(tuple(round(p*SCALE) for p in (x-radius, y-radius, x+radius, y+radius)), fill=fill, outline=outline, width=round(width*SCALE))

    def text(self, xy, text, size=11, fill=WHITE, mono=True, anchor=None):
        self.d.text(tuple(round(p*SCALE) for p in xy), text, font=font(size, mono), fill=fill, anchor=anchor)

    def pill(self, text, fill=LIME):
        self.rect((204, 21, 436, 48), "#132a2e", "#48644b")
        self.text((320, 35), text, 10, fill, anchor="mm")

    def post(self, point, label, secured=False, selected=False):
        x, y = point
        if selected:
            self.circle(x, y, 19, outline=LIME, width=2)
            self.circle(x, y, 24, outline="#6b864e")
        self.circle(x, y, 11, LIME if secured else WHITE, WHITE, 2)
        self.text((x, y), label, 9, "#1c302c", anchor="mm")

    def squad(self, point, label="A"):
        x, y = point
        self.rect((x-14, y-14, x+14, y+14), BLUE, WHITE, radius=6, width=2)
        self.text((x, y), label, 12, WHITE, anchor="mm")

    def runner(self, point):
        x, y = point
        self.circle(x, y, 14, RED, WHITE, 2)
        self.circle(x+3, y-6, 2.4, WHITE)
        self.line([(x-5, y-2), (x, y-4), (x+4, y+2), (x+8, y+3)], WHITE, 1.7)
        self.line([(x, y-4), (x-1, y+3), (x-6, y+8)], WHITE, 1.7)
        self.line([(x-1, y+3), (x+3, y+6), (x+4, y+10)], WHITE, 1.7)

    def cursor(self, point):
        x, y = point
        self.polygon([(x, y), (x+3, y+19), (x+8, y+13), (x+16, y+12)], WHITE)
        self.line([(x, y), (x+3, y+19), (x+8, y+13), (x+16, y+12), (x, y)], "#0b1a21", 1)

    def cards(self, selected=False):
        for i, label in enumerate("ABC"):
            x = 167 + i*104
            self.rect((x, 294, x+94, 329), "#10262c", LIME if selected and i == 0 else "#3e5751")
            self.text((x+47, 311), f"SQUAD {label}", 10, LIME if selected and i == 0 else WHITE, anchor="mm")

    def land(self):
        self.polygon([(100, 64), (537, 64), (584, 110), (567, 273), (100, 273), (75, 235), (110, 195), (85, 145)])
        self.line([(100, 64), (85, 145), (110, 195), (75, 235), (100, 273)], "#60b8b7", 2)
        self.text((34, 179), "SEA", 9, "#60b8b7")

    def finish(self):
        return self.image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)


def curve(a, b, t, bow=-55):
    cx, cy = (a[0]+b[0])/2, (a[1]+b[1])/2+bow
    return ((1-t)**2*a[0]+2*(1-t)*t*cx+t*t*b[0], (1-t)**2*a[1]+2*(1-t)*t*cy+t*t*b[1])


def dotted(s, a, b, bow=-55):
    for n in range(25):
        if n % 2 == 0:
            s.line([curve(a, b, n/25, bow), curve(a, b, (n+1)/25, bow)], "#88b1a2", 1)


def mission(t):
    s = Scene()
    continents = [
        [(68,94),(115,66),(183,75),(207,100),(180,127),(158,140),(141,176),(116,161),(103,133),(75,126)],
        [(158,182),(199,185),(223,222),(208,264),(182,293),(174,241),(153,208)],
        [(285,109),(305,86),(338,96),(345,117),(315,135),(289,131)],
        [(302,142),(348,146),(368,190),(343,250),(317,239),(289,188)],
        [(346,99),(386,69),(460,80),(488,105),(556,103),(573,133),(531,163),(484,153),(458,187),(430,200),(406,163),(370,151)],
        [(474,238),(524,223),(550,246),(527,271),(486,269)],
    ]
    for points in continents:
        s.polygon(points)
        s.line([*points, points[0]], "#416359", 1)
    for i, (x,y) in enumerate([(155,108),(326,116),(436,164)]):
        radius = 14 + ((t*2+i*.3) % 1)*24
        s.circle(x, y, radius, outline="#713d4a")
        s.circle(x, y, 5, RED)
    s.line([(326,116),(436,164)], "#82a575", 1)
    s.runner((436,164))
    s.squad((396,219))
    s.squad((491,186), "B")
    s.pill("THE CASE FILES ARE OPEN", RED)
    s.text((320,315), "YOU LEAD THE CHASE", 12, LIME, anchor="mm")
    return s.finish()


def order(t):
    s = Scene(); s.land()
    moving = .30 <= t < .78
    arrived = t >= .78
    selected = t >= .13
    a, b = (190,190), (440,165)
    s.line([(190,76),(190,273)], MUTED if t >= .30 else LIME, 3 if t >= .30 else 5)
    s.line([(380,64),(500,273)], LIME if arrived or selected else MUTED, 5 if selected else 3)
    dotted(s, a, b)
    s.post(a,"01",t < .30)
    s.post(b,"02",arrived,selected and not arrived)
    if moving: s.squad(curve(a,b,(t-.30)/.48))
    elif not arrived: s.squad(a)
    else: s.squad(b)
    s.runner((300+max(0,min(1,(t-.30)/.48))*38,230))
    s.cards(.22 <= t < .78)
    if t < .22: s.cursor((453,178))
    elif t < .30: s.cursor((224,315))
    s.pill("1. SELECT A POST" if t < .22 else "2. CHOOSE A SQUAD" if t < .30 else "OLD BORDER UNGUARDED" if moving else "NEW BORDER GUARDED")
    return s.finish()


def runner(t):
    s = Scene(); s.land()
    a,b = (170,170),(310,145)
    progress = max(0,min(1,(t-.18)/.34))
    rp = max(0,min(1,(t-.18)/.64))
    s.line([(170,64),(170,273)], LIME if t < .18 else MUTED, 4)
    s.line([(310,64),(310,273)], LIME if t >= .52 else MUTED, 4)
    s.post(a,"01", t < .18); s.post(b,"02",t >= .52)
    dotted(s,a,b,-30)
    s.squad(curve(a,b,progress,-30))
    s.runner((406+rp*105,233-rp*55))
    s.cards()
    s.pill("THINKING TIME = PAUSED" if t < .18 or t >= .82 else "BOTH MOVE TOGETHER" if t < .52 else "POST GUARDED. FUGITIVE MOVES.")
    s.text((461,267), "FUGITIVE" if .18 <= t < .82 else "PAUSED", 9, RED, anchor="mm")
    return s.finish()


def containment(t):
    s = Scene(); s.land()
    arrived = t >= .66
    s.line([(100,90),(400,90)], LIME, 5)
    s.line([(100,273),(400,273)], LIME, 5)
    s.line([(400,90),(400,273)], LIME if arrived else MUTED, 5 if arrived else 3)
    s.line([(100,90),(85,145),(110,195),(75,235),(100,273)], "#60b8b7", 4)
    s.post((240,90),"B",True); s.post((240,273),"C",True)
    s.post((400,182),"02",arrived,not arrived)
    progress=max(0,min(1,(t-.18)/.48))
    s.squad(curve((524,237),(400,182),progress,-30))
    s.runner((269+progress*57,185))
    s.text((503,110), "LAND EXIT", 9, MUTED, anchor="mm")
    s.line([(469,127),(548,127)], MUTED, 1)
    s.pill("CLOSE THE LAST GAP" if not arrived else "FUGITIVE CAUGHT", LIME)
    if arrived:
        s.rect((170,212,357,242),"#142d2a","#739958")
        s.text((263,227),"NO LAND ESCAPE ROUTE",9,LIME,anchor="mm")
    s.text((320,313),"GUARDED BMOVES AND SEA CLOSE THE NET",10,LIME,anchor="mm")
    return s.finish()


def hint(t):
    s = Scene(); s.land()
    shown = t >= .25
    s.line([(190,64),(190,273)],LIME,5)
    s.line([(380,64),(500,273)],LIME if shown else MUTED,5 if shown else 3)
    s.post((190,190),"A",True)
    s.post((440,165),"02",False,shown)
    s.runner((322,235))
    s.cards(shown)
    s.rect((65,78,233,114),"#122a2d","#88a866")
    s.text((149,96),"SHOW HINT / FREE",11,LIME,anchor="mm")
    s.rect((473,78,569,114),"#122a2d","#44614e")
    s.text((521,96),f"{CONFIG['openingMaxOrders']} MOVES",10,LIME,anchor="mm")
    if shown:
        s.rect((65,130,258,171),"#122a2d","#88a866")
        s.text((161,151),"SQUAD A > POST 02",11,LIME,anchor="mm")
        s.cursor((452,182))
    else: s.cursor((199,102))
    s.pill("FREE INTELLIGENCE. YOUR CALL.")
    s.text((320,349),"NO TIME, MOVES OR POINTS SPENT",8,MUTED,anchor="mm")
    return s.finish()


for name, render in [("mission",mission),("order",order),("runner",runner),("containment",containment),("hint",hint)]:
    count = round(FPS * SECONDS)
    frames = [render(i/(count-1)) for i in range(count)]
    # A shared palette avoids flicker across frames while keeping GIFs compact.
    palette = frames[round(count*.85)].quantize(colors=128)
    frames = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    frames[0].save(OUT/f"{name}.gif",save_all=True,append_images=frames[1:],duration=round(1000/FPS),loop=0,optimize=True,disposal=1)
    render(.85).save(OUT/f"{name}.png",optimize=True)
    print(f"{name}: {count} frames, {(OUT/f'{name}.gif').stat().st_size // 1024} KiB")
