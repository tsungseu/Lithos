import tempfile,time,unittest
from pathlib import Path
from unittest.mock import patch
import oauth

class OAuthTests(unittest.TestCase):
    def setUp(self):oauth.logout();self.home=Path('unused')
    def flow(self,provider='github'):
        with patch.object(oauth,'read_config',return_value={provider:{'client_id':'test','client_secret':'synthetic','redirect_uri':''}}):
            result=oauth.start(self.home,provider,'http://127.0.0.1:8765')
        ticket=result['url'].split('ticket=')[1]
        url,cookie=oauth.launch(ticket)
        return ticket,dict(oauth.FLOWS[ticket]),cookie,url
    def test_login_and_replay(self):
        ticket,flow,cookie,url=self.flow()
        self.assertIn('code_challenge=',url)
        with patch.object(oauth,'request_json',side_effect=[{'access_token':'never-exposed'},{'id':42,'name':'Tester'}]):
            oauth.callback('github',{'state':[flow['state']],'code':['code']},'lithos_oauth='+cookie)
        self.assertEqual(oauth.ACCOUNT['id'],'42');self.assertNotIn('never-exposed',str(oauth.ACCOUNT))
        with self.assertRaises(ValueError):oauth.callback('github',{'state':[flow['state']],'code':['code']},'lithos_oauth='+cookie)
    def test_bad_browser_expired_and_cancel(self):
        ticket,flow,cookie,_=self.flow()
        with patch.object(oauth,'request_json') as request:
            with self.assertRaises(ValueError):oauth.callback('github',{'state':[flow['state']],'code':['code']},'lithos_oauth=wrong')
            with self.assertRaises(ValueError):oauth.callback('github',{'state':[flow['state']],'error':['access_denied']},'lithos_oauth='+cookie)
            request.assert_not_called()
        self.assertIsNone(oauth.ACCOUNT)
        ticket,flow,cookie,_=self.flow();oauth.FLOWS[ticket]['expires']=time.time()-1
        with self.assertRaises(ValueError):oauth.launch(ticket)
    def test_dpapi_and_secret_redaction(self):
        with tempfile.TemporaryDirectory() as tmp:
            home=Path(tmp);oauth.save_config(home,{'provider':'github','client_id':'id','client_secret':'unique-test-secret'})
            self.assertNotIn(b'unique-test-secret',(home/'oauth-config.bin').read_bytes())
            self.assertNotIn('unique-test-secret',str(oauth.status(home,'http://127.0.0.1:8765')))
            self.assertEqual(oauth.read_config(home)['github']['client_secret'],'unique-test-secret')
    def test_apple_rejects_unsigned_identity(self):
        with self.assertRaises(ValueError):oauth.apple_identity('eyJhbGciOiJub25lIn0.e30.','id','nonce')

if __name__=='__main__':unittest.main()
