"""Local knowledge editing, recovery and rebuildable SQLite search index."""
import contextlib
import difflib
import hashlib
import json
import os
import re
import sqlite3
import tempfile
import threading
import time
from datetime import datetime
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit

LIMIT = 1024 * 1024


class Conflict(ValueError):
    pass


class Knowledge:
    def __init__(self, server):
        self.s = server
        self.root = server.KNOWLEDGE.resolve()
        ident = hashlib.sha256(str(self.root).casefold().encode()).hexdigest()[:24]
        self.home = server.checked(server.DATA, 'knowledge/' + ident)
        self.home.mkdir(parents=True, exist_ok=True)
        self.db = self.home / 'knowledge.sqlite3'
        self.lock = threading.RLock()
        self.scanning = False
        self.progress = {'scanning': False, 'processed': 0, 'errors': [], 'updated': None}
        with self.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS files(path TEXT PRIMARY KEY, title TEXT, body TEXT, warning TEXT, size INTEGER, modified INTEGER);
                CREATE TABLE IF NOT EXISTS versions(id INTEGER PRIMARY KEY, path TEXT, created REAL, body BLOB, hash TEXT);
                CREATE INDEX IF NOT EXISTS version_path ON versions(path, id);
                CREATE TABLE IF NOT EXISTS recovery(path TEXT PRIMARY KEY, content TEXT, base TEXT, updated REAL);
                CREATE TABLE IF NOT EXISTS preferences(id INTEGER PRIMARY KEY CHECK(id=1), value TEXT);
                CREATE TABLE IF NOT EXISTS links(source TEXT, target TEXT, PRIMARY KEY(source,target));
            ''')

    @contextlib.contextmanager
    def connect(self):
        db = sqlite3.connect(self.db, timeout=30)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def path(self, relative):
        p = self.s.checked(self.root, relative)
        if any(x.startswith('.') or x in self.s.LIBRARY_SKIP for x in p.relative_to(self.root).parts):
            raise ValueError('隐藏文件和依赖目录不参与知识管理')
        return p

    def writable(self, p):
        parts = p.relative_to(self.root).parts
        if p.suffix.lower() != '.md':
            return '只有 Markdown 知识笔记支持编辑'
        if parts and parts[0] == '05_开源项目':
            return '开源项目资料默认只读'
        for parent in [p.parent, *p.parent.parents]:
            if (parent / '.git').exists():
                return 'Git 仓库内的资料默认只读'
            if parent == self.root:
                break
        return ''

    @staticmethod
    def digest(raw):
        return hashlib.sha256(raw).hexdigest()

    def raw(self, p):
        with p.open('rb') as f:
            raw = f.read(LIMIT + 1)
        if len(raw) > LIMIT:
            raise ValueError('超过 1 MiB，仅支持阅读和下载')
        return raw

    def read(self, relative):
        p = self.path(relative)
        result = self.s.library_preview(relative)
        reason = self.writable(p)
        try:
            raw = self.raw(p)
            content = raw.decode('utf-8-sig')
            if p.suffix.lower() == '.md':
                result.update(content=content, warning='')
            result['revision'] = self.digest(raw)
        except (UnicodeError, ValueError):
            reason = reason or '超过 1 MiB 或不是 UTF-8 编码，仅支持阅读和下载'
        result.update(editable=not reason, readonly_reason=reason)
        with self.connect() as db:
            rec = db.execute('SELECT * FROM recovery WHERE path=?', (relative,)).fetchone()
        result['recovery'] = dict(rec) if rec else None
        return result

    def validate_content(self, content):
        if not isinstance(content, str) or len(content.encode('utf-8')) > LIMIT:
            raise ValueError('Markdown 内容必须小于等于 1 MiB')
        return content

    def save(self, body):
        relative, content = str(body.get('path', '')), self.validate_content(body.get('content'))
        with self.lock:
            p = self.path(relative)
            reason = self.writable(p)
            if reason:
                raise ValueError(reason)
            old = self.raw(p)
            previous = old.decode('utf-8-sig')
            revision = self.digest(old)
            if body.get('revision') != revision:
                raise Conflict('文件已被其他程序修改。请比较磁盘版本，或另存当前编辑。')
            if previous == content:
                with self.connect() as db:
                    db.execute('DELETE FROM recovery WHERE path=?', (relative,))
                return self.read(relative)
            raw = (b'\xef\xbb\xbf' if old.startswith(b'\xef\xbb\xbf') else b'') + content.encode('utf-8')
            # The original snapshot must commit before replacing the file.
            with self.connect() as db:
                db.execute('INSERT INTO versions(path,created,body,hash) VALUES(?,?,?,?)', (relative, time.time(), old, revision))
            fd, temporary = tempfile.mkstemp(prefix='.lithos-', dir=p.parent)
            try:
                with os.fdopen(fd, 'wb') as f:
                    f.write(raw)
                    f.flush()
                    os.fsync(f.fileno())
                if self.digest(self.raw(p)) != revision:
                    raise Conflict('保存期间原文件已变化，未覆盖磁盘内容')
                self.path(relative)
                os.replace(temporary, p)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
            with self.connect() as db:
                db.execute('DELETE FROM recovery WHERE path=?', (relative,))
            self.index_file(p)
            return self.read(relative)

    def create(self, body):
        with self.lock:
            folder = self.path(str(body.get('folder', '')))
            if not folder.is_dir():
                raise ValueError('请选择已有目录')
            name = self.s.safe_name(body.get('name', ''))
            if not name.lower().endswith('.md'):
                name += '.md'
            p = self.path((folder / name).relative_to(self.root).as_posix())
            reason = self.writable(p)
            if reason:
                raise ValueError(reason)
            content = self.validate_content(body.get('content', '# ' + name[:-3] + '\n\n'))
            with p.open('x', encoding='utf-8', newline='') as f:
                f.write(content)
            self.index_file(p)
            return self.read(p.relative_to(self.root).as_posix())

    def recover(self, body):
        relative = str(body.get('path', ''))
        p = self.path(relative)
        if self.writable(p):
            raise ValueError(self.writable(p))
        with self.lock, self.connect() as db:
            if body.get('discard'):
                db.execute('DELETE FROM recovery WHERE path=?', (relative,))
            else:
                content = self.validate_content(body.get('content'))
                db.execute('INSERT OR REPLACE INTO recovery VALUES(?,?,?,?)', (relative, content, str(body.get('revision', '')), time.time()))
        return {'ok': True}

    def ensure_folder(self, relative):
        """Check every ancestor before creating even the first missing directory."""
        folder = self.path(relative)
        reason = self.writable(folder / 'note.md')
        if reason:
            raise ValueError(reason)
        folder.mkdir(parents=True, exist_ok=True)
        return folder

    def create_folder(self, body):
        with self.lock:
            parent = self.path(str(body.get('folder', '')))
            if not parent.is_dir():
                raise ValueError('请选择已有知识目录')
            name = self.s.safe_name(body.get('name', ''))
            folder = self.path((parent / name).relative_to(self.root).as_posix())
            reason = self.writable(folder / 'note.md')
            if reason:
                raise ValueError(reason)
            folder.mkdir()  # Exclusive; existing names are never merged.
            return {'path': folder.relative_to(self.root).as_posix()}

    def daily(self, body):
        with self.lock:
            folder = self.ensure_folder(str(body.get('folder', '日记')))
            date = datetime.now().strftime('%Y-%m-%d')
            relative = (folder / (date + '.md')).relative_to(self.root).as_posix()
            if self.path(relative).exists():
                return self.read(relative)
            try:
                return self.create({'folder': folder.relative_to(self.root).as_posix(), 'name': date,
                                    'content': '# ' + date + '\n\n## 工作记录\n\n## 待办\n\n- [ ] \n'})
            except FileExistsError:
                return self.read(relative)

    def templates(self, folder):
        p = self.path(folder)
        reason = self.writable(p / 'note.md')
        if reason:
            raise ValueError(reason)
        items = []
        if p.is_dir():
            for child in sorted(p.iterdir()):
                if child.suffix.lower() != '.md' or child.name.startswith('.'):
                    continue
                try:
                    relative = child.relative_to(self.root).as_posix()
                    self.path(relative)
                    items.append({'path': relative, 'name': child.stem})
                except (ValueError, OSError):
                    continue
        return {'items': items, 'exists': p.is_dir()}

    def browse(self, folder='', sort='name-asc', offset=0):
        p = self.path(folder)
        if not p.is_dir():
            raise ValueError('目录不存在')
        items, errors = [], []
        for child in p.iterdir():
            if child.name.startswith('.') or child.name in self.s.LIBRARY_SKIP:
                continue
            try:
                relative = child.relative_to(self.root).as_posix()
                self.path(relative)
                st = child.stat()
                items.append({'id': relative, 'title': child.name, 'kind': 'directory' if child.is_dir() else 'file',
                              'modified': st.st_mtime, 'size': st.st_size,
                              'readonly': self.writable(child / 'note.md') if child.is_dir() else self.writable(child)})
            except (OSError, ValueError):
                errors.append(child.name)
        items.sort(key=lambda item: (item['modified'] if sort.startswith('modified') else item['title'].casefold(), item['title']), reverse=sort.endswith('desc'))
        items.sort(key=lambda item: item['kind'] != 'directory')
        offset = max(0, int(offset))
        return {'items': items[offset:offset+100], 'next_offset': offset+100 if len(items)>offset+100 else None,
                'total': len(items), 'folder': folder, 'root': str(self.root), 'errors': errors}

    def versions(self, path):
        self.path(path)
        with self.connect() as db:
            rows = db.execute('SELECT id,created,hash,length(body) AS size FROM versions WHERE path=? ORDER BY id DESC', (path,)).fetchall()
        return [dict(row) for row in rows]

    def version(self, path, ident):
        p = self.path(path)
        with self.connect() as db:
            row = db.execute('SELECT * FROM versions WHERE id=? AND path=?', (int(ident), path)).fetchone()
        if row is None:
            raise ValueError('历史版本不存在')
        content = row['body'].decode('utf-8-sig')
        current = self.raw(p).decode('utf-8-sig')
        return {'content': content, 'diff': ''.join(difflib.unified_diff(content.splitlines(True), current.splitlines(True), fromfile='历史版本', tofile='磁盘当前版本'))}

    def restore(self, body):
        version = self.version(body.get('path', ''), body.get('id'))
        return self.save({**body, 'content': version['content']})

    def preferences(self, body=None):
        with self.lock, self.connect() as db:
            if body is not None:
                if not isinstance(body, dict) or len(json.dumps(body)) > 200000:
                    raise ValueError('工作区状态无效或过大')
                db.execute('INSERT OR REPLACE INTO preferences VALUES(1,?)', (json.dumps(body, ensure_ascii=False),))
            row = db.execute('SELECT value FROM preferences WHERE id=1').fetchone()
        return json.loads(row[0]) if row else {}

    def index_file(self, p):
        with self.lock:
            relative = p.relative_to(self.root).as_posix()
            self.path(relative)
            st = p.stat()
            with self.connect() as db:
                old = db.execute('SELECT size,modified FROM files WHERE path=?', (relative,)).fetchone()
                if old and old['size'] == st.st_size and old['modified'] == st.st_mtime_ns:
                    return
                content, warning = self.s.library_text(str(p), st.st_size, st.st_mtime_ns)
                db.execute('INSERT OR REPLACE INTO files VALUES(?,?,?,?,?,?)', (relative, p.name, content, warning, st.st_size, st.st_mtime_ns))
                db.execute('DELETE FROM links WHERE source=?', (relative,))
                if p.suffix.lower() == '.md':
                    db.executemany('INSERT OR IGNORE INTO links VALUES(?,?)', [(relative,t) for t in self.targets(content)])

    def scan(self, background=True):
        with self.lock:
            if self.scanning:
                return self.status()
            self.scanning = True
        def run():
            self.progress = {'scanning': True, 'processed': 0, 'errors': [], 'updated': None}
            seen, complete = set(), True
            try:
                warnings = []
                for current, dirs, files in self.s.library_walk(self.root, warnings):
                    safe_dirs = []
                    for n in dirs:
                        if n in self.s.LIBRARY_SKIP or n.startswith('.'):
                            continue
                        try:
                            self.path((current/n).relative_to(self.root).as_posix())
                            safe_dirs.append(n)
                        except (OSError, ValueError):
                            warnings.append('跳过链接或不可访问目录：' + str(current/n))
                    dirs[:] = safe_dirs
                    for name in files:
                        if name.startswith('.'):
                            continue
                        p = current/name
                        relative = p.relative_to(self.root).as_posix()
                        seen.add(relative)
                        try:
                            self.index_file(p)
                            self.progress['processed'] += 1
                        except (OSError, ValueError) as e:
                            self.progress['errors'].append(relative + ': ' + str(e))
                self.progress['errors'].extend(warnings)
                complete = not warnings
            except Exception as e:
                self.progress['errors'].append(str(e))
                complete = False
            finally:
                if complete:
                    with self.lock, self.connect() as db:
                        for row in db.execute('SELECT path FROM files').fetchall():
                            if row[0] not in seen:
                                db.execute('DELETE FROM files WHERE path=?', (row[0],))
                                db.execute('DELETE FROM links WHERE source=?', (row[0],))
                self.scanning = False
                self.progress.update(scanning=False, updated=time.time())
        if background:
            threading.Thread(target=run, daemon=True, name='knowledge-index').start()
        else:
            run()
        return self.status()

    def status(self):
        with self.connect() as db:
            count = db.execute('SELECT count(*) FROM files').fetchone()[0]
            warnings = db.execute("SELECT path,warning FROM files WHERE warning != '' LIMIT 100").fetchall()
            versions = db.execute('SELECT count(*),coalesce(sum(length(body)),0) FROM versions').fetchone()
        return {**self.progress, 'scanning': self.scanning, 'count': count, 'warnings': [dict(r) for r in warnings], 'versions': versions[0], 'history_bytes': versions[1], 'storage': str(self.home)}

    def search(self, query='', folder='', kind='all', ext='', offset=0):
        self.path(folder)
        query = query.strip().casefold()[:200]
        offset = max(0, int(offset))
        results = []
        with self.connect() as db:
            for row in db.execute('SELECT * FROM files ORDER BY path'):
                path, body = row['path'], row['body'] or ''
                if folder and not path.startswith(folder.rstrip('/') + '/'):
                    continue
                if ext and Path(path).suffix.lower() != ext:
                    continue
                name_match = query in path.casefold()
                body_match = query in body.casefold()
                if not ((kind != 'body' and name_match) or (kind != 'name' and body_match)):
                    continue
                pos = max(0, body.casefold().find(query))
                results.append({'id': path, 'title': row['title'], 'snippet': body[max(0, pos-70):pos+170], 'warning': row['warning'], 'name_match': name_match})
        results.sort(key=lambda x: (not x['name_match'], x['id'].casefold()))
        return {'items': results[offset:offset+100], 'total': len(results), 'next_offset': offset+100 if len(results)>offset+100 else None, 'status': self.status()}

    @staticmethod
    def targets(text):
        text = re.sub(r'(?ms)^\s*(```|~~~).*?^\s*\1[^\n]*$', '', text)
        text = re.sub(r'`[^`]*`', '', text)
        refs = re.findall(r'\[\[([^\]]+)\]\]', text)
        refs += re.findall(r'(?<!!)\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)', text)
        return [r.split('|')[0] for r in refs]

    def resolve(self, source, target):
        raw = unquote(target.split('#')[0])
        if not raw or urlsplit(raw).scheme or raw.startswith(('/', '\\')):
            return []
        normalized = os.path.normpath(str(PurePosixPath(source).parent / raw)).replace('\\', '/')
        try:
            exact = self.path(normalized)
            for p in (exact, exact.with_suffix('.md') if not exact.suffix else exact):
                if p.is_file():
                    return [p.relative_to(self.root).as_posix()]
        except (ValueError, OSError):
            return []
        if '/' in raw or '\\' in raw:
            return []
        with self.connect() as db:
            return [r[0] for r in db.execute('SELECT path FROM files') if Path(r[0]).stem.casefold() == Path(raw).stem.casefold() and Path(r[0]).suffix.lower()=='.md']

    def links(self, path):
        p = self.path(path)
        text, _ = self.s.library_text(str(p), p.stat().st_size, p.stat().st_mtime_ns)
        outgoing = [{'target': t, 'candidates': self.resolve(path, t)} for t in dict.fromkeys(self.targets(text)) if not urlsplit(t).scheme and not t.startswith('#')]
        incoming = []
        with self.connect() as db:
            rows = db.execute('SELECT source,target FROM links').fetchall()
        for row in rows:
            if row['source'] != path and self.resolve(row['source'], row['target']) == [path]:
                incoming.append(row['source'])
        return {'outgoing': outgoing, 'incoming': sorted(set(incoming)), 'indexed': len(rows), 'source': next((l for l in text.splitlines() if l.startswith('来源项目：')), '未记录')}

    def get(self, action, params):
        value = lambda key, default='': params.get(key, [default])[0]
        if action == 'read': return self.read(value('path'))
        if action == 'browse': return self.browse(value('folder'), value('sort','name-asc'), value('offset','0'))
        if action == 'templates': return self.templates(value('folder','模板'))
        if action == 'versions': return self.versions(value('path'))
        if action == 'version': return self.version(value('path'), value('id'))
        if action == 'preferences': return self.preferences()
        if action == 'status': return self.status()
        if action == 'links': return self.links(value('path'))
        if action == 'resolve': return {'candidates': self.resolve(value('path'), value('target'))}
        if action == 'search': return self.search(value('q'), value('folder'), value('kind','all'), value('ext'), value('offset','0'))
        raise ValueError('未知知识接口')

    def post(self, action, body):
        actions = {'save': self.save, 'create': self.create, 'folder': self.create_folder, 'daily': self.daily,
                   'setup-templates': lambda b: {'path': self.ensure_folder(str(b.get('folder','模板'))).relative_to(self.root).as_posix()},
                   'recovery': self.recover, 'restore': self.restore, 'preferences': self.preferences, 'scan': lambda b: self.scan()}
        if action not in actions: raise ValueError('未知知识操作')
        return actions[action](body)
