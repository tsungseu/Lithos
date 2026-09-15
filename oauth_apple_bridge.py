"""Optional HTTPS reverse-proxy upstream for Apple's form_post callback.
Run only on a server/domain you control; see OAuth接入说明.md.
"""
import os
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TARGET=os.environ.get('LITHOS_APPLE_LOCAL_CALLBACK','http://127.0.0.1:8765/oauth/callback/apple')
url=urllib.parse.urlsplit(TARGET)
if url.scheme!='http' or url.hostname!='127.0.0.1' or url.path!='/oauth/callback/apple' or url.username or url.query or url.fragment:
    raise ValueError('Bridge target must be the fixed loopback Apple callback')

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_POST(self):
        try:
            if self.path!='/apple/callback' or not self.headers.get('Content-Type','').startswith('application/x-www-form-urlencoded'):raise ValueError()
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=32768:raise ValueError()
            form=urllib.parse.parse_qs(self.rfile.read(size).decode(),max_num_fields=12)
            data={key:form[key][0] for key in ['code','state','error'] if key in form}
            if not data.get('state') or not (data.get('code') or data.get('error')):raise ValueError()
            self.send_response(303);self.send_header('Location',TARGET+'?'+urllib.parse.urlencode(data))
            self.send_header('Cache-Control','no-store');self.send_header('Referrer-Policy','no-referrer');self.send_header('Content-Length','0');self.end_headers()
        except (ValueError,UnicodeError):self.send_error(400,'Invalid callback')

if __name__=='__main__':ThreadingHTTPServer(('127.0.0.1',int(os.environ.get('LITHOS_BRIDGE_PORT','8790'))),Handler).serve_forever()
