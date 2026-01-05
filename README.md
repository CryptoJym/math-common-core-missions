# Math Common Core Missions

Interactive math lessons aligned to **6th Grade Common Core Standards**, designed for homeschool and family learning environments.

## Overview

This project contains 15 "Power Lessons" that transform Common Core math standards into engaging, hands-on activities. Each mission includes:

- Materials checklist
- Learning objectives (mapped to specific CC standards)
- Video lessons and CK-12 Foundation links
- Hands-on activities using household items
- Parent verification checklist
- Submission guidelines

## The 15 Missions

| # | Topic | Common Core Standard |
|---|-------|---------------------|
| 1 | Greatest Common Factor | 6.NS.4 |
| 2 | Inequality & Absolute Value | 6.NS.7a-d |
| 3 | Ratios with Money | 6.RP.3b, 6.RP.3c |
| 4 | Inequalities | 6.EE.8 |
| 5 | Expressions | 6.EE.2a, 6.EE.2c |
| 6 | Identifying Parts of Expressions | 6.EE.2b |
| 7 | Solving Equations | 6.EE.7 |
| 8 | Equations (Vacation Planning) | 6.EE.9 |
| 9 | Operations with Decimals | 6.NS.3 |
| 10 | Unit Ratios | 6.RP.2 |
| 11 | Dividing Fractions | 6.NS.1 |
| 12 | Area of Triangles | 6.G.1 |
| 13 | Ratios Tables | 6.RP.3a |
| 14 | Averages | 6.SP.3 |
| 15 | Unit Conversion | 6.RP.3d |

## Project Structure

```
math-common-core-missions/
├── README.md
├── generate_math_missions.py   # Raw curriculum content + mission generator
├── build_mission_site.py       # Markdown → HTML converter
├── src/                        # Source Markdown files (15 missions)
│   ├── Mission_01_Greatest_Common_Factor.md
│   ├── Mission_02_Inequality_and_absolute_value.md
│   └── ...
└── dist/                       # Generated HTML website
    ├── index.html              # Mission Control landing page
    ├── Mission_01_Greatest_Common_Factor.html
    └── ...
```

## Usage

### View the Website
Open `dist/index.html` in your browser to access Math Mission Control.

### Regenerate HTML
```bash
python build_mission_site.py
```

## Common Core Standards Covered

| Domain | Standards |
|--------|-----------|
| **6.NS** (Number System) | 6.NS.1, 6.NS.3, 6.NS.4, 6.NS.7a-d |
| **6.RP** (Ratios & Proportions) | 6.RP.2, 6.RP.3a-d |
| **6.EE** (Expressions & Equations) | 6.EE.2a-c, 6.EE.7, 6.EE.8, 6.EE.9 |
| **6.G** (Geometry) | 6.G.1 |
| **6.SP** (Statistics & Probability) | 6.SP.3 |

## License

Educational use encouraged.
