#!/usr/bin/env python3
"""Read-only EllenG Cup source regression checks; no network/database access."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]

def read(name):
    return (ROOT / name).read_text(encoding="utf-8")

class EllenGSourceChecks(unittest.TestCase):
    def test_entry_redirect_targets_current_scoring_page(self):
        entry = read("index.html")
        self.assertRegex(entry, r'scoring\.html\?v=')
        self.assertTrue((ROOT / "scoring.html").is_file())

    def test_supabase_browser_config_uses_publishable_key(self):
        cfg = read("config.js")
        self.assertIn("supabasePublishableKey", cfg)
        self.assertNotRegex(cfg, r"(?i)service.role|sb_secret_")

    def test_draft_order_and_capacity_helpers_present(self):
        source = read("common.js")
        for fn in ("order", "teamCapacity", "canBand", "bandPenalty"):
            self.assertRegex(source, rf"function\s+{fn}\s*\(")

    def test_html_versions_are_consistent(self):
        scoring = read("scoring.html")
        entry = read("index.html")
        worker = read("service-worker.js")
        app = re.search(r'name="elleng-app-version" content="([^"]+)"', scoring)
        redirect = re.search(r'scoring\.html\?v=([0-9.]+)', entry)
        cache = re.search(r'elleng-cup-v([0-9.]+)', worker)
        self.assertIsNotNone(app)
        self.assertIsNotNone(redirect)
        self.assertIsNotNone(cache)
        self.assertEqual(app.group(1), redirect.group(1), "Entry page uses an older scoring version")
        self.assertEqual(app.group(1), cache.group(1), "Service worker cache version differs")

if __name__ == "__main__":
    unittest.main()
