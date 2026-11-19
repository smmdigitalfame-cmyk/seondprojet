"""Credential-free, reproducible source handoff archives (not database backups)."""
from pathlib import PurePosixPath
import hashlib
import json
import zipfile

BLOCKED_PARTS = {'.git', '.jj', 'node_modules', 'dist', 'build', '.output', '.nitro',
                 '.lovable', '.oj-cache', 'mem', '__pycache__', '.cache', 'coverage'}

def include_path(name):
    path = PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts or any(p in BLOCKED_PARTS for p in path.parts):
        return False
    base = path.name.lower()
    if base in {'app.env', 'backup.env', 'rclone.conf', 'state.json', 'roadmap.md', 'package-manifest.json'}:
        return False
    if base.startswith('.env') and base not in {'.env.example', '.env.template'}:
        return False
    if base.endswith(('.pem', '.key', '.p12', '.pfx', '.jks', '.keystore', '.log',
                      '.tsbuildinfo', '.sql.gz', '.sqlite', '.db')):
        return False
    return True

def package(source, destination, product, revision, guide):
    files = {}
    for path in sorted(source.rglob('*')):
        if not path.is_file() or path.is_symlink():
            continue
        name = path.relative_to(source).as_posix()
        if include_path(name):
            files[name] = path.read_bytes()
    files['START-HERE.md'] = guide.encode()
    manifest = {'product': product, 'revision': revision,
                'contains_credentials': False, 'contains_customer_data': False,
                'files': {n: hashlib.sha256(b).hexdigest() for n, b in files.items()}}
    with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)
        archive.writestr('PACKAGE-MANIFEST.json', json.dumps(manifest, indent=2))
    return len(files)