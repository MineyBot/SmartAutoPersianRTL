"""ساخت تصویر قهرمان README: مقایسه‌ی «قبل | بعد».

درس‌هایی که از چند ساخت و بازبینی بصری گرفته شد:
  ۱) نشانه‌ی ✗/✓ را نباید با ایموجی نوشت — Pillow با فونت‌های ویندوز آن‌ها را
     «tofu» رندر می‌کند؛ اینجا با خط ترسیم می‌شوند.
  ۲) گیت‌هاب تصویر README را در ستونی ~۸۶۰ پیکسلی نشان می‌دهد، پس فایل ۱۷۰۰
     پیکسلی نصف می‌شود: هر قلم و هر خط باید دو برابر اندازه‌ی نهایی باشد.
  ۳) برش کوتاه بماند؛ بلوک کد که هیچ تفاوتی نشان نمی‌دهد نباید نیمی از قاب را
     بخورد.
  ۴) نشانه‌گذاری روی خودِ اسکرین‌شات (دایره/گیره با مختصات محاسبه‌شده) شکننده
     است: هر بار که شات دوباره ساخته شود مختصات جابه‌جا می‌شود و نشانه به عنصر
     اشتباه اشاره می‌کند. توضیح «چه چیزی غلط است» جای بهتری در متن README دارد
     که هم قابل‌جست‌وجو است و هم برای خواننده‌ی صفحه‌خوان قابل‌دسترس. پس اینجا
     فقط دو ستون تمیز می‌سازیم و قطبیت را با ✗/✓، رنگ و زیرعنوان می‌رسانیم.
  ۵) دو نسخه‌ی روشن و تیره، برای <picture> با prefers-color-scheme.
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")

CROP_H = 1030          # کمی پس از انتهای لیست «مراحل کار» (ol.bottom = 1010)
TARGET_W = 1700        # ~۲× ستون محتوای گیت‌هاب

THEMES = {
    "hero": dict(bg=(255, 255, 255), mut=(84, 94, 112), line=(214, 221, 232),
                 bad=(188, 30, 60), good=(68, 76, 224)),
    "hero-dark": dict(bg=(13, 17, 23), mut=(150, 162, 182), line=(46, 54, 70),
                      bad=(255, 120, 144), good=(148, 154, 255)),
}


def font(size, bold=False):
    for name in (
        "seguisb.ttf" if bold else "segoeui.ttf",
        "arialbd.ttf" if bold else "arial.ttf",
        "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",
    ):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_cross(d, cx, cy, r, color, wd):
    d.line([(cx - r, cy - r), (cx + r, cy + r)], fill=color, width=wd)
    d.line([(cx - r, cy + r), (cx + r, cy - r)], fill=color, width=wd)


def draw_check(d, cx, cy, r, color, wd):
    """✗ دو خط کامل دارد و ✓ یک خط شکسته‌ی کوتاه‌تر؛ با ضخامت یکسان، ✗ پررنگ‌تر
    دیده می‌شود و ستون «خراب» از محصول بلندتر فریاد می‌زند. با ضخامت بیشترِ تیک
    جبران می‌شود تا وزن بصری دو نشانه برابر شود."""
    w2 = int(round(wd * 1.25))
    d.line([(cx - r, cy + r * 0.1), (cx - r * 0.28, cy + r * 0.84)], fill=color, width=w2)
    d.line([(cx - r * 0.28, cy + r * 0.84), (cx + r, cy - r * 0.84)], fill=color, width=w2)


before = Image.open(os.path.join(DOCS, "before.png")).convert("RGB")
after = Image.open(os.path.join(DOCS, "after.png")).convert("RGB")
w = min(before.width, after.width)
h = min(CROP_H, before.height, after.height)
before = before.crop((0, 0, w, h))
after = after.crop((0, 0, w, h))

BAND = 138
GAP = 48
PAD = 36
BAR = 8
INSET = 16

for name, T in THEMES.items():
    panel_w = w + INSET * 2
    panel_h = h + INSET * 2
    canvas_w = PAD * 2 + panel_w * 2 + GAP
    canvas_h = PAD * 2 + BAND + panel_h
    img = Image.new("RGB", (canvas_w, canvas_h), T["bg"])
    d = ImageDraw.Draw(img)

    f_title = font(50, True)
    f_sub = font(33)

    y_img = PAD + BAND
    cols = [
        (PAD, "cross", "Without the extension",
         "Persian left-aligned \u00b7 list marker stranded", T["bad"], before),
        (PAD + panel_w + GAP, "check", "Persian Web Mixer",
         "Persian right-aligned \u00b7 list marker attached", T["good"], after),
    ]

    for x, mark, title, sub, color, shot in cols:
        my = PAD + 27
        # ✗ دو خط کامل دارد و همیشه سنگین‌تر دیده می‌شود؛ شعاعش کمی کوچک‌تر و
        # خطش نازک‌تر گرفته می‌شود تا وزن دو نشانه برابر شود.
        if mark == "cross":
            draw_cross(d, x + 24, my, 16, color, 6)
        else:
            draw_check(d, x + 24, my, 18, color, 6)
        d.text((x + 62, PAD), title, fill=color, font=f_title)
        d.text((x + 62, PAD + 62), sub, fill=T["mut"], font=f_sub)
        d.rectangle([x, y_img - BAR - 9, x + panel_w - 1, y_img - 10], fill=color)
        d.rectangle([x, y_img, x + panel_w - 1, y_img + panel_h - 1],
                    outline=T["line"], width=3)
        img.paste(shot, (x + INSET, y_img + INSET))

    out = os.path.join(DOCS, name + ".png")
    if img.width > TARGET_W:
        r = TARGET_W / img.width
        img = img.resize((TARGET_W, int(img.height * r)), Image.LANCZOS)
    img.save(out, optimize=True)
    print("%-15s %dx%d  %.0f KB" % (name + ".png", img.width, img.height,
                                    os.path.getsize(out) / 1024))
