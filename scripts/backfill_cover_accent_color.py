#!/usr/bin/env python3
# ============================================================
# backfill_cover_accent_color.py · 课程封面强调色回填(PM 2026-07-02 决策·方案2)
# --------------------------------------------------------------------------
# 对每门有 cover_image_url 的课程,下载封面、忽略近白/近黑/低饱和像素后,
# 取最鲜艳的一撮像素的均值作为「强调色」,写回 courses.cover_accent_color。
# 为什么不用整图平均色:实测 25 张真实封面(明光网系列)平均色几乎全落在
# 同一米白/浅灰区间(#d2~#e7),背景照平均色做基本看不出差异;忽略近白背景后
# 取鲜艳像素簇,才能反映每本书插画的实际主色(蓝/金/赭…)。
#
# 用法:
#   SUPABASE_SERVICE_ROLE_KEY=<sss-dev 的 service_role>  python3 scripts/backfill_cover_accent_color.py
#   加 --dry-run 只打印不写库。
# ⚠️ 仅 sss-dev!本脚本不做项目 ref 校验,运行前自行确认 SUPABASE_URL 指向 dev。
# ============================================================
import colorsys
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from io import BytesIO

from PIL import Image

SUPABASE_URL = os.environ.get('EXPO_PUBLIC_SUPABASE_URL', 'https://ubyzyadlzmtgxvbxanbr.supabase.co')
SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
DRY_RUN = '--dry-run' in sys.argv

if not SERVICE_KEY:
    print('✗ 需要环境变量 SUPABASE_SERVICE_ROLE_KEY(sss-dev 的 service_role 密钥)', file=sys.stderr)
    sys.exit(1)
if 'ubyzyadlzmtgxvbxanbr' not in SUPABASE_URL:
    print(f'✗ SUPABASE_URL 看起来不是 sss-dev({SUPABASE_URL}),中止(本脚本只允许对 dev 跑)', file=sys.stderr)
    sys.exit(1)

ctx = ssl.create_default_context()
if os.environ.get('NODE_EXTRA_CA_CERTS'):
    ctx = ssl.create_default_context(cafile=os.environ['NODE_EXTRA_CA_CERTS'])


def rest(method, path, body=None, extra_headers=None):
    url = f'{SUPABASE_URL}{path}'
    data = json.dumps(body).encode() if body is not None else None
    headers = {
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json',
        **(extra_headers or {}),
    }
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            body_text = resp.read().decode()
            return resp.status, (json.loads(body_text) if body_text else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]


def extract_accent_color(image_bytes):
    """忽略近白/近黑/低饱和像素,取最鲜艳的前 5% 像素簇均值。全图接近单色(无鲜艳像素)则返回 None。"""
    img = Image.open(BytesIO(image_bytes)).convert('RGB').resize((80, 114))
    pixels = list(img.getdata())
    vivid = []
    for p in pixels:
        r, g, b = (v / 255 for v in p)
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        if 0.15 < v < 0.95 and s > 0.25:
            vivid.append((s * v, p))
    if not vivid:
        return None
    vivid.sort(reverse=True, key=lambda x: x[0])
    top = vivid[: max(1, len(vivid) // 20)]
    avg = tuple(sum(c[1][i] for c in top) // len(top) for i in range(3))
    return '#{:02x}{:02x}{:02x}'.format(*avg)


def main():
    status, courses = rest('GET', '/rest/v1/courses?select=id,name,cover_image_url&cover_image_url=not.is.null&order=name')
    if status != 200:
        print('✗ 拉课程列表失败', status, courses, file=sys.stderr)
        sys.exit(1)

    print(f'共 {len(courses)} 门课程有 cover_image_url,开始提取…')
    ok, skipped, failed = 0, 0, 0
    for c in courses:
        try:
            req = urllib.request.Request(c['cover_image_url'], headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, context=ctx, timeout=20) as resp:
                image_bytes = resp.read()
            color = extract_accent_color(image_bytes)
            if color is None:
                print(f'  ⚠ {c["name"]}: 全图接近单色,未找到鲜艳像素,跳过(维持 NULL)')
                skipped += 1
                continue
            print(f'  ✓ {c["name"]}: {color}')
            if not DRY_RUN:
                st, body = rest('PATCH', f'/rest/v1/courses?id=eq.{c["id"]}', {'cover_accent_color': color})
                if st not in (200, 204):
                    print(f'    ✗ 写库失败 status={st} {body}', file=sys.stderr)
                    failed += 1
                    continue
            ok += 1
        except Exception as e:
            print(f'  ✗ {c["name"]}: {e}', file=sys.stderr)
            failed += 1

    print(f'\n完成:{ok} 成功 · {skipped} 跳过(近单色)· {failed} 失败' + ('(--dry-run,未写库)' if DRY_RUN else ''))


if __name__ == '__main__':
    main()
