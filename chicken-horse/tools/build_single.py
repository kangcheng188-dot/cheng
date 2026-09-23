#!/usr/bin/env python3
"""把 index.html + style.css + js/*.js 打包成一个独立 HTML 文件。

用法：
  python3 tools/build_single.py out.html            # 完整 HTML（可直接双击打开）
  python3 tools/build_single.py out.html --fragment # 去掉 <html>/<head>/<body> 外壳（用于托管平台自带外壳的场景）
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKER_MODULES = ['util.js', 'level.js', 'items.js', 'physics.js', 'world.js', 'ai.js', 'ai_worker.js']


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    out = Path(sys.argv[1])
    fragment = '--fragment' in sys.argv
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    css = (ROOT / 'style.css').read_text(encoding='utf-8')
    html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + css + '\n</style>')

    def inline(m):
        src = m.group(1)
        code = (ROOT / src).read_text(encoding='utf-8')
        assert '</script' not in code, src
        return '<script>\n' + code + '\n</script>'

    html = re.sub(r'<script src="(js/[^"]+)"></script>', inline, html)
    worker_src = 'self.window = self;\n' + '\n'.join((ROOT / 'js' / m).read_text(encoding='utf-8') for m in WORKER_MODULES)
    assert '</script' not in worker_src
    worker_tag = '<script type="text/plain" id="uch-worker-src">\n' + worker_src + '\n</script>\n'
    html = html.replace('<script>\n', worker_tag + '<script>\n', 1)

    if fragment:
        head = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
        body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
        # 外壳已提供 charset / viewport，只保留标题、描述、字体与样式
        head = re.sub(r'<meta charset[^>]*>\s*', '', head)
        head = re.sub(r'<meta name="viewport"[^>]*>\s*', '', head)
        html = head.strip() + '\n' + body.strip() + '\n'
    out.write_text(html, encoding='utf-8')
    print(f'wrote {out} ({out.stat().st_size / 1024:.0f} KB)')


if __name__ == '__main__':
    main()
