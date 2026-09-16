'use strict';
// Shared content patterns for existing tools. Business handlers keep their original DOM nodes.
(() => {
 const K=window.LithosKnowledge,W=window.LithosWorkspace,C=window.LithosCommands;
 const button=(label,fn,cls='subtle')=>{const b=node('button',label,cls);b.type='button';b.onclick=()=>Promise.resolve().then(fn).catch(e=>notice(e.message));return b;};
 document.body.classList.add('obsidian-pages');
 const grid=document.querySelector('.work-grid'),sources=document.querySelector('.sources'),editor=document.querySelector('.editor-panel');
 const model=document.querySelector('.project-model-bar');
 const files=node('section',undefined,'obs-files');files.setAttribute('aria-label','项目资料列表');
 files.append(sources.querySelector('.section-head'),$('doc-search'),$('doc-list'),$('doc-warning'));
 const context=node('aside',undefined,'obs-project-context');context.setAttribute('aria-label','项目辅助面板');
 const evidence=node('details',undefined,'obs-inspector-section');evidence.open=true;evidence.append(node('summary','来源资料'),files);
 const projectActions=node('section',undefined,'obs-project-actions');projectActions.append(node('h3','项目 → 技术知识库'),node('p','勾选项目资料 → AI 提炼草稿 → 人工审核入库。点击入口不会立即发送资料。','muted'),button('AI 沉淀到知识库',startDistill,'primary'),button('新建知识草稿',()=>$('manual-draft').click()),button('查看历史草稿',()=>$('load-drafts').click()),button('新建项目',()=>$('create-dialog').showModal()));
 const modelDetails=node('details',undefined,'obs-inspector-section');modelDetails.append(node('summary','本次模型'),model);
 const goalDetails=node('details',undefined,'obs-inspector-section');goalDetails.open=true;goalDetails.append(node('summary','提炼与生成'),sources);
 context.append(projectActions,goalDetails,modelDetails,evidence);grid.append(context);
 function startDistill(){return C.run('distill');}
 document.addEventListener('lithos-distill-open',()=>{goalDetails.open=true;modelDetails.open=true;evidence.open=true;context.scrollTop=0;if(!state.selected.size)notice('请先在来源资料中勾选文件，再预览内容并调用 AI。');$('focus').focus({preventScroll:true});});
 const aiAction=button('AI 沉淀到知识库',startDistill,'primary');aiAction.id='project-ai-distill';document.querySelector('.project-head').append(aiAction);
 const aiHint=node('p','选择资料后预览发送内容，再调用已配置模型生成草稿；审核通过才写入技术知识库。','small muted');$('prepare').before(aiHint);
 const startCard=node('section',undefined,'distill-start-card');startCard.append(node('h3','AI 提炼项目经验'),node('p','1. 确认来源资料　2. 预览并调用模型　3. 审核入库','muted'));
 const previewAction=button('预览资料并准备 AI 生成',()=>{goalDetails.open=true;if(!state.selected.size){evidence.open=true;files.scrollIntoView({block:'nearest'});notice('请先勾选来源资料。');return;}$('prepare').click();},'primary');startCard.append(previewAction);$('draft-empty').append(startCard);
 for(const b of document.querySelectorAll('.project-head>button'))if(b.textContent.includes('收起 / 展开'))b.remove();
 document.querySelector('#draft-empty h3').textContent='开始一篇知识草稿';
 document.querySelector('#draft-empty p').textContent='选择来源资料后调用模型，或手动编写。审核前保持草稿状态。';
 document.querySelector('#guide .page-heading h1').textContent='使用指南';
 document.querySelector('#home .home-intro h1').textContent='工作区总览';
 document.querySelector('#home .home-intro .muted').textContent='项目、知识与待审核草稿。';
 function syncProject(kind){
  if(!['work','distill'].includes(kind))return;
  const distill=kind==='distill';$('work').classList.toggle('obs-distill-mode',distill);$('work').classList.toggle('obs-project-mode',!distill);
  aiAction.hidden=distill;
  if(distill){evidence.append(files);grid.prepend(editor);}else{grid.prepend(files);}
  projectActions.hidden=distill;evidence.hidden=!distill;modelDetails.hidden=!distill;goalDetails.hidden=!distill;editor.hidden=!distill;
  if(distill&&state.generating)goalDetails.open=true;
 }
 document.addEventListener('lithos-page-render',e=>syncProject(e.detail));
 const oldDisplayDraft=displayDraft;
 displayDraft=function(draft){oldDisplayDraft(draft);W.page('distill');};

 // Settings: searchable category rail and one consistent active selection.
 const settingsNav=document.querySelector('.settings-tabs');
 const search=node('input');search.type='search';search.placeholder='搜索设置…';search.setAttribute('aria-label','搜索设置');settingsNav.prepend(search);
 const hint=node('p','设置仅在本机保存','obs-settings-caption');search.after(hint);
 const tabs=[...settingsNav.querySelectorAll('button')];
 const keywords={appearance:'主题 字号 深色 浅色 跟随系统',data:'资料 根目录 端口 工作区',models:'供应商 API Key 模型 接口 effort',application:'关于 版本 离线 备份',account:'GitHub Google Apple OAuth 登录'};
 const names={data:'文件与工作区',models:'模型与供应商',application:'关于'};
 for(const [index,tab] of tabs.entries()){
  if(names[tab.dataset.setting])tab.textContent=names[tab.dataset.setting];
  tab.dataset.settingsKey=tab.dataset.setting||'extension-'+index;
  tab.addEventListener('click',()=>{tabs.forEach(t=>{t.classList.toggle('active',t===tab);t.setAttribute('aria-current',t===tab?'page':'false');});K.ui.prefs.settingsCategory=tab.dataset.settingsKey;K.persist();});
 }
 search.oninput=()=>{const q=search.value.trim().toLowerCase();let count=0;for(const tab of tabs){const text=tab.textContent+' '+(keywords[tab.dataset.setting]||'')+' '+(tab.textContent.includes('日记')?'模板 日期 笔记 插入':'')+' '+(tab.textContent.includes('历史')?'搜索 索引 扫描 恢复 版本':'');tab.hidden=!text.toLowerCase().includes(q);if(!tab.hidden)count++;}hint.textContent=count?'设置仅在本机保存':'没有匹配的设置';};
 search.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();tabs.find(t=>!t.hidden)?.click();}};
 const settingModal=document.querySelector('.ws-settings-modal');
 const observer=new MutationObserver(()=>{if(!settingModal.open)return;search.value='';search.oninput();const selected=tabs.find(t=>t.dataset.settingsKey===K.ui.prefs.settingsCategory);if(selected)selected.click();});observer.observe(settingModal,{attributes:true,attributeFilter:['open']});
 // Provider editing is a settings subpage, not another card appended below the list.
 const providerForm=$('settings-model-form');const back=button('返回供应商列表',()=>$('provider-cancel').click());back.classList.add('obs-back');providerForm.prepend(back);
 const providerMode=()=>{$('setting-models').classList.toggle('obs-provider-edit',!providerForm.hidden);};new MutationObserver(providerMode).observe(providerForm,{attributes:true,attributeFilter:['hidden']});providerMode();

 // Give every small dialog the same Escape/focus-return and heading association.
 let lastFocus=document.activeElement;document.addEventListener('focusin',e=>{if(!e.target.closest('dialog'))lastFocus=e.target;});
 function decorateDialog(dialog){if(dialog.dataset.obsDialog)return;dialog.dataset.obsDialog='true';dialog.addEventListener('close',()=>{if(lastFocus?.isConnected&&!document.querySelector('dialog[open]'))lastFocus.focus();});
  const update=()=>{if(!dialog.open)return;if(dialog===settingModal){dialog.removeAttribute('aria-labelledby');dialog.setAttribute('aria-label','设置');}else{const heading=dialog.querySelector('h2,h3');if(heading){heading.id||='dialog-heading-'+Math.random().toString(36).slice(2);dialog.setAttribute('aria-labelledby',heading.id);}}dialog.classList.toggle('obs-picker',dialog.classList.contains('quick-switcher'));};new MutationObserver(update).observe(dialog,{attributes:true,attributeFilter:['open'],childList:true});update();}
 for(const d of document.querySelectorAll('dialog'))decorateDialog(d);
 new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.nodeType===1){if(n.matches('dialog'))decorateDialog(n);n.querySelectorAll('dialog').forEach(decorateDialog);}}).observe(document.body,{childList:true});

 // Compact editor status, separate from operation results and notifications.
 const metrics=node('span',undefined,'obs-document-metrics');document.querySelector('.status-bar').prepend(metrics);
 let metricsTimer;
 function updateMetrics(){clearTimeout(metricsTimer);metricsTimer=setTimeout(()=>{const t=W.active(),d=K.current();if(t?.kind==='document'&&d?.format==='markdown'){const text=d.content||'';metrics.textContent=(K.ui.mode==='edit'?'编辑':'阅读')+' · '+Array.from(text).length.toLocaleString()+' 字符'+(d.dirty?' · 未保存':'');}else if(t?.kind==='distill'&&state.draft)metrics.textContent='知识草稿 · '+(state.draft.published?'已入库':'待审核');else if(t?.kind==='project-document')metrics.textContent='项目原件 · 只读';else metrics.textContent='';},80);}
 document.addEventListener('lithos-document-state',updateMetrics);document.addEventListener('lithos-page-render',updateMetrics);$('draft-content').addEventListener('input',updateMetrics);
 syncProject(W.active()?.kind);updateMetrics();
})();
