"""Independent team service. No desktop filesystem or model credentials are accepted."""
import hashlib
import hmac
import json
import math
import collections
import os
import re
import secrets
import time
import tempfile
from contextlib import asynccontextmanager,contextmanager
from pathlib import Path
import psycopg
from psycopg.rows import dict_row
from fastapi import FastAPI,HTTPException,Header

@contextmanager
def db():
    with psycopg.connect(os.environ['DATABASE_URL'],row_factory=dict_row) as connection:yield connection

def secret_hash(value):return hashlib.sha256(value.encode()).hexdigest()
def password_hash(value,salt):return hashlib.pbkdf2_hmac('sha256',value.encode(),bytes.fromhex(salt),600000).hex()
def bad(code,message):raise HTTPException(code,message)

def initialize():
    with db() as c:
        c.execute('CREATE EXTENSION IF NOT EXISTS vector')
        c.execute('''CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, team TEXT NOT NULL, name TEXT NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL, UNIQUE(team,name));
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), expires DOUBLE PRECISION);
CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY, team TEXT NOT NULL, owner TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, kind TEXT NOT NULL, revision TEXT NOT NULL, active BOOLEAN NOT NULL, evidence TEXT NOT NULL, vector vector);
CREATE TABLE IF NOT EXISTS publications(key TEXT PRIMARY KEY,asset TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS history(id TEXT PRIMARY KEY,asset TEXT NOT NULL,revision TEXT NOT NULL,body TEXT NOT NULL,created DOUBLE PRECISION);
CREATE TABLE IF NOT EXISTS grants(id TEXT PRIMARY KEY,team TEXT NOT NULL,name TEXT NOT NULL,token TEXT UNIQUE NOT NULL,assets TEXT NOT NULL,revoked BOOLEAN NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,team TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,asset TEXT,created DOUBLE PRECISION);
CREATE TABLE IF NOT EXISTS login_attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset DOUBLE PRECISION NOT NULL);''')
        c.execute("ALTER TABLE assets ADD COLUMN IF NOT EXISTS vector_model TEXT NOT NULL DEFAULT ''")

@asynccontextmanager
async def lifespan(app):
    initialize();yield
app=FastAPI(title='Lithos Team Memory',version='0.1.0',lifespan=lifespan)

def user(auth):
    token=auth.removeprefix('Bearer ')
    with db() as c:r=c.execute('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=%s AND s.expires>%s',(secret_hash(token),time.time())).fetchone()
    if not r:bad(401,'Login required')
    return r

def audit(c,u,action,asset=''):
    c.execute('INSERT INTO audit VALUES(%s,%s,%s,%s,%s,%s)',(secrets.token_hex(16),u['team'],u['id'],action,asset,time.time()))

def public_body(body):
    if set(body)-{'title','content','kind','evidence','revision','reviewed'}:bad(400,'Unexpected fields; credentials and host paths must not be uploaded')
    if body.get('reviewed') is not True:bad(400,'Explicit review required')
    title=body.get('title');content=body.get('content');kind=body.get('kind','knowledge');evidence=body.get('evidence',[])
    if not isinstance(title,str) or not 1<=len(title)<=200 or not isinstance(content,str) or not 1<=len(content.encode())<=1024*1024:bad(400,'Invalid title or content')
    if kind not in {'fact','context','knowledge','skill'} or not isinstance(evidence,list):bad(400,'Invalid asset')
    if len(evidence)>100 or any(not isinstance(e,str) or len(e)>10000 for e in evidence):bad(400,'Evidence must be selected text excerpts')
    text=title+'\n'+content+'\n'+json.dumps(evidence)
    if re.search(r'(?i)[a-z]:[\\/]|-----BEGIN .*PRIVATE KEY|\bsk-[A-Za-z0-9_-]{20,}|\bghp_[A-Za-z0-9]{20,}',text):bad(400,'Remove local paths and credentials before sharing')
    return title,content,kind,json.dumps(evidence,ensure_ascii=False)

def snapshot(ident,revision,content):
    root=Path(os.environ.get('LITHOS_FILES','./team-assets')).resolve()
    folder=root/ident;folder.mkdir(parents=True,exist_ok=True)
    if folder.is_symlink() or not folder.resolve().is_relative_to(root):bad(400,'Unsafe storage path')
    target=folder/(revision+'.md')
    if target.exists():return
    fd,tmp=tempfile.mkstemp(dir=folder,prefix='.snapshot-')
    try:
        with os.fdopen(fd,'w',encoding='utf-8',newline='') as f:f.write(content);f.flush();os.fsync(f.fileno())
        os.replace(tmp,target)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)

@app.post('/api/v1/bootstrap')
def bootstrap(body:dict,authorization:str=Header(default='')):
    expected=os.environ.get('LITHOS_BOOTSTRAP_TOKEN','')
    if not expected or not hmac.compare_digest(authorization,'Bearer '+expected):bad(403,'Invalid bootstrap token')
    if not isinstance(body.get('password'),str) or len(body['password'])<12:bad(400,'Password needs at least 12 characters')
    with db() as c:
        c.execute('LOCK TABLE users IN EXCLUSIVE MODE')
        if c.execute('SELECT id FROM users LIMIT 1').fetchone():bad(409,'Already initialized')
        salt=secrets.token_hex(16);ident=secrets.token_hex(16);team=secrets.token_hex(16)
        c.execute('INSERT INTO users VALUES(%s,%s,%s,%s,%s,%s)',(ident,team,str(body.get('name','admin'))[:100],salt,password_hash(body['password'],salt),'admin'))
    return {'team':team,'id':ident}

@app.post('/api/v1/login')
def login(body:dict):
    team=str(body.get('team',''));name=str(body.get('name',''));key=secret_hash(team+'\0'+name)
    with db() as c:
        c.execute('INSERT INTO login_attempts VALUES(%s,0,%s) ON CONFLICT DO NOTHING',(key,time.time()+300))
        row=c.execute('SELECT * FROM login_attempts WHERE key=%s FOR UPDATE',(key,)).fetchone()
        if row['reset']<time.time():c.execute('UPDATE login_attempts SET count=0,reset=%s WHERE key=%s',(time.time()+300,key))
        elif row['count']>=10:bad(429,'Try again later')
        c.execute('UPDATE login_attempts SET count=count+1 WHERE key=%s',(key,))
        account=c.execute('SELECT * FROM users WHERE team=%s AND name=%s',(team,name)).fetchone()
    if not account or not hmac.compare_digest(account['password'],password_hash(str(body.get('password','')),account['salt'])):bad(401,'Invalid credentials')
    token=secrets.token_urlsafe(32)
    with db() as c:c.execute('INSERT INTO sessions VALUES(%s,%s,%s)',(secret_hash(token),account['id'],time.time()+86400))
    return {'token':token,'expires_in':86400,'role':account['role']}

@app.post('/api/v1/logout')
def logout(authorization:str=Header(default='')):
    with db() as c:c.execute('DELETE FROM sessions WHERE token=%s',(secret_hash(authorization.removeprefix('Bearer ')),))
    return {'logged_out':True}

@app.post('/api/v1/users')
def create_user(body:dict,authorization:str=Header(default='')):
    u=user(authorization)
    if u['role']!='admin':bad(403,'Admin required')
    if body.get('role') not in {'admin','editor','reader'} or len(str(body.get('password','')))<12:bad(400,'Invalid role or password')
    ident=secrets.token_hex(16);salt=secrets.token_hex(16)
    with db() as c:c.execute('INSERT INTO users VALUES(%s,%s,%s,%s,%s,%s)',(ident,u['team'],str(body.get('name',''))[:100],salt,password_hash(body['password'],salt),body['role']))
    return {'id':ident}

@app.get('/api/v1/assets')
def assets(q:str='',authorization:str=Header(default='')):
    u=user(authorization)
    with db() as c:rows=c.execute('SELECT id,title,kind,revision FROM assets WHERE team=%s AND active AND (title ILIKE %s OR body ILIKE %s) LIMIT 100',(u['team'],'%'+q+'%','%'+q+'%')).fetchall()
    return rows

@app.get('/api/v1/assets/{ident}')
def read(ident:str,authorization:str=Header(default='')):
    u=user(authorization)
    with db() as c:r=c.execute('SELECT id,title,body,kind,revision,evidence FROM assets WHERE id=%s AND team=%s AND active',(ident,u['team'])).fetchone()
    if not r:bad(404,'Not found')
    r['evidence']=json.loads(r['evidence']);return r

@app.post('/api/v1/assets')
def publish(body:dict,authorization:str=Header(default='')):
    u=user(authorization)
    if u['role'] not in {'admin','editor'}:bad(403,'Editor required')
    title,content,kind,evidence=public_body(body);ident=secrets.token_hex(16);revision=secret_hash(content)
    key=secret_hash(json.dumps([u['team'],u['id'],title,content,kind,evidence]))
    with db() as c:
        c.execute('SELECT pg_advisory_xact_lock(hashtext(%s))',(key,))
        prior=c.execute('SELECT asset FROM publications WHERE key=%s',(key,)).fetchone()
        if prior:return {'id':prior['asset'],'revision':revision}
        snapshot(ident,revision,content)
        c.execute('INSERT INTO publications VALUES(%s,%s)',(key,ident))
        c.execute('INSERT INTO assets(id,team,owner,title,body,kind,revision,active,evidence,vector) VALUES(%s,%s,%s,%s,%s,%s,%s,TRUE,%s,NULL)',(ident,u['team'],u['id'],title,content,kind,revision,evidence));audit(c,u,'publish',ident)
    return {'id':ident,'revision':revision}

@app.put('/api/v1/assets/{ident}')
def update(ident:str,body:dict,authorization:str=Header(default='')):
    u=user(authorization);title,content,kind,evidence=public_body(body)
    with db() as c:
        old=c.execute('SELECT * FROM assets WHERE id=%s AND team=%s AND active FOR UPDATE',(ident,u['team'])).fetchone()
        if not old:bad(404,'Not found')
        if u['role']!='admin' and (u['role']!='editor' or old['owner']!=u['id']):bad(403,'Owner or admin required')
        if old['revision']!=body.get('revision'):bad(409,'Revision conflict')
        c.execute('INSERT INTO history VALUES(%s,%s,%s,%s,%s)',(secrets.token_hex(16),ident,old['revision'],old['body'],time.time()))
        revision=secret_hash(content);snapshot(ident,revision,content);c.execute("UPDATE assets SET title=%s,body=%s,kind=%s,revision=%s,evidence=%s,vector=NULL,vector_model='' WHERE id=%s",(title,content,kind,revision,evidence,ident));audit(c,u,'update',ident)
    return {'id':ident,'revision':revision}

@app.post('/api/v1/assets/{ident}/revoke')
def revoke(ident:str,authorization:str=Header(default='')):
    u=user(authorization)
    with db() as c:
        old=c.execute('SELECT owner FROM assets WHERE id=%s AND team=%s',(ident,u['team'])).fetchone()
        if not old:bad(404,'Not found')
        if u['role']!='admin' and old['owner']!=u['id']:bad(403,'Owner or admin required')
        c.execute('UPDATE assets SET active=FALSE WHERE id=%s',(ident,));audit(c,u,'revoke',ident)
    return {'revoked':True}

@app.post('/api/v1/agents')
def agent(body:dict,authorization:str=Header(default='')):
    u=user(authorization)
    if u['role']!='admin':bad(403,'Admin required')
    allowed=body.get('assets',[])
    if not isinstance(allowed,list) or not allowed:bad(400,'Explicit assets required')
    with db() as c:
        for ident in allowed:
            if not c.execute('SELECT id FROM assets WHERE id=%s AND team=%s AND active',(ident,u['team'])).fetchone():bad(404,'Not found')
        ident=secrets.token_hex(16);token=secrets.token_urlsafe(32)
        c.execute('INSERT INTO grants VALUES(%s,%s,%s,%s,%s,FALSE)',(ident,u['team'],str(body.get('name','Agent'))[:100],secret_hash(token),json.dumps(allowed)))
    return {'id':ident,'token':token}

@app.post('/api/v1/agents/{ident}/revoke')
def revoke_agent(ident:str,authorization:str=Header(default='')):
    u=user(authorization)
    if u['role']!='admin':bad(403,'Admin required')
    with db() as c:c.execute('UPDATE grants SET revoked=TRUE WHERE id=%s AND team=%s',(ident,u['team']))
    return {'revoked':True}

@app.get('/api/v1/agent/search')
def agent_search(q:str='',authorization:str=Header(default='')):
    with db() as c:
        grant=c.execute('SELECT * FROM grants WHERE token=%s AND NOT revoked',(secret_hash(authorization.removeprefix('Bearer ')),)).fetchone()
        if not grant:bad(401,'Invalid Agent credential')
        return c.execute('SELECT id,title,body,kind,revision FROM assets WHERE team=%s AND active AND id=ANY(%s) AND (title ILIKE %s OR body ILIKE %s) LIMIT 8',(grant['team'],json.loads(grant['assets']),'%'+q+'%','%'+q+'%')).fetchall()

@app.get('/health')
def health():return {'status':'ok'}

def terms(text):
    words=re.findall(r'[a-z0-9_]+|[\u3400-\u9fff]',text.casefold())
    for run in re.findall(r'[\u3400-\u9fff]+',text):words.extend(run[i:i+2] for i in range(len(run)-1))
    return words

def rank_lexical(rows,query):
    """Rank only rows already filtered by the caller's authorization."""
    corpus=[collections.Counter(terms(r['title']+' '+r['body'])) for r in rows]
    lengths=[sum(c.values()) for c in corpus];avg=sum(lengths)/max(1,len(rows))
    result=[]
    for row,count,length in zip(rows,corpus,lengths):
        score=0
        for term in set(terms(query)):
            frequency=count[term]
            if not frequency:continue
            df=sum(term in doc for doc in corpus)
            score+=math.log(1+(len(rows)-df+.5)/(df+.5))*frequency*2.2/(frequency+1.2*(.25+.75*length/max(avg,1)))
        if score:result.append({**row,'score':score})
    return sorted(result,key=lambda r:-r['score'])

def vector_value(value):
    if not isinstance(value,list) or not 1<=len(value)<=8192 or any(type(v) not in (int,float) or not math.isfinite(v) for v in value):bad(400,'Invalid vector')
    return json.dumps(value)

@app.put('/api/v1/assets/{ident}/vector')
def put_vector(ident:str,body:dict,authorization:str=Header(default='')):
    u=user(authorization);value=vector_value(body.get('vector'));model=body.get('model')
    if not isinstance(model,str) or not model.strip() or len(model)>200:bad(400,'Model required')
    with db() as c:
        old=c.execute('SELECT owner,revision FROM assets WHERE id=%s AND team=%s AND active FOR UPDATE',(ident,u['team'])).fetchone()
        if not old:bad(404,'Not found')
        if u['role']!='admin' and (u['role']!='editor' or old['owner']!=u['id']):bad(403,'Owner or admin required')
        if old['revision']!=body.get('revision'):bad(409,'Revision conflict')
        c.execute('UPDATE assets SET vector=%s::vector,vector_model=%s WHERE id=%s',(value,model,ident))
    return {'indexed':True}

def search_authorized(c,team,allowed,body):
    query=body.get('query','')
    if not isinstance(query,str) or len(query)>4000:bad(400,'Invalid query')
    clause='team=%s AND active';params=[team]
    if allowed is not None:clause+=' AND id=ANY(%s)';params.append(allowed)
    rows=c.execute('SELECT id,title,body,kind,revision FROM assets WHERE '+clause,params).fetchall()
    lexical=rank_lexical(rows,query);rankings=[lexical]
    if body.get('vector') is not None:
        value=vector_value(body['vector'])
        # CASE prevents dimension errors even if the SQL planner reorders filters.
        sql='SELECT id,title,body,kind,revision, CASE WHEN vector_dims(vector)=%s THEN 1-(vector <=> %s::vector) ELSE 0 END AS score FROM assets WHERE '+clause+' AND vector IS NOT NULL AND vector_model=%s'
        vectors=c.execute(sql,[len(body['vector']),value,*params,str(body.get('model',''))]).fetchall()
        rankings.append(sorted((r for r in vectors if r['score']>.35),key=lambda r:-r['score']))
    merged={}
    for ranking in rankings:
        for index,row in enumerate(ranking):
            if row['id'] not in merged:merged[row['id']]={**row,'score':0}
            merged[row['id']]['score']+=1/(61+index)
    return sorted(merged.values(),key=lambda r:-r['score'])[:8]

@app.post('/api/v1/search')
def search(body:dict,authorization:str=Header(default='')):
    u=user(authorization)
    with db() as c:return search_authorized(c,u['team'],None,body)

@app.post('/api/v1/agent/search')
def agent_hybrid(body:dict,authorization:str=Header(default='')):
    with db() as c:
        grant=c.execute('SELECT * FROM grants WHERE token=%s AND NOT revoked',(secret_hash(authorization.removeprefix('Bearer ')),)).fetchone()
        if not grant:bad(401,'Invalid Agent credential')
        return search_authorized(c,grant['team'],json.loads(grant['assets']),body)

@app.get('/api/v1/agent/assets/{ident}')
def agent_read(ident:str,authorization:str=Header(default='')):
    with db() as c:
        grant=c.execute('SELECT * FROM grants WHERE token=%s AND NOT revoked',(secret_hash(authorization.removeprefix('Bearer ')),)).fetchone()
        if not grant:bad(401,'Invalid Agent credential')
        row=c.execute('SELECT id,title,body,kind,revision,evidence FROM assets WHERE id=%s AND team=%s AND active AND id=ANY(%s)',(ident,grant['team'],json.loads(grant['assets']))).fetchone()
        if not row:bad(404,'Not found')
        row['evidence']=json.loads(row['evidence']);return row
