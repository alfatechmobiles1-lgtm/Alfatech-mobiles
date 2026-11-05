"""Copy public/catalog.json into the DEFAULT_CATALOG inside public/index.html.
Run after every catalogue edit:  python3 tools/sync_catalog.py"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
cat = json.loads((root / 'public/catalog.json').read_text(encoding='utf-8'))
idx = root / 'public/index.html'
s = idx.read_text(encoding='utf-8')
a = s.index('const DEFAULT_CATALOG = ') + len('const DEFAULT_CATALOG = ')
b = s.index(';\nasync function loadCatalog', a)
s = s[:a] + json.dumps(cat, ensure_ascii=False, separators=(',', ':')) + s[b:]
idx.write_text(s, encoding='utf-8')
print('synced', len(cat['models']), 'models')
