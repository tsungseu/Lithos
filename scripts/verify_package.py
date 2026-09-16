"""Unpack and verify the deliverable independently, denying outbound sockets."""
import hashlib, json, os, re, socket, subprocess, tempfile, time, urllib.request, zipfile
from pathlib import Path

base=Path(__file__).resolve().parents[1]
archive=base.parent/'outputs/曜石-Lithos-v3.5.5-Windows-x64.zip'
with tempfile.TemporaryDirectory(prefix='workbench-package-') as temp:
    with zipfile.ZipFile(archive) as z: z.extractall(temp)
    package=next(Path(temp).iterdir())
    for line in (package/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
        digest, name=line.split('  ',1)
        assert hashlib.sha256((package/name).read_bytes()).hexdigest()==digest, name
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
    config={'root':'./workspace','port':port}
    (package/'config.json').write_text(json.dumps(config),encoding='utf-8')
    env=os.environ.copy()
    for key in ('WORKBENCH_ROOT','WORKBENCH_DATA','WORKBENCH_PORT','PYTHONHOME','PYTHONPATH'):
        env.pop(key,None)
    bootstrap="import socket,runpy; original=socket.socket.connect; socket.socket.connect=lambda self,address: original(self,address) if address[0] in ('127.0.0.1','::1') else (_ for _ in ()).throw(OSError('outbound network denied')); runpy.run_path('server.py',run_name='__main__')"
    process=subprocess.Popen([str(package/'runtime/python.exe'),'-c',bootstrap],cwd=package,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    try:
        url=f'http://127.0.0.1:{port}'
        for attempt in range(60):
            try:
                with urllib.request.urlopen(url,timeout=1) as response: html=response.read().decode(); break
            except OSError: time.sleep(.1)
        else: raise RuntimeError('package failed to start')
        token=re.search(r'name="workbench-token" content="([^"]+)"',html).group(1)
        def api(path,body=None):
            req=urllib.request.Request(url+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Workbench-Token':token})
            with urllib.request.urlopen(req,timeout=5) as r:return json.load(r)
        initial=api('/api/state')
        for asset in ['/knowledge-ui.js','/knowledge-ui.css','/workspace-shell.js','/workspace-shell.css','/workspace-commands.js','/workspace-navigation.js']:
            with urllib.request.urlopen(url+asset) as r: assert r.status==200
        note=api('/api/kb/create',{'folder':'03_工程实践/开发与部署','name':'知识编辑验收'})
        note=api('/api/kb/save',{'path':note['id'],'revision':note['revision'],'content':'# 离线知识编辑\n\n保存与恢复测试'})
        assert len(api('/api/kb/versions?path='+urllib.parse.quote(note['id'])))==1
        assert api('/api/kb/search?q='+urllib.parse.quote('离线知识编辑'))['total']==1
        assert initial['projects']==[] and initial['stats']['knowledge']==0
        assert Path(initial['root']).resolve()==(package/'workspace').resolve()
        resource=package/'workspace/03_技术知识库/05_开源项目/示例'
        resource.mkdir(parents=True)
        (resource/'资源说明.txt').write_text('离线资源检索样例',encoding='utf-8')
        graph=api('/api/graph?folder='+urllib.parse.quote('05_开源项目'))
        assert any(n['title']=='资源说明.txt' for n in graph['nodes'])
        assert api('/api/library?q='+urllib.parse.quote('离线资源检索样例'))['total']==1
        assert api('/api/library-preview?path='+urllib.parse.quote('05_开源项目/示例/资源说明.txt'))['content']=='离线资源检索样例'
        with urllib.request.urlopen(url+'/api/library-download?path='+urllib.parse.quote('05_开源项目/示例/资源说明.txt')) as response:
            assert response.read().decode()=='离线资源检索样例'
        for asset in ['/office-frame.html','/office-frame.js','/office.css','/vendor/jszip.min.js','/vendor/docx-preview.min.js','/vendor/xlsx.full.min.js','/vendor/pdf.min.js','/vendor/pdf.worker.min.js','/app.js','/workspace.css','/markdown.js','/vendor/marked.umd.js','/vendor/purify.min.js','/graph.js','/storage.js','/providers.js','/router.js','/app/settings','/app/projects','/app/knowledge']:
            with urllib.request.urlopen(url+asset) as r: assert r.status==200
        project=api('/api/projects',{'area':'03_其他项目','name':'离线验收'})
        source=Path(project['path'])/'03_开发与验证/验证记录.md'
        source.write_text('离线验收：样例10项通过，适用范围仅为本地测试。',encoding='utf-8')
        draft=api('/api/manual-draft',{'project':project['id'],'files':['03_开发与验证/验证记录.md']})
        content='## 有效做法\n保留测试证据[S1]。\n## 适用边界\n仅为本地样例。'
        api('/api/save-draft',{'draft':draft['id'],'content':content})
        result=api('/api/publish',{'draft':draft['id'],'content':content,'title':'离线验收知识','reviewed':True,'category':'03_工程实践/开发与部署'})
        assert Path(result['path']).is_file()
        assert len(api('/api/knowledge?q='+urllib.parse.quote('离线验收知识')))==1
        reuse=subprocess.run([str(package/'runtime/python.exe'),'-c',"import webbrowser; webbrowser.open=lambda url: True; import launcher; launcher.main()"],cwd=package,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)
        assert reuse.returncode==0, reuse.stderr
        print('PASS: ZIP hashes; isolated embedded runtime; empty portable workspace; no external sockets; create project; manual draft; save; reviewed publish; search; local assets.')
    finally:
        process.terminate(); process.wait(timeout=5)
