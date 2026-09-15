import json, urllib.request, webbrowser
try:
    from backend.server import Handler, PORT, ROOT, initialize_workspace, WorkbenchHTTPServer
except ModuleNotFoundError:
    from server import Handler, PORT, ROOT, initialize_workspace, WorkbenchHTTPServer


def main():
    initialize_workspace()
    url = f'http://127.0.0.1:{PORT}'
    try:
        http = WorkbenchHTTPServer(('127.0.0.1', PORT), Handler)
    except OSError:
        try:
            with urllib.request.urlopen(url + '/api/state', timeout=2) as response:
                state = json.load(response)
            if state.get('app_id') != 'project-knowledge-workbench' or state.get('root') != str(ROOT):
                raise ValueError('different application or workspace')
            webbrowser.open(url)
            print('工作台已运行，已打开现有页面。')
        except Exception:
            raise SystemExit(f'端口 {PORT} 已占用。请关闭先前工作台，或修改 config.json 的 port 后启动；不会停止其他进程。')
    else:
        webbrowser.open(url)
        print(f'项目知识工作台：{url}\n资料位置：{ROOT}\n关闭此窗口或按 Ctrl+C 停止服务。', flush=True)
        try:
            http.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            http.server_close()

if __name__ == '__main__':
    main()
