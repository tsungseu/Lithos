"""Build a Windows x64 offline package from local runtime artifacts."""
import hashlib, importlib.metadata, json, shutil, zipfile
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
OUT = BASE.parent / 'outputs'
CACHE = BASE.parent / 'work' / 'package-v2'
PACKAGE = OUT / '曜石-Lithos-v3.7.0-Windows-x64'
FILES = ['office-frame.html','office-frame.js','office.css','server.py','launcher.py','index.html','workspace.css','shell.js','markdown.js','app.js','settings.js','graph.js','storage.js','router.js','providers.js','启动工作台.cmd','使用说明.md','离线使用与配置.md','项目记录模板.md']

FILES.extend(['工作区界面说明.md','oauth.py','account.js','brand.svg','OAuth接入说明.md','oauth_apple_bridge.py'])
FILES.extend(['page-patterns.js', 'page-patterns.css', 'memory.py', 'memory_agents.py', 'memory_gateway.py', 'memory_team.py', '记忆平台使用说明.md', 'memory-ui.js', 'memory-ui.css'])
FILES.extend(['workspace-shell.js', 'workspace-shell.css', 'workspace-commands.js', 'workspace-navigation.js', 'Obsidian工作区使用说明.md', 'CHANGELOG.md'])
FILES.extend(['knowledge.py', 'knowledge-ui.js', 'knowledge-ui.css', '知识管理使用说明.md'])

def source(name):
    for folder in ('web','backend','desktop','docs','scripts',''):
        path=BASE/folder/name
        if path.is_file(): return path
    raise FileNotFoundError(name)

def build():
    PACKAGE.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        shutil.copy2(source(name), PACKAGE/name)
    shutil.copytree(BASE/'web/vendor',PACKAGE/'vendor',dirs_exist_ok=True)
    runtime = PACKAGE/'runtime'
    runtime.mkdir(exist_ok=True)
    archive = CACHE/'python-3.12.10-embed-amd64.zip'
    with zipfile.ZipFile(archive) as z:
        for info in z.infolist():
            if not (runtime/info.filename).resolve().is_relative_to(runtime.resolve()):
                raise ValueError('Unsafe runtime archive')
        z.extractall(runtime)
    (runtime/'python312._pth').write_text('python312.zip\n.\n..\nLib/site-packages\n', encoding='utf-8')
    dist = importlib.metadata.distribution('pypdf')
    for item in dist.files:
        if '__pycache__' in item.parts or '..' in item.parts or str(item).endswith('.pyc'):
            continue
        runtime_source = Path(dist.locate_file(item))
        target = runtime/'Lib/site-packages'/item
        if runtime_source.is_file():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(runtime_source,target)
    (PACKAGE/'config.json').write_text(json.dumps({'root':'./workspace','port':8765}, indent=2), encoding='utf-8')
    (PACKAGE/'第三方组件声明.txt').write_text(f'Python 3.12.10 Windows x64 embeddable\n来源：https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip\n归档SHA-256：{hashlib.sha256(archive.read_bytes()).hexdigest()}\n许可证：runtime/LICENSE.txt\npypdf {dist.version}\n许可证：runtime/Lib/site-packages/pypdf-{dist.version}.dist-info/licenses/LICENSE\nOffice阅读组件及许可证详见vendor/VERSIONS.txt；所有组件随包提供。\n界面为原创实现；飞书、Wiki.js、Obsidian仅作为交互参考，未打包其产品代码。\n',encoding='utf-8')
    entries=[]
    release_files=[]
    for p in sorted(PACKAGE.rglob('*')):
        if p.is_symlink(): raise ValueError('No symlinks permitted')
        relative=p.relative_to(PACKAGE)
        allowed=relative.as_posix() in FILES+['config.json','第三方组件声明.txt'] or relative.parts[0] in {'runtime','vendor'}
        if p.is_file() and allowed and '__pycache__' not in relative.parts and p.suffix!='.pyc':
            entries.append(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.relative_to(PACKAGE).as_posix())
            release_files.append(p)
    (PACKAGE/'SHA256SUMS.txt').write_text('\n'.join(entries)+'\n',encoding='utf-8')
    target = OUT/(PACKAGE.name+'.zip')
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
        for p in release_files+[PACKAGE/'SHA256SUMS.txt']:
            z.write(p,PACKAGE.name+'/'+p.relative_to(PACKAGE).as_posix())
    print(json.dumps({'package':str(target),'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()},ensure_ascii=False))

if __name__=='__main__': build()
