import os,subprocess,requests,base64,importlib.util
spec=importlib.util.spec_from_file_location("p","scripts/source-package-policy.py");p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
R="https://api.github.com/repos/smmdigitalfame-cmyk/seondprojet";H={"Authorization":"token "+os.environ["GITHUB_TOKEN"],"Accept":"application/vnd.github+json"}
B="drive-source-backup"
ref=requests.get(f"{R}/git/ref/heads/{B}",headers=H).json();head=ref["object"]["sha"]
c=requests.get(f"{R}/git/commits/{head}",headers=H).json()
tree=requests.get(f"{R}/git/trees/{c['tree']['sha']}?recursive=1",headers=H).json()["tree"]
remote={t["path"]:t["sha"] for t in tree if t["type"]=="blob"}
files=[f for f in subprocess.check_output(["git","ls-files"]).decode().split("\n") if f and p.include_path(f) and os.path.isfile(f)]
items=[]
for f in files:
  d=open(f,"rb").read();import hashlib;s=hashlib.sha1(b"blob %d\0"%len(d)+d).hexdigest()
  if remote.get(f)!=s:
    b=requests.post(f"{R}/git/blobs",headers=H,json={"content":base64.b64encode(open(f,"rb").read()).decode(),"encoding":"base64"}).json()
    items.append({"path":f,"mode":"100644","type":"blob","sha":b["sha"]})
print("changed",len(items))
if items:
  t=requests.post(f"{R}/git/trees",headers=H,json={"base_tree":c["tree"]["sha"],"tree":items}).json()
  nc=requests.post(f"{R}/git/commits",headers=H,json={"message":"Sync latest Lovable website code","tree":t["sha"],"parents":[head]}).json()
  r=requests.patch(f"{R}/git/refs/heads/{B}",headers=H,json={"sha":nc["sha"]});print(r.status_code,nc["sha"][:7])
