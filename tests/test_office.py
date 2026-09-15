import io, zipfile, urllib.request, urllib.parse
from pathlib import Path
from test_workbench import WorkbenchTests
from backend import server as app

class OfficeTests(WorkbenchTests):
    def test_office_bytes_and_model_boundary(self):
        relative='03_开发与验证/表格.xlsx'
        p=Path(self.p['path'])/relative
        with zipfile.ZipFile(p,'w') as z:z.writestr('xl/workbook.xml','<workbook/>')
        listed=next(x for x in app.documents(self.p['id'])['files'] if x['id']==relative)
        self.assertFalse(listed['evidence'])
        self.assertEqual(app.document_bytes(self.p['id'],relative),p.read_bytes())
        with self.assertRaises(ValueError):app.prepare({'project':self.p['id'],'files':[relative]})
        for bad in ['../outside.txt','app/secret.txt','03_开发与验证/missing.pdf']:
            with self.assertRaises(ValueError):app.document_bytes(self.p['id'],bad)
        url=f'http://127.0.0.1:{self.web.server_port}/api/project-file?'+urllib.parse.urlencode({'project':self.p['id'],'file':relative})
        with urllib.request.urlopen(url) as r:self.assertEqual(r.read(),p.read_bytes())
        with urllib.request.urlopen(f'http://127.0.0.1:{self.web.server_port}/office-frame.html') as r:
            policy=r.headers['Content-Security-Policy']
            self.assertIn("connect-src 'none'",policy)
            self.assertIn("frame-ancestors 'self'",policy)
    def test_office_archive_limits(self):
        p=Path(self.p['path'])/'03_开发与验证/过大.docx'
        with zipfile.ZipFile(p,'w',zipfile.ZIP_DEFLATED) as z:z.writestr('large',b'0'*(65*1024*1024))
        with self.assertRaisesRegex(ValueError,'解压'):app.document_bytes(self.p['id'],'03_开发与验证/过大.docx')
        p.write_bytes(b'broken')
        with self.assertRaisesRegex(ValueError,'损坏'):app.document_bytes(self.p['id'],'03_开发与验证/过大.docx')
