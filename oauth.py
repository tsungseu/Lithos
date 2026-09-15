"""Optional local-account OAuth. Provider tokens never leave this module."""
import base64
import ctypes
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
import urllib.parse
import urllib.request
from http.cookies import SimpleCookie

PROVIDERS = {
    'github': ('GitHub', 'https://github.com/login/oauth/authorize', 'https://github.com/login/oauth/access_token', 'read:user'),
    'google': ('Google', 'https://accounts.google.com/o/oauth2/v2/auth', 'https://oauth2.googleapis.com/token', 'openid profile email'),
    'apple': ('Apple', 'https://appleid.apple.com/auth/authorize', 'https://appleid.apple.com/auth/token', 'name email'),
}
LOCK = threading.RLock()
FLOWS = {}
ACCOUNT = None
EPOCH = 0

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise ValueError('OAuth服务返回了非预期跳转')

def request_json(url, form=None, token=None):
    headers={'Accept':'application/json', 'User-Agent':'Lithos-Workbench'}
    data=None
    if form is not None:
        data=urllib.parse.urlencode(form).encode()
        headers['Content-Type']='application/x-www-form-urlencoded'
    if token: headers['Authorization']='Bearer '+token
    try:
        with urllib.request.build_opener(NoRedirect()).open(urllib.request.Request(url,data=data,headers=headers),timeout=30) as response:
            raw=response.read(1024*1024+1)
            if len(raw)>1024*1024: raise ValueError()
            value=json.loads(raw)
            if not isinstance(value,dict) or value.get('error'): raise ValueError()
            return value
    except Exception:
        raise ValueError('OAuth服务请求失败，请核对应用配置或稍后重试；未保存令牌') from None

def protect(data, decrypt=False):
    if os.name!='nt': raise ValueError('本地凭据加密目前支持Windows；未写入明文')
    from ctypes import wintypes
    class Blob(ctypes.Structure):
        _fields_=[('size',wintypes.DWORD),('data',ctypes.POINTER(ctypes.c_ubyte))]
    raw=ctypes.create_string_buffer(data)
    source=Blob(len(data),ctypes.cast(raw,ctypes.POINTER(ctypes.c_ubyte)));output=Blob()
    crypt=ctypes.windll.crypt32
    fn=crypt.CryptUnprotectData if decrypt else crypt.CryptProtectData
    fn.argtypes=[ctypes.POINTER(Blob),ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p,wintypes.DWORD,ctypes.POINTER(Blob)]
    fn.restype=wintypes.BOOL
    if not fn(ctypes.byref(source),None,None,None,None,1,ctypes.byref(output)):
        raise ValueError('无法访问当前Windows账户的加密配置')
    try:return ctypes.string_at(output.data,output.size)
    finally:
        ctypes.windll.kernel32.LocalFree.argtypes=[ctypes.c_void_p]
        ctypes.windll.kernel32.LocalFree(output.data)

def read_config(home):
    path=home/'oauth-config.bin'
    return json.loads(protect(path.read_bytes(),True)) if path.exists() else {}

def save_config(home, body):
    global EPOCH
    provider=body.get('provider')
    if provider not in PROVIDERS: raise ValueError('不支持的登录方式')
    with LOCK:
        config=read_config(home)
        if body.get('remove'):
            config.pop(provider,None)
        else:
            client=str(body.get('client_id','')).strip()
            secret=str(body.get('client_secret','')).strip() or config.get(provider,{}).get('client_secret','')
            redirect=str(body.get('redirect_uri','')).strip()
            if not client or len(client)>300 or not secret or len(secret)>10000: raise ValueError('请填写Client ID和Client Secret；Apple填写已签发的客户端JWT')
            if provider=='apple':
                parsed=urllib.parse.urlsplit(redirect)
                if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.query or parsed.fragment:
                    raise ValueError('Apple需要已注册的公网HTTPS回调桥接地址')
            config[provider]={'client_id':client,'client_secret':secret,'redirect_uri':redirect if provider=='apple' else ''}
        home.mkdir(parents=True,exist_ok=True)
        temporary=home/'oauth-config.tmp'
        temporary.write_bytes(protect(json.dumps(config).encode()))
        temporary.replace(home/'oauth-config.bin')
        EPOCH+=1
        FLOWS.clear()
    return {'ok':True}

def status(home, origin):
    config=read_config(home)
    with LOCK: account=dict(ACCOUNT) if ACCOUNT else None
    return {'account':account,'providers':[{'id':key,'label':value[0], 'configured':key in config,
        'client_id':config.get(key,{}).get('client_id',''),
        'redirect_uri':config.get(key,{}).get('redirect_uri') or origin+'/oauth/callback/'+key}
        for key,value in PROVIDERS.items()]}

def start(home, provider, origin):
    if provider not in PROVIDERS: raise ValueError('不支持的登录方式')
    config=read_config(home).get(provider)
    if not config: raise ValueError('请先配置该供应商的OAuth应用')
    with LOCK:
        for key in list(FLOWS):
            if FLOWS[key]['expires']<time.time():FLOWS.pop(key)
        if len(FLOWS)>20: raise ValueError('待授权请求过多，请稍后重试')
        ticket=secrets.token_urlsafe(32)
        FLOWS[ticket]={'provider':provider,'config':config,'origin':origin,'expires':time.time()+600,
                       'state':secrets.token_urlsafe(32),'nonce':secrets.token_urlsafe(32),'verifier':secrets.token_urlsafe(48)}
    return {'url':origin+'/oauth/launch?ticket='+ticket}

def launch(ticket):
    with LOCK:
        flow=FLOWS.get(ticket)
        if not flow or flow['expires']<time.time() or flow.get('launched'):raise ValueError('授权入口已过期，请重新登录')
        flow['launched']=True;flow['cookie']=secrets.token_urlsafe(32)
        provider=flow['provider'];config=flow['config']
        flow['redirect']=config.get('redirect_uri') or flow['origin']+'/oauth/callback/'+provider
        params={'client_id':config['client_id'],'redirect_uri':flow['redirect'],'response_type':'code','scope':PROVIDERS[provider][3], 'state':flow['state']}
        if provider!='github':params['nonce']=flow['nonce']
        if provider!='apple':
            params.update(code_challenge=base64.urlsafe_b64encode(hashlib.sha256(flow['verifier'].encode()).digest()).decode().rstrip('='),code_challenge_method='S256')
        else:params['response_mode']='form_post'
        return PROVIDERS[provider][1]+'?'+urllib.parse.urlencode(params),flow['cookie']

def b64(value):return base64.urlsafe_b64decode(value+'='*(-len(value)%4))

def apple_identity(token, audience, nonce):
    try:
        header,payload,signature=token.split('.')
        meta=json.loads(b64(header));claims=json.loads(b64(payload))
        if meta.get('alg')!='RS256':raise ValueError()
        keys=request_json('https://appleid.apple.com/auth/keys')['keys']
        key=next(k for k in keys if k.get('kid')==meta.get('kid') and k.get('kty')=='RSA' and k.get('alg')=='RS256')
        n=int.from_bytes(b64(key['n']),'big');e=int.from_bytes(b64(key['e']),'big');size=(n.bit_length()+7)//8
        sig=b64(signature)
        if len(sig)!=size or int.from_bytes(sig,'big')>=n:raise ValueError()
        decoded=pow(int.from_bytes(sig,'big'),e,n).to_bytes(size,'big')
        digest=bytes.fromhex('3031300d060960864801650304020105000420')+hashlib.sha256((header+'.'+payload).encode()).digest()
        padding=size-len(digest)-3
        if padding<8 or not hmac.compare_digest(decoded,b'\x00\x01'+b'\xff'*padding+b'\x00'+digest):raise ValueError()
        if claims.get('iss')!='https://appleid.apple.com' or claims.get('aud')!=audience or claims.get('nonce')!=nonce or float(claims['exp'])<=time.time() or float(claims['iat'])>time.time()+60 or not claims.get('sub'):raise ValueError()
        return {'id':str(claims['sub']), 'name':str(claims.get('email') or 'Apple用户')[:200]}
    except Exception:raise ValueError('Apple身份签名或授权声明验证失败') from None

def callback(provider, query, cookies):
    global ACCOUNT
    state=query.get('state',[''])[0]
    jar=SimpleCookie()
    try:jar.load(cookies or '')
    except Exception:raise ValueError('授权浏览器校验失败') from None
    with LOCK:
        found=next(((key,f) for key,f in FLOWS.items() if state and hmac.compare_digest(f['state'],state)),None)
        if not found:raise ValueError('授权已失效或已使用，请重新登录')
        ticket,flow=found
        if flow['provider']!=provider or flow['expires']<time.time() or not flow.get('cookie') or not jar.get('lithos_oauth') or not hmac.compare_digest(jar['lithos_oauth'].value,flow['cookie']):raise ValueError('授权浏览器或有效期校验失败')
        FLOWS.pop(ticket)
        epoch=EPOCH
    if query.get('error'):raise ValueError('授权已取消，可以继续离线使用')
    code=query.get('code',[''])[0]
    if not code or len(code)>8000:raise ValueError('授权码缺失')
    config=flow['config']
    form={'grant_type':'authorization_code','client_id':config['client_id'],'client_secret':config['client_secret'],'redirect_uri':flow['redirect'],'code':code}
    if provider!='apple':form['code_verifier']=flow['verifier']
    tokens=request_json(PROVIDERS[provider][2],form)
    if provider=='apple':identity=apple_identity(tokens.get('id_token',''),config['client_id'],flow['nonce'])
    else:
        access=tokens.get('access_token')
        if not isinstance(access,str) or not access:raise ValueError('供应商没有返回访问令牌')
        user=request_json('https://api.github.com/user' if provider=='github' else 'https://openidconnect.googleapis.com/v1/userinfo',token=access)
        ident=user.get('id') if provider=='github' else user.get('sub')
        if not ident:raise ValueError('供应商没有返回稳定用户标识')
        identity={'id':str(ident),'name':str(user.get('name') or user.get('login') or 'Google用户')[:200]}
    with LOCK:
        if epoch!=EPOCH:raise ValueError('账号已退出或配置已更新，请重新授权')
        ACCOUNT={'provider':provider,**identity,'signed_in_at':int(time.time())}
    return {'ok':True}

def logout():
    global ACCOUNT, EPOCH
    with LOCK:ACCOUNT=None;FLOWS.clear();EPOCH+=1
    return {'ok':True}
