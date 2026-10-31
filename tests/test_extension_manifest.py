"""Static checks for the Chrome extension: the things Chrome rejects at "Load unpacked" time.

No browser needed. Catches a missing referenced file, an invalid manifest, a reserved file name,
or a permission added without review, before anyone tries to load the extension.
"""
import json
import pathlib
import unittest

EXT = pathlib.Path(__file__).resolve().parent.parent / "extension"
# Reviewed permission surface. Widening it should be a deliberate change to this list.
ALLOWED_PERMISSIONS = {"storage"}
ALLOWED_HOSTS = {"https://github.com/*", "http://127.0.0.1:8787/*", "http://localhost:8787/*"}


def manifest():
    return json.loads((EXT / "manifest.json").read_text())


def referenced_files(m):
    refs = [m["background"]["service_worker"], m["action"]["default_popup"]]
    refs += list(m.get("icons", {}).values()) + list(m["action"].get("default_icon", {}).values())
    for cs in m.get("content_scripts", []):
        refs += cs.get("js", []) + cs.get("css", [])
    for war in m.get("web_accessible_resources", []):
        refs += [r for r in war["resources"] if "*" not in r]
    return refs


class ExtensionManifest(unittest.TestCase):
    def test_is_manifest_v3(self):
        self.assertEqual(manifest()["manifest_version"], 3)

    def test_every_referenced_file_exists(self):
        missing = [r for r in referenced_files(manifest()) if not (EXT / r).is_file()]
        self.assertEqual(missing, [], f"manifest references missing files: {missing}")

    def test_no_reserved_file_names(self):
        # Chrome refuses to load an extension containing files or folders whose names start with "_"
        reserved = [str(p.relative_to(EXT)) for p in EXT.rglob("_*")]
        self.assertEqual(reserved, [], f"Chrome reserves names starting with '_': {reserved}")

    def test_permissions_are_minimal(self):
        m = manifest()
        self.assertLessEqual(set(m.get("permissions", [])), ALLOWED_PERMISSIONS)
        self.assertLessEqual(set(m.get("host_permissions", [])), ALLOWED_HOSTS)

    def test_service_worker_is_not_a_content_script(self):
        m = manifest()
        scripts = {js for cs in m.get("content_scripts", []) for js in cs.get("js", [])}
        self.assertNotIn(m["background"]["service_worker"], scripts)


if __name__ == "__main__":
    unittest.main()
