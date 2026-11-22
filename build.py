"""Package only runtime files; no dependencies or network access."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json
from urllib.parse import urlparse

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
version = manifest['version']
# Zotero's extension manager requires these compatibility and update properties.
application = manifest['applications']['zotero']
for required in ['id', 'update_url', 'strict_max_version']:
    if not application.get(required):
        raise ValueError('Missing applications.zotero.' + required)
if urlparse(application['update_url']).scheme != 'https':
    raise ValueError('Zotero requires an HTTPS update_url')
output = root / 'dist' / ('bilingual-records-' + version + '.xpi')
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for name in ['manifest.json', 'bootstrap.js', 'core.js', 'plugin.js', 'editor.xhtml', 'editor.js', 'authors.js', 'journals.js', 'journal-manager.xhtml', 'journal-manager.js', 'vendor/pinyin-pro.js', 'vendor/pinyin-pro.LICENSE', 'icons/bilingual.svg', 'icons/bilingual-dark.svg']:
        archive.write(root / name, name)
print(output)
