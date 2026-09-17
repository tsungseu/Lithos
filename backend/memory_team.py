"""Explicit team publishing boundary. Only reviewed Markdown and selected excerpts leave the device."""
import json
import hashlib
import hmac
import os
import re
import urllib.parse
import urllib.request

class Team:
    def __init__(self,memory):
        self.memory=memory
        self.path=memory.home/'team.protected'
    def config(self):
        return json.loads(self.memory.s.oauth.protect(self.path.read_bytes(),True)) if self.path.exists() else {}
    def configure(self,body):
        endpoint=str(body.get('endpoint','')).rstrip('/');url=urllib.parse.urlsplit(endpoint)
        if url.username or url.password or url.query or url.fragment or not url.hostname:raise ValueError('团队地址无效')
        if url.scheme!='https' and not(url.scheme=='http' and url.hostname in {'127.0.0.1','localhost','::1'}):raise ValueError('团队远程服务需要HTTPS')
        token=str(body.get('token',''))
        if not token or '\n' in token or '\r' in token:raise ValueError('团队登录令牌无效')
        value=json.dumps({'endpoint':endpoint,'token':token}).encode();temp=self.path.with_suffix('.pending');temp.write_bytes(self.memory.s.oauth.protect(value));os.replace(temp,self.path)
        return {'configured':True}
    def login(self,body):
        endpoint=str(body.get('endpoint','')).rstrip('/');url=urllib.parse.urlsplit(endpoint)
        if url.username or url.password or url.query or url.fragment or not url.hostname:raise ValueError('团队地址无效')
        if url.scheme!='https' and not(url.scheme=='http' and url.hostname in {'127.0.0.1','localhost','::1'}):raise ValueError('团队远程服务需要HTTPS')
        payload={k:str(body.get(k,'')) for k in ('team','name','password')}
        req=urllib.request.Request(endpoint+'/api/v1/login',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'})
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,*args):return None
        with urllib.request.build_opener(NoRedirect()).open(req,timeout=15) as response:result=json.loads(response.read(65536))
        self.configure({'endpoint':endpoint,'token':result['token']})
        return {'connected':True,'role':result['role'],'expires_in':result['expires_in']}

    def request(self,path,body=None,method=None):
        config=self.config()
        if not config:raise ValueError('未连接团队服务')
        req=urllib.request.Request(config['endpoint']+'/api/v1/'+path,data=None if body is None else json.dumps(body).encode(),headers={'Authorization':'Bearer '+config['token'],'Content-Type':'application/json'},method=method)
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,*args):return None
        with urllib.request.build_opener(NoRedirect()).open(req,timeout=15) as response:
            raw=response.read(2*1024*1024+1)
            if len(raw)>2*1024*1024:raise ValueError('团队响应过大')
            return json.loads(raw)
    def search(self,query,budget=3000):
        if not self.path.exists() or not query.strip():return []
        # Send search terms only; never send the private evidence corpus to team search.
        rows=self.request('search',{'query':query[:1000]});result=[]
        for row in rows[:4]:
            asset=self.request('assets/'+row['id']);text=asset['body'][:min(3000,budget)]
            cost=len(text.encode())
            if cost>budget:continue
            result.append(dict(id='team:'+asset['id'],scope='team',path='',title=asset['title'],kind=asset['kind'],revision=asset['revision'],text=text,start=0,score=0))
            budget-=cost
        return result

    def preview(self,body):
        with self.memory.connect() as db:asset=db.execute('SELECT * FROM assets WHERE id=?',(body.get('id'),)).fetchone()
        if not asset:raise ValueError('请选择已审核资产')
        raw=self.memory.s.checked(self.memory.knowledge,asset['path']).read_bytes()
        if asset['stale'] or hashlib.sha256(raw).hexdigest()!=asset['revision']:raise ValueError('资产已变化或待复核，请重新审核后共享')
        text=raw.decode('utf-8-sig')
        # Explicit export preview excludes all local path/metadata records.
        text=re.sub(r'\n<!-- lithos-asset:.*?-->','',text)
        if re.search(r'(?i)[a-z]:[\\/]|-----BEGIN .*PRIVATE KEY|\bsk-[A-Za-z0-9_-]{20,}',text):raise ValueError('正文包含本机路径或疑似密钥，请先编辑移除')
        selected=body.get('excerpts',[])
        sources=json.loads(asset['sources'])
        if not isinstance(selected,list) or any(not isinstance(x,str) or not x or not any(x in s['text'] for s in sources) for x in selected):raise ValueError('共享证据必须从来源中选择原文片段')
        result=dict(title=asset['title'],content=text,kind=asset['kind'],evidence=selected,reviewed=True)
        binding=json.dumps([asset['id'],asset['revision'],result],ensure_ascii=False,sort_keys=True).encode()
        result['preview_hash']=hashlib.sha256(binding).hexdigest()
        return result
    def publish(self,body):
        if body.get('confirmed') is not True:raise ValueError('请预览并明确发布团队资产')
        preview=self.preview(body)
        expected=preview.pop('preview_hash')
        if not hmac.compare_digest(str(body.get('preview_hash','')),expected):raise ValueError('共享内容已变化，请重新预览并确认')
        return self.request('assets',preview)
