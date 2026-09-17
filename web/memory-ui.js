'use strict';
(() => {
 const C=window.LithosCommands,W=window.LithosWorkspace;
 const host=node('section',undefined,'view memory-center');host.id='memory';host.hidden=true;document.body.append(host);
 const heading=node('div',undefined,'section-head');heading.append(node('h1','记忆中心'));
 const info=node('p','本地证据 → 待审核候选 → 可复用知识。后台任务不会直接修改正式知识。','muted');
 const status=node('p',undefined,'memory-status');status.setAttribute('role','status');
 const actions=node('div',undefined,'actions');const nav=node('div',undefined,'memory-tabs');
 const list=node('div',undefined,'memory-list'),detail=node('section',undefined,'memory-detail');
 host.append(heading,info,status,actions,nav,list,detail);
 let section='candidates',timer,activeCandidate=null;
 const get=async(action,params={})=>api('/api/memory/'+action+'?'+new URLSearchParams(params));
 const post=(action,body)=>api('/api/memory/'+action,body);
 const act=(text,fn)=>{const b=node('button',text,'secondary');b.onclick=()=>busy(b,fn);return b;};
 actions.append(act('导入已有知识待复核',async()=>{const r=await post('import-existing',{});notice('已创建 '+r.candidates+' 个待复核候选');await refresh();}),act('扫描资料变化',async()=>{await post('scan',{});await refresh();}),act('启用当前模型后台处理',async()=>{await post('configure',{model:generationConfig(),enabled:true});await refresh();}),act('暂停后台处理',async()=>{await post('configure',{enabled:false});await refresh();}));
 const labels={sources:'来源',jobs:'任务',candidates:'待审核',assets:'知识与 Skill',feedback:'使用反馈',agents:'Agent 接入',team:'团队共享',embedding:'检索设置'};
 for(const [key,label] of Object.entries(labels)){const b=act(label,async()=>{section=key;detail.replaceChildren();await refresh();});nav.append(b);b.dataset.section=key;}
 const stateLabels={queued:'排队',running:'提炼中',review:'待审核',paused:'已暂停',retry:'等待重试',failed:'失败',cancelled:'已取消',pending:'待审核',published:'已入库',ignored:'已忽略'};
 async function refresh(){
  const s=await get('status');
  const rows=['team','embedding'].includes(section)?[]:await get(section);
  status.textContent=`${s.model_configured?'后台模型已配置':'尚未配置后台模型'} · ${s.config.enabled?'自动处理已开启':'自动处理暂停'} · 今日任务 ${s.usage.tasks||0}/${s.config.limits.tasks} · 调用 ${s.usage.calls||0}/${s.config.limits.calls} · 预算占用输入 ${s.usage.input_tokens||0} / 输出 ${s.usage.output_tokens||0} token（保守预留） · 知识库：${s.knowledge}`;
  nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.section===section));list.replaceChildren();
  if(section==='agents')agentForm();
  if(section==='team'){teamForm();return;}
  if(section==='embedding'){embeddingForm(s);return;}
  if(!rows.length)list.append(node('p','暂无记录。扫描后可选择来源生成候选。','muted'));
  for(const r of rows){const row=node('article',undefined,'memory-row');row.append(node('strong',r.title||r.path||r.id),node('p',[stateLabels[r.state]||r.state,r.classification,r.kind,r.progress,r.reason,r.error,r.stale?'来源待复核':''].filter(Boolean).join(' · '),'muted'));
   if(section==='sources'&&r.hash)row.append(act('生成候选',async()=>{await post('enqueue',{paths:[r.path]});section='jobs';await refresh();}));
   if(section==='candidates')row.append(act('查看与审核',()=>review(r.id)));
   if(section==='jobs'&&!['review','cancelled'].includes(r.state))for(const [label,action] of [['暂停','pause'],['重试','retry'],['取消','cancel']])row.append(act(label,async()=>{await post('task',{id:r.id,action});await refresh();}));
   if(section==='agents')row.append(act('撤销凭据',async()=>{await post('agent-revoke',{id:r.id});await refresh();}));
   if(section==='assets'){if(r.kind==='skill')row.append(act('导出 Skill',async()=>{const s=await get('skill-export',{id:r.id});const url=URL.createObjectURL(new Blob([s.content],{type:'text/markdown'}));const a=node('a');a.href=url;a.download='SKILL.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));row.append(act('打开',()=>window.LithosKnowledge.open(r.path,true)),act(r.locked?'解除锁定':'锁定',async()=>{await post('lock',{id:r.id,locked:!r.locked});await refresh();}));for(const [label,verdict] of [['已采用','used'],['已过期','stale'],['无效','invalid']])row.append(act(label,async()=>{await post('feedback',{asset:r.id,verdict});notice('反馈已记录');}));}
   list.append(row);
  }
 }
 async function review(id){
  const r=await get('candidate',{id});activeCandidate=id;detail.replaceChildren(node('h2',r.title));
  const output=node('article',undefined,'markdown');renderMarkdown(output,r.body);detail.append(output);
  const evidence=node('details');evidence.append(node('summary','来源证据（逐条核对）'));
  for(const s of r.sources)evidence.append(node('h3',`[${s.ref}] ${s.path} · 字符 ${s.start}—${s.end}`),node('pre',s.text));detail.append(evidence);
  const diff=node('details');diff.append(node('summary','与已有知识的差异'),node('pre',r.diff));detail.append(diff);
  if(r.state!=='pending')return;
  const editing=node('details');editing.append(node('summary','修改候选正文'));
  const editor=node('textarea');editor.value=r.body;editor.rows=14;editor.setAttribute('aria-label','候选正文');editing.append(editor,act('保存候选修改',async()=>{await post('edit-candidate',{id,content:editor.value,revision:r.body_revision});await review(id);notice('候选已保存，尚未正式入库');}));detail.append(editing);
  const unverified=node('input');unverified.type='checkbox';if(!r.sources.length){const warning=node('label','以待验证知识保存；无项目证据，不标记已验证');warning.prepend(unverified);detail.append(warning);}
  const folder=node('input');folder.placeholder='入库子目录，留空为知识库根目录';folder.setAttribute('aria-label','候选入库目录');
  const check=node('input');check.type='checkbox';const label=node('label','已核对证据、关键结论与适用边界');label.prepend(check);detail.append(folder,label);
  for(const [name,action] of [['新增知识','new'],['更新已有知识','update'],['保留双方','keep-both'],['忽略','ignore']]){const b=act(name,async()=>{if(!check.checked)throw Error('请先完成审核');await post('review',{id,action,folder:folder.value,reviewed:true,accept_unverified:unverified.checked,key:'review_'+id+'_'+action});await refresh();await review(id);});b.disabled=action==='update'&&!r.target;detail.append(b);}
  detail.scrollIntoView({block:'start'});
 }
 function field(parent,label,type='text',value=''){const wrap=node('label',label),input=node('input');input.type=type;input.value=value;wrap.append(input);parent.append(wrap);return input;}
 function agentForm(){
  const form=node('section',undefined,'memory-form');form.append(node('h2','创建项目专用 Agent 凭据'));
  const name=field(form,'客户端名称'),project=field(form,'项目标识'),assets=field(form,'允许访问的资产 ID（逗号分隔）');
  const retain=field(form,'保留经过代理的会话 30 天，用于提炼','checkbox');retain.checked=true;
  form.append(act('创建凭据',async()=>{const r=await post('agent-create',{name:name.value,project:project.value,assets:assets.value.split(',').map(s=>s.trim()).filter(Boolean),retain:retain.checked});const output=node('pre',JSON.stringify(r,null,2));form.append(output,node('p','令牌仅此次显示。独立网关默认监听本机 8770；MCP /mcp，模型接口 /v1。','muted'));}));list.append(form);
 }
 function teamForm(){
  const form=node('section',undefined,'memory-form');form.append(node('h2','连接团队服务'),node('p','仅显式发布已审核资产与选定证据；项目原件和模型 Key 不同步。','muted'));
  const endpoint=field(form,'团队服务地址'),team=field(form,'团队 ID'),username=field(form,'账号'),password=field(form,'密码','password');form.append(act('登录团队',async()=>{await post('team-login',{endpoint:endpoint.value,team:team.value,name:username.value,password:password.value});password.value='';notice('团队登录成功');}));const token=field(form,'或填写已有团队登录令牌','password');form.append(act('保存本机连接',async()=>{await post('team-configure',{endpoint:endpoint.value,token:token.value});token.value='';notice('团队连接已保存在本机');}));
  const asset=field(form,'要共享的本地资产 ID');const preview=node('pre');let previewHash='';form.append(act('预览共享内容',async()=>{const data=await post('team-preview',{id:asset.value,excerpts:[]});previewHash=data.preview_hash;preview.textContent=JSON.stringify(data,null,2);}));
  const approved=field(form,'我已核对将发送的正文，明确发布到团队','checkbox');form.append(act('发布到团队',async()=>{if(!approved.checked||!preview.textContent)throw Error('请先预览并确认共享');const r=await post('team-publish',{id:asset.value,confirmed:true,excerpts:[],preview_hash:previewHash});notice('已发布团队资产：'+r.id);}),preview);
  form.append(act('查看团队资产',async()=>{const rows=await get('team-assets');detail.replaceChildren(node('h2','团队资产'));for(const r of rows){const item=node('p',r.title+' · '+r.id);item.append(act('撤销共享',async()=>{await post('team-revoke',{id:r.id});notice('已撤销共享');}));detail.append(item);}}));list.append(form);
 }
 function embeddingForm(s){const form=node('section',undefined,'memory-form');form.append(node('h2','混合检索'),node('p','默认中文分词与 BM25；启用后使用当前供应商的向量接口，调用用量单独记录。','muted'));const model=field(form,'Embedding 模型 ID','text',s.config.embedding?.model||'');form.append(act('启用向量检索',async()=>{await post('configure',{embedding:{enabled:true,model:model.value}});notice('已启用；首次请建立向量索引');}),act('建立向量索引',async()=>{const r=await post('index-vectors',{});notice('已索引 '+r.indexed+' 个片段');}),act('仅使用本地检索',async()=>{await post('configure',{embedding:{enabled:false,model:model.value}});notice('已切回本地检索');}));const budgetFields={};form.append(node('h2','每日自动处理限额'));for(const [key,label] of Object.entries({tasks:'变更任务',calls:'提炼调用',input_tokens:'输入 token 预留',output_tokens:'输出 token 预留'}))budgetFields[key]=field(form,label,'number',String(s.config.limits[key]));form.append(act('保存限额',async()=>{await post('configure',{limits:Object.fromEntries(Object.entries(budgetFields).map(([key,input])=>[key,Number(input.value)]))});notice('预算已保存');}));list.append(form);}
 function open(){W.page('memory');refresh().catch(e=>notice(e.message));}
 C.register('memory',{label:'记忆中心',icon:'history',run:open});const ribbon=document.querySelector('.header');ribbon.querySelector('[data-command=distill]').after(C.button('memory'));
 const projectButton=act('生成可复用知识候选',async()=>{if(!state.project||!state.selected.size)throw Error('请先勾选来源资料');const config=await get('status');if(!config.model_configured)await post('configure',{model:generationConfig(),enabled:true});await post('enqueue',{paths:[...state.selected].map(p=>(state.projects.find(x=>x.id===state.project.id)?.source_prefix||'.')+'/'+p),focus:$('focus').value});open();});
 $('prepare').after(projectButton);
 document.addEventListener('lithos-page-render',e=>{clearInterval(timer);if(e.detail==='memory'){refresh().catch(e=>notice(e.message));timer=setInterval(()=>{if(!['agents','team','embedding'].includes(section))refresh().catch(()=>{});},5000);}});
})();
