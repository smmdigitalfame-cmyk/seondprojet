#!/usr/bin/env python3
"""Import a GitHub-produced source ZIP into backup-only staging."""
import fcntl
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import zipfile

ROOT = Path('/root/backups/source-packages')
spec = importlib.util.spec_from_file_location('refresh', ROOT / 'refresh-drive-source-packages.py')
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)

with (ROOT / 'refresh.lock').open('w') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    incoming = ROOT / 'incoming-instagram.zip'
    with zipfile.ZipFile(incoming) as archive:
        manifest = json.loads(archive.read('PACKAGE-MANIFEST.json'))
        if manifest['product'] != 'Instagram' or manifest['revision'] != sys.argv[1]:
            raise ValueError('Source revision mismatch')
        staging = ROOT / 'Instagram-incoming'
        if staging.exists():
            shutil.rmtree(staging)
        staging.mkdir(mode=0o700)
        for name, expected in manifest['files'].items():
            if not refresh.policy.include_path(name):
                raise ValueError('Unsafe archive entry')
            data = archive.read(name)
            if hashlib.sha256(data).hexdigest() != expected:
                raise ValueError('Source checksum mismatch')
            dest = staging / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
    source = ROOT / 'Instagram'
    if source.exists():
        shutil.rmtree(source)
    staging.rename(source)
    state_file = ROOT / 'state.json'
    state = json.loads(state_file.read_text()) if state_file.exists() else {}
    remote = json.loads(refresh.github('repos/smmdigitalfame-cmyk/seondprojet/commits/drive-source-backup'))['sha']
    state['Instagram'] = {'remote_revision': remote, 'source_revision': sys.argv[1]}
    state_file.write_text(json.dumps(state))
    incoming.unlink()
refresh.run(force=True)