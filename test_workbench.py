import json, tempfile, threading, unittest, urllib.request, urllib.error, os
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import server as app

class Model(BaseHTTPRequestHandler):
    seen = None
    def log_message(self, *args): pass
    def do_POST(self):
        Model.seen = {'path': self.path, 'body': json.loads(self.rfile.read(int(self.headers['Content-Length']))), 'auth': self.headers.get('Authorization')}
        result = {'choices': [{'message': {'content': '# 测试经验\n\n## 验证依据\n资料记载了一次验证[S1]。\n\n## 适用边界\n仅限样本场景，待复测。'}}]}
        data = json.dumps(result).encode(); self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(data)

class WorkbenchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.model = ThreadingHTTPServer(('127.0.0.1', 0), Model)
        threading.Thread(target=cls.model.serve_forever, daemon=True).start()
        cls.web = ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        threading.Thread(target=cls.web.serve_forever, daemon=True).start()
    @classmethod
    def tearDownClass(cls):
        cls.model.shutdown(); cls.model.server_close(); cls.web.shutdown(); cls.web.server_close()
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); app.ROOT = Path(self.tmp.name); app.PROJECTS = app.ROOT/'05_项目与交付'; app.KNOWLEDGE = app.ROOT/'03_技术知识库'; app.DATA = app.ROOT/'app-data'
        (app.KNOWLEDGE/'03_工程实践/典型问题与解决方法').mkdir(parents=True)
        self.p = app.create_project({'area': '01_自动驾驶', 'name': '测试项目'})
        self.source = Path(self.p['path'])/'03_开发与验证/测试结果.md'; self.source.write_text('一次测试：样本10个，问题复现，完成修复。', encoding='utf-8')
        app.PREVIEWS.clear()
    def tearDown(self): self.tmp.cleanup()
    def preview(self):
        return app.prepare({'project': self.p['id'], 'files': ['03_开发与验证/测试结果.md'], 'focus': '测试结论'})
    def draft(self):
        preview = self.preview()
        return app.generate({'preview': preview['id'], 'endpoint': f'http://127.0.0.1:{self.model.server_port}/v1', 'model': 'mock-model', 'key': 'test-secret-not-real'})
    def publish_body(self, draft):
        return {'draft': draft['id'], 'category': '03_工程实践/典型问题与解决方法', 'title': '测试经验', 'content': draft['content'], 'reviewed': True}
    def test_flat_project_and_no_overwrite(self):
        root = Path(self.p['path']); self.assertEqual({x.name for x in root.iterdir()}, set(app.PHASES))
        self.assertFalse(list(root.rglob('README*'))); self.assertFalse(list(root.rglob('*.lnk')))
        with self.assertRaises(FileExistsError): app.create_project({'area': '01_自动驾驶', 'name': root.name})
    def test_paths_and_protected_name(self):
        for name in ['../bad', 'bad/name', 'CON', 'x.', 'C:\\tmp', '..']:
            with self.assertRaises(ValueError): app.create_project({'area':'01_自动驾驶','name':name})
        with self.assertRaises(ValueError): app.checked(app.PROJECTS,'../outside')
        with self.assertRaises(ValueError): app.create_project({'area':'01_自动驾驶','name':'06-DLP开发生产'})
    def test_package_docs_exclude_build_and_code(self):
        package = Path(self.p['path'])/'03_开发与验证/采集工具'
        (package/'src').mkdir(parents=True)
        (package/'日志').mkdir()
        (package/'日志/原始日志.txt').write_text('not a report', encoding='utf-8')
        for name in ['CMakeLists.txt', 'src/CMakeLists.txt', 'src/内部说明.md', '采集流程.md']:
            (package/name).write_text('测试', encoding='utf-8')
        names = {x['name'] for x in app.documents(self.p['id'])['files']}
        self.assertIn('采集流程.md', names)
        self.assertNotIn('CMakeLists.txt', names)
        self.assertNotIn('内部说明.md', names)
        self.assertNotIn('原始日志.txt', names)
    def test_prompt_is_bound_to_selected_source(self):
        other = Path(self.p['path'])/'02_方案与设计/私有说明.md'; other.write_text('SHOULD_NOT_SEND',encoding='utf-8')
        draft = self.draft(); request = Model.seen
        self.assertEqual(request['path'],'/v1/chat/completions'); self.assertEqual(request['auth'],'Bearer test-secret-not-real')
        self.assertNotIn('SHOULD_NOT_SEND',json.dumps(request['body'])); self.assertIn('[S1]',request['body']['messages'][1]['content'])
        self.assertNotIn('test-secret-not-real',(app.DATA/(draft['id']+'.json')).read_text(encoding='utf-8'))
    def test_reasoning_effort_is_optional_and_validated(self):
        preview = self.preview()
        app.generate({'preview': preview['id'], 'endpoint': f'http://127.0.0.1:{self.model.server_port}/v1', 'model': 'mock-model', 'key': '', 'effort': 'high'})
        self.assertEqual(Model.seen['body']['reasoning_effort'], 'high')
        preview = self.preview()
        with self.assertRaisesRegex(ValueError, 'Effort'):
            app.generate({'preview': preview['id'], 'endpoint': f'http://127.0.0.1:{self.model.server_port}/v1', 'model': 'mock-model', 'key': '', 'effort': 'ultra'})
    def test_review_publish_and_search(self):
        draft = self.draft(); body = self.publish_body(draft); body['reviewed']=False
        with self.assertRaises(ValueError): app.publish(body)
        body['reviewed']=True; result=app.publish(body); text=Path(result['path']).read_text(encoding='utf-8')
        self.assertIn('SHA-256',text); self.assertIn(str(self.source),text); self.assertEqual(len(app.knowledge('测试经验')),1)
        with self.assertRaises(ValueError): app.publish(body)
    def test_changed_source_blocks_publish(self):
        draft=self.draft(); self.source.write_text('已改变',encoding='utf-8')
        with self.assertRaises(ValueError): app.publish(self.publish_body(draft))
    def test_empty_and_oversized_evidence(self):
        self.source.write_text('',encoding='utf-8')
        with self.assertRaises(ValueError): self.preview()
        self.source.write_text('x'*30001,encoding='utf-8')
        with self.assertRaises(ValueError): self.preview()
    def test_endpoint_and_category_validation(self):
        preview=self.preview()
        for endpoint in ['http://example.com/v1','https://key@example.com/v1','https://example.com/v1?key=x']:
            with self.assertRaises(ValueError): app.generate({'preview':preview['id'],'endpoint':endpoint,'model':'x'})
        draft=self.draft();body=self.publish_body(draft);body['category']='../../05_项目与交付'
        with self.assertRaises(ValueError): app.publish(body)
    def test_save_draft_does_not_publish(self):
        draft=self.draft();app.save_draft({'draft':draft['id'],'content':'修订稿 [S1]'})
        self.assertEqual(app.load_draft(draft['id'])['content'],'修订稿 [S1]');self.assertEqual(app.knowledge(),[])
    def test_manual_offline_draft_with_evidence(self):
        Model.seen = None
        draft = app.manual_draft({'project': self.p['id'], 'files': ['03_开发与验证/测试结果.md']})
        self.assertIsNone(Model.seen)
        self.assertEqual(draft['origin'], 'manual')
        self.assertIn('[S1]', draft['content'])
        body = self.publish_body(draft)
        body['content'] = '# 人工经验\n资料记载测试10例[S1]；适用边界尚待复测。'
        result = app.publish(body)
        self.assertTrue(Path(result['path']).is_file())
        self.assertIn('人工编写（离线）', Path(result['path']).read_text(encoding='utf-8'))
    def test_manual_without_evidence_only_saves(self):
        draft = app.manual_draft({'project': self.p['id']})
        self.assertEqual(draft['sources'], [])
        app.save_draft({'draft': draft['id'], 'content': '待整理想法'})
        with self.assertRaisesRegex(ValueError, '项目证据'):
            app.publish(self.publish_body(draft))
    def test_manual_preview_expiry_and_changed_source(self):
        preview = self.preview()
        draft = app.manual_draft({'preview': preview['id']})
        self.source.write_text('changed', encoding='utf-8')
        with self.assertRaises(ValueError): app.publish(self.publish_body(draft))
        app.PREVIEWS[preview['id']]['expires'] = 0
        with self.assertRaises(ValueError): app.manual_draft({'preview': preview['id']})
    def test_portable_config_and_initialization(self):
        base = app.ROOT / 'package'
        base.mkdir()
        absent = app.ROOT / 'absent-drive'
        root, mode, port = app.configuration(base, {}, absent)
        self.assertEqual(root, base / 'workspace')
        self.assertEqual(mode, 'portable')
        (base / 'config.json').write_text(json.dumps({'root':'./资料', 'port':8767}), encoding='utf-8')
        root, mode, port = app.configuration(base, {}, absent)
        self.assertEqual(root.resolve(), (base / '资料').resolve())
        self.assertEqual((mode, port), ('configured', 8767))
        override, _, _ = app.configuration(base, {'WORKBENCH_ROOT':str(app.ROOT)}, absent)
        self.assertEqual(override, app.ROOT)
        prior = app.MODE
        try:
            app.MODE = 'portable'
            app.initialize_workspace()
            self.assertEqual(len(app.categories()), 16)
            self.assertTrue((app.PROJECTS/'03_其他项目').is_dir())
            app.MODE = 'existing'
            app.KNOWLEDGE = app.ROOT/'missing-knowledge'
            app.initialize_workspace()
            self.assertFalse(app.KNOWLEDGE.exists())
        finally:
            app.MODE = prior
    def test_http_origin_and_host_and_chinese_guide(self):
        url=f'http://127.0.0.1:{self.web.server_port}'
        request=urllib.request.Request(url+'/api/projects',data=b'{}',headers={'Content-Type':'application/json'})
        with self.assertRaises(urllib.error.HTTPError) as error:urllib.request.urlopen(request)
        self.assertEqual(error.exception.code,403)
        request=urllib.request.Request(url+'/api/state',headers={'Host':'evil.example'})
        with self.assertRaises(urllib.error.HTTPError):urllib.request.urlopen(request)
        with urllib.request.urlopen(url+'/%E4%BD%BF%E7%94%A8%E8%AF%B4%E6%98%8E.md') as r:self.assertIn('新增项目',r.read().decode())
        with urllib.request.urlopen(url+'/app/settings') as r:self.assertIn('settings-model-form',r.read().decode())
    def test_settings_save_requires_valid_workspace_and_restart(self):
        original_base = app.BASE
        try:
            app.BASE = app.ROOT/'tool'
            app.BASE.mkdir()
            current_root, current_port = app.ROOT, app.PORT
            result=app.save_settings({'root':str(app.ROOT),'port':8768})
            self.assertTrue(result['restart_required'])
            self.assertEqual((app.ROOT,app.PORT),(current_root,current_port))
            saved=json.loads((app.BASE/'config.json').read_text(encoding='utf-8'))
            self.assertEqual(saved['port'],8768)
            self.assertEqual(app.settings()['configured_port'],8768)
            for payload in [{'root':str(app.BASE),'port':8768}, {'root':str(app.ROOT),'port':80}, {'root':str(app.ROOT),'port':True}, {'root':str(app.ROOT),'port':8768,'key':'not-allowed'}]:
                with self.assertRaises(ValueError):app.save_settings(payload)
            self.assertEqual(json.loads((app.BASE/'config.json').read_text(encoding='utf-8')),saved)
        finally:app.BASE=original_base
    def test_library_browses_open_source_nested_and_binary(self):
        folder=app.KNOWLEDGE/'05_开源项目/机器人/资源/深层'
        folder.mkdir(parents=True)
        (folder/'使用指南.md').write_text('独有检索词：关节校准经验。',encoding='utf-8')
        (folder/'模型.zip').write_bytes(b'archive fixture')
        (app.KNOWLEDGE/'根目录说明.txt').write_text('根目录可读取',encoding='utf-8')
        root=app.library()
        self.assertIn('05_开源项目',{x['title'] for x in root['items']})
        self.assertIn('根目录说明.txt',{x['title'] for x in root['items']})
        search=app.library(query='关节校准')
        self.assertEqual([x['title'] for x in search['items']],['使用指南.md'])
        self.assertIn('资源',{x['title'] for x in app.library(query='资源')['items']})
        files=app.library('05_开源项目/机器人/资源/深层')['items']
        self.assertEqual(len(files),2)
        binary=app.library_preview('05_开源项目/机器人/资源/深层/模型.zip')
        self.assertEqual(binary['content'],'')
        self.assertTrue(binary['warning'])
        self.assertIn('根目录',app.library_preview('根目录说明.txt')['content'])
        with self.assertRaises(ValueError):app.library('../outside')
        with self.assertRaises(ValueError):app.library_preview('../outside')
    def test_library_pagination_and_search_scope(self):
        folder=app.KNOWLEDGE/'05_开源项目'
        folder.mkdir()
        for index in range(105):(folder/f'file{index:03}.bin').write_bytes(b'x')
        page=app.library('05_开源项目')
        self.assertEqual((page['total'],len(page['items']),page['next_offset']),(105,100,100))
        self.assertEqual(len(app.library('05_开源项目',offset=100)['items']),5)
        self.assertEqual(app.library('03_工程实践',query='file')['total'],0)
        self.assertEqual(app.library(query='file104')['total'],1)
    def test_graph_real_links_and_scope(self):
        folder=app.KNOWLEDGE/'05_开源项目/机器人'
        folder.mkdir(parents=True)
        (folder/'方法.md').write_text('[[验证]]\n[来源](验证.md)\n[[不存在]]\n`[[忽略]]`',encoding='utf-8')
        (folder/'验证.md').write_text('验证原件',encoding='utf-8')
        (folder/'忽略.md').write_text('不应建立代码内链接',encoding='utf-8')
        result=app.knowledge_graph('05_开源项目',2)
        self.assertEqual(len(result['nodes']),5)
        links=[e for e in result['edges'] if e['kind']=='reference']
        self.assertEqual(len(links),1)
        self.assertTrue(links[0]['target'].endswith('验证.md'))
        self.assertEqual(len(app.knowledge_graph('05_开源项目',1)['nodes']),2)
        with self.assertRaises(ValueError):app.knowledge_graph('../outside')
        with self.assertRaises(ValueError):app.knowledge_graph('',9)
    def test_graph_node_limit(self):
        folder=app.KNOWLEDGE/'05_开源项目';folder.mkdir()
        for index in range(260):(folder/f'{index}.md').write_text('test',encoding='utf-8')
        result=app.knowledge_graph('05_开源项目')
        self.assertEqual(len(result['nodes']),250)
        self.assertTrue(result['warnings'])
    def test_connection_test_sends_no_project_and_saves_nothing(self):
        result=app.test_model({'endpoint':f'http://127.0.0.1:{self.model.server_port}/v1','model':'mock','key':'temporary-test-secret'})
        self.assertTrue(result['ok'])
        self.assertEqual(len(Model.seen['body']['messages']),1)
        self.assertNotIn('一次测试',json.dumps(Model.seen['body'],ensure_ascii=False))
        self.assertFalse(app.DATA.exists())

if __name__ == '__main__': unittest.main(verbosity=2)
