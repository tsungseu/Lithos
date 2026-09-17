import unittest
import test_memory as fixtures
from backend.memory_agents import Agents
from backend.memory_gateway import inject,validate,query_text

class AgentTests(unittest.TestCase):
    setUp=fixtures.MemoryTests.setUp
    tearDown=fixtures.MemoryTests.tearDown
    model=fixtures.MemoryTests.model
    candidate=fixtures.MemoryTests.candidate
    def grant(self):
        c=self.candidate();self.m.review(dict(id=c['id'],action='new',reviewed=True,key='review_agent_1'))
        self.a=Agents(self.m)
        return self.a.create(dict(name='Test Agent',project='test-project',assets=[c['id']],retain=False)),c
    def test_agent_scope_and_revocation(self):
        grant,c=self.grant();self.assertTrue(self.a.tool(grant['token'],'memory_search',{'query':'标定'}))
        self.assertEqual(self.a.tool(grant['token'],'memory_read',{'id':c['id']})['id'],c['id'])
        with self.assertRaises(ValueError):self.a.tool(grant['token'],'memory_read',{'id':'another'})
        self.a.revoke(grant['id'])
        with self.assertRaises(ValueError):self.a.tool(grant['token'],'memory_read',{'id':c['id']})
    def test_agent_cannot_publish(self):
        grant,c=self.grant()
        with self.assertRaises(ValueError):self.a.tool(grant['token'],'review',{'id':c['id']})
        result=self.a.tool(grant['token'],'memory_submit',dict(title='建议',content='待验证步骤',kind='skill'))
        self.assertEqual(result['state'],'pending')
        self.assertEqual(len(list(self.k.glob('*.md'))),1)
    def test_mcp_tools(self):
        grant,c=self.grant();r=self.a.rpc(grant['token'],dict(id=1,method='tools/list'));self.assertEqual(len(r['result']['tools']),5)
    def test_privacy_capture_off(self):
        grant,c=self.grant();self.a.capture(grant['token'],'private')
        with self.m.connect() as db:self.assertEqual(db.execute('SELECT count(*) FROM conversations').fetchone()[0],0)
    def test_gateway_protocol_validation(self):
        validate(dict(model='test',messages=[{'role':'user','content':'问题'}],stream=True,tools=[]),'/v1/chat/completions')
        with self.assertRaises(ValueError):validate(dict(model='test',messages=[],unknown=True),'/v1/chat/completions')
        with self.assertRaises(ValueError):validate(dict(model='test',messages=[dict(role='user',content=[dict(type='image_url')])]),'/v1/chat/completions')
    def test_gateway_preserves_tools(self):
        original=dict(model='test',messages=[dict(role='system',content='规则'),dict(role='user',content='问题')],tools=[dict(type='function',function=dict(name='tool'))],stream=True)
        payload=inject(original,'/v1/chat/completions',[dict(id='asset',text='参考')])
        self.assertEqual(payload['tools'],original['tools']);self.assertEqual(payload['messages'][0],original['messages'][0]);self.assertEqual(query_text(payload,'/v1/chat/completions'),'问题')
        self.assertEqual(len(original['messages']),2)
