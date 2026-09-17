"""Explicit Agent grants and read/submit-only MCP tools for a bound Memory service."""
import hashlib
import json
import secrets
import time

TOOLS = [
 ('memory_search','检索获授权的已审核知识',{'query':{'type':'string'}}),
 ('memory_read','读取已审核资产及获授权证据',{'id':{'type':'string'}}),
 ('project_context','查阅项目上下文',{'query':{'type':'string'}}),
 ('memory_submit','提交待审核记忆或Skill候选',{'title':{'type':'string'},'content':{'type':'string'},'kind':{'type':'string','enum':['fact','context','knowledge','skill']}}),
 ('memory_feedback','记录资产使用反馈',{'id':{'type':'string'},'verdict':{'type':'string','enum':['used','stale','invalid']}}),
]

class Agents:
    def __init__(self,memory):
        self.memory=memory
        with memory.connect() as db:
            db.executescript('''CREATE TABLE IF NOT EXISTS agent_grants(id TEXT PRIMARY KEY,name TEXT,token_hash TEXT UNIQUE,project TEXT,assets TEXT,retain INTEGER,revoked INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,agent TEXT,body TEXT,created REAL,expires REAL);
CREATE TABLE IF NOT EXISTS agent_usage(id TEXT PRIMARY KEY,agent TEXT,kind TEXT,created REAL,input_bytes INTEGER,output_bytes INTEGER);''')
    def create(self,body):
        name=str(body.get('name','')).strip();project=str(body.get('project','')).strip()
        if not name or not project:raise ValueError('客户端需要名称及明确项目标识')
        assets=body.get('assets',[])
        if not isinstance(assets,list) or not assets or not all(isinstance(x,str) for x in assets):raise ValueError('请显式选择允许访问的资产')
        with self.memory.connect() as db:
            if any(not db.execute('SELECT id FROM assets WHERE id=?',(i,)).fetchone() for i in assets):raise ValueError('资产不存在')
            token=secrets.token_urlsafe(32);ident=secrets.token_hex(16)
            db.execute('INSERT INTO agent_grants VALUES(?,?,?,?,?,?,0)',(ident,name,hashlib.sha256(token.encode()).hexdigest(),project,json.dumps(assets),bool(body.get('retain',True))))
        return dict(id=ident,token=token,workspace_id=self.memory.workspace_id,library_id=self.memory.library_id,retention_days=30 if body.get('retain',True) else 0)
    def grants(self):
        with self.memory.connect() as db:return [dict(r) for r in db.execute('SELECT id,name,project,assets,retain,revoked FROM agent_grants')]
    def revoke(self,ident):
        with self.memory.connect() as db:db.execute('UPDATE agent_grants SET revoked=1 WHERE id=?',(ident,))
        return {'revoked':True}
    def authorize(self,token):
        with self.memory.connect() as db:row=db.execute('SELECT * FROM agent_grants WHERE token_hash=? AND revoked=0',(hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
        if not row:raise ValueError('Agent凭据无效或已撤销')
        result=dict(row);result['assets']=json.loads(result['assets']);return result
    def tool(self,token,name,args):
        grant=self.authorize(token);m=self.memory
        if name in {'memory_search','project_context'}:
            results=m.search(str(args.get('query','')),allowed=grant['assets'])
            return [r for r in results if name!='project_context' or r['kind']=='context']
        if name=='memory_read':
            ident=args.get('id')
            if ident not in grant['assets']:raise ValueError('资产不存在或无权访问')
            with m.connect() as db:row=db.execute('SELECT * FROM assets WHERE id=?',(ident,)).fetchone()
            if not row:raise ValueError('资产不存在')
            p=m.s.checked(m.knowledge,row['path']);raw=p.read_bytes()
            if hashlib.sha256(raw).hexdigest()!=row['revision']:raise ValueError('资产已变化，等待复核')
            # Source paths are workspace-relative, never expose absolute host paths.
            return dict(id=ident,title=row['title'],content=raw.decode('utf-8-sig'),revision=row['revision'],stale=bool(row['stale']),sources=json.loads(row['sources']))
        if name=='memory_feedback':
            if args.get('id') not in grant['assets']:raise ValueError('资产不存在或无权访问')
            return m.post('feedback',dict(asset=args['id'],verdict=args.get('verdict')))
        if name=='memory_submit':
            kind=args.get('kind','knowledge');content=args.get('content','');title=args.get('title','')
            if kind not in {'fact','context','knowledge','skill'} or not isinstance(content,str) or not 1<=len(content.encode())<=100000:raise ValueError('候选格式无效')
            m.s.safe_name(title)
            ident=secrets.token_hex(16)
            # External assertions are pending and explicitly unverified. No source is fabricated.
            body='> Agent 提交，尚无项目原件证据；请人工核验。\n\n'+content
            with m.connect() as db:db.execute('INSERT INTO candidates VALUES(?,?,?,?,?,?,?,?,?,?,?)',(ident,'agent:'+grant['id'],'pending',kind,title,body,'[]','','','new',time.time()))
            return dict(id=ident,state='pending',evidence_status='unverified')
        raise ValueError('不支持的工具，Agent不能审核入库或共享')
    def rpc(self,token,request):
        self.authorize(token)
        ident=request.get('id');method=request.get('method','')
        if not isinstance(method,str):raise ValueError('Invalid method')
        if method=='initialize':result={'protocolVersion':'2024-11-05','capabilities':{'tools':{}},'serverInfo':{'name':'lithos-memory','version':'0.1.0'}}
        elif method=='ping':result={}
        elif method=='tools/list':result={'tools':[dict(name=n,description=d,inputSchema={'type':'object','properties':p,'required':list(p),'additionalProperties':False}) for n,d,p in TOOLS]}
        elif method=='tools/call':
            params=request.get('params',{})
            try:result={'content':[{'type':'text','text':json.dumps(self.tool(token,params.get('name'),params.get('arguments',{})),ensure_ascii=False)}]}
            except (ValueError,OSError) as e:result={'isError':True,'content':[{'type':'text','text':str(e)}]}
        elif method.startswith('notifications/'):return None
        else:return {'jsonrpc':'2.0','id':ident,'error':{'code':-32601,'message':'Method not found'}}
        return {'jsonrpc':'2.0','id':ident,'result':result}
    def purge_expired(self):
        now=time.time()
        with self.memory.connect() as db:
            expired=db.execute('SELECT id FROM conversations WHERE expires<?',(now,)).fetchall()
            for record in expired:
                job='conversation-'+record['id']
                source_path='@conversation/'+record['id']
                for asset in db.execute('SELECT id,sources FROM assets').fetchall():
                    sources=json.loads(asset['sources']);changed=False
                    for source in sources:
                        if source.get('path')==source_path:
                            source['text']='';source['evidence_status']='expired';changed=True
                    if changed:db.execute('UPDATE assets SET sources=?,stale=1 WHERE id=?',(json.dumps(sources,ensure_ascii=False),asset['id']))
                db.execute("UPDATE candidates SET sources='[]',state=CASE WHEN state='pending' THEN 'expired' ELSE state END WHERE job=?",(job,))
                db.execute("UPDATE jobs SET payload='{}',state='cancelled',error='原始会话已到保留期限' WHERE id=?",(job,))
            db.execute('DELETE FROM conversations WHERE expires<?',(now,))
        return len(expired)

    def capture(self,token,text):
        grant=self.authorize(token)
        if not grant['retain']:return
        self.purge_expired()
        now=time.time();ident=secrets.token_hex(16)
        with self.memory.connect() as db:
            db.execute('DELETE FROM conversations WHERE expires<?',(now,))
            db.execute('INSERT INTO conversations VALUES(?,?,?,?,?)',(ident,grant['id'],text,now,now+30*86400))

        if self.memory.config()['enabled']:
            payload=dict(sources=[dict(path='@conversation/'+ident,hash=hashlib.sha256(text.encode()).hexdigest(),text=text)],kind='fact',focus='提炼项目 '+grant['project']+' 的事实、决策与未决问题。对话主张不是已经验证的事实。',workspace_id=self.memory.workspace_id,library_id=self.memory.library_id)
            try:self.memory.reserve(tasks=1)
            except ValueError:return
            with self.memory.connect() as db:
                db.execute('INSERT INTO jobs(id,state,payload,created,updated) VALUES(?,?,?,?,?)',('conversation-'+ident,'queued',json.dumps(payload,ensure_ascii=False),now,now))
