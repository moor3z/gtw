"""Cache-busting: stamps every CSS/JS reference with ?v=<number> so browsers fetch
new files straight after an update. Usage: python3 tools/bump_version.py 5"""
import re, sys, pathlib
v = sys.argv[1]
root = pathlib.Path(__file__).resolve().parent.parent / 'public'
for f in list(root.rglob('*.html')) + list((root / 'assets/js').glob('*.js')):
    s = f.read_text()
    n = re.sub(r"(/assets/(?:css|js)/[\w-]+\.(?:css|js))(\?v=\w+)?", rf"\1?v={v}", s)          # HTML links/scripts
    n = re.sub(r"(from '\./[\w-]+\.js)(\?v=\w+)?'", rf"\1?v={v}'", n)                           # JS imports
    if n != s: f.write_text(n); print('stamped', f.relative_to(root))
