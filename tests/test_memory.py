import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from backend import server, memory

class MemoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.k=self.root/'知识库';self.k.mkdir();self.data=self.root/'app-state'
        self.s=SimpleNamespace(**{n:getattr(server,n) for n in ('checked','safe_name','extract','oauth','knowledge_service','SimpleNamespace','library_preview','library_text','library_walk','LIBRARY_SKIP')},ROOT=self.root,KNOWLEDGE=self.k,DATA=self.data,call_model=self.model)
        self.m=memory.Memory(self.s);self.m.model={'model':'fixture'}
        (self.root/'证据.md').write_text('# 验证\n\n传感器标定后误差降低，测试通过。',encoding='utf-8')
    def tearDown(self):self.m.stopped.set();self.tmp.cleanup()
    def model(self,body,messages):
        if '只返回JSON' in messages[0]['content']:
            return json.dumps(dict(title='标定方法',body='## 有效做法\n传感器标定后误差降低，测试通过。[S1]\n\n## 适用边界\n仅限测试环境',citations=[dict(ref='S1',quote='传感器标定后误差降低')],classification='new',target=''),ensure_ascii=False),'fixture','','default'
        return '传感器标定后误差降低，测试通过。[S1] 原文：传感器标定后误差降低','fixture','','default'
    def candidate(self):
        job=self.m.enqueue({'paths':['证据.md']});self.m.process(job['id']);state=self.m.job(job['id']);self.assertEqual(state['state'],'review',state);return self.m.candidate(state['result'])
    def test_chunk_coverage(self):
        text=('标题\n\n正文'*3000);parts=memory.chunks(text,100)
        self.assertEqual(''.join(c['text'] for c in parts),text)
        self.assertTrue(all(text[c['start']:c['end']]==c['text'] for c in parts))
    def test_pipeline_review_and_recall(self):
        candidate=self.candidate();self.assertEqual(list(self.k.iterdir()),[])
        body=dict(id=candidate['id'],action='new',reviewed=True,key='submission_1')
        result=self.m.review(body);self.assertTrue((self.k/result['path']).exists())
        self.assertEqual(self.m.review(body),result)
        self.assertEqual(len(list(self.k.glob('*.md'))),1)
        hits=self.m.search('传感器标定');self.assertTrue(hits);self.assertEqual(hits[0]['id'],candidate['id'])
        self.assertFalse(self.m.search('unrelated architecture'))
    def test_duplicate_task(self):
        first=self.m.enqueue({'paths':['证据.md']});second=self.m.enqueue({'paths':['证据.md']});self.assertEqual(first,second)
        self.assertEqual(self.m.status()['usage']['tasks'],1)
    def test_changed_source_blocks_review(self):
        candidate=self.candidate();(self.root/'证据.md').write_text('变更',encoding='utf-8')
        with self.assertRaises(ValueError):self.m.review(dict(id=candidate['id'],action='new',reviewed=True,key='submission_2'))
        self.assertFalse(list(self.k.glob('*.md')))
    def test_review_required(self):
        candidate=self.candidate()
        with self.assertRaises(ValueError):self.m.review(dict(id=candidate['id'],action='new',key='submission_3'))
    def test_invalid_quote(self):
        with self.assertRaises(ValueError):memory.Memory.validate(json.dumps(dict(title='假',body='假[S1]',classification='new',citations=[dict(ref='S1',quote='不存在的原文')])),[dict(ref='S1',text='真实证据')])
    def test_budget(self):
        self.m.configure({'limits':dict(memory.DEFAULTS,calls=1)})
        self.m.reserve(calls=1)
        with self.assertRaises(ValueError):self.m.reserve(calls=1)
    def test_workspace_snapshot(self):
        other=memory.Memory(SimpleNamespace(**{**vars(self.s),'KNOWLEDGE':self.root/'其他知识库'}))
        self.assertNotEqual(self.m.library_id,other.library_id)
        self.assertNotEqual(self.m.home,other.home)
    def test_exclusions(self):
        (self.root/'config.md').write_text('配置',encoding='utf-8')
        for name in ['../escape.md','config.md']:
            with self.assertRaises(ValueError):self.m.source(name)
    def test_cancel(self):
        job=self.m.enqueue({'paths':['证据.md']});self.m.post('task',dict(id=job['id'],action='cancel'));self.m.process(job['id']);self.assertEqual(self.m.job(job['id'])['state'],'cancelled')

    def test_exclusive_worker_owner(self):
        other=memory.Memory(self.s)
        self.assertTrue(self.m.acquire_worker_lock())
        try:self.assertFalse(other.acquire_worker_lock())
        finally:self.m.worker_handle.close()
        self.assertTrue(other.acquire_worker_lock());other.worker_handle.close()

    def test_candidate_edit_conflict(self):
        c=self.candidate()
        updated=self.m.post('edit-candidate',dict(id=c['id'],revision=c['body_revision'],content=c['body']+'\n人工补充适用边界'))
        self.assertIn('人工补充',updated['body'])
        with self.assertRaises(ValueError):self.m.post('edit-candidate',dict(id=c['id'],revision=c['body_revision'],content='旧页面修改'))
        self.assertFalse(list(self.k.glob('*.md')))

    def test_exact_duplicate_body_is_not_published_twice(self):
        c=self.candidate();self.m.review(dict(id=c['id'],action='new',reviewed=True,key='dedup_first_1'))
        with self.m.connect() as db:db.execute("INSERT INTO candidates SELECT 'duplicate-test',job,'pending',kind,title,body,sources,target,revision,'new',created FROM candidates WHERE id=?",(c['id'],))
        with self.assertRaises(ValueError):self.m.review(dict(id='duplicate-test',action='new',reviewed=True,key='dedup_second_1'))
        self.assertEqual(len(list(self.k.glob('*.md'))),1)

    def test_locked_update_and_external_target_conflict(self):
        first=self.candidate();saved=self.m.review(dict(id=first['id'],action='new',reviewed=True,key='locked_first_1'))
        revision=memory.digest((self.k/saved['path']).read_bytes())
        with self.m.connect() as db:
            db.execute("INSERT INTO candidates SELECT 'update-test',job,'pending',kind,title,body,sources,?,?,'update',created FROM candidates WHERE id=?",(saved['path'],revision,first['id']))
        request=dict(id='update-test',action='update',reviewed=True,key='locked_update_1')
        self.m.post('lock',dict(id=first['id'],locked=True))
        with self.assertRaises(ValueError):self.m.review(request)
        self.m.post('lock',dict(id=first['id'],locked=False))
        (self.k/saved['path']).write_text('外部编辑',encoding='utf-8')
        with self.assertRaises(ValueError):self.m.review(request)
        self.assertEqual((self.k/saved['path']).read_text(encoding='utf-8'),'外部编辑')

    def test_team_preview_is_bound_to_reviewed_content(self):
        from backend.memory_team import Team
        from unittest.mock import Mock
        c=self.candidate();result=self.m.review(dict(id=c['id'],action='new',reviewed=True,key='team_preview_1'))
        team=Team(self.m);team.request=Mock(return_value={'id':'shared'})
        preview=team.preview({'id':c['id']})
        with self.assertRaises(ValueError):team.publish(dict(id=c['id'],confirmed=True))
        self.assertFalse(team.request.called)
        team.publish(dict(id=c['id'],confirmed=True,preview_hash=preview['preview_hash']))
        self.assertNotIn('preview_hash',team.request.call_args.args[1])
        (self.k/result['path']).write_text('外部变更',encoding='utf-8')
        with self.assertRaises(ValueError):team.publish(dict(id=c['id'],confirmed=True,preview_hash=preview['preview_hash']))

    def test_conversation_expiry_removes_asset_evidence(self):
        from backend.memory_agents import Agents
        a=Agents(self.m)
        c=self.candidate();self.m.review(dict(id=c['id'],action='new',reviewed=True,key='expire_asset_1'))
        with self.m.connect() as db:
            db.execute('INSERT INTO conversations VALUES(?,?,?,?,?)',('expired','grant','private text',0,1))
            db.execute('UPDATE assets SET sources=? WHERE id=?',(json.dumps([dict(path='@conversation/expired',text='private text',hash='hash')]),c['id']))
        self.assertEqual(a.purge_expired(),1)
        with self.m.connect() as db:asset=db.execute('SELECT sources,stale FROM assets WHERE id=?',(c['id'],)).fetchone()
        self.assertNotIn('private text',asset['sources']);self.assertEqual(asset['stale'],1)

if __name__=='__main__':unittest.main()
