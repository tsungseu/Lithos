"""Verify installed native app against an isolated home, never the user's D drive."""
import json, os, socket, subprocess, tempfile, time, urllib.request
from pathlib import Path

base=Path(__file__).resolve().parents[1]
package=base.parent/'work/desktop-build/payload'
if len(__import__('sys').argv)>1:package=Path(__import__('sys').argv[1])
home=base.parent/'work/desktop-qa-home'
home.mkdir(exist_ok=True)
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
(home/'config.json').write_text(json.dumps({'root':'./workspace','port':port}),encoding='utf-8')
env=os.environ.copy()
for k in ['WORKBENCH_ROOT','WORKBENCH_PORT','WORKBENCH_DATA','PYTHONHOME','PYTHONPATH']:env.pop(k,None)
env['WORKBENCH_HOME']=str(home)
before=(package/'server.py').read_bytes()
process=subprocess.Popen([str(package/'runtime/python.exe'),'-B','-u',str(package/'desktop_host.py')],cwd=package,env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
try:
    line=process.stdout.readline().decode().strip()
    assert line==f'http://127.0.0.1:{port}',line
    with urllib.request.urlopen(line+'/api/state') as r:state=json.load(r)
    assert Path(state['root']).resolve()==(home/'workspace').resolve()
    assert state['version']=='3.3.0'
finally:
    process.stdin.close();process.wait(timeout=6)
assert process.returncode==0
with socket.socket() as s:assert s.connect_ex(('127.0.0.1',port))!=0,'orphan service'
assert (package/'server.py').read_bytes()==before
# The WinForms harness loads the actual WebView2 control and captures its own surface.
startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
native=subprocess.run([str(package/'Workbench.exe'),'--smoke-test',str(home)],cwd=package,timeout=60,startupinfo=startup)
assert native.returncode==0,(home/'smoke-result.txt').read_text()
assert (home/'smoke-result.txt').read_text().startswith('PASS')
with socket.socket() as s:assert s.connect_ex(('127.0.0.1',port))!=0,'native orphan service'
print('PASS: external config and workspace; native WebView2 loads actual app; owner exit stops server; install assets unchanged. Screenshot:',home/'desktop-preview.png')
