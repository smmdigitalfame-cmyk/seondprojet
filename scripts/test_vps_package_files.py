import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('vps', Path(__file__).with_name('vps-package-files.py'))
vps = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vps)

class VPSChanges(unittest.TestCase):
    def test_vps_edit_triggers_new_fingerprint(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            file = root / 'server.mjs'
            file.write_text('version1')
            old = vps.fingerprint(root)
            file.write_text('version2')
            self.assertNotEqual(old, vps.fingerprint(root))

    def test_removed_deployed_file_changes_fingerprint(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            file = root / 'index.html'; file.write_text('app')
            old = vps.fingerprint(root); file.unlink()
            self.assertNotEqual(old, vps.fingerprint(root))

    def test_private_settings_never_enter_snapshot(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / 'live'; root.mkdir()
            (root / 'app.env').write_text('private')
            (root / 'server.mjs').write_text('code')
            output = Path(d) / 'snapshot'
            vps.snapshot(root, output)
            self.assertFalse((output / 'app.env').exists())
            self.assertEqual((output / 'server.mjs').read_text(), 'code')

if __name__ == '__main__':
    unittest.main()