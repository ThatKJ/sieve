import os
import pptx
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

def create_deck():
    prs = pptx.Presentation()
    # 16:9 widescreen
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6] # blank layout

    # Colors
    BG_DARK = RGBColor(13, 17, 23)
    TEXT_WHITE = RGBColor(240, 246, 252)
    TEXT_MUTED = RGBColor(139, 148, 158)
    ACCENT_BLUE = RGBColor(88, 166, 255)
    ACCENT_GREEN = RGBColor(63, 185, 80)
    ACCENT_RED = RGBColor(248, 81, 73)
    CARD_BG = RGBColor(22, 27, 34)
    BORDER_COLOR = RGBColor(48, 54, 61)

    def set_bg(slide):
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
        bg.fill.solid()
        bg.fill.fore_color.rgb = BG_DARK
        bg.line.fill.background()
        return bg

    def add_header(slide, eyebrow_text, slide_num_str):
        # Header text
        tb = slide.shapes.add_textbox(Inches(0.8), Inches(0.4), Inches(10), Inches(0.4))
        p = tb.text_frame.paragraphs[0]
        p.text = eyebrow_text.upper()
        p.font.name = "Arial"
        p.font.size = Pt(11)
        p.font.bold = True
        p.font.color.rgb = ACCENT_BLUE

        # Slide num
        tb_num = slide.shapes.add_textbox(Inches(11.5), Inches(0.4), Inches(1), Inches(0.4))
        p_num = tb_num.text_frame.paragraphs[0]
        p_num.text = slide_num_str
        p_num.alignment = PP_ALIGN.RIGHT
        p_num.font.name = "Arial"
        p_num.font.size = Pt(12)
        p_num.font.color.rgb = TEXT_MUTED

    def add_footer(slide, left_text, right_text):
        tb = slide.shapes.add_textbox(Inches(0.8), Inches(6.9), Inches(8), Inches(0.35))
        p = tb.text_frame.paragraphs[0]
        p.text = left_text
        p.font.name = "Arial"
        p.font.size = Pt(10)
        p.font.color.rgb = TEXT_MUTED

        tb2 = slide.shapes.add_textbox(Inches(8.5), Inches(6.9), Inches(4), Inches(0.35))
        p2 = tb2.text_frame.paragraphs[0]
        p2.text = right_text
        p2.alignment = PP_ALIGN.RIGHT
        p2.font.name = "Arial"
        p2.font.size = Pt(10)
        p2.font.color.rgb = TEXT_MUTED

    # ==================== SLIDE 1: INTRODUCTION ====================
    s1 = prs.slides.add_slide(blank_layout)
    set_bg(s1)
    add_header(s1, "DevF8rge × Hacktoberfest 2026 · Theme 01: AI for Open Source", "01 / 06")
    add_footer(s1, "Sieve · Intelligent Maintainer Workspace", "github.com/ThatKJ/sieve")

    tb = s1.shapes.add_textbox(Inches(0.8), Inches(1.5), Inches(11.5), Inches(4.5))
    tf = tb.text_frame
    tf.word_wrap = True

    p = tf.paragraphs[0]
    p.text = "SIEVESPACE V2"
    p.font.name = "Arial"
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = ACCENT_BLUE
    p.space_after = Pt(10)

    p2 = tf.add_paragraph()
    p2.text = "SIEVE"
    p2.font.name = "Arial"
    p2.font.size = Pt(64)
    p2.font.bold = True
    p2.font.color.rgb = TEXT_WHITE
    p2.space_after = Pt(8)

    p3 = tf.add_paragraph()
    p3.text = "GitHub, redesigned for maintainers."
    p3.font.name = "Arial"
    p3.font.size = Pt(28)
    p3.font.bold = True
    p3.font.color.rgb = ACCENT_BLUE
    p3.space_after = Pt(18)

    p4 = tf.add_paragraph()
    p4.text = '“Sieve helps maintainers understand pull requests, identify risks, and decide what needs attention.”'
    p4.font.name = "Georgia"
    p4.font.size = Pt(20)
    p4.font.color.rgb = TEXT_WHITE
    p4.space_after = Pt(28)

    p5 = tf.add_paragraph()
    p5.text = "● Standard-Library Python Engine    ⚡ Gemma 4 Visual Intelligence    🔒 100% Read-Only on GitHub    🛡️ Contributor Code Never Runs    📦 MIT License"
    p5.font.name = "Arial"
    p5.font.size = Pt(11)
    p5.font.bold = True
    p5.font.color.rgb = TEXT_MUTED

    s1.notes_slide.notes_text_frame.text = (
        "Good morning, judges. We are presenting Sieve: GitHub, redesigned for maintainers.\n\n"
        "Right now, maintainers are burning out because GitHub wasn't designed for triaging hundreds of automated and AI-generated pull requests. "
        "Sieve is an open-source, local-first intelligence layer that injects directly into GitHub. It helps maintainers understand pull requests, "
        "identify risks, and decide what needs attention — without ever running untrusted contributor code.\n\n"
        "Let’s look at why this is such a critical problem right now."
    )

    # ==================== SLIDE 2: THE PROBLEM ====================
    s2 = prs.slides.add_slide(blank_layout)
    set_bg(s2)
    add_header(s2, "02 / 06 · The Maintainer Reality", "02 / 06")
    add_footer(s2, "Problem Statement: Save maintainers time and prevent silent repository regressions", "Evidence: Linux Foundation Survey 2026")

    tb = s2.shapes.add_textbox(Inches(0.8), Inches(0.9), Inches(11.7), Inches(1.1))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "Open source is drowning in pull requests that look convincing."
    p.font.name = "Arial"
    p.font.size = Pt(26)
    p.font.bold = True
    p.font.color.rgb = TEXT_WHITE
    p2 = tf.add_paragraph()
    p2.text = "Maintainers spend evenings reviewing code changes without knowing what they really touch."
    p2.font.name = "Arial"
    p2.font.size = Pt(14)
    p2.font.color.rgb = TEXT_MUTED

    # Left Column: Problem points
    tb_pts = s2.shapes.add_textbox(Inches(0.8), Inches(2.2), Inches(6.0), Inches(4.5))
    tf_pts = tb_pts.text_frame
    tf_pts.word_wrap = True

    pts = [
        ("Volume & Low-Effort PRs", "Repositories receive dozens of pull requests. A recent Linux Foundation survey found 25% of incoming PRs are low-effort code generated by LLMs that looks polished but does nothing."),
        ("Reviewing Code Takes Hours", "Maintainers manually trace diffs, check linked issues, and verify tests. Reading through superficial changes burns valuable volunteer maintainer time."),
        ("Hidden Ripple Effects", "A change in one file can quietly break downstream modules three directories away. Standard GitHub diffs only show modified lines, not the affected repository topology."),
        ("Maintainers Need to Know What to Review First", "GitHub lists pull requests by timestamp, not risk or readiness. Maintainers have no fast way to identify which pull requests are safe and which are dangerous.")
    ]
    for i, (title, desc) in enumerate(pts):
        p_t = tf_pts.paragraphs[0] if i == 0 else tf_pts.add_paragraph()
        p_t.text = f"• {title}"
        p_t.font.name = "Arial"
        p_t.font.size = Pt(13)
        p_t.font.bold = True
        p_t.font.color.rgb = ACCENT_BLUE

        p_d = tf_pts.add_paragraph()
        p_d.text = desc
        p_d.font.name = "Arial"
        p_d.font.size = Pt(11)
        p_d.font.color.rgb = TEXT_MUTED
        p_d.space_after = Pt(10)

    # Right Column: Visual illustration
    if os.path.exists("presentation/assets/sieve_conceptual_illustration.jpg"):
        s2.shapes.add_picture("presentation/assets/sieve_conceptual_illustration.jpg", Inches(7.2), Inches(2.2), width=Inches(5.3))

    s2.notes_slide.notes_text_frame.text = (
        "What you're seeing here is the reality open source maintainers face every single evening.\n\n"
        "Repositories are flooded with pull requests. In an October 2026 Linux Foundation survey, maintainers reported that nearly 25% of incoming pull requests "
        "are AI-generated slop — code that looks clean and polished on the surface, but actually does nothing or breaks functionality.\n\n"
        "Reviewing this takes hours. Even worse, GitHub only shows modified lines. A simple two-line change in one file can quietly break modules three directories away, "
        "because GitHub doesn't show you the repository import graph. Maintainers need to know what to review first.\n\n"
        "Here is how Sieve solves that."
    )

    # ==================== SLIDE 3: HOW SIEVE HELPS ====================
    s3 = prs.slides.add_slide(blank_layout)
    set_bg(s3)
    add_header(s3, "03 / 06 · How Sieve Helps", "03 / 06")
    add_footer(s3, "Architecture: Deterministic engine facts always take precedence over AI opinions", "Confidence Ledger: Source-tagged findings")

    tb = s3.shapes.add_textbox(Inches(0.8), Inches(0.9), Inches(11.7), Inches(1.1))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "From incoming pull request to an evidence-backed maintainer brief."
    p.font.name = "Arial"
    p.font.size = Pt(26)
    p.font.bold = True
    p.font.color.rgb = TEXT_WHITE
    p2 = tf.add_paragraph()
    p2.text = "A clean 5-step workflow that turns raw code diffs into clear, prioritized maintainer decisions."
    p2.font.name = "Arial"
    p2.font.size = Pt(14)
    p2.font.color.rgb = TEXT_MUTED

    # 5 Steps Cards
    steps = [
        ("1. CONNECT", "Chrome extension attaches to GitHub. 100% read-only; never requests write tokens."),
        ("2. UNDERSTAND", "Python engine statically parses repository AST into internal import topology."),
        ("3. ANALYSE", "Verifies claims: does linked issue exist? Are claimed tests in diff? Do modules exist?"),
        ("4. IDENTIFY", "Computes blast radius DAG: modified files, direct dependents, tests, and broken imports."),
        ("5. GUIDE", "Surfaces actionable review queues, exact pytest commands, and polite author replies.")
    ]
    card_w = Inches(2.25)
    gap = Inches(0.14)
    for i, (title, desc) in enumerate(steps):
        left = Inches(0.8) + i * (card_w + gap)
        tb_step = s3.shapes.add_textbox(left, Inches(2.2), card_w, Inches(2.2))
        tf_s = tb_step.text_frame
        tf_s.word_wrap = True
        p_t = tf_s.paragraphs[0]
        p_t.text = title
        p_t.font.name = "Arial"
        p_t.font.size = Pt(12)
        p_t.font.bold = True
        p_t.font.color.rgb = ACCENT_BLUE
        p_t.space_after = Pt(8)
        p_d = tf_s.add_paragraph()
        p_d.text = desc
        p_d.font.name = "Arial"
        p_d.font.size = Pt(10.5)
        p_d.font.color.rgb = TEXT_MUTED

    # Two Bottom Banners (Facts vs Hypotheses)
    tb_fact = s3.shapes.add_textbox(Inches(0.8), Inches(4.7), Inches(5.7), Inches(1.8))
    tf_f = tb_fact.text_frame
    tf_f.word_wrap = True
    p = tf_f.paragraphs[0]
    p.text = "VERIFIED CODE FACTS · Deterministic AST Engine"
    p.font.name = "Arial"
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = ACCENT_GREEN
    p.space_after = Pt(6)
    p2 = tf_f.add_paragraph()
    p2.text = "Standard-library Python AST parsing. Evaluates real file existence, exact import lines, deleted symbol references, and diff stats. 100% deterministic, zero hallucinations. Never executes untrusted contributor code."
    p2.font.name = "Arial"
    p2.font.size = Pt(11)
    p2.font.color.rgb = TEXT_MUTED

    tb_ai = s3.shapes.add_textbox(Inches(6.8), Inches(4.7), Inches(5.7), Inches(1.8))
    tf_ai = tb_ai.text_frame
    tf_ai.word_wrap = True
    p = tf_ai.paragraphs[0]
    p.text = "ARCHITECTURAL REASONING · Gemma 4 Visual Intelligence"
    p.font.name = "Arial"
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = ACCENT_BLUE
    p.space_after = Pt(6)
    p2 = tf_ai.add_paragraph()
    p2.text = "Google Gemma 4 multimodal model (gemma-4-26b-a4b-it) receives the rendered graph PNG and structured AST evidence. Explains architectural implications and missing tests. Strictly badged as model hypothesis."
    p2.font.name = "Arial"
    p2.font.size = Pt(11)
    p2.font.color.rgb = TEXT_MUTED

    s3.notes_slide.notes_text_frame.text = (
        "Here is Sieve’s five-step workflow.\n\n"
        "First, our Chrome extension connects to GitHub in 100% read-only mode — we never ask for write tokens. "
        "Second, our standard-library Python engine parses the repository AST to build a complete import graph. "
        "Third, we verify contributor claims: did they link a real open issue? Are claimed tests actually in the diff? Do imported modules exist?\n\n"
        "Fourth, we calculate the blast radius DAG: which modules depend on the changed files, and what tests need to run? "
        "And fifth, we deliver an actionable brief with exact pytest reproduction commands.\n\n"
        "Crucially, we separate deterministic AST facts — which are 100% verified — from Gemma 4 multimodal architectural reasoning, "
        "which is clearly labeled as model hypothesis.\n\n"
        "Now let's see Sieve working live in GitHub."
    )

    # ==================== SLIDE 4: HERO MISSION CONTROL ====================
    s4 = prs.slides.add_slide(blank_layout)
    set_bg(s4)
    add_header(s4, "04 / 06 · Hero Experience", "04 / 06")
    add_footer(s4, "Live Demonstration: Running locally on macOS via Manifest V3 Chrome Extension", "Target: ThatKJ/sieve-demo-target")

    tb = s4.shapes.add_textbox(Inches(0.8), Inches(0.9), Inches(11.7), Inches(1.1))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "GitHub becomes a maintainer workspace."
    p.font.name = "Arial"
    p.font.size = Pt(26)
    p.font.bold = True
    p.font.color.rgb = TEXT_WHITE
    p2 = tf.add_paragraph()
    p2.text = "Live Chrome extension injecting a high-signal command center directly into GitHub's pull requests page."
    p2.font.name = "Arial"
    p2.font.size = Pt(14)
    p2.font.color.rgb = TEXT_MUTED

    # Hero screenshot on left
    if os.path.exists("presentation/assets/harness_command_center_2x.png"):
        s4.shapes.add_picture("presentation/assets/harness_command_center_2x.png", Inches(0.8), Inches(2.1), width=Inches(8.5))

    # Hero annotations on right
    tb_ann = s4.shapes.add_textbox(Inches(9.6), Inches(2.1), Inches(2.9), Inches(4.5))
    tf_ann = tb_ann.text_frame
    tf_ann.word_wrap = True

    ann_pts = [
        ("NATIVE GITHUB SWITCHER", "Injected directly into GitHub's subnav. One click toggles between Native GitHub and Sieve Workspace with zero page reloads."),
        ("TURN-TAKING KPI LANES", "Automatically categorizes PRs by responsibility: Action Needed: You, Waiting on Author, Blocked, and Merge Ready."),
        ("AST BLAST RADIUS RANKS", "Pull requests are ranked by real architectural impact score rather than submission timestamp. High-risk PRs surface immediately.")
    ]
    for i, (title, desc) in enumerate(ann_pts):
        p_t = tf_ann.paragraphs[0] if i == 0 else tf_ann.add_paragraph()
        p_t.text = title
        p_t.font.name = "Arial"
        p_t.font.size = Pt(12)
        p_t.font.bold = True
        p_t.font.color.rgb = ACCENT_BLUE

        p_d = tf_ann.add_paragraph()
        p_d.text = desc
        p_d.font.name = "Arial"
        p_d.font.size = Pt(10.5)
        p_d.font.color.rgb = TEXT_MUTED
        p_d.space_after = Pt(14)

    s4.notes_slide.notes_text_frame.text = (
        "This is the hero experience: GitHub transformed into a maintainer workspace.\n\n"
        "Notice the Native/Sieve switcher injected directly into GitHub's subnav. With one click, the standard GitHub pull request list becomes the Sieve Command Center. "
        "There's no separate tab, no SaaS dashboard, and zero context switching.\n\n"
        "At the top, our triage KPI strip categorizes PRs by responsibility: what needs your action, what's waiting on the author, and what is merge-ready. "
        "On the right, the Spotlight card ranks PRs not by when they were opened, but by their actual architectural blast radius.\n\n"
        "Maintainers instantly know which PRs are safe to merge and which ones could break the build.\n\n"
        "Now let's zoom in on what happens when a maintainer inspects a suspicious PR."
    )

    # ==================== SLIDE 5: PR INTELLIGENCE ====================
    s5 = prs.slides.add_slide(blank_layout)
    set_bg(s5)
    add_header(s5, "05 / 06 · Individual PR Intelligence", "05 / 06")
    add_footer(s5, "Multimodal Verification: SVG topology PNG + AST JSON sent to Gemma 4", "Strict Grounding: Verified in AST vs Model Hypothesis")

    tb = s5.shapes.add_textbox(Inches(0.8), Inches(0.9), Inches(11.7), Inches(1.1))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "Sieve doesn't just show what changed. It explains what it affects."
    p.font.name = "Arial"
    p.font.size = Pt(26)
    p.font.bold = True
    p.font.color.rgb = TEXT_WHITE
    p2 = tf.add_paragraph()
    p2.text = "Deep architectural inspection of ThatKJ/sieve-demo-target#4 (claims tests & bugfix, but introduces breakages)."
    p2.font.name = "Arial"
    p2.font.size = Pt(14)
    p2.font.color.rgb = TEXT_MUTED

    # Left: PR Drawer screenshot
    if os.path.exists("presentation/assets/real_pr4_drawer_open_2x.png"):
        s5.shapes.add_picture("presentation/assets/real_pr4_drawer_open_2x.png", Inches(0.8), Inches(2.1), width=Inches(6.8))

    # Right: Findings and Gemma 4
    tb_pr = s5.shapes.add_textbox(Inches(7.8), Inches(2.1), Inches(4.7), Inches(2.5))
    tf_pr = tb_pr.text_frame
    tf_pr.word_wrap = True
    p = tf_pr.paragraphs[0]
    p.text = "SCORE: 25 / 100 · LOW-EFFORT"
    p.font.name = "Arial"
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = ACCENT_RED
    p.space_after = Pt(6)

    findings = [
        ("Claimed Tests Missing", "Description says 'Added comprehensive unit tests', but diff contains 0 test files."),
        ("Phantom Imports", "Imports ledgerly.validators, which does not exist anywhere in the repository."),
        ("Regression Radar", "Renamed category_totals, but report.py:3 still imports it. Downstream breakage!"),
        ("Topology DAG", "Identified 2 modified files, 5 direct dependents, and 2 related test files.")
    ]
    for title, desc in findings:
        p_t = tf_pr.add_paragraph()
        p_t.text = f"• {title}: {desc}"
        p_t.font.name = "Arial"
        p_t.font.size = Pt(10.5)
        p_t.font.color.rgb = TEXT_WHITE
        p_t.space_after = Pt(4)

    # Gemma visual screenshot on right bottom
    if os.path.exists("presentation/assets/gemma-visual-intelligence.png"):
        s5.shapes.add_picture("presentation/assets/gemma-visual-intelligence.png", Inches(7.8), Inches(4.5), width=Inches(4.7))

    s5.notes_slide.notes_text_frame.text = (
        "This is our in-situ PR Intelligence drawer, running live on pull request #4 from our demo repository.\n\n"
        "This PR arrived with a polished description claiming comprehensive tests and an issue fix. But look at what Sieve discovered:\n"
        "First, it scored it 25 out of 100 — low effort. The diff contains zero test files despite the claims. "
        "Second, it imports ledgerly.validators, which doesn't exist anywhere in the repository. "
        "Third, our regression radar caught that an internal function was renamed while report.py still imports the old name — a silent downstream breakage.\n\n"
        "At the bottom right, Gemma 4 analyzed the visual topology DAG alongside AST facts to explain the architectural risk. Every finding is badged with its exact evidence source.\n\n"
        "The maintainer gets an immediate verdict and a pre-drafted polite feedback checklist. Sieve doesn't just show what changed — it explains what it could affect."
    )

    # ==================== SLIDE 6: THE LIVE PRODUCT ====================
    s6 = prs.slides.add_slide(blank_layout)
    set_bg(s6)
    add_header(s6, "06 / 06 · The Live Product", "06 / 06")
    add_footer(s6, "Hacktoberfest 2026 · DevF8rge Finals Bengaluru", "github.com/ThatKJ/sieve")

    tb = s6.shapes.add_textbox(Inches(0.8), Inches(0.9), Inches(11.7), Inches(1.1))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "Understand every change. Review with confidence."
    p.font.name = "Arial"
    p.font.size = Pt(26)
    p.font.bold = True
    p.font.color.rgb = TEXT_WHITE
    p2 = tf.add_paragraph()
    p2.text = "A working, local-first open-source intelligence layer for GitHub maintainers."
    p2.font.name = "Arial"
    p2.font.size = Pt(14)
    p2.font.color.rgb = TEXT_MUTED

    # 3 Columns
    col_w = Inches(3.7)
    gap = Inches(0.3)

    # Col 1: Web Showcase
    left1 = Inches(0.8)
    if os.path.exists("presentation/assets/web_app_home_2x.png"):
        s6.shapes.add_picture("presentation/assets/web_app_home_2x.png", left1, Inches(2.2), width=col_w)
    tb1 = s6.shapes.add_textbox(left1, Inches(4.6), col_w, Inches(1.5))
    tf1 = tb1.text_frame
    tf1.word_wrap = True
    p = tf1.paragraphs[0]
    p.text = "Web Showcase"
    p.font.name = "Arial"
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = TEXT_WHITE
    p2 = tf1.add_paragraph()
    p2.text = "Public repository overview, interactive 3D Repository Atlas, and verified demo PRs (sieve-workspace.vercel.app / local 127.0.0.1:8787)."
    p2.font.name = "Arial"
    p2.font.size = Pt(10.5)
    p2.font.color.rgb = TEXT_MUTED

    # Col 2: Chrome Extension
    left2 = left1 + col_w + gap
    if os.path.exists("presentation/assets/extension_popup_live.png"):
        s6.shapes.add_picture("presentation/assets/extension_popup_live.png", left2 + Inches(0.8), Inches(2.2), width=Inches(2.1))
    tb2 = s6.shapes.add_textbox(left2, Inches(4.6), col_w, Inches(1.5))
    tf2 = tb2.text_frame
    tf2.word_wrap = True
    p = tf2.paragraphs[0]
    p.text = "Chrome Extension (Manifest V3)"
    p.font.name = "Arial"
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = TEXT_WHITE
    p2 = tf2.add_paragraph()
    p2.text = "Connects to local daemon in 4ms. Verifies Ollama (qwen3.5:9b), Gemma 4 multimodal model, and GitHub API quota."
    p2.font.name = "Arial"
    p2.font.size = Pt(10.5)
    p2.font.color.rgb = TEXT_MUTED

    # Col 3: Engine & Repos
    left3 = left2 + col_w + gap
    if os.path.exists("presentation/assets/web_app_repo_queue_2x.png"):
        s6.shapes.add_picture("presentation/assets/web_app_repo_queue_2x.png", left3, Inches(2.2), width=col_w)
    tb3 = s6.shapes.add_textbox(left3, Inches(4.6), col_w, Inches(1.5))
    tf3 = tb3.text_frame
    tf3.word_wrap = True
    p = tf3.paragraphs[0]
    p.text = "Local Engine & Source"
    p.font.name = "Arial"
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = TEXT_WHITE
    p2 = tf3.add_paragraph()
    p2.text = "Pure standard-library Python daemon. 94 passing automated tests. Public on GitHub: ThatKJ/sieve (MIT) & ThatKJ/sieve-demo-target."
    p2.font.name = "Arial"
    p2.font.size = Pt(10.5)
    p2.font.color.rgb = TEXT_MUTED

    # Bottom Guarantees
    tb_b = s6.shapes.add_textbox(Inches(0.8), Inches(6.1), Inches(11.7), Inches(0.6))
    tf_b = tb_b.text_frame
    tf_b.word_wrap = True
    p = tf_b.paragraphs[0]
    p.text = "✓ 100% Read-Only on GitHub    ✓ Zero Cloud Lock-In    ✓ Contributor Code Never Runs    ✓ Open-Weight AI Architecture"
    p.font.name = "Arial"
    p.font.size = Pt(12)
    p.font.bold = True
    p.font.color.rgb = ACCENT_GREEN

    s6.notes_slide.notes_text_frame.text = (
        "To wrap up: Sieve is a real, working product built tonight.\n\n"
        "On the left, our web showcase features an interactive 3D Repository Atlas and live demo explorer. In the center, our Chrome extension runs locally, "
        "pinging the Python daemon in 4 milliseconds with Gemma 4 visual intelligence active. On the right, our repository is public under the MIT license "
        "with 94 passing automated tests, tested against our live demo repo ThatKJ/sieve-demo-target.\n\n"
        "Zero cloud lock-in. 100% read-only. Contributor code is never executed.\n\n"
        "Understand every change. Review with confidence. Thank you, and we’re ready for your questions!"
    )

    out_path = "presentation/sieve_final_presentation.pptx"
    prs.save(out_path)
    print(f"Generated {out_path} successfully!")

if __name__ == "__main__":
    create_deck()
