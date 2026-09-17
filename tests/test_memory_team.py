"""Team API contract tests without claiming a live PostgreSQL deployment."""
import contextlib
import importlib.util
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

@unittest.skipUnless(importlib.util.find_spec('fastapi') and importlib.util.find_spec('psycopg'),'team optional dependencies not installed')
class TeamContractTests(unittest.TestCase):
    def setUp(self):
        from team import app
        self.api=app
    def test_publication_rejects_local_paths_and_keys(self):
        from fastapi import HTTPException
        for content in ['D:/private/file.md','-----BEGIN RSA PRIVATE KEY-----','sk-'+'a'*30]:
            with self.assertRaises(HTTPException):self.api.public_body(dict(title='doc',content=content,kind='knowledge',evidence=[],reviewed=True))
    def test_publication_requires_review(self):
        from fastapi import HTTPException
        with self.assertRaises(HTTPException):self.api.public_body(dict(title='doc',content='text'))
    def test_read_filters_team_before_return(self):
        from fastapi import HTTPException
        calls=[]
        class Fake:
            def execute(self,query,params):calls.append((query,params));return self
            def fetchone(self):return None
        @contextlib.contextmanager
        def database():yield Fake()
        with patch.object(self.api,'user',return_value=dict(id='u',team='team-a',role='reader')),patch.object(self.api,'db',database):
            with self.assertRaises(HTTPException) as e:self.api.read('asset-in-team-b','Bearer t')
        self.assertEqual(e.exception.status_code,404);self.assertIn('team=%s',calls[0][0]);self.assertEqual(calls[0][1],('asset-in-team-b','team-a'))
    def test_reader_cannot_publish(self):
        from fastapi import HTTPException
        with patch.object(self.api,'user',return_value=dict(id='u',team='team-a',role='reader')):
            with self.assertRaises(HTTPException) as e:self.api.publish(dict(title='doc',content='text',reviewed=True),'Bearer t')
        self.assertEqual(e.exception.status_code,403)
    def test_snapshot_preserves_version(self):
        with tempfile.TemporaryDirectory() as folder,patch.dict('os.environ',{'LITHOS_FILES':folder}):
            self.api.snapshot('asset','v1','old');self.api.snapshot('asset','v2','new')
            self.assertEqual((Path(folder)/'asset/v1.md').read_text(),'old')
            self.assertEqual((Path(folder)/'asset/v2.md').read_text(),'new')

    def test_chinese_lexical_and_vector_validation(self):
        from fastapi import HTTPException
        rows=[dict(id='a',title='传感器标定',body='标定误差的验证方法'),dict(id='b',title='部署',body='容器启动步骤')]
        hits=self.api.rank_lexical(rows,'传感器误差')
        self.assertEqual(hits[0]['id'],'a')
        self.assertEqual(self.api.rank_lexical(rows,'unrelated'),[])
        for value in [[],[float('nan')],[True],['secret']]:
            with self.assertRaises(HTTPException):self.api.vector_value(value)

    def test_agent_read_filters_asset_and_team(self):
        from fastapi import HTTPException
        calls=[]
        class Fake:
            def execute(self,query,params):calls.append((query,params));return self
            def fetchone(self):return dict(team='a',assets='["allowed"]') if len(calls)==1 else None
        @contextlib.contextmanager
        def database():yield Fake()
        with patch.object(self.api,'db',database):
            with self.assertRaises(HTTPException):self.api.agent_read('forbidden','Bearer credential')
        self.assertIn('id=ANY(%s)',calls[1][0]);self.assertEqual(calls[1][1],('forbidden','a',['allowed']))
