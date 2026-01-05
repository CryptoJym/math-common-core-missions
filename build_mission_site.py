import os
import re

# Configuration
SOURCE_DIR = "Math_Power_Missions_Enhanced"
OUTPUT_DIR = "Math_Mission_Control"

if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

# HTML Templates
HEADER_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;600&family=Nunito:wght@400;700&display=swap" rel="stylesheet">
    <style>
        :root {{
            --primary: #4361ee;
            --secondary: #3f37c9;
            --accent: #f72585;
            --bg: #f8f9fa;
            --card-bg: #ffffff;
            --text: #2b2d42;
        }}
        body {{
            font-family: 'Nunito', sans-serif;
            background-color: var(--bg);
            color: var(--text);
            margin: 0;
            padding: 20px;
        }}
        h1, h2, h3 {{ font-family: 'Fredoka', sans-serif; color: var(--secondary); }}
        .container {{ max-width: 800px; margin: 0 auto; }}
        .mission-card {{
            background: var(--card-bg);
            border-radius: 20px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 10px 20px rgba(0,0,0,0.05);
            border-bottom: 5px solid var(--primary);
        }}
        .checklist-item {{
            background: #eef4ff;
            margin: 10px 0;
            padding: 15px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            cursor: pointer;
            transition: transform 0.2s;
        }}
        .checklist-item:hover {{ transform: scale(1.02); background: #dce9ff; }}
        .checklist-item input {{ margin-right: 15px; transform: scale(1.5); }}
        .nav-btn {{
            display: inline-block;
            background: var(--primary);
            color: white;
            padding: 10px 20px;
            border-radius: 50px;
            text-decoration: none;
            font-weight: bold;
            margin-bottom: 20px;
        }}
        pre {{
            background: #2b2d42;
            color: #4cc9f0;
            padding: 15px;
            border-radius: 10px;
            overflow-x: auto;
            font-family: monospace;
        }}
        .progress-container {{
            position: fixed; top: 0; left: 0; width: 100%; height: 8px; background: #ddd; z-index: 1000;
        }}
        .progress-bar {{ height: 100%; background: var(--accent); width: 0%; transition: width 0.3s; }}
    </style>
</head>
<body>
    <div class="progress-container"><div class="progress-bar" id="progressBar"></div></div>
    <div class="container">
        <a href="index.html" class="nav-btn">← Back to Base</a>
