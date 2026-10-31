# Builds preview.local.html (offline look check, no login, no network) from ../index.html.
# Data: preview-data.local.js from dump-preview.cjs. Open http://localhost:8795/scripts/preview.local.html#claims
# Hash routes: #home #kids #enrol #claims #file:<study id>:<exam|plan|tx>
import pathlib
here = pathlib.Path(__file__).parent
s = (here.parent / "index.html").read_text(encoding="utf-8")
s = s.replace('href="style.css"', 'href="../style.css"').replace('href="app.css"', 'href="../app.css"')
s = s.replace('<script src="vendor/supabase.js"></script>', '<script src="preview-data.local.js"></script>\n<script src="preview-mock.js"></script>')
s = s.replace('<script src="config.js"></script>', '<script src="../config.js"></script>').replace('<script src="app.js"></script>', '<script src="../app.js"></script>\n<script src="preview-route.js"></script>')
s = s.replace("<title>Dent-II Record Form</title>", "<title>Dent-II Record Form · offline preview</title>")
(here / "preview.local.html").write_text(s, encoding="utf-8")
print("preview.local.html written")
