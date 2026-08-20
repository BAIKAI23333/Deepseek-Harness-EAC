import re

# 修复 core.js
with open('dsh-desktop/assets/plugins/picturereader/src/core.js', 'r', encoding='utf-8') as f:
    content = f.read()

# PaddleOCR 字段名
old1 = '"w": max(xs)-min(xs), "h": max(ys)-min(ys)'
new1 = '"width": max(xs)-min(xs), "height": max(ys)-min(ys)'
content = content.replace(old1, new1)

old2 = '"w": 0, "h": 0'
new2 = '"width": 0, "height": 0'
content = content.replace(old2, new2)

with open('dsh-desktop/assets/plugins/picturereader/src/core.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('core.js fixed')

# 修复 vlm.js
with open('dsh-desktop/assets/plugins/picturereader/src/vlm.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 添加 isLocalEndpoint 函数
if 'isLocalEndpoint' not in content:
    insert = """/**
 * Check if the endpoint is on localhost (no API key required).
 * @param {string} baseURL - the VLM endpoint base URL.
 * @returns {boolean} true when it's a local endpoint.
 */
function isLocalEndpoint(baseURL) {
  const u = baseURL.replace(/\\/v1$/, '').replace(/\\/+$/, '');
  return /^http:\\/\\/(127\\.0\\.0\\.1|localhost):\\d+$/.test(u);
}

"""
    content = content.replace(
        '/**\n * Check if the endpoint is a managed local server.',
        insert + '/**\n * Check if the endpoint is a managed local server.'
    )
    content = content.replace(
        'const isLocal = isManagedEndpoint(base, DEFAULT_PORT)',
        'const isLocal = isLocalEndpoint(base)'
    )

with open('dsh-desktop/assets/plugins/picturereader/src/vlm.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('vlm.js fixed')
