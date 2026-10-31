import os
import sys
import asyncio
from playwright.async_api import async_playwright

html_content = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Sieve — Final Hackathon Presentation</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background: #06090e;
      color: #f0f6fc;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
      margin: 0;
      padding: 0;
    }

    .slide {
      width: 1920px;
      height: 1080px;
      position: relative;
      overflow: hidden;
      background: #0d1117;
      page-break-after: always;
      padding: 70px 90px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    /* Ambient background grid */
    .slide::before {
      content: "";
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background-image: 
        linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
      background-size: 64px 64px;
      pointer-events: none;
      z-index: 0;
    }

    .slide-content {
      position: relative;
      z-index: 1;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    /* Header bar */
    .slide-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 24px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .eyebrow-tag {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #58a6ff;
      background: rgba(56, 139, 253, 0.1);
      padding: 6px 14px;
      border-radius: 999px;
      border: 1px solid rgba(56, 139, 253, 0.25);
    }

    .slide-num {
      font-family: 'JetBrains Mono', monospace;
      font-size: 15px;
      color: #7d8590;
      font-weight: 500;
    }

    /* Slide Titles */
    .title-group {
      margin-top: 16px;
    }

    .slide-title {
      font-size: 46px;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.15;
      letter-spacing: -0.02em;
    }

    .slide-subtitle {
      font-size: 22px;
      color: #8b949e;
      margin-top: 10px;
      font-weight: 400;
      line-height: 1.4;
    }

    /* Footer bar */
    .slide-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 14px;
      color: #7d8590;
    }

    .brand-mark {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 600;
      color: #f0f6fc;
      font-size: 16px;
    }

    .brand-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #238636;
      box-shadow: 0 0 10px rgba(35, 134, 54, 0.5);
    }

    /* Badges & Chips */
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      font-family: 'JetBrains Mono', monospace;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.04);
      color: #c9d1d9;
    }

    .pill.green {
      background: rgba(46, 160, 67, 0.12);
      border-color: rgba(46, 160, 67, 0.35);
      color: #3fb950;
    }

    .pill.blue {
      background: rgba(56, 139, 253, 0.12);
      border-color: rgba(56, 139, 253, 0.35);
      color: #58a6ff;
    }

    .pill.amber {
      background: rgba(210, 153, 34, 0.12);
      border-color: rgba(210, 153, 34, 0.35);
      color: #d29922;
    }

    .pill.red {
      background: rgba(248, 81, 73, 0.12);
      border-color: rgba(248, 81, 73, 0.35);
      color: #f85149;
    }

    /* Glass Cards */
    .card {
      background: rgba(22, 27, 34, 0.7);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 26px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }

    /* SLIDE 1: COVER */
    .cover-body {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: flex-start;
      margin: auto 0;
      max-width: 1200px;
    }

    .cover-logo-row {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
    }

    .cover-logo-icon {
      width: 54px;
      height: 54px;
      border-radius: 14px;
      background: #161b22;
      border: 1px solid rgba(255, 255, 255, 0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    }

    .cover-title {
      font-size: 104px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.04em;
      line-height: 1;
      margin-bottom: 20px;
      background: linear-gradient(180deg, #ffffff 30%, #c9d1d9 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .cover-tagline {
      font-size: 42px;
      font-weight: 600;
      color: #58a6ff;
      letter-spacing: -0.02em;
      margin-bottom: 24px;
    }

    .cover-sentence {
      font-size: 26px;
      color: #e6edf3;
      line-height: 1.5;
      font-weight: 400;
      max-width: 950px;
      margin-bottom: 44px;
      border-left: 3px solid #58a6ff;
      padding-left: 24px;
    }

    .cover-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
    }

    /* SLIDE 2: PROBLEM */
    .problem-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      align-items: center;
      margin: auto 0;
    }

    .problem-cards {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .problem-card {
      background: rgba(22, 27, 34, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 20px 24px;
      display: flex;
      align-items: flex-start;
      gap: 18px;
    }

    .problem-icon-wrap {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: rgba(248, 81, 73, 0.1);
      border: 1px solid rgba(248, 81, 73, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #f85149;
      flex-shrink: 0;
      font-size: 20px;
    }

    .problem-card-title {
      font-size: 18px;
      font-weight: 600;
      color: #f0f6fc;
      margin-bottom: 6px;
    }

    .problem-card-desc {
      font-size: 15px;
      color: #8b949e;
      line-height: 1.45;
    }

    .problem-visual-wrap {
      background: #161b22;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
      display: flex;
      flex-direction: column;
    }

    .problem-visual-wrap img {
      width: 100%;
      height: 440px;
      object-fit: cover;
      display: block;
    }

    .problem-visual-caption {
      padding: 18px 24px;
      background: rgba(13, 17, 23, 0.95);
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 14px;
      color: #8b949e;
      line-height: 1.5;
    }

    .problem-visual-caption strong {
      color: #f0f6fc;
    }

    /* SLIDE 3: WORKFLOW */
    .workflow-steps {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 16px;
      margin: 24px 0 32px 0;
    }

    .workflow-card {
      background: rgba(22, 27, 34, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 24px 20px;
      position: relative;
    }

    .step-num-pill {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 700;
      color: #58a6ff;
      background: rgba(56, 139, 253, 0.12);
      border: 1px solid rgba(56, 139, 253, 0.3);
      padding: 3px 10px;
      border-radius: 6px;
      display: inline-block;
      margin-bottom: 14px;
    }

    .step-title {
      font-size: 18px;
      font-weight: 700;
      color: #f0f6fc;
      margin-bottom: 10px;
    }

    .step-desc {
      font-size: 14px;
      color: #8b949e;
      line-height: 1.5;
    }

    .distinction-container {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }

    .distinction-card {
      border-radius: 14px;
      padding: 22px 26px;
      border: 1px solid;
    }

    .distinction-card.deterministic {
      background: rgba(35, 134, 54, 0.06);
      border-color: rgba(46, 160, 67, 0.3);
    }

    .distinction-card.model {
      background: rgba(163, 113, 247, 0.06);
      border-color: rgba(163, 113, 247, 0.3);
    }

    .distinction-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 10px;
    }

    .distinction-title {
      font-size: 17px;
      font-weight: 700;
      color: #f0f6fc;
    }

    .distinction-desc {
      font-size: 14px;
      color: #8b949e;
      line-height: 1.5;
    }

    /* SLIDE 4: HERO MISSION CONTROL */
    .hero-view-container {
      margin: 16px 0 auto 0;
      display: grid;
      grid-template-columns: 3fr 1fr;
      gap: 28px;
      align-items: center;
    }

    .browser-frame {
      background: #161b22;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
    }

    .browser-bar {
      height: 38px;
      background: #0d1117;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      padding: 0 16px;
      gap: 8px;
    }

    .browser-dots {
      display: flex;
      gap: 6px;
    }

    .b-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .b-dot.r { background: #ff5f56; }
    .b-dot.y { background: #ffbd2e; }
    .b-dot.g { background: #27c93f; }

    .browser-url {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: #7d8590;
      background: rgba(255, 255, 255, 0.04);
      padding: 3px 14px;
      border-radius: 6px;
      margin-left: 12px;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }

    .browser-frame img {
      width: 100%;
      height: 600px;
      object-fit: cover;
      object-position: top;
      display: block;
    }

    .hero-callouts {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .callout-box {
      background: rgba(22, 27, 34, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 18px 20px;
    }

    .callout-box.featured {
      border-color: rgba(56, 139, 253, 0.4);
      background: rgba(56, 139, 253, 0.06);
    }

    .callout-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      color: #58a6ff;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 6px;
    }

    .callout-title {
      font-size: 16px;
      font-weight: 700;
      color: #f0f6fc;
      margin-bottom: 6px;
    }

    .callout-desc {
      font-size: 13.5px;
      color: #8b949e;
      line-height: 1.45;
    }

    /* SLIDE 5: PR INTELLIGENCE */
    .pr-intel-grid {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: 32px;
      margin: 16px 0 auto 0;
      align-items: stretch;
    }

    .pr-left-col, .pr-right-col {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .intel-image-frame {
      background: #161b22;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 16px 40px rgba(0,0,0,0.45);
    }

    .intel-image-frame img {
      width: 100%;
      height: 380px;
      object-fit: cover;
      object-position: top;
      display: block;
    }

    .findings-card {
      background: rgba(22, 27, 34, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 20px 24px;
    }

    .findings-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 12px;
    }

    .finding-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      font-size: 14px;
      line-height: 1.4;
      color: #c9d1d9;
    }

    .finding-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
      flex-shrink: 0;
    }
    .finding-badge.fail {
      background: rgba(248, 81, 73, 0.15);
      color: #f85149;
      border: 1px solid rgba(248, 81, 73, 0.3);
    }
    .finding-badge.warn {
      background: rgba(210, 153, 34, 0.15);
      color: #d29922;
      border: 1px solid rgba(210, 153, 34, 0.3);
    }
    .finding-badge.pass {
      background: rgba(46, 160, 67, 0.15);
      color: #3fb950;
      border: 1px solid rgba(46, 160, 67, 0.3);
    }

    .motto-banner {
      background: rgba(56, 139, 253, 0.08);
      border: 1px solid rgba(56, 139, 253, 0.25);
      border-radius: 12px;
      padding: 16px 20px;
      font-size: 16px;
      color: #e6edf3;
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: auto;
    }

    .motto-banner strong {
      color: #58a6ff;
    }

    /* SLIDE 6: LIVE PRODUCT */
    .product-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 28px;
      margin: 16px 0 auto 0;
    }

    .product-col {
      background: rgba(22, 27, 34, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .product-img-wrap {
      background: #0d1117;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      overflow: hidden;
      height: 250px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .product-img-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top center;
    }

    .product-col-title {
      font-size: 20px;
      font-weight: 700;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .product-col-desc {
      font-size: 14.5px;
      color: #8b949e;
      line-height: 1.5;
    }

    .product-col-meta {
      margin-top: auto;
      padding-top: 14px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      font-family: 'JetBrains Mono', monospace;
      font-size: 12.5px;
      color: #58a6ff;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .closing-banner {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      padding: 22px 36px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 24px;
    }

    .closing-quote {
      font-size: 24px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.01em;
    }

    .closing-quote span {
      color: #58a6ff;
    }

    .closing-guarantees {
      display: flex;
      gap: 20px;
      font-size: 14px;
      color: #8b949e;
    }

    .closing-guarantees span {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .closing-guarantees span::before {
      content: "✓";
      color: #3fb950;
      font-weight: bold;
    }

  </style>
</head>
<body>

  <!-- ==================== SLIDE 1: INTRODUCTION ==================== -->
  <section class="slide" id="slide-1">
    <div class="slide-content">
      <div class="slide-header">
        <div class="eyebrow-tag">DevF8rge × Hacktoberfest 2026 · Theme 01: AI for Open Source</div>
        <div class="slide-num">01 / 06</div>
      </div>

      <div class="cover-body">
        <div class="cover-logo-row">
          <div class="cover-logo-icon">
            <svg width="32" height="32" viewBox="0 0 16 16" fill="#f0f6fc"><g fill="#58a6ff"><circle cx="3" cy="3" r="1.5"/><circle cx="8" cy="3" r="1.5"/><circle cx="13" cy="3" r="1.5"/><circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></g></svg>
          </div>
          <span style="font-family:'JetBrains Mono', monospace; font-size: 18px; font-weight:700; color:#58a6ff; letter-spacing:0.1em; text-transform:uppercase;">SIEVESPACE V2</span>
        </div>

        <h1 class="cover-title">SIEVE</h1>
        <h2 class="cover-tagline">GitHub, redesigned for maintainers.</h2>

        <p class="cover-sentence">
          "Sieve helps maintainers understand pull requests, identify risks, and decide what needs attention."
        </p>

        <div class="cover-badges">
          <span class="pill green">● Standard-Library Python Engine</span>
          <span class="pill blue">⚡ Gemma 4 Visual Intelligence</span>
          <span class="pill">🔒 100% Read-Only on GitHub</span>
          <span class="pill">🛡️ Contributor Code Never Runs</span>
          <span class="pill">📦 MIT Open Source</span>
        </div>
      </div>

      <div class="slide-footer">
        <div class="brand-mark"><span class="brand-dot"></span> Sieve · Intelligent Maintainer Workspace</div>
        <div>github.com/ThatKJ/sieve</div>
      </div>
    </div>
  </section>


  <!-- ==================== SLIDE 2: THE PROBLEM ==================== -->
  <section class="slide" id="slide-2">
    <div class="slide-content">
      <div class="slide-header">
        <div class="eyebrow-tag">02 / 06 · The Maintainer Reality</div>
        <div class="slide-num">02 / 06</div>
      </div>

      <div class="title-group">
        <h2 class="slide-title">Open source is drowning in pull requests that look convincing.</h2>
        <p class="slide-subtitle">Maintainers spend evenings reviewing code changes without knowing what they really touch.</p>
      </div>

      <div class="problem-grid">
        <div class="problem-cards">
          <div class="problem-card">
            <div class="problem-icon-wrap">⚡</div>
            <div>
              <div class="problem-card-title">Volume & Low-Effort PRs</div>
              <div class="problem-card-desc">Repositories receive dozens of pull requests. A recent Linux Foundation survey found 25% of incoming pull requests are AI-generated slop that looks polished but does nothing.</div>
            </div>
          </div>

          <div class="problem-card">
            <div class="problem-icon-wrap">⏳</div>
            <div>
              <div class="problem-card-title">Reviewing Code Takes Hours</div>
              <div class="problem-card-desc">Maintainers manually trace diffs, check linked issues, and verify tests. Reading through superficial changes burns valuable volunteer maintainer time.</div>
            </div>
          </div>

          <div class="problem-card">
            <div class="problem-icon-wrap">💥</div>
            <div>
              <div class="problem-card-title">Hidden Ripple Effects</div>
              <div class="problem-card-desc">A change in one file can quietly break downstream modules three directories away. Standard GitHub diffs only show modified lines, not the affected repository topology.</div>
            </div>
          </div>

          <div class="problem-card">
            <div class="problem-icon-wrap">🚦</div>
            <div>
              <div class="problem-card-title">Maintainers Need to Know What to Review First</div>
              <div class="problem-card-desc">GitHub lists pull requests by timestamp, not risk or readiness. Maintainers have no fast way to identify which pull requests are safe and which are dangerous.</div>
            </div>
          </div>
        </div>

        <div class="problem-visual-wrap">
          <img src="assets/sieve_conceptual_illustration.jpg" alt="Conceptual Impact Diagram">
          <div class="problem-visual-caption">
            <strong>The Blast Radius Blindspot:</strong> GitHub shows you what text changed. Sieve maps the entire import graph so you immediately understand what that change could break.
          </div>
        </div>
      </div>

      <div class="slide-footer">
        <div>Problem Statement: Save maintainers time and prevent silent repository regressions</div>
        <div>Evidence: Linux Foundation October 2026 Survey · curl bug bounty suspension</div>
      </div>
    </div>
  </section>


  <!-- ==================== SLIDE 3: HOW SIEVE HELPS ==================== -->
  <section class="slide" id="slide-3">
    <div class="slide-content">
      <div class="slide-header">
        <div class="eyebrow-tag">03 / 06 · How Sieve Helps</div>
        <div class="slide-num">03 / 06</div>
      </div>

      <div class="title-group">
        <h2 class="slide-title">From incoming pull request to an evidence-backed maintainer brief.</h2>
        <p class="slide-subtitle">A clean 5-step workflow that turns raw code diffs into clear, prioritized maintainer decisions.</p>
      </div>

      <div class="workflow-steps">
        <div class="workflow-card">
          <span class="step-num-pill">STEP 01</span>
          <div class="step-title">Connect</div>
          <div class="step-desc">Chrome extension attaches to GitHub pull request pages. 100% read-only; never requests write tokens or posts comments automatically.</div>
        </div>

        <div class="workflow-card">
          <span class="step-num-pill">STEP 02</span>
          <div class="step-title">Understand</div>
          <div class="step-desc">Standard-library Python engine statically parses the repository AST into an internal import graph (Python & JS/TS).</div>
        </div>

        <div class="workflow-card">
          <span class="step-num-pill">STEP 03</span>
          <div class="step-title">Analyse</div>
          <div class="step-desc">Verifies contributor claims: does the linked issue exist? Are claimed tests in the diff? Do new imported modules actually exist?</div>
        </div>

        <div class="workflow-card">
          <span class="step-num-pill">STEP 04</span>
          <div class="step-title">Identify Risks</div>
          <div class="step-desc">Computes blast radius DAG: modified files, direct dependents, test consumers, and regression radar for removed or renamed symbols.</div>
        </div>

        <div class="workflow-card">
          <span class="step-num-pill">STEP 05</span>
          <div class="step-title">Guide Action</div>
          <div class="step-desc">Surfaces actionable queues (Action Needed vs Blocked), generates exact pytest reproduction commands, and drafts polite reviewer feedback.</div>
        </div>
      </div>

      <div class="distinction-container">
        <div class="distinction-card deterministic">
          <div class="distinction-header">
            <span class="pill green">VERIFIED CODE FACTS</span>
            <div class="distinction-title">Deterministic AST Analysis</div>
          </div>
          <div class="distinction-desc">
            Standard-library Python AST parsing. Evaluates real file existence, exact import lines, deleted symbol references, and diff stats. 100% deterministic, 0% hallucinations. Never executes untrusted contributor code.
          </div>
        </div>

        <div class="distinction-card model">
          <div class="distinction-header">
            <span class="pill blue">ARCHITECTURAL REASONING</span>
            <div class="distinction-title">Gemma 4 Visual Intelligence</div>
          </div>
          <div class="distinction-desc">
            Google Gemma 4 multimodal model (<code>gemma-4-26b-a4b-it</code>) receives the rendered graph PNG and structured AST evidence. Explains architectural implications and missing tests. Strictly badged as model hypothesis.
          </div>
        </div>
      </div>

      <div class="slide-footer">
        <div>Architecture: Deterministic engine facts always take precedence over AI opinions</div>
        <div>Confidence Ledger: Every finding records its source (Repository, GitHub Data, or Model)</div>
      </div>
    </div>
  </section>


  <!-- ==================== SLIDE 4: HERO MISSION CONTROL ==================== -->
  <section class="slide" id="slide-4">
    <div class="slide-content">
      <div class="slide-header">
        <div class="eyebrow-tag">04 / 06 · Hero Experience</div>
        <div class="slide-num">04 / 06</div>
      </div>

      <div class="title-group">
        <h2 class="slide-title">GitHub becomes a maintainer workspace.</h2>
        <p class="slide-subtitle">Live Chrome extension injecting a high-signal command center directly into GitHub's pull requests page.</p>
      </div>

      <div class="hero-view-container">
        <div class="browser-frame">
          <div class="browser-bar">
            <div class="browser-dots">
              <span class="b-dot r"></span>
              <span class="b-dot y"></span>
              <span class="b-dot g"></span>
            </div>
            <div class="browser-url">github.com/ThatKJ/sieve-demo-target/pulls</div>
          </div>
          <img src="assets/harness_command_center_2x.png" alt="Sieve Mission Control inside GitHub">
        </div>

        <div class="hero-callouts">
          <div class="callout-box featured">
            <div class="callout-tag">NON-DESTRUCTIVE TOGGLE</div>
            <div class="callout-title">Native GitHub Switcher</div>
            <div class="callout-desc">Injected into GitHub's subnav bar. Maintainers toggle instantly between native GitHub and Sieve Workspace with zero page reloads.</div>
          </div>

          <div class="callout-box">
            <div class="callout-tag">TURN-TAKING LANES</div>
            <div class="callout-title">Triage KPI Strip</div>
            <div class="callout-desc">Automatically sorts PRs by responsibility: <em>Action Needed: You</em>, <em>Waiting on Author</em>, <em>Blocked</em>, and <em>Merge Ready</em>.</div>
          </div>

          <div class="callout-box">
            <div class="callout-tag">RISK PRIORITIZATION</div>
            <div class="callout-title">AST Blast Radius Ranks</div>
            <div class="callout-desc">Pull requests are ranked by real architectural impact score rather than submission timestamps. High-risk changes surface immediately.</div>
          </div>
        </div>
      </div>

      <div class="slide-footer">
        <div>Live Demonstration: Running locally on macOS via Manifest V3 Chrome Extension</div>
        <div>Target Repository: ThatKJ/sieve-demo-target (3 active demo PRs)</div>
      </div>
    </div>
  </section>


  <!-- ==================== SLIDE 5: PR INTELLIGENCE ==================== -->
  <section class="slide" id="slide-5">
    <div class="slide-content">
      <div class="slide-header">
        <div class="eyebrow-tag">05 / 06 · Individual PR Intelligence</div>
        <div class="slide-num">05 / 06</div>
      </div>

      <div class="title-group">
        <h2 class="slide-title">Sieve doesn't just show what changed. It explains what it affects.</h2>
        <p class="slide-subtitle">Deep architectural inspection of ThatKJ/sieve-demo-target#4 (claims tests & bugfix, but introduces breakages).</p>
      </div>

      <div class="pr-intel-grid">
        <div class="pr-left-col">
          <div class="intel-image-frame">
            <img src="assets/real_pr4_drawer_open_2x.png" alt="Sieve PR Intelligence Drawer">
          </div>
          <div class="motto-banner">
            <span>💡</span>
            <div><strong>The Maintainer Result:</strong> An actionable verification brief, exact pytest reproduction commands, and a polite contributor checklist. Nothing is posted; Sieve is 100% read-only.</div>
          </div>
        </div>

        <div class="pr-right-col">
          <div class="findings-card">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="pill red">SCORE: 25 / 100 · LOW-EFFORT</span>
              <span style="font-family:'JetBrains Mono', monospace; font-size:12px; color:#8b949e;">PR #4 Analysis</span>
            </div>
            
            <ul class="findings-list">
              <li class="finding-item">
                <span class="finding-badge fail">FAIL</span>
                <div><strong>Claimed Tests Missing:</strong> Description says “Added comprehensive unit tests”, but the diff contains 0 test files.</div>
              </li>
              <li class="finding-item">
                <span class="finding-badge fail">FAIL</span>
                <div><strong>Phantom Imports:</strong> Code imports <code>ledgerly.validators</code>, which does not exist anywhere in the repository.</div>
              </li>
              <li class="finding-item">
                <span class="finding-badge warn">RADAR</span>
                <div><strong>Regression Alert:</strong> Renamed <code>category_totals</code>, but <code>report.py:3</code> still imports it. Downstream breakage flagged!</div>
              </li>
              <li class="finding-item">
                <span class="finding-badge pass">AST</span>
                <div><strong>Blast Radius DAG:</strong> 2 modified files, 5 direct dependent modules, 2 related test files identified.</div>
              </li>
            </ul>
          </div>

          <div class="intel-image-frame" style="box-shadow:none;">
            <img src="assets/gemma-visual-intelligence.png" style="height:220px;" alt="Gemma Visual Intelligence">
          </div>
        </div>
      </div>

      <div class="slide-footer">
        <div>Multimodal Verification: Pure SVG graph converted to PNG + structured AST evidence sent to Gemma 4</div>
        <div>Strict Grounding: Every finding is badged [Verified in AST] or [Model Hypothesis]</div>
      </div>
    </div>
  </section>


  <!-- ==================== SLIDE 6: THE LIVE PRODUCT ==================== -->
  <section class="slide" id="slide-6">
    <div class="slide-content">
      <div class="slide-header">
        <div class="eyebrow-tag">06 / 06 · The Live Product</div>
        <div class="slide-num">06 / 06</div>
      </div>

      <div class="title-group">
        <h2 class="slide-title">Understand every change. Review with confidence.</h2>
        <p class="slide-subtitle">A working, local-first open-source intelligence layer for GitHub maintainers.</p>
      </div>

      <div class="product-grid">
        <div class="product-col">
          <div class="product-col-title">
            <span>Web Showcase</span>
            <span class="pill green">Deployed</span>
          </div>
          <div class="product-img-wrap">
            <img src="assets/web_app_home_2x.png" alt="Sieve Web Showcase">
          </div>
          <div class="product-col-desc">
            Public architecture showcase with interactive 3D Repository Atlas, demo PR explorer, and full documentation.
          </div>
          <div class="product-col-meta">
            <span>URL: sieve.vercel.app / local</span>
            <span>Atlas: 3D force-directed import DAG</span>
          </div>
        </div>

        <div class="product-col">
          <div class="product-col-title">
            <span>Chrome Extension</span>
            <span class="pill blue">Manifest V3</span>
          </div>
          <div class="product-img-wrap" style="background:#161b22; padding:12px;">
            <img src="assets/extension_popup_live.png" style="object-fit:contain;" alt="Chrome Extension Popup">
          </div>
          <div class="product-col-desc">
            Connects to local daemon in 4ms. Verifies Ollama (qwen3.5:9b), Gemma 4 multimodal model, and GitHub API quota.
          </div>
          <div class="product-col-meta">
            <span>Status: Online (4ms latency)</span>
            <span>Model: gemma-4-26b-a4b-it active</span>
          </div>
        </div>

        <div class="product-col">
          <div class="product-col-title">
            <span>Local Engine & Open Source</span>
            <span class="pill green">MIT License</span>
          </div>
          <div class="product-img-wrap">
            <img src="assets/web_app_repo_queue_2x.png" alt="Sieve Repository View">
          </div>
          <div class="product-col-desc">
            Zero third-party dependencies required. Pure standard-library Python daemon. 94 automated unit & lifecycle tests.
          </div>
          <div class="product-col-meta">
            <span>Repo: github.com/ThatKJ/sieve</span>
            <span>Demo: github.com/ThatKJ/sieve-demo-target</span>
          </div>
        </div>
      </div>

      <div class="closing-banner">
        <div class="closing-quote">
          “Understand every change. <span>Review with confidence.</span>”
        </div>
        <div class="closing-guarantees">
          <span>Read-Only on GitHub</span>
          <span>Zero Cloud Lock-In</span>
          <span>Untrusted Code Never Runs</span>
          <span>Open-Weight AI</span>
        </div>
      </div>

      <div class="slide-footer">
        <div class="brand-mark"><span class="brand-dot"></span> Sieve · Redesigning GitHub for Open Source Maintainers</div>
        <div>Hacktoberfest 2026 · DevF8rge Finals Bengaluru</div>
      </div>
    </div>
  </section>

</body>
</html>
"""

with open("presentation/slides.html", "w") as f:
    f.write(html_content)

print("Saved presentation/slides.html successfully!")

async def export_slides():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
        
        url = "file://" + os.path.abspath("presentation/slides.html")
        await page.goto(url)
        await page.wait_for_timeout(2000)
        
        # Export PDF
        await page.pdf(
            path="presentation/sieve_final_presentation.pdf",
            width="1920px",
            height="1080px",
            print_background=True,
            page_ranges="1-6"
        )
        print("Exported presentation/sieve_final_presentation.pdf successfully!")
        
        # Export individual slide PNGs
        slides = await page.query_selector_all(".slide")
        for i, slide in enumerate(slides):
            out_png = f"presentation/slides/slide_{i+1:02d}.png"
            await slide.screenshot(path=out_png)
            print(f"Exported {out_png}")
            
        await browser.close()

asyncio.run(export_slides())
