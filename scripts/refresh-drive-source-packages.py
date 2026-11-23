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
LATEST = DEST + '/latest-code'
spec = importlib.util.spec_from_file_location('policy', Path(__file__).with_name('source-package-policy.py'))
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)
vps_spec = importlib.util.spec_from_file_location('vps_files', Path(__file__).with_name('vps-package-files.py'))
vps_files = importlib.util.module_from_spec(vps_spec)
vps_spec.loader.exec_module(vps_files)

def selected_commit(repo, branches):
    commits = [(branch, json.loads(github(f'repos/{repo}/commits/{branch}'))) for branch in branches]
    return max(commits, key=lambda pair: pair[1]['commit']['committer']['date'])

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
        for product, repo, branches, deployed in [
            ('Instagram', 'smmdigitalfame-cmyk/seondprojet', ['main', 'drive-source-backup'], Path('/var/www/insights')),
            ('TikTok', 'smmdigitalfame-cmyk/finalproject', ['main'], Path('/opt/tiktokapp')),
        ]:
            branch, commit = selected_commit(repo, branches)
            remote = commit['sha']
            old = state.get(product, {})
            source = ROOT / product
            if not source.exists() or old.get('remote_revision') != remote:
                download(repo, branch, source)
            revision = old.get('source_revision', remote) if old.get('remote_revision') == remote else remote
            deployed_hash = vps_files.fingerprint(deployed)
            if force or old.get('day') != today or old.get('remote_revision') != remote or old.get('vps_hash') != deployed_hash:
                vps_files.snapshot(deployed, source / 'VPS-DEPLOYED')
                output = ROOT / f'{product}-complete-source.zip'
                guide = (ROOT / f'{product}-START-HERE.md').read_text()
                guide += '\n\nVPS-DEPLOYED/ is the latest credential-free VPS file snapshot, not editable repository source. Keep it separate; never overwrite source with compiled files. Secrets and customer data are excluded.\n'
                count = policy.package(source, output, product, revision, guide)
                subprocess.run(['rclone', 'copyto', str(output), f'{LATEST}/{output.name}', '--checksum'], check=True, timeout=300)
                state[product] = {'remote_revision': remote, 'source_revision': revision, 'branch': branch, 'vps_hash': deployed_hash, 'day': today, 'files': count}
                state_file.write_text(json.dumps(state, indent=2))
                print(f'{product}: {count} source files uploaded')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    run(args.force)