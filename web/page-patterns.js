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
 const projectActions=node('section',undefined,'obs-project-actions');projectActions.append(node('h3','项目 → 技术知识库'),node('p','勾选项目资料 → AI 提炼草稿 → 人工审核入库。点击入口不会立即发送资料。','muted'),button('新建知识草稿',()=>$('manual-draft').click()),button('查看历史草稿',()=>$('load-drafts').click()),button('新建项目',()=>$('create-dialog').showModal()));
 const modelDetails=node('details',undefined,'obs-inspector-section');modelDetails.append(node('summary','本次模型'),model);
 const goalDetails=node('details',undefined,'obs-inspector-section');goalDetails.open=true;goalDetails.append(node('summary','提炼与生成'),sources);
 const left=node('section',undefined,'project-preview-pane');
 const list=node('details',undefined,'project-file-picker');list.open=true;list.append(node('summary','项目资料 · 点击预览，勾选加入沉淀'),files);
 const preview=node('div',undefined,'project-preview-body');preview.append(node('p','从目录或上方资料列表选择文件预览。','muted'));
 const previewHead=node('div',undefined,'section-head');previewHead.append(node('h2','文件预览'));
 const aiHead=node('div',undefined,'section-head');aiHead.append(node('h2','AI 知识沉淀'));
 const focusPane=side=>{grid.dataset.focus=grid.dataset.focus===side?'':side;};
 const addMaterial=button('加入沉淀材料',()=>C.run('material'));previewHead.append(addMaterial);
 previewHead.append(button('展开 / 还原预览',()=>focusPane('preview')));aiHead.append(button('展开 / 还原沉淀',()=>focusPane('ai')));
 left.append(previewHead,list,preview);context.replaceChildren(aiHead,goalDetails,modelDetails,evidence,editor);grid.replaceChildren(left,context);
 // Material selection has one owner; the left picker contains the original list.
 evidence.replaceChildren(node('summary','材料操作'),projectActions);projectActions.querySelector('h3').textContent='材料与草稿';
 const materialCount=node('span',undefined,'badge');aiHead.append(materialCount);const syncCount=()=>{materialCount.textContent=$('selection-count').textContent;};new MutationObserver(syncCount).observe($('selection-count'),{childList:true,subtree:true,characterData:true});syncCount();
 const splitter=node('div',undefined,'project-pane-splitter');splitter.tabIndex=0;splitter.setAttribute('role','separator');splitter.setAttribute('aria-label','调整预览与 AI 沉淀宽度');splitter.setAttribute('aria-orientation','vertical');left.after(splitter);
 let ratio=Number(K.ui.prefs.projectPaneRatio)||.6;
 function resize(value){ratio=Math.max(.15,Math.min(.85,value));grid.style.setProperty('--project-ratio',(ratio*100)+'%');splitter.setAttribute('aria-valuenow',String(Math.round(ratio*100)));splitter.setAttribute('aria-valuemin','15');splitter.setAttribute('aria-valuemax','85');}
 resize(ratio);
 document.addEventListener('lithos-ready',()=>resize(Number(K.ui.prefs.projectPaneRatio)||.6));
 const persistWidth=()=>{K.ui.prefs.projectPaneRatio=ratio;K.persist();};
 splitter.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();splitter.setPointerCapture(e.pointerId);grid.classList.add('project-resizing');};
 splitter.onpointermove=e=>{if(!splitter.hasPointerCapture(e.pointerId))return;const bounds=grid.getBoundingClientRect();resize((e.clientX-bounds.left)/bounds.width);};
 splitter.onpointerup=e=>{if(splitter.hasPointerCapture(e.pointerId))splitter.releasePointerCapture(e.pointerId);grid.classList.remove('project-resizing');persistWidth();};
 splitter.onlostpointercapture=()=>{grid.classList.remove('project-resizing');persistWidth();};
 splitter.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();resize(e.key==='Home'?.15:e.key==='End'?.85:ratio+(e.key==='ArrowLeft'?-.02:.02));persistWidth();};
 splitter.ondblclick=()=>{resize(.6);persistWidth();};
 modelDetails.open=true;let shownPreview='';

 function startDistill(){return C.run('distill');}
 document.addEventListener('lithos-distill-open',()=>{grid.dataset.focus='';goalDetails.open=true;modelDetails.open=true;evidence.open=true;context.scrollTop=0;if(!state.selected.size)notice('请先在来源资料中勾选文件，再预览内容并调用 AI。');$('focus').focus({preventScroll:true});});
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
  if(!['work','distill','project-document'].includes(kind))return;
  $('work').classList.add('project-dual');
  projectActions.hidden=false;evidence.hidden=false;modelDetails.hidden=false;goalDetails.hidden=false;editor.hidden=false;
  const t=W.active();addMaterial.hidden=kind!=='project-document';addMaterial.disabled=t?.file?.evidence===false||!!state.generating;
  if(kind==='project-document'&&state.project?.id===t.project.id){
   const key=t.project.id+':'+t.file.id;
   if(shownPreview!==key){shownPreview=key;preview.replaceChildren();W.renderProject(preview,t);list.open=false;}
  }else if(shownPreview&&!shownPreview.startsWith(state.project?.id+':')){shownPreview='';preview.replaceChildren(node('p','选择文件预览。','muted'));list.open=true;}
 }
 document.addEventListener('lithos-page-render',e=>syncProject(e.detail));
 const oldDisplayDraft=displayDraft;
 displayDraft=function(draft){oldDisplayDraft(draft);if(!['work','distill','project-document'].includes(W.active()?.kind))W.page('distill');grid.dataset.focus='';editor.scrollIntoView({block:'nearest'});};

 // Settings: searchable category rail and one consistent active selection.
 const settingsNav=document.querySelector('.settings-tabs');
 const content=document.querySelector('.settings-content');
 const existing=[...settingsNav.querySelectorAll('button')];
 const byKey=key=>existing.find(b=>b.dataset.setting===key);
 const extension=existing.filter(b=>!b.dataset.setting);
 extension.forEach((b,i)=>b.dataset.settingsKey='extension-'+(existing.indexOf(b)));
 function panel(key,title){const p=node('section',undefined,'setting-panel');p.id='setting-'+key;p.hidden=true;p.append(node('h2',title));content.append(p);const tab=node('button',title,'setting-tab');tab.dataset.setting=key;return {p,tab};}
 function row(parent,title,description,control){const r=node('div',undefined,'setting-row'),label=node('div');label.append(node('h3',title),node('p',description));r.append(label,control);parent.append(r);}
 const refreshToggles=[];
 function toggle(label,read,write){const input=node('input');input.type='checkbox';input.setAttribute('aria-label',label);refreshToggles.push(()=>input.checked=read());input.checked=read();input.onchange=()=>write(input.checked);document.addEventListener('lithos-ready',()=>input.checked=read());return input;}
 const uiPanel=panel('interface','界面');
 row(uiPanel.p,'显示左侧导航','文件、搜索与书签面板。',toggle('显示左侧导航',()=>!K.ui.prefs.sidebarCollapsed,value=>{K.ui.prefs.sidebarCollapsed=!value;document.body.classList.toggle('sidebar-collapsed',!value);K.persist();}));
 row(uiPanel.p,'显示文档辅助栏','查阅文内目录、引用与来源。',toggle('显示文档辅助栏',()=>!K.ui.prefs.infoHidden,value=>{K.ui.prefs.infoHidden=!value;document.body.classList.toggle('ws-info-hidden',!value);K.persist();}));
 row(uiPanel.p,'项目双栏比例','拖动预览和 AI 面板之间的分隔线调宽，双击恢复默认。',button('恢复默认比例',()=>{resize(.6);persistWidth();}));
 const editPanel=panel('editor','编辑器');
 row(editPanel.p,'宽幅阅读','允许知识笔记正文使用更宽的阅读区域。',toggle('宽幅阅读',()=>!!K.ui.prefs.wide,value=>{K.ui.prefs.wide=value;K.elements.host.querySelector('.kb-layout').classList.toggle('kb-wide',value);K.persist();}));
 row(editPanel.p,'保存方式','Ctrl+S 更新文件；停止输入后保存恢复草稿，外部修改会触发冲突检查。',node('span','手动保存','muted'));
 row(editPanel.p,'可编辑资料','知识目录中的 UTF-8 Markdown 可编辑；项目原件、开源资源和 Git 仓库默认只读。',node('span','Markdown','muted'));
 const keyPanel=panel('shortcuts','快捷键');
 keyPanel.p.append(node('p','快捷键与命令面板执行相同操作。当前快捷键为内置配置。','muted'));
 for(const command of C.commands.values())if(command.key)row(keyPanel.p,command.label,'',node('kbd',command.key));
 byKey('application').textContent='关于';$('setting-application').querySelector('h2').textContent='关于 Lithos';
 byKey('data').textContent='文件与链接';$('setting-data').querySelector('h2').textContent='文件与链接';
 $('setting-data').append(node('h3','内部链接'),node('p','支持相对路径和 [[笔记名]]。同名笔记显示候选；关联索引来自实际文件内容。','muted'));
 const groupTitle=text=>node('div',text,'obs-settings-group');
 settingsNav.replaceChildren(groupTitle('选项'),byKey('application'),byKey('appearance'),uiPanel.tab,editPanel.tab,byKey('data'),keyPanel.tab,groupTitle('知识功能'),...extension,groupTitle('Lithos'),byKey('models'));
 if(byKey('account'))settingsNav.append(byKey('account'));
 const search=node('input');search.type='search';search.placeholder='搜索设置…';search.setAttribute('aria-label','搜索设置');settingsNav.prepend(search);
 const hint=node('p','设置仅在本机保存','obs-settings-caption');search.after(hint);
 const tabs=[...settingsNav.querySelectorAll('button')];
 const keywords={interface:'侧栏 导航 辅助栏 宽度 布局',editor:'阅读 编辑 保存 Markdown',shortcuts:'键盘 命令 快捷键',appearance:'主题 字号 深色 浅色 跟随系统',data:'资料 根目录 端口 工作区',models:'供应商 API Key 模型 接口 effort',application:'关于 版本 离线 备份',account:'GitHub Google Apple OAuth 登录'};
 const names={data:'文件与链接',models:'模型与供应商',application:'关于'};
 for(const [index,tab] of tabs.entries()){
  if(names[tab.dataset.setting])tab.textContent=names[tab.dataset.setting];
  tab.dataset.settingsKey=tab.dataset.setting||tab.dataset.settingsKey||'extension-'+index;
  tab.addEventListener('click',()=>{if(tab.dataset.setting)document.querySelectorAll('.setting-panel').forEach(p=>p.hidden=p.id!=='setting-'+tab.dataset.setting);tabs.forEach(t=>{t.classList.toggle('active',t===tab);t.setAttribute('aria-current',t===tab?'page':'false');});K.ui.prefs.settingsCategory=tab.dataset.settingsKey;K.persist();});
 }
 search.oninput=()=>{const q=search.value.trim().toLowerCase();let count=0;for(const tab of tabs){const text=tab.textContent+' '+(keywords[tab.dataset.setting]||'')+' '+(tab.textContent.includes('日记')?'模板 日期 笔记 插入':'')+' '+(tab.textContent.includes('历史')?'搜索 索引 扫描 恢复 版本':'');tab.hidden=!text.toLowerCase().includes(q);if(!tab.hidden)count++;}hint.textContent=count?'设置仅在本机保存':'没有匹配的设置';};
 search.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();tabs.find(t=>!t.hidden)?.click();}};
 const settingModal=document.querySelector('.ws-settings-modal');
 const observer=new MutationObserver(()=>{if(!settingModal.open)return;refreshToggles.forEach(refresh=>refresh());search.value='';search.oninput();const selected=tabs.find(t=>t.dataset.settingsKey===K.ui.prefs.settingsCategory);(selected||byKey('application')).click();});observer.observe(settingModal,{attributes:true,attributeFilter:['open']});
 // Provider editing is a settings subpage, not another card appended below the list.
 const providerForm=$('settings-model-form');const back=button('返回供应商列表',()=>$('provider-cancel').click());back.classList.add('obs-back');providerForm.prepend(back);
 const providerMode=()=>{$('setting-models').classList.toggle('obs-provider-edit',!providerForm.hidden);};new MutationObserver(providerMode).observe(providerForm,{attributes:true,attributeFilter:['hidden']});providerMode();

 // Screenshot-aligned category icons and help landing page.
 const settingsIcons={application:'help',appearance:'settings',interface:'sidebar',editor:'edit',data:'folder',shortcuts:'command',models:'distill',account:'bookmark'};
 for(const tab of tabs){const icon=C.icon(settingsIcons[tab.dataset.setting]||(tab.textContent.includes('日记')?'daily':'history'));icon.classList.add('settings-category-icon');tab.prepend(icon);}
 const helpDialog=document.querySelector('.ws-help-modal'),guide=$('guide');
 const helpLanding=node('section',undefined,'help-landing');
 const hero=node('div',undefined,'help-brand');const logo=node('img');logo.src='/brand.svg';logo.alt='Lithos';
 const version=node('p','本地知识工作台','muted');hero.append(logo,node('h1','Lithos'),version);helpLanding.append(hero);
 const cards=node('div',undefined,'help-resource-card');helpLanding.append(cards);
 const backToHelp=button('返回帮助中心',()=>{guide.hidden=true;helpLanding.hidden=false;});backToHelp.classList.add('help-back');guide.prepend(backToHelp);
 const resource=(icon,title,description,label,action)=>{const item=node('div',undefined,'help-resource-row');const mark=C.icon(icon),text=node('div');text.append(node('h2',title),node('p',description,'muted'));item.append(mark,text,button(label,action));cards.append(item);};
 resource('read','使用指南','了解笔记、链接、搜索和项目知识沉淀的使用方法。','浏览',()=>{helpLanding.hidden=true;guide.hidden=false;guide.scrollTop=0;backToHelp.focus();});
 const external=url=>{const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.click();};
 resource('project','项目主页','查看 Lithos 源码、项目说明和开发进展。','浏览',()=>external('https://github.com/tsungseu/Lithos'));
 resource('help','问题反馈','提交使用问题、Bug 或功能建议。请勿公开密钥及私人资料。','打开',()=>external('https://github.com/tsungseu/Lithos/issues'));
 resource('history','版本与更新','查看已发布版本及更新说明。','浏览',()=>external('https://github.com/tsungseu/Lithos/releases'));
 helpDialog.append(helpLanding);guide.hidden=true;
 new MutationObserver(()=>{if(helpDialog.open){guide.hidden=true;helpLanding.hidden=false;version.textContent='版本 '+($('settings-version').textContent==='—'?'3.6.1':$('settings-version').textContent);}}).observe(helpDialog,{attributes:true,attributeFilter:['open']});
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
