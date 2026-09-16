import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from backend import server
from backend.knowledge import Knowledge, Conflict, LIMIT


class KnowledgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)/'知识库'
        self.root.mkdir()
        self.old_root = server.KNOWLEDGE
        server.KNOWLEDGE = self.root
        binding = SimpleNamespace(KNOWLEDGE=self.root, DATA=Path(self.tmp.name)/'data', checked=server.checked,
                                  safe_name=server.safe_name, library_preview=server.library_preview,
                                  library_text=server.library_text, library_walk=server.library_walk, LIBRARY_SKIP=server.LIBRARY_SKIP)
        self.kb = Knowledge(binding)
        (self.root/'方法.md').write_bytes(b'\xef\xbb\xbf# Original\r\n')

    def tearDown(self):
        server.KNOWLEDGE = self.old_root
        self.tmp.cleanup()

    def test_save_history_restore_and_noop(self):
        d=self.kb.read('方法.md')
        saved=self.kb.save({'path':'方法.md','revision':d['revision'],'content':'# changed\r\n'})
        self.assertTrue((self.root/'方法.md').read_bytes().startswith(b'\xef\xbb\xbf'))
        self.kb.save({'path':'方法.md','revision':saved['revision'],'content':saved['content']})
        self.assertEqual(len(self.kb.versions('方法.md')),1)
        old=self.kb.versions('方法.md')[0]
        self.kb.restore({'path':'方法.md','id':old['id'],'revision':saved['revision']})
        self.assertEqual((self.root/'方法.md').read_bytes(),b'\xef\xbb\xbf# Original\r\n')
        self.assertEqual(len(self.kb.versions('方法.md')),2)

    def test_conflict_never_overwrites(self):
        d=self.kb.read('方法.md')
        (self.root/'方法.md').write_text('external',encoding='utf-8')
        with self.assertRaises(Conflict):
            self.kb.save({'path':'方法.md','revision':d['revision'],'content':'mine'})
        self.assertEqual((self.root/'方法.md').read_text(),'external')
        self.assertEqual(self.kb.versions('方法.md'),[])

    def test_write_failure_keeps_original_and_recovery(self):
        d=self.kb.read('方法.md')
        self.kb.recover({'path':'方法.md','revision':d['revision'],'content':'mine'})
        with patch('backend.knowledge.os.replace',side_effect=OSError('disk failure')):
            with self.assertRaises(OSError):
                self.kb.save({'path':'方法.md','revision':d['revision'],'content':'mine'})
        self.assertEqual(self.kb.read('方法.md')['revision'],d['revision'])
        self.assertEqual(self.kb.read('方法.md')['recovery']['content'],'mine')
        self.assertFalse(list(self.root.glob('.lithos-*')))

    def test_readonly_and_traversal(self):
        for folder in ['05_开源项目','仓库']:
            (self.root/folder).mkdir()
            (self.root/folder/'README.md').write_text('# test')
        (self.root/'仓库/.git').write_text('gitdir: elsewhere')
        for path in ['05_开源项目/README.md','仓库/README.md']:
            self.assertFalse(self.kb.read(path)['editable'])
            with self.assertRaises(ValueError): self.kb.create({'folder':str(Path(path).parent),'name':'new'})
        for path in ['../other.md','.hidden.md','C:/other.md']:
            with self.assertRaises(ValueError): self.kb.read(path)

    def test_size_and_encoding(self):
        (self.root/'large.md').write_bytes(b'a'*(LIMIT+1))
        (self.root/'bad.md').write_bytes(b'\xff')
        self.assertFalse(self.kb.read('large.md')['editable'])
        self.assertFalse(self.kb.read('bad.md')['editable'])

    def test_search_links_ambiguous_and_fenced_code(self):
        for folder in ['a','b']:
            (self.root/folder).mkdir()
            (self.root/folder/'同名.md').write_text('测试定位',encoding='utf-8')
        (self.root/'方法.md').write_text('[[同名]]\n[local](a/同名.md)\n```text\n[[not-link]]\n```',encoding='utf-8')
        self.kb.scan(background=False)
        self.assertEqual(self.kb.search('定位')['total'],2)
        self.assertEqual(self.kb.search('定位',folder='a')['total'],1)
        self.assertEqual(self.kb.search('定位',kind='name')['total'],0)
        self.assertEqual(len(self.kb.resolve('方法.md','同名')),2)
        links=self.kb.links('方法.md')
        self.assertEqual(len(links['outgoing']),2)
        self.assertEqual(self.kb.links('a/同名.md')['incoming'],['方法.md'])
        (self.root/'b/同名.md').unlink()
        self.kb.scan(background=False)
        self.assertEqual(self.kb.search('定位')['total'],1)

    def test_persistence_and_workspace_isolation(self):
        self.kb.preferences({'favorites':['方法.md']})
        self.assertEqual(Knowledge(self.kb.s).preferences()['favorites'],['方法.md'])
        self.kb.recover({'path':'方法.md','content':'draft','revision':'old'})
        self.assertEqual(Knowledge(self.kb.s).read('方法.md')['recovery']['content'],'draft')

    def test_concurrent_save_one_wins(self):
        revision=self.kb.read('方法.md')['revision']
        results=[]
        def save(content):
            try: self.kb.save({'path':'方法.md','content':content,'revision':revision});results.append('saved')
            except Conflict: results.append('conflict')
        threads=[threading.Thread(target=save,args=(str(i),)) for i in range(2)]
        for t in threads:t.start()
        for t in threads:t.join()
        self.assertCountEqual(results,['saved','conflict'])

    def test_create_no_overwrite(self):
        with self.assertRaises(FileExistsError):self.kb.create({'folder':'','name':'方法'})
        d=self.kb.create({'folder':'','name':'新笔记'})
        self.assertTrue(d['editable'])
        self.assertEqual(self.kb.search('新笔记')['total'],1)
