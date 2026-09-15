"""macOS application host: bundled Python, local browser and native quit dialog."""
import json
import os
from pathlib import Path
import subprocess
import threading
import urllib.request
import webbrowser

home=Path.home()/'Library'/'Application Support'/'Lithos'
home.mkdir(parents=True,exist_ok=True)
config=home/'config.json'
if not config.exists():config.write_text(json.dumps({'root':'./workspace','port':8765}),encoding='utf-8')
os.environ['WORKBENCH_HOME']=str(home)
os.environ['WORKBENCH_DATA']=str(home/'data')

def dialog(text):
    # Fixed application messages only, no project content or credentials.
    subprocess.run(['osascript','-e',text],check=False)

def main():
    from server import Handler, PORT, ROOT, initialize_workspace, WorkbenchHTTPServer
    initialize_workspace()
    url=f'http://127.0.0.1:{PORT}'
    try:http=WorkbenchHTTPServer(('127.0.0.1',PORT),Handler)
    except OSError:
        try:
            with urllib.request.urlopen(url+'/api/state',timeout=3) as response:state=json.load(response)
            if state.get('app_id')!='project-knowledge-workbench' or state.get('root')!=str(ROOT):raise ValueError()
            webbrowser.open(url+'/app')
        except Exception:dialog('display dialog "端口被其他程序占用，请在 Library/Application Support/Lithos/config.json 修改端口后重试。" with title "曜石 · Lithos" buttons {"关闭"}')
        return
    thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
    try:
        webbrowser.open(url+'/app')
        dialog('display dialog "曜石正在本机运行，工作区已在默认浏览器打开。使用期间保留此窗口。结束前先保存草稿，再点击退出；关闭网页不会停止服务。" with title "曜石 · Lithos" buttons {"退出工作台"} default button "退出工作台"')
    finally:http.shutdown();http.server_close();thread.join(timeout=5)

if __name__=='__main__':main()
