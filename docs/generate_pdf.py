#!/usr/bin/env python3
"""将 Markdown 教程转为 HTML，然后用 Playwright 打印为 PDF"""

import os
import re
import markdown

DOCS_DIR = os.path.dirname(os.path.abspath(__file__))
MD_FILE = os.path.join(DOCS_DIR, "memory-tutorial.md")
HTML_FILE = os.path.join(DOCS_DIR, "memory-tutorial.html")

# 读取 markdown
with open(MD_FILE, "r", encoding="utf-8") as f:
    md_content = f.read()

# 去掉 HTML 注释
md_content = re.sub(r'<!--.*?-->', '', md_content, flags=re.DOTALL)

# 图片路径转绝对路径 (file://)
md_content = md_content.replace(
    "](./images/",
    f"](file://{DOCS_DIR}/images/"
)

# markdown -> html
html_body = markdown.markdown(
    md_content,
    extensions=["tables", "fenced_code", "toc"]
)

html_full = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
body {{
    font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    font-size: 14px;
    line-height: 1.8;
    color: #333;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
}}
h1 {{
    font-size: 28px;
    color: #1a1a2e;
    border-bottom: 3px solid #4361ee;
    padding-bottom: 8px;
}}
h2 {{
    font-size: 21px;
    color: #4361ee;
    border-bottom: 1px solid #ddd;
    padding-bottom: 6px;
    margin-top: 32px;
}}
h3 {{ font-size: 17px; color: #555; margin-top: 22px; }}
blockquote {{
    border-left: 4px solid #4361ee;
    margin: 12px 0;
    padding: 8px 16px;
    background: #f0f4ff;
    color: #555;
}}
table {{
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0;
    font-size: 13px;
}}
th, td {{
    border: 1px solid #ddd;
    padding: 8px 10px;
    text-align: left;
}}
th {{ background: #4361ee; color: white; }}
tr:nth-child(even) {{ background: #f8f9fa; }}
code {{
    background: #f0f0f0;
    padding: 2px 5px;
    border-radius: 3px;
    font-size: 12px;
    font-family: "SF Mono", "Menlo", monospace;
}}
pre {{
    background: #1e1e2e;
    color: #cdd6f4;
    padding: 14px;
    border-radius: 6px;
    font-size: 12px;
    line-height: 1.5;
    overflow-x: auto;
}}
pre code {{ background: none; padding: 0; color: inherit; }}
img {{
    max-width: 100%;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    margin: 12px 0;
}}
hr {{ border: none; border-top: 1px solid #ddd; margin: 28px 0; }}
li {{ margin: 4px 0; }}
</style>
</head>
<body>
{html_body}
</body>
</html>"""

with open(HTML_FILE, "w", encoding="utf-8") as f:
    f.write(html_full)

print(f"HTML 已生成: {{HTML_FILE}}")
print("接下来用 Playwright 打印为 PDF...")
