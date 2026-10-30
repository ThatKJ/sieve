# Sieve Workspace — Monochromatic Luxury Design System

**Visual Authority:** Reference Visual Standard (`media_1793397476309_ebda5710.jpg`)  
**Design Philosophy:** Minimalistic, Architectural, Monochromatic, Calm, Sophisticated, Spacious, High-Contrast Black & Translucent Glass.

---

## 1. Design Tokens

### Color Palette

| Token | Hex Value | Semantic Role |
| :--- | :--- | :--- |
| `--sieve-bg-canvas` | `#E8E7E5` | Outer canvas backdrop behind floating application surfaces |
| `--sieve-surface-primary` | `#F7F6F4` | Primary workspace surface and card backgrounds |
| `--sieve-surface-secondary` | `#EEEDEA` | Secondary recessed surfaces and search input backgrounds |
| `--sieve-surface-elevated` | `#FFFFFF` | Elevated cards, popovers, and translucent glass highlights |
| `--sieve-surface-contrast` | `#171717` | Pitch black surfaces for active nav items, spotlight card, and CTAs |
| `--sieve-text-primary` | `#111111` | Primary headings, titles, and active labels |
| `--sieve-text-secondary` | `#777571` | Subtitles, metadata, author handles, and inactive labels |
| `--sieve-text-muted` | `#A19F9A` | Timestamps, icon strokes, and placeholder text |
| `--sieve-text-inverted` | `#FFFFFF` | Text on pitch-black contrast surfaces |
| `--sieve-border-subtle` | `#DFDEDA` | Delicate borders defining card and panel boundaries |
| `--sieve-border-glass` | `rgba(255, 255, 255, 0.65)` | Shimmer border on elevated glass elements |

### Restrained Semantic Accents
Semantic indicators are strictly restrained to soft, desaturated tones:
- **Success:** Muted Forest Green (`#2e7d32` / bg `rgba(46, 125, 50, 0.08)`)
- **Warning / Overlap:** Muted Warm Amber (`#b26a00` / bg `rgba(178, 106, 0, 0.08)`)
- **Failure / Conflict:** Muted Crimson (`#c62828` / bg `rgba(198, 40, 40, 0.08)`)
- **Neutral:** Neutral Slate Grey (`#777571` / bg `rgba(119, 117, 113, 0.08)`)

*Zero purple, pink, electric blue, neon accents, or colorful gradient backgrounds are permitted.*

---

## 2. Surface & Depth Architecture

### Glassmorphism & Elevation
1. **Application Frame (Level 0):**
   ```css
   background: rgba(247, 246, 244, 0.88);
   backdrop-filter: blur(28px) saturate(180%);
   -webkit-backdrop-filter: blur(28px) saturate(180%);
   border: 1px solid rgba(255, 255, 255, 0.7);
   border-radius: 28px;
   box-shadow: 0 20px 60px rgba(0, 0, 0, 0.06), 0 2px 10px rgba(0, 0, 0, 0.02);
   ```
2. **Elevated Frosted Cards (Level 1):**
   ```css
   background: #FFFFFF;
   border: 1px solid #DFDEDA;
   border-radius: 20px;
   box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
   ```
3. **High-Contrast Pitch-Black Showcase Cards (The Signature Visual):**
   ```css
   background: #171717;
   color: #FFFFFF;
   border: 1px solid rgba(255, 255, 255, 0.12);
   border-radius: 22px;
   box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
   ```

---

## 3. Typography & Spacing

### Font Stack
```css
font-family: -apple-system, BlinkMacSystemFont, "Inter", "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, sans-serif;
```

### Hierarchy
- **Workspace Brand / Headline:** `28px` / Line-height `1.15` / Weight `700` / Letter-spacing `-0.03em`
- **Section & Card Titles:** `15px` / Line-height `1.3` / Weight `600` / Letter-spacing `-0.015em`
- **PR Titles:** `14px` / Line-height `1.35` / Weight `600` / Color `#111111`
- **Body & Metadata:** `12.5px` / Line-height `1.4` / Weight `400` / Color `#777571`
- **Badges & Chips:** `11px` / Line-height `1` / Weight `600` / Letter-spacing `0.02em` / Monospace for numbers

---

## 4. Signature Components

### 1. Frosted Sidebar Navigation
- Vertical pill menu items.
- Inactive items: `#777571` with transparent background.
- Active item: Solid `#171717` black pill with `#FFFFFF` text and white SVG icon.
- Bottom profile pill with circular avatar and maintainer title.

### 2. High-Contrast Selected PR Spotlight Card
- Directly inspired by the right-hand dark showcase card in the reference image.
- Pitch black background (`#171717`) with white typography.
- Displays the currently selected PR's blast radius preview, impact score gauge, and author avatar.

### 3. Floating Action Pill Bar
- Positioned floating at the bottom center of the workspace (`Lancez votre projet` style).
- Pill radius (`999px`), solid black background (`#171717`), crisp white text and icon.
- Provides quick actions: "⚡ Sieve Engine Active" / "Batch Triage".

### 4. Slide-Over Intelligence Drawer
- Layered translucent glass backdrop (`rgba(0, 0, 0, 0.25)` with `backdrop-filter: blur(8px)`).
- Drawer body in `#F7F6F4` with white elevated cards and pure SVG DAG visualizer.
