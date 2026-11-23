"""Read-only fingerprints and snapshots of product deployment directories."""
import hashlib
from pathlib import Path
import shutil

BLOCKED = {'.git', '.jj', 'node_modules', '__pycache__', '.cache', 'logs',
           'uploads', 'backups', 'storage', 'data'}

def allowed(name):
    path = Path(name)
    base = path.name.lower()
    if any(p in BLOCKED for p in path.parts):
        return False
    if base.startswith('.env') or base.endswith(('.env', '.pem', '.key', '.log',
            '.sqlite', '.db', '.sql', '.gz', '.zip', '.p12', '.pfx', '.keystore')):
        return base.endswith('.env.example')
    return base not in {'rclone.conf', 'github-token'}

def files(root):
    for path in sorted(root.rglob('*')):
        if path.is_file() and not path.is_symlink() and allowed(path.relative_to(root).as_posix()):
            yield path

def fingerprint(root):
    digest = hashlib.sha256()
    for path in files(root):
        digest.update(path.relative_to(root).as_posix().encode() + b'\0')
        digest.update(hashlib.sha256(path.read_bytes()).digest())
    return digest.hexdigest()

def snapshot(root, destination):
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True, mode=0o700)
    for path in files(root):
        target = destination / path.relative_to(root)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(path.read_bytes())