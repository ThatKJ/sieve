import asyncio
import os
import http.server
import socketserver
import threading
from playwright.async_api import async_playwright

PORT = 8799
WEB_DIR = os.path.abspath("web")

class StaticHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

async def run_tests():
    # Start pure static server without any /api routes to test static fallback
    server = socketserver.TCPServer(("127.0.0.1", PORT), StaticHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    print(f"Static test server running on http://127.0.0.1:{PORT}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        
        # Test 1: Desktop Viewport (1440x900)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        
        await page.goto(f"http://127.0.0.1:{PORT}")
        await page.wait_for_timeout(4000) # allow fallback demo data to mount
        
        # Check title
        title = await page.title()
        print(f"Page title: {title}")
        assert "Sieve" in title, f"Unexpected title: {title}"
        
        # Check console errors
        print(f"Desktop console errors: {console_errors}")
        assert len(console_errors) == 0, f"Found console errors: {console_errors}"
        
        # Check demo atlas rendered
        has_atlas_canvas = await page.query_selector("canvas, svg")
        print(f"Has atlas canvas/svg: {has_atlas_canvas is not None}")
        
        # Check screenshot
        await page.screenshot(path="presentation/assets/web_showcase_desktop_verified.png")
        print("Captured web_showcase_desktop_verified.png")

        # Test 2: Click on demo PR (PR #4) to test static fallback PR inspection
        demo_btn = await page.query_selector(".demo-card .demo-inspect-btn")
        if demo_btn:
            await demo_btn.click()
            await page.wait_for_timeout(2000)
            await page.screenshot(path="presentation/assets/web_showcase_demo_pr_inspected.png")
            print("Captured web_showcase_demo_pr_inspected.png")
            
            # Click Back to Overview
            back_btn = await page.query_selector(".review-nav-bar button")
            if back_btn:
                await back_btn.click()
                await page.wait_for_timeout(1000)

        # Test 3: Mobile Viewport (390x844 - iPhone 12/13/14)
        mobile_page = await browser.new_page(viewport={"width": 390, "height": 844})
        mobile_errors = []
        mobile_page.on("console", lambda msg: mobile_errors.append(msg.text) if msg.type == "error" else None)
        
        await mobile_page.goto(f"http://127.0.0.1:{PORT}")
        await mobile_page.wait_for_timeout(4000)
        
        # Check horizontal overflow on mobile
        overflow = await mobile_page.evaluate("""() => {
            return document.documentElement.scrollWidth > window.innerWidth;
        }""")
        print(f"Mobile has horizontal overflow: {overflow}")
        assert not overflow, "Mobile has horizontal overflow!"
        
        print(f"Mobile console errors: {mobile_errors}")
        assert len(mobile_errors) == 0, f"Found mobile console errors: {mobile_errors}"
        
        await mobile_page.screenshot(path="presentation/assets/web_showcase_mobile_verified.png")
        print("Captured web_showcase_mobile_verified.png")
        
        await browser.close()
    
    server.shutdown()
    print("ALL STATIC WEB SHOWCASE TESTS PASSED!")

if __name__ == "__main__":
    asyncio.run(run_tests())
