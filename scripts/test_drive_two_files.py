import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('refresh', Path(__file__).with_name('refresh-drive-source-packages.py'))
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)

class TwoFiles(unittest.TestCase):
    def test_refresh_uploads_exactly_two_latest_zips(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for product in ['Instagram', 'TikTok']:
                (root / product).mkdir()
                (root / (product + '-START-HERE.md')).write_text('guide')
            commit = {'sha': 'abc'}
            with patch.object(refresh, 'ROOT', root), patch.object(refresh, 'selected_commit', return_value=('main', commit)), patch.object(refresh, 'download'), patch.object(refresh.vps_files, 'fingerprint', return_value='hash'), patch.object(refresh.vps_files, 'snapshot'), patch.object(refresh.policy, 'package', return_value=1), patch.object(refresh.subprocess, 'run') as run:
                refresh.run(force=True)
            destinations = [call.args[0][3] for call in run.call_args_list]
            self.assertEqual(destinations, [
                'gdrive:vps-backups/deployment-packages/latest-code/Instagram-complete-source.zip',
                'gdrive:vps-backups/deployment-packages/latest-code/TikTok-complete-source.zip'])

if __name__ == '__main__':
    unittest.main()