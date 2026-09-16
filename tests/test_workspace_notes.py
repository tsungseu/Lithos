from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
import unittest
from tests import test_knowledge


class WorkspaceNotesTests(unittest.TestCase):
    setUp = test_knowledge.KnowledgeTests.setUp
    tearDown = test_knowledge.KnowledgeTests.tearDown
    def test_daily_idempotent_concurrent(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: self.kb.daily({}), range(4)))
        today = datetime.now().strftime('%Y-%m-%d')
        self.assertEqual({r['id'] for r in results}, {'日记/' + today + '.md'})
        first = results[0]
        self.kb.save({'path': first['id'], 'revision': first['revision'], 'content': 'keep my work'})
        self.assertEqual(self.kb.daily({})['content'], 'keep my work')

    def test_lazy_templates_and_readonly_creation(self):
        self.assertFalse(self.kb.templates('模板')['exists'])
        self.assertFalse((self.root/'模板').exists())
        for folder in ['05_开源项目/new', '../outside', '.private', 'repository/new']:
            (self.root/'repository').mkdir(exist_ok=True)
            (self.root/'repository/.git').write_text('gitdir: elsewhere')
            with self.assertRaises(ValueError):
                self.kb.daily({'folder': folder})
            with self.assertRaises(ValueError):
                self.kb.post('setup-templates', {'folder': folder})
        self.assertFalse((self.root/'05_开源项目').exists())
        self.kb.post('setup-templates', {'folder': '模板'})
        self.kb.create({'folder': '模板', 'name': 'sample', 'content': '{{title}} {{date}}'})
        self.assertEqual(self.kb.templates('模板')['items'][0]['path'], '模板/sample.md')

    def test_folder_exclusive_and_sorted_pages(self):
        self.kb.create_folder({'name': '知识'})
        with self.assertRaises(FileExistsError):
            self.kb.create_folder({'name': '知识'})
        with self.assertRaises(ValueError):
            self.kb.create_folder({'name': '../escape'})
        for i in range(105):
            (self.root/f'note-{i:03}.md').write_text('body')
        first = self.kb.browse(sort='name-desc')
        self.assertEqual(first['items'][0]['kind'], 'directory')
        self.assertEqual(first['next_offset'], 100)
        second = self.kb.browse(sort='name-desc', offset=100)
        self.assertFalse(set(x['id'] for x in first['items']) & set(x['id'] for x in second['items']))
