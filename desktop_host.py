"""Desktop-owned HTTP service: stdin EOF stops only this service."""
import json, os, sys, threading
from pathlib import Path

home = Path(os.environ['WORKBENCH_HOME'])
home.mkdir(parents=True, exist_ok=True)
config = home / 'config.json'
if not config.exists():
    root = 'D:/' if all((Path('D:/') / p).is_dir() for p in ['05_项目与交付', '03_技术知识库']) else './workspace'
    with config.open('x', encoding='utf-8') as f:
        json.dump({'root': root, 'port': 8768}, f, ensure_ascii=False, indent=2)

from server import initialize_workspace, WorkbenchHTTPServer, Handler, PORT

initialize_workspace()
http = WorkbenchHTTPServer(('127.0.0.1', PORT), Handler)
def watch_owner():
    # No shell commands or credentials are accepted on this pipe.
    sys.stdin.buffer.read()
    http.shutdown()
threading.Thread(target=watch_owner, daemon=True).start()
print('http://127.0.0.1:' + str(http.server_port), flush=True)
try:
    http.serve_forever(poll_interval=.15)
finally:
    http.server_close()
