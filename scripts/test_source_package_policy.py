import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile
import json

spec = importlib.util.spec_from_file_location('policy', Path(__file__).with_name('source-package-policy.py'))
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)

class PackageRules(unittest.TestCase):
    def test_credentials_are_excluded_at_every_depth(self):
        for name in ['.env', 'server/.env.production', 'app.env', 'a/rclone.conf',
                     'a/signing.keystore', 'backup.env', 'a/private.key']:
            self.assertFalse(policy.include_path(name), name)

    def test_metadata_and_dependencies_are_excluded(self):
        for name in ['.git/config', 'a/.git/config', 'node_modules/p/a.js',
                     'a/dist/index.js', 'mem/index.md', '../secrets', '/root/pass']:
            self.assertFalse(policy.include_path(name), name)

    def test_product_code_and_blank_settings_are_kept(self):
        for name in ['supabase/functions/public-telegram-webhook/index.ts',
                     'drizzle/migrations/0010_example.sql', '.github/workflows/deploy.yml',
                     'src/routes/api/public/bot/tiktok-key.ts', '.env.example']:
            self.assertTrue(policy.include_path(name), name)

    def test_archive_manifest_matches_actual_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); source = root / 'source'; source.mkdir()
            (source / 'bot.ts').write_text('bot code')
            (source / '.env').write_text('secret')
            archive = root / 'instagram.zip'
            policy.package(source, archive, 'Instagram', 'abc', 'Deploy guide')
            with zipfile.ZipFile(archive) as z:
                self.assertNotIn('.env', z.namelist())
                manifest = json.loads(z.read('PACKAGE-MANIFEST.json'))
                self.assertEqual(manifest['product'], 'Instagram')
                self.assertEqual(manifest['files']['bot.ts'], policy.hashlib.sha256(b'bot code').hexdigest())

if __name__ == '__main__':
    unittest.main()