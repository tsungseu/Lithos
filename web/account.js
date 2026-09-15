'use strict';
(() => {
 const settingsNav=document.querySelector('.settings-tabs'), content=document.querySelector('.settings-content');
 const tab=node('button','账号','setting-tab');tab.dataset.setting='account';settingsNav.append(tab);
 const panel=node('section',undefined,'setting-panel');panel.id='setting-account';panel.hidden=true;content.append(panel);
 const title=node('h2','账号'), description=node('p','登录是可选的。项目、知识库和离线功能无需账号；登录不会同步资料，也不影响模型 API Key。','muted'), identity=node('p','离线访客','setting-info'), list=node('div'), message=node('p',undefined,'small muted');message.setAttribute('role','status');
 panel.append(title,description,identity,list,message);
 const form=node('form',undefined,'panel');form.hidden=true;
 const fields={};
 for(const [key,label,type] of [['provider','登录方式','select'],['client_id','Client ID','text'],['client_secret','Client Secret / Apple客户端JWT（本机加密保存）','password'],['redirect_uri','Apple HTTPS回调桥接地址','url']]){
  const input=node(type==='select'?'select':'input');input.id='oauth-'+key;if(type!=='select')input.type=type;
  else for(const id of ['github','google','apple']){const opt=node('option',id);opt.value=id;input.append(opt);}
  input.autocomplete='off';fields[key]=input;const l=node('label',label);l.htmlFor=input.id;form.append(l,input);
 }
 const help=node('p','GitHub / Google 回调地址见上方供应商条目；须先在供应商后台注册OAuth应用。密钥留空保留原值。Apple需要公网HTTPS桥接及定期更新的客户端JWT。','small muted');
 const save=node('button','保存本机配置','primary');save.type='submit';const cancel=node('button','取消','subtle');cancel.type='button';cancel.onclick=()=>form.hidden=true;form.append(help,save,cancel);panel.append(form);
 const edit=node('button','配置 OAuth 应用','secondary');edit.onclick=()=>form.hidden=!form.hidden;panel.append(edit);
 const exit=node('button','退出账号','subtle');exit.onclick=()=>busy(exit,async()=>{await api('/api/account/logout',{});await refresh();});panel.append(exit);
 let polling=null;
 function open(){document.querySelectorAll('.setting-panel').forEach(p=>p.hidden=p!==panel);document.querySelectorAll('.setting-tab').forEach(b=>b.classList.toggle('active',b===tab));refresh();}
 tab.onclick=open;
 const ribbon=node('button','◎','nav');ribbon.title='账号';ribbon.setAttribute('aria-label','账号');ribbon.onclick=()=>{showView('settings');open();};document.querySelector('.rail-note').prepend(ribbon);
 async function refresh(){try{const data=await api('/api/account');identity.textContent=data.account?`${data.account.name} · ${data.account.provider} · 本次应用会话`:'离线访客 · 未登录';exit.hidden=!data.account;list.replaceChildren();for(const p of data.providers){const row=node('div',undefined,'provider-card'), name=node('h3',p.label), status=node('p',p.configured?'已配置 · 浏览器授权':p.id==='apple'?'未配置 · 需要Apple应用与HTTPS回调桥接':'未配置 · 需要OAuth应用凭据','small muted'), callback=node('p','回调：'+p.redirect_uri,'path'), login=node('button','使用 '+p.label+' 登录','secondary');login.disabled=!p.configured;login.onclick=()=>busy(login,async()=>{const result=await api('/api/account/login',{provider:p.id});const link=node('a','打开浏览器授权','primary');link.href=result.url;link.target='_blank';link.rel='noopener noreferrer';message.replaceChildren(link,node('span','　授权完成后返回本页；入口10分钟内有效。'));link.click();if(polling)clearInterval(polling);let attempts=0;polling=setInterval(async()=>{if(++attempts>200){clearInterval(polling);return;}try{const s=await api('/api/account');if(s.account){clearInterval(polling);message.textContent='登录成功。';refresh();}}catch(_){clearInterval(polling);}},3000);});const configure=node('button','配置','subtle');configure.onclick=()=>{fields.provider.value=p.id;fields.client_id.value=p.client_id;fields.client_secret.value='';fields.redirect_uri.value=p.id==='apple'?p.redirect_uri:'';form.hidden=false;};const remove=node('button','移除配置','subtle');remove.hidden=!p.configured;remove.onclick=()=>busy(remove,async()=>{await api('/api/account/config',{provider:p.id,remove:true});await refresh();});row.append(name,status,callback,login,configure,remove);list.append(row);}}catch(e){message.textContent=e.message;}}
 form.onsubmit=e=>{e.preventDefault();busy(save,async()=>{await api('/api/account/config',Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.value])));fields.client_secret.value='';form.hidden=true;message.textContent='已使用当前Windows账户加密保存。';await refresh();});};
 document.querySelectorAll('.setting-tab:not([data-setting="account"])').forEach(b=>b.addEventListener('click',()=>panel.hidden=true));
})();
