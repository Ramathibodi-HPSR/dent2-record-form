# Builds preview.local.html (offline look check, no login, no network) from ../index.html.
# Data: preview-data.local.js from dump-preview.cjs. Open http://localhost:8795/scripts/preview.local.html#claims
# Hash routes: #home #kids #enrol #claims #file:<study id>:<exam|plan|tx>
import pathlib, re
here = pathlib.Path(__file__).parent
s = (here.parent / "index.html").read_text(encoding="utf-8")
# Asset URLs may carry a version query (app.js?v=1.0.1, UX review R2-01); keep it so the preview busts the cache too.
s = re.sub(r'href="(style|app)\.css(\?[^"]*)?"', r'href="../\1.css\2"', s)
s = s.replace('<script src="vendor/supabase.js"></script>', '<script src="preview-data.local.js"></script>\n<script src="preview-mock.js"></script>')
s = re.sub(r'<script src="config\.js(\?[^"]*)?"></script>', r'<script src="../config.js\1"></script>', s)
s = re.sub(r'<script src="app\.js(\?[^"]*)?"></script>', r'<script src="../app.js\1"></script>\n<script src="preview-route.js"></script>', s)
for need in ('../style.css', '../app.css', '../config.js', '../app.js', 'preview-mock.js', 'preview-route.js'):
    assert need in s, f"make-preview: {need} not found in index.html"

s = s.replace("<title>Dent-II Record Form</title>", "<title>Dent-II Record Form · offline preview</title>")
(here / "preview.local.html").write_text(s, encoding="utf-8")
print("preview.local.html written")
