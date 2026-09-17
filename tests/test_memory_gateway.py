import json
import threading
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import unittest
import test_memory as fixtures
from backend.memory_agents import Agents
from backend.memory_gateway import Gateway

class GatewayTests(unittest.TestCase):
    model=fixtures.MemoryTests.model
    candidate=fixtures.MemoryTests.candidate
    def setUp(self):
        fixtures.MemoryTests.setUp(self);self.m.agents=Agents(self.m)
        candidate=self.candidate();self.m.review(dict(id=candidate['id'],action='new',reviewed=True,key='gateway_publish'))
        self.token=self.m.agents.create(dict(name='client',project='test',assets=[candidate['id']],retain=False))['token']
        parent=self
        class Upstream(BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def do_POST(self):
                parent.received=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                if parent.received.get('stream'):raw=b'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n'
                else:raw=json.dumps({'id':'response','choices':[{'message':{'content':'ok','tool_calls':[{'id':'call','type':'function','function':{'name':'inspect','arguments':'{}'}}]}}]}).encode()
                self.send_response(200);self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
        self.upstream=ThreadingHTTPServer(('127.0.0.1',0),Upstream);threading.Thread(target=self.upstream.serve_forever,daemon=True).start()
        self.m.model={'endpoint':f'http://127.0.0.1:{self.upstream.server_port}/v1','model':'test'}
        self.gateway=Gateway(('127.0.0.1',0),self.m);threading.Thread(target=self.gateway.serve_forever,daemon=True).start()
    def tearDown(self):
        self.gateway.shutdown();self.gateway.server_close();self.upstream.shutdown();self.upstream.server_close();fixtures.MemoryTests.tearDown(self)
    def request(self,path,body,token=None):
        req=urllib.request.Request(f'http://127.0.0.1:{self.gateway.server_port}'+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+(token or self.token)})
        with urllib.request.urlopen(req,timeout=5) as r:return r.read()
    def test_stream_passthrough(self):
        result=self.request('/v1/chat/completions',dict(model='test',messages=[dict(role='user',content='标定')],stream=True))
        self.assertIn(b'[DONE]',result);self.assertGreater(len(self.received['messages']),1)
    def test_response_and_tools(self):
        body=dict(model='test',input='标定',tools=[dict(type='function',name='inspect',parameters={})])
        result=json.loads(self.request('/v1/responses',body));self.assertEqual(self.received['tools'],body['tools']);self.assertEqual(result['id'],'response')
    def test_unknown_field_rejected(self):
        with self.assertRaises(urllib.error.HTTPError) as error:self.request('/v1/chat/completions',dict(model='test',messages=[],bad=True))
        self.assertEqual(error.exception.code,400)
    def test_unauthorized(self):
        with self.assertRaises(urllib.error.HTTPError) as error:self.request('/mcp',dict(id=1,method='tools/list'),token='wrong')
        self.assertEqual(error.exception.code,401)
    def test_mcp_http(self):
        result=json.loads(self.request('/mcp',dict(id=1,method='tools/list')));self.assertEqual(len(result['result']['tools']),5)
