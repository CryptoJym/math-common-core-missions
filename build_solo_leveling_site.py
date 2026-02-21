#!/usr/bin/env python3
"""
Math Missions: Solo Leveling Edition
Converts enhanced markdown missions to themed HTML
"""

import os
import re
import glob
import shutil
import markdown

# Configuration
SOURCE_DIR = "src_enhanced"
OUTPUT_DIR = "dist"
IMAGES_DIR = "images"

# Mission metadata with Solo Leveling theming
MISSIONS = {
    1: {"title": "Greatest Common Factor", "rank": "E", "dungeon": "Tutorial Gate: Number Foundations", "color": "#888888"},
    2: {"title": "Inequality & Absolute Value", "rank": "E", "dungeon": "Tutorial Gate: Number Lines", "color": "#888888"},
    3: {"title": "Ratios with Money", "rank": "E", "dungeon": "Tutorial Gate: Currency Realm", "color": "#888888"},
    4: {"title": "Inequalities", "rank": "D", "dungeon": "Basic Dungeon: Symbol Mastery", "color": "#4cc9f0"},
    5: {"title": "Expressions", "rank": "D", "dungeon": "Basic Dungeon: Variable Vault", "color": "#4cc9f0"},
    6: {"title": "Identifying Parts of Expressions", "rank": "D", "dungeon": "Basic Dungeon: Expression Analysis", "color": "#4cc9f0"},
    7: {"title": "Solving Equations", "rank": "C", "dungeon": "Intermediate Raid: Equation Labyrinth", "color": "#00ff88"},
    8: {"title": "Equations (Vacation Planning)", "rank": "C", "dungeon": "Intermediate Raid: Real World Variables", "color": "#00ff88"},
    9: {"title": "Operations with Decimals", "rank": "C", "dungeon": "Intermediate Raid: Decimal Domain", "color": "#00ff88"},
    10: {"title": "Unit Ratios", "rank": "B", "dungeon": "Advanced Dungeon: Ratio Fortress", "color": "#7b2cbf"},
    11: {"title": "Dividing Fractions", "rank": "B", "dungeon": "Advanced Dungeon: Fraction Abyss", "color": "#7b2cbf"},
    12: {"title": "Area of Triangles", "rank": "B", "dungeon": "Advanced Dungeon: Geometry Citadel", "color": "#7b2cbf"},
    13: {"title": "Ratios Tables", "rank": "A", "dungeon": "Elite Raid: Data Stronghold", "color": "#ffd700"},
    14: {"title": "Averages", "rank": "A", "dungeon": "Elite Raid: Statistics Sanctum", "color": "#ffd700"},
    15: {"title": "Unit Conversion", "rank": "A", "dungeon": "Elite Raid: Measurement Nexus", "color": "#ffd700"},
}

# CSS Template
CSS_TEMPLATE = """
:root {
    --bg-primary: #0a0a0f;
    --bg-secondary: #1a1a2e;
    --bg-card: #16213e;
    --accent-blue: #4cc9f0;
    --accent-purple: #7b2cbf;
    --accent-gold: #ffd700;
    --accent-green: #00ff88;
    --accent-red: #ff4444;
    --text-primary: #e0e0e0;
    --text-secondary: #a0a0a0;
    --text-muted: #666;
    --glow-blue: 0 0 20px rgba(76, 201, 240, 0.5);
    --glow-purple: 0 0 20px rgba(123, 44, 191, 0.5);
    --glow-gold: 0 0 20px rgba(255, 215, 0, 0.5);
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    line-height: 1.8;
    min-height: 100vh;
}

/* Animated background */
body::before {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background:
        radial-gradient(ellipse at top left, rgba(123, 44, 191, 0.1) 0%, transparent 50%),
        radial-gradient(ellipse at bottom right, rgba(76, 201, 240, 0.1) 0%, transparent 50%);
    pointer-events: none;
    z-index: -1;
}

.container {
    max-width: 900px;
    margin: 0 auto;
    padding: 20px;
}

/* System Notification Header */
.system-alert {
    background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-card) 100%);
    border: 2px solid var(--accent-blue);
    border-radius: 10px;
    padding: 20px;
    margin-bottom: 30px;
    box-shadow: var(--glow-blue);
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0%, 100% { box-shadow: 0 0 20px rgba(76, 201, 240, 0.3); }
    50% { box-shadow: 0 0 40px rgba(76, 201, 240, 0.6); }
}

.system-alert h1 {
    font-family: 'Courier New', monospace;
    color: var(--accent-blue);
    font-size: 1.5em;
    margin-bottom: 10px;
    text-transform: uppercase;
    letter-spacing: 2px;
}

.system-alert .dungeon-name {
    color: var(--accent-gold);
    font-size: 1.8em;
    font-weight: bold;
    text-shadow: var(--glow-gold);
}

/* Rank Badge */
.rank-badge {
    display: inline-block;
    padding: 8px 20px;
    border-radius: 5px;
    font-weight: bold;
    font-size: 1.2em;
    margin: 10px 0;
    text-transform: uppercase;
    letter-spacing: 3px;
}

.rank-E { background: linear-gradient(135deg, #444 0%, #666 100%); color: #fff; }
.rank-D { background: linear-gradient(135deg, #2a6f97 0%, #4cc9f0 100%); color: #fff; box-shadow: var(--glow-blue); }
.rank-C { background: linear-gradient(135deg, #006644 0%, #00ff88 100%); color: #000; }
.rank-B { background: linear-gradient(135deg, #5a189a 0%, #7b2cbf 100%); color: #fff; box-shadow: var(--glow-purple); }
.rank-A { background: linear-gradient(135deg, #b8860b 0%, #ffd700 100%); color: #000; box-shadow: var(--glow-gold); }

/* Section Cards */
.section-card {
    background: var(--bg-card);
    border-radius: 15px;
    padding: 25px;
    margin-bottom: 25px;
    border-left: 4px solid var(--accent-purple);
    position: relative;
    overflow: hidden;
}

.section-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, rgba(123, 44, 191, 0.05) 0%, transparent 100%);
    pointer-events: none;
}

.section-card h2 {
    color: var(--accent-blue);
    font-size: 1.4em;
    margin-bottom: 15px;
    display: flex;
    align-items: center;
    gap: 10px;
}

.section-card h2 .icon {
    font-size: 1.5em;
}

.section-card h3 {
    color: var(--accent-purple);
    margin: 20px 0 10px;
}

/* Equipment/Materials List */
.equipment-list {
    background: rgba(0, 0, 0, 0.3);
    border-radius: 10px;
    padding: 15px 20px;
    margin: 15px 0;
}

.equipment-list li {
    padding: 8px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    list-style: none;
    position: relative;
    padding-left: 25px;
}

.equipment-list li::before {
    content: '◆';
    position: absolute;
    left: 0;
    color: var(--accent-gold);
}

.equipment-list li:last-child {
    border-bottom: none;
}

/* Skills/Learning Targets */
.skill-box {
    background: linear-gradient(135deg, rgba(123, 44, 191, 0.2) 0%, rgba(76, 201, 240, 0.1) 100%);
    border: 1px solid var(--accent-purple);
    border-radius: 10px;
    padding: 15px 20px;
    margin: 10px 0;
    font-family: 'Courier New', monospace;
    font-size: 0.95em;
}

.skill-box .standard-code {
    color: var(--accent-gold);
    font-weight: bold;
}

/* Strategy Steps */
.strategy-steps {
    counter-reset: step;
}

.strategy-step {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 10px;
    padding: 15px 20px 15px 60px;
    margin: 15px 0;
    position: relative;
}

.strategy-step::before {
    counter-increment: step;
    content: counter(step);
    position: absolute;
    left: 15px;
    top: 50%;
    transform: translateY(-50%);
    width: 35px;
    height: 35px;
    background: var(--accent-purple);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 1.1em;
}

/* Checklist */
.checklist-item {
    background: rgba(0, 255, 136, 0.1);
    border: 1px solid var(--accent-green);
    border-radius: 8px;
    padding: 12px 15px;
    margin: 10px 0;
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    transition: all 0.3s;
}

.checklist-item:hover {
    background: rgba(0, 255, 136, 0.2);
    transform: translateX(5px);
}

.checklist-item input[type="checkbox"] {
    width: 20px;
    height: 20px;
    accent-color: var(--accent-green);
}

/* Quest Complete Box */
.quest-complete {
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.1) 0%, rgba(123, 44, 191, 0.1) 100%);
    border: 2px solid var(--accent-gold);
    border-radius: 15px;
    padding: 25px;
    text-align: center;
    margin-top: 30px;
}

.quest-complete h2 {
    color: var(--accent-gold);
    justify-content: center;
}

/* Navigation */
.nav-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 0;
    margin-bottom: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.nav-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--bg-secondary);
    color: var(--accent-blue);
    padding: 10px 20px;
    border-radius: 25px;
    text-decoration: none;
    font-weight: bold;
    transition: all 0.3s;
    border: 1px solid var(--accent-blue);
}

.nav-btn:hover {
    background: var(--accent-blue);
    color: var(--bg-primary);
    box-shadow: var(--glow-blue);
}

/* Progress Bar */
.progress-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 6px;
    background: var(--bg-secondary);
    z-index: 1000;
}

.progress-bar {
    height: 100%;
    background: linear-gradient(90deg, var(--accent-purple) 0%, var(--accent-blue) 100%);
    width: 0%;
    transition: width 0.3s;
    box-shadow: 0 0 10px var(--accent-blue);
}

/* Links */
a {
    color: var(--accent-blue);
    text-decoration: none;
    transition: all 0.3s;
}

a:hover {
    color: var(--accent-gold);
    text-shadow: 0 0 10px var(--accent-gold);
}

/* Code blocks */
pre, code {
    background: #0d1117;
    border-radius: 8px;
    padding: 2px 6px;
    font-family: 'Courier New', monospace;
    color: var(--accent-green);
}

pre {
    padding: 15px;
    overflow-x: auto;
    border: 1px solid rgba(76, 201, 240, 0.3);
}

/* Mission Image */
.mission-image {
    width: 100%;
    max-height: 300px;
    object-fit: cover;
    border-radius: 15px;
    margin: 20px 0;
    border: 2px solid var(--accent-purple);
    box-shadow: var(--glow-purple);
}

/* Responsive */
@media (max-width: 768px) {
    .container {
        padding: 15px;
    }

    .system-alert .dungeon-name {
        font-size: 1.4em;
    }

    .section-card {
        padding: 20px 15px;
    }
}

/* Tip boxes */
.tip-box {
    background: rgba(255, 215, 0, 0.1);
    border-left: 4px solid var(--accent-gold);
    padding: 15px 20px;
    margin: 15px 0;
    border-radius: 0 10px 10px 0;
}

.tip-box strong {
    color: var(--accent-gold);
}

/* Warning boxes */
.warning-box {
    background: rgba(255, 68, 68, 0.1);
    border-left: 4px solid var(--accent-red);
    padding: 15px 20px;
    margin: 15px 0;
    border-radius: 0 10px 10px 0;
}

.warning-box strong {
    color: var(--accent-red);
}

/* User Nav Bar */
.user-nav {
    position: fixed;
    top: 6px;
    right: 0;
    left: 0;
    z-index: 999;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 15px;
    padding: 8px 20px;
    background: rgba(10, 10, 15, 0.9);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(76, 201, 240, 0.2);
}

.user-nav-info {
    display: flex;
    align-items: center;
    gap: 12px;
}

.user-nav-rank {
    background: linear-gradient(135deg, var(--accent-purple), #5a189a);
    padding: 3px 10px;
    border-radius: 4px;
    font-size: 0.75em;
    font-weight: bold;
    letter-spacing: 1px;
    text-transform: uppercase;
}

.user-nav-name {
    color: var(--accent-blue);
    font-weight: 600;
}

.user-nav-xp {
    color: var(--accent-gold);
    font-size: 0.85em;
}

.user-nav-logout {
    background: transparent;
    border: 1px solid var(--accent-red);
    color: var(--accent-red);
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.85em;
    transition: all 0.3s;
}

.user-nav-logout:hover {
    background: var(--accent-red);
    color: #fff;
}

.user-nav-login {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--accent-blue);
    text-decoration: none;
    font-weight: 600;
    font-size: 0.9em;
    padding: 4px 12px;
    border: 1px solid var(--accent-blue);
    border-radius: 4px;
    transition: all 0.3s;
}

.user-nav-login:hover {
    background: var(--accent-blue);
    color: var(--bg-primary);
}

/* Completion Badge on gate cards */
.completion-badge {
    position: absolute;
    bottom: 15px;
    right: 15px;
    background: linear-gradient(135deg, #006644, var(--accent-green));
    color: #000;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 0.7em;
    font-weight: bold;
    letter-spacing: 2px;
    text-transform: uppercase;
}

.gate-card.mission-cleared {
    border-color: rgba(0, 255, 136, 0.3);
}

/* Push body content down when user-nav is present */
body.has-user-nav {
    padding-top: 50px;
}
"""

# HTML Template for missions
HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title} | Level Up</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Rajdhani:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
    {css}

    h1, h2, .system-alert h1, .rank-badge {{
        font-family: 'Orbitron', sans-serif;
    }}
    </style>
</head>
<body>
    <div class="progress-container">
        <div class="progress-bar" id="progressBar"></div>
    </div>

    <div class="container">
        <nav class="nav-bar">
            <a href="index.html" class="nav-btn">← Return to Level Up HQ</a>
            <span class="rank-badge rank-{rank}">{rank}-RANK</span>
        </nav>

        <div class="system-alert">
            <h1>⚠️ [SYSTEM] DUNGEON GATE DETECTED</h1>
            <div class="dungeon-name">🏰 {dungeon}</div>
            <p style="margin-top: 15px; color: var(--text-secondary);">
                A new challenge awaits. Complete this dungeon to strengthen your mathematical abilities.
            </p>
        </div>

        {content}

    </div>

    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="js/config.js"></script>
    <script src="js/auth.js"></script>
    <script src="js/progress.js"></script>
    <script>
        // Progress bar based on scroll
        window.addEventListener('scroll', () => {{
            const scrollTop = document.documentElement.scrollTop;
            const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            const progress = (scrollTop / scrollHeight) * 100;
            document.getElementById('progressBar').style.width = progress + '%';
        }});

        // Init auth UI and mission progress tracking
        document.addEventListener('DOMContentLoaded', async () => {{
            await MHA_Auth.initAuthUI(false);
            document.body.classList.add('has-user-nav');
            await MHA_Progress.initMissionProgress({mission_num});
        }});
    </script>
</body>
</html>
"""

# Index page template
INDEX_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Level Up | Solo Leveling Edition</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Rajdhani:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
    {css}

    h1, h2, .system-alert h1, .rank-badge, .gate-card h3 {{
        font-family: 'Orbitron', sans-serif;
    }}

    .hero {{
        text-align: center;
        padding: 60px 20px;
        background: linear-gradient(180deg, rgba(123, 44, 191, 0.2) 0%, transparent 100%);
        margin-bottom: 40px;
        border-radius: 20px;
    }}

    .hero h1 {{
        font-size: 2.5em;
        color: var(--accent-gold);
        text-shadow: var(--glow-gold);
        margin-bottom: 10px;
    }}

    .hero .subtitle {{
        font-size: 1.3em;
        color: var(--accent-blue);
        letter-spacing: 3px;
        text-transform: uppercase;
    }}

    .gates-grid {{
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 25px;
        padding: 20px 0;
    }}

    .gate-card {{
        background: var(--bg-card);
        border-radius: 15px;
        padding: 25px;
        text-decoration: none;
        color: var(--text-primary);
        border: 2px solid transparent;
        transition: all 0.3s;
        position: relative;
        overflow: hidden;
    }}

    .gate-card::before {{
        content: '';
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: conic-gradient(transparent, rgba(123, 44, 191, 0.1), transparent 30%);
        animation: rotate 4s linear infinite;
        opacity: 0;
        transition: opacity 0.3s;
    }}

    .gate-card:hover::before {{
        opacity: 1;
    }}

    @keyframes rotate {{
        100% {{ transform: rotate(360deg); }}
    }}

    .gate-card:hover {{
        border-color: var(--accent-purple);
        transform: translateY(-5px);
        box-shadow: var(--glow-purple);
    }}

    .gate-card .gate-rank {{
        position: absolute;
        top: 15px;
        right: 15px;
        padding: 5px 12px;
        border-radius: 4px;
        font-size: 0.8em;
        font-weight: bold;
    }}

    .gate-card .gate-icon {{
        font-size: 3em;
        margin-bottom: 15px;
        display: block;
    }}

    .gate-card h3 {{
        color: var(--accent-blue);
        margin-bottom: 10px;
        font-size: 1.1em;
    }}

    .gate-card p {{
        color: var(--text-secondary);
        font-size: 0.9em;
    }}

    .rank-section {{
        margin: 40px 0 20px;
        padding: 15px 20px;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 10px;
        border-left: 4px solid;
    }}

    .rank-section h2 {{
        display: flex;
        align-items: center;
        gap: 15px;
    }}
    </style>
</head>
<body>
    <div class="container">
        <div class="hero">
            <h1>⚔️ LEVEL UP</h1>
            <p class="subtitle">Solo Leveling Edition</p>
            <p style="margin-top: 20px; color: var(--text-secondary); max-width: 600px; margin-left: auto; margin-right: auto;">
                Welcome to Level Up. 15 Dungeon Gates have appeared. Each contains mathematical challenges
                aligned to the ancient Common Core Standards. Complete them all to achieve S-Rank mastery.
            </p>

            <div id="authNotice" style="display:none; margin-top: 16px; max-width: 720px; margin-left: auto; margin-right: auto; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(255, 68, 68, 0.55); background: rgba(255, 68, 68, 0.12); color: var(--accent-red);">
                This area is restricted.
            </div>
            <a href="la_index.html" class="nav-btn" style="margin-top: 25px; display: inline-flex; background: linear-gradient(135deg, rgba(0, 212, 170, 0.2), rgba(76, 201, 240, 0.2)); border-color: #00d4aa;">
                <span style="font-size: 1.2em;">📚</span> Language Arts Level Up
            </a>

            <div id="bradyPortal" style="display:none; margin-top: 14px;">
                <a href="brady/index.html" class="nav-btn" style="display: inline-flex; background: linear-gradient(135deg, rgba(255, 215, 0, 0.16), rgba(123, 44, 191, 0.16)); border-color: rgba(255, 215, 0, 0.55);">
                    <span style="font-size: 1.2em;">🧠</span> Level Up HQ
                </a>
            </div>
        </div>

        {gate_cards}

    </div>

    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="js/config.js"></script>
    <script src="js/auth.js"></script>
    <script src="js/progress.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', async () => {{
            await MHA_Auth.initAuthUI(false);
            document.body.classList.add('has-user-nav');
            await MHA_Progress.initIndexProgress();

            // Show the private student portal link for authorized accounts.
            const session = await MHA_Auth.getSession();
            const email = String(session?.user?.email || '').trim().toLowerCase();
            const allowed = ['bradyhyro67@gmail.com', 'james@jamesbrady.org'];
            if (allowed.includes(email)) {{
                const portal = document.getElementById('bradyPortal');
                if (portal) portal.style.display = 'block';
            }}

            // If a user is redirected here from a restricted page, show a clear message.
            const params = new URLSearchParams(window.location.search);
            if (params.get('unauthorized') === '1') {{
                const notice = document.getElementById('authNotice');
                if (notice) {{
                    notice.textContent = 'That page is available only to an authorized account.';
                    notice.style.display = 'block';
                }}
            }}
        }});
    </script>
</body>
</html>
"""

def create_directories():
    """Create necessary directories"""
    for dir_path in [OUTPUT_DIR, IMAGES_DIR, SOURCE_DIR]:
        if not os.path.exists(dir_path):
            os.makedirs(dir_path)

def generate_index():
    """Generate the index page with all gates"""
    gate_icons = ['🌀', '⚡', '💰', '📊', '🔮', '🧩', '⚖️', '✈️', '💎', '🏀', '🍕', '📐', '📈', '🎲', '📏']

    gate_cards_html = ""

    # Group by rank
    ranks = [
        ("E", "Tutorial Gates", "#888888", [1, 2, 3]),
        ("D", "Basic Dungeons", "#4cc9f0", [4, 5, 6]),
        ("C", "Intermediate Raids", "#00ff88", [7, 8, 9]),
        ("B", "Advanced Dungeons", "#7b2cbf", [10, 11, 12]),
        ("A", "Elite Raids", "#ffd700", [13, 14, 15]),
    ]

    for rank, rank_name, color, mission_ids in ranks:
        gate_cards_html += f'''
        <div class="rank-section" style="border-color: {color};">
            <h2><span class="rank-badge rank-{rank}">{rank}-RANK</span> {rank_name}</h2>
        </div>
        <div class="gates-grid">
        '''

        for mission_id in mission_ids:
            mission = MISSIONS[mission_id]
            filename = f"mission_{mission_id:02d}.html"
            icon = gate_icons[mission_id - 1]

            gate_cards_html += f'''
            <a href="{filename}" class="gate-card">
                <span class="gate-rank rank-{mission['rank']}">{mission['rank']}-RANK</span>
                <span class="gate-icon">{icon}</span>
                <h3>Mission {mission_id:02d}</h3>
                <p>{mission['title']}</p>
            </a>
            '''

        gate_cards_html += '</div>'

    html = INDEX_TEMPLATE.format(css=CSS_TEMPLATE, gate_cards=gate_cards_html)

    with open(os.path.join(OUTPUT_DIR, "index.html"), 'w') as f:
        f.write(html)

    print("Generated: index.html")

def process_markdown_to_html(md_content, mission_num):
    """Convert markdown content to themed HTML sections"""
    content = md_content

    # Use placeholders for directives so markdown processes the inner content
    # Replace opening tags with unique placeholders
    directive_map = {
        'system-alert': 'SYSALERT',
        'hunter-tip': 'HUNTERTIP',
        'system-complete': 'SYSCOMPLETE',
        'equipment': 'EQUIPMENT',
        'skill-box': 'SKILLBOX',
        'training-links': 'TRAINLINKS',
        'tip': 'TIPBOX',
        'warning': 'WARNBOX',
        'quest': 'QUESTBOX',
        'checklist': 'CHECKLIST',
        'note': 'NOTEBOX',
        'quest-complete': 'QUESTCOMPLETE',
        'strategy': 'STRATEGY',
        'verbatim-instructions': 'VERBATIM'
    }

    # Replace directive markers with placeholder comments
    for directive, placeholder in directive_map.items():
        content = re.sub(
            rf':::{directive}\n',
            f'<!-- {placeholder}_START -->',
            content
        )

    # Replace closing ::: with end placeholder
    content = re.sub(r'\n:::', '\n<!-- DIRECTIVE_END -->', content)

    # Convert markdown to HTML
    html_content = markdown.markdown(content, extensions=['tables', 'fenced_code'])

    # Now convert placeholders to styled divs
    class_map = {
        'SYSALERT': 'system-alert',
        'HUNTERTIP': 'hunter-tip',
        'SYSCOMPLETE': 'system-complete',
        'EQUIPMENT': 'equipment-box',
        'SKILLBOX': 'skill-box',
        'TRAINLINKS': 'training-links',
        'TIPBOX': 'tip-box',
        'WARNBOX': 'warning-box',
        'QUESTBOX': 'quest-box',
        'CHECKLIST': 'checklist-box',
        'NOTEBOX': 'note-box',
        'QUESTCOMPLETE': 'quest-complete',
        'STRATEGY': 'strategy-box',
        'VERBATIM': 'verbatim-box'
    }

    for placeholder, css_class in class_map.items():
        html_content = html_content.replace(
            f'<!-- {placeholder}_START -->',
            f'<div class="{css_class}">'
        )

    html_content = html_content.replace('<!-- DIRECTIVE_END -->', '</div>')

    return html_content

MISSION_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mission {mission_num:02d} - {title} | Level Up</title>
    <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;500;600;700;900&display=swap" rel="stylesheet">
    <style>
    {css}
    </style>
    <style>
    .mission-content {{
        max-width: 900px;
        margin: 0 auto;
        padding: 20px;
    }}

    .mission-header {{
        text-align: center;
        padding: 40px 20px;
        margin-bottom: 30px;
        background: linear-gradient(135deg, rgba(123, 44, 191, 0.2), rgba(76, 201, 240, 0.2));
        border-radius: 15px;
        border: 1px solid var(--accent-purple);
    }}

    .mission-header h1 {{
        font-family: 'Orbitron', sans-serif;
        font-size: 2.5em;
        color: var(--accent-blue);
        margin-bottom: 10px;
    }}

    .mission-body {{
        background: rgba(0, 0, 0, 0.4);
        padding: 40px;
        border-radius: 15px;
        border: 1px solid var(--border-color);
    }}

    .mission-body h2 {{
        color: var(--accent-blue);
        font-family: 'Orbitron', sans-serif;
        border-bottom: 2px solid var(--accent-purple);
        padding-bottom: 10px;
        margin-top: 30px;
    }}

    .mission-body h3 {{
        color: var(--accent-purple);
        margin-top: 25px;
    }}

    .mission-body p {{
        line-height: 1.8;
        margin-bottom: 15px;
    }}

    .mission-body pre {{
        background: rgba(0, 0, 0, 0.6);
        padding: 20px;
        border-radius: 10px;
        border: 1px solid var(--border-color);
        overflow-x: auto;
        font-family: 'Courier New', monospace;
    }}

    .mission-body code {{
        background: rgba(76, 201, 240, 0.2);
        padding: 2px 6px;
        border-radius: 4px;
        font-family: 'Courier New', monospace;
    }}

    .mission-body pre code {{
        background: transparent;
        padding: 0;
    }}

    .mission-body table {{
        width: 100%;
        border-collapse: collapse;
        margin: 20px 0;
    }}

    .mission-body th, .mission-body td {{
        border: 1px solid var(--border-color);
        padding: 12px;
        text-align: left;
    }}

    .mission-body th {{
        background: rgba(123, 44, 191, 0.3);
        color: var(--accent-blue);
    }}

    .mission-body ul, .mission-body ol {{
        margin-left: 20px;
        margin-bottom: 15px;
    }}

    .mission-body li {{
        margin-bottom: 8px;
    }}

    .system-alert {{
        background: linear-gradient(135deg, rgba(76, 201, 240, 0.2), rgba(123, 44, 191, 0.2));
        border: 2px solid var(--accent-blue);
        border-radius: 10px;
        padding: 20px;
        margin: 20px 0;
        font-family: 'Orbitron', sans-serif;
    }}

    .hunter-tip {{
        background: rgba(0, 255, 136, 0.1);
        border-left: 4px solid var(--accent-green);
        padding: 15px 20px;
        margin: 20px 0;
        border-radius: 0 10px 10px 0;
    }}

    .system-complete {{
        background: linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(123, 44, 191, 0.2));
        border: 2px solid #ffd700;
        border-radius: 10px;
        padding: 20px;
        margin: 20px 0;
        text-align: center;
    }}

    .equipment-box {{
        background: rgba(123, 44, 191, 0.15);
        border: 1px solid var(--accent-purple);
        border-radius: 10px;
        padding: 20px;
        margin: 20px 0;
    }}

    .skill-box {{
        background: rgba(76, 201, 240, 0.1);
        border-left: 4px solid var(--accent-blue);
        padding: 15px 20px;
        margin: 15px 0;
        border-radius: 0 10px 10px 0;
    }}

    .training-links {{
        background: rgba(255, 215, 0, 0.1);
        border: 1px solid rgba(255, 215, 0, 0.3);
        border-radius: 10px;
        padding: 15px 20px;
        margin: 20px 0;
    }}

    .training-links a {{
        display: block;
        margin: 8px 0;
    }}

    .quest-box {{
        background: linear-gradient(135deg, rgba(255, 68, 68, 0.1), rgba(123, 44, 191, 0.1));
        border: 2px solid var(--accent-red);
        border-radius: 10px;
        padding: 20px;
        margin: 20px 0;
    }}

    .checklist-box {{
        background: rgba(0, 255, 136, 0.1);
        border: 1px solid var(--accent-green);
        border-radius: 10px;
        padding: 20px;
        margin: 20px 0;
    }}

    .note-box {{
        background: rgba(76, 201, 240, 0.1);
        border-left: 4px solid var(--accent-blue);
        padding: 15px 20px;
        margin: 15px 0;
        border-radius: 0 10px 10px 0;
    }}

    .quest-complete {{
        background: linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(255, 215, 0, 0.15));
        border: 2px solid var(--accent-green);
        border-radius: 10px;
        padding: 20px;
        margin: 20px 0;
        box-shadow: var(--glow-gold);
    }}

    .strategy-box {{
        background: rgba(123, 44, 191, 0.1);
        border: 1px dashed var(--accent-purple);
        border-radius: 10px;
        padding: 20px;
        margin: 20px 0;
    }}

    .verbatim-box {{
        background: rgba(255, 215, 0, 0.1);
        border: 2px solid var(--accent-gold);
        border-radius: 10px;
        padding: 20px;
        margin: 20px 0;
        font-style: italic;
    }}

    .back-link {{
        display: inline-block;
        padding: 10px 20px;
        background: var(--card-bg);
        border: 1px solid var(--accent-purple);
        color: var(--accent-blue);
        text-decoration: none;
        border-radius: 5px;
        margin-bottom: 20px;
        transition: all 0.3s;
    }}

    .back-link:hover {{
        background: rgba(123, 44, 191, 0.3);
        border-color: var(--accent-blue);
    }}

    .nav-buttons {{
        display: flex;
        justify-content: space-between;
        margin-top: 40px;
        padding-top: 20px;
        border-top: 1px solid var(--border-color);
    }}

    .nav-buttons a {{
        padding: 10px 20px;
        background: var(--card-bg);
        border: 1px solid var(--accent-purple);
        color: var(--accent-blue);
        text-decoration: none;
        border-radius: 5px;
        transition: all 0.3s;
    }}

    .nav-buttons a:hover {{
        background: rgba(123, 44, 191, 0.3);
    }}

    .nav-buttons .disabled {{
        opacity: 0.5;
        pointer-events: none;
    }}

    .mission-image {{
        width: 100%;
        max-width: 800px;
        height: auto;
        border-radius: 15px;
        margin: 20px auto;
        display: block;
        border: 2px solid var(--accent-purple);
        box-shadow: 0 0 30px rgba(123, 44, 191, 0.4);
    }}
    </style>
</head>
<body>
    <div class="mission-content">
        <a href="index.html" class="back-link">← Back to Mission Select</a>

        <div class="mission-header">
            <span class="rank-badge rank-{rank}">{rank}-RANK</span>
            <h1>Mission {mission_num:02d}</h1>
            <p style="color: var(--text-secondary); font-size: 1.2em;">{title}</p>
            <img src="images/mission_{mission_num:02d}.png" alt="Mission {mission_num:02d} - {title}" class="mission-image">
        </div>

        <div class="mission-body">
            {content}
        </div>

        <div class="nav-buttons">
            {prev_link}
            {next_link}
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="js/config.js"></script>
    <script src="js/auth.js"></script>
    <script src="js/progress.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', async () => {{
            await MHA_Auth.initAuthUI(false);
            document.body.classList.add('has-user-nav');
            await MHA_Progress.initMissionProgress({mission_num});
        }});
    </script>
</body>
</html>
"""

def generate_mission_pages():
    """Generate individual mission pages from enhanced markdown"""
    enhanced_dir = os.path.join(os.path.dirname(OUTPUT_DIR), 'src_enhanced')

    for mission_num in range(1, 16):
        # Find the markdown file
        pattern = f"Mission_{mission_num:02d}_*.md"
        files = glob.glob(os.path.join(enhanced_dir, pattern))

        if not files:
            print(f"Warning: No markdown file found for mission {mission_num}")
            continue

        md_file = files[0]

        # Read and process the markdown
        with open(md_file, 'r') as f:
            md_content = f.read()

        html_content = process_markdown_to_html(md_content, mission_num)

        # Get mission info
        mission = MISSIONS[mission_num]

        # Create navigation links
        prev_link = f'<a href="mission_{mission_num-1:02d}.html">← Previous Mission</a>' if mission_num > 1 else '<span class="disabled">← Previous Mission</span>'
        next_link = f'<a href="mission_{mission_num+1:02d}.html">Next Mission →</a>' if mission_num < 15 else '<span class="disabled">Next Mission →</span>'

        # Generate the page
        html = MISSION_TEMPLATE.format(
            mission_num=mission_num,
            title=mission['title'],
            rank=mission['rank'],
            css=CSS_TEMPLATE,
            content=html_content,
            prev_link=prev_link,
            next_link=next_link
        )

        output_file = os.path.join(OUTPUT_DIR, f"mission_{mission_num:02d}.html")
        with open(output_file, 'w') as f:
            f.write(html)

        print(f"Generated: mission_{mission_num:02d}.html")

def copy_static_assets():
    """Copy static auth pages and JS to dist"""
    static_dir = os.path.join(os.path.dirname(OUTPUT_DIR), 'static_auth')
    if os.path.exists(static_dir):
        for item in os.listdir(static_dir):
            src = os.path.join(static_dir, item)
            dst = os.path.join(OUTPUT_DIR, item)
            if os.path.isdir(src):
                shutil.copytree(src, dst, dirs_exist_ok=True)
            else:
                shutil.copy2(src, dst)
        print("Copied static auth assets")


def main():
    create_directories()
    generate_index()
    generate_mission_pages()
    copy_static_assets()
    print("\nBuild complete! Site generated in:", OUTPUT_DIR)
    print(f"Open {os.path.join(OUTPUT_DIR, 'index.html')} to view the site.")

if __name__ == "__main__":
    main()
