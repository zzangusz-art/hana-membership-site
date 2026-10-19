# 월간 리포트용: 캡처 PNG에서 보여 줄 부분만 잘라 JPEG로 저장
# 인자: 원본 대상 위치[top|bottom|0~1] 높이/너비비율 — 위치가 숫자(우리 링크 위치)면 그 자리에 빨간 테두리를 그린다
import sys
from PIL import Image, ImageDraw
src, dst, pos, ratio = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
im = Image.open(src).convert('RGB'); w, h = im.size; ch = min(h, int(w * ratio))
hit = None
if pos == 'top': y = 0
elif pos == 'bottom': y = h - ch
else: hit = float(pos) * h; y = int(hit - ch * 0.3)
y = max(0, min(h - ch, y)); c = im.crop((0, y, w, y + ch))
if hit is not None:
    hy = int(hit - y); d = ImageDraw.Draw(c)
    d.rectangle((6, max(0, hy - 14), int(w * 0.62), min(ch - 1, hy + 96)), outline=(214, 40, 40), width=5)
if c.width > 1000: c = c.resize((1000, int(c.height * 1000 / c.width)))
c.save(dst, 'JPEG', quality=78)
