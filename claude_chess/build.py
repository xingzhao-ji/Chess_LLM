import re
src = lambda f: open('src/' + f).read()
engine = src('engine.js')
assert '</script' not in engine
module = "\n".join([src('textures.js'), src('pieces.js'), src('scene.js'), src('app.js')])
assert '</script' not in module
html = src('page.html') + f"""
<script id="engine-src">
{engine}
</script>
<script type="importmap">{{"imports":{{"three":"https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/"}}}}</script>
<script type="module">
import * as THREE from 'three';
import {{ mergeGeometries }} from 'three/addons/utils/BufferGeometryUtils.js';
{module}
</script>
"""
open('index.html', 'w').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>' + html + '</body></html>')
print('wrote index.html', len(html))
