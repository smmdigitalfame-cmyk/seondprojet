#!/usr/bin/env python3
"""Run only on the backup VPS. Never changes websites, databases or webhooks."""
import argparse
import datetime
import fcntl
import importlib.util
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request

ROOT = Path('/root/backups/source-packages')
DEST = 'gdrive:vps-backups/deployment-packages'
spec = importlib.util.spec_from_file_location('policy', Path(__file__).with_name('source-package-policy.py'))
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)

def github(path):
    headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'editor-source-backup'}
    token_file = ROOT / 'github-token'
    if token_file.exists():
        headers['Authorization'] = 'Bearer ' + token_file.read_text().strip()
    with urllib.request.urlopen(urllib.request.Request('https://api.github.com/' + path, headers=headers), timeout=90) as r:
        return r.read()

def download(repo, branch, target):
    data = github(f'repos/{repo}/tarball/{branch}')
    temporary = Path(tempfile.mkdtemp(dir=ROOT))
    try:
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
            for member in archive.getmembers():
                parts = PurePosixPath(member.name).parts[1:]
                name = '/'.join(parts)
                if not parts or not member.isfile() or not policy.include_path(name):
                    continue
                content = archive.extractfile(member)
                if content is None:
                    continue
                destination = temporary.joinpath(*parts)
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(content.read())
        # Replace backup staging only, never a running app directory.
        if target.exists():
            shutil.rmtree(target)
        temporary.rename(target)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)

def run(force=False):
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (ROOT / 'refresh.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        state_file = ROOT / 'state.json'
        state = json.loads(state_file.read_text()) if state_file.exists() else {}
        today = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')
        for product, repo, branch in [('Instagram', 'smmdigitalfame-cmyk/seondprojet', 'drive-source-backup'), ('TikTok', 'smmdigitalfame-cmyk/finalproject', 'main')]:
            remote = json.loads(github(f'repos/{repo}/commits/{branch}'))['sha']
            old = state.get(product, {})
            source = ROOT / product
            if not source.exists() or (old.get('remote_revision') and old['remote_revision'] != remote):
                download(repo, branch, source)
            revision = old.get('source_revision', remote) if old.get('remote_revision') == remote else remote
            if force or old.get('day') != today or old.get('remote_revision') != remote:
                output = ROOT / f'{product}-complete-source.zip'
                guide = (ROOT / f'{product}-START-HERE.md').read_text()
                count = policy.package(source, output, product, revision, guide)
                for folder in ['latest-code', 'history/' + today]:
                    subprocess.run(['rclone', 'copyto', str(output), f'{DEST}/{folder}/{output.name}', '--checksum'], check=True, timeout=300)
                state[product] = {'remote_revision': remote, 'source_revision': revision, 'day': today, 'files': count}
                state_file.write_text(json.dumps(state, indent=2))
                print(f'{product}: {count} source files uploaded')
        # Retention is scoped to this job's dated history only. Never delete older backups elsewhere.
        listing = subprocess.check_output(['rclone', 'lsjson', DEST + '/history', '--dirs-only'], text=True)
        cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=14)).date()
        for item in json.loads(listing):
            try:
                day = datetime.date.fromisoformat(item['Name'])
            except ValueError:
                continue
            if day < cutoff:
                subprocess.run(['rclone', 'purge', DEST + '/history/' + item['Name']], check=True, timeout=120)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    run(args.force)