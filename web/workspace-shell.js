'use strict';
// Unified groups contain navigation state, while the knowledge module owns document buffers.
(() => {
 const K=window.LithosKnowledge,C=window.LithosCommands;
 const workspace={groups:[{id:'left',tabs:[],active:null,history:[],position:-1}],group:'left',closed:[]};
 let ready=false,activating=0,serial=0,renderPending=false;
 const stage=node('main',undefined,'ws-stage'),parking=node('div',undefined,'ws-parking');parking.hidden=true;
 document.body.append(stage,parking);document.body.classList.add('obsidian-workspace');
 for(const v of document.querySelectorAll('body>.view'))if(v.id!=='settings')parking.append(v);
 const paneNodes=new Map();
 const group=()=>workspace.groups.find(g=>g.id===workspace.group)||workspace.groups[0];
 const active=()=>group().tabs.find(t=>t.id===group().active);
 function persist(){if(!ready)return;const paths=new Map();for(const g of workspace.groups)for(const t of g.tabs)if(t.kind==='document')paths.set(t.path,{path:t.path,pinned:t.pinned});K.ui.tabs=[...paths.values()];K.ui.prefs.workspace=JSON.parse(JSON.stringify(workspace));K.persist();}
 const title=t=>t.kind==='project-document'?t.file.name:t.kind==='document'?(K.ui.docs.get(t.path)?.title||t.path.split('/').pop()):({blank:'新标签页',graph:'关系图谱',work:'项目空间',distill:'知识沉淀',guide:'使用指南',home:'工作区总览'}[t.kind]||'Lithos');
 function changed(){if(renderPending)return;renderPending=true;requestAnimationFrame(()=>{renderPending=false;render();});}
 function addHistory(g,id){g.locations=g.locations||{};const tab=g.tabs.find(t=>t.id===id);if(tab)g.locations[id]={...tab};if(g.history[g.position]===id)return;g.history=g.history.slice(0,g.position+1);g.history.push(id);g.history=g.history.slice(-100);g.position=g.history.length-1;g.locations=Object.fromEntries(Object.entries(g.locations).filter(([key])=>g.history.includes(key)));}
 function recordScroll(){for(const g of workspace.groups){const t=g.tabs.find(t=>t.id===g.active),pane=paneNodes.get(g.id);if(!t||!pane)continue;t.scroll=(pane.querySelector('.kb-reader')||pane.querySelector('.ws-passive')||pane.querySelector('.view'))?.scrollTop||t.scroll||0;}}
 function ensureGroup(){if(workspace.groups.length<2)workspace.groups.push({id:'right',tabs:[],active:null,history:[],position:-1});return workspace.groups.find(g=>g.id!==workspace.group);}
 async function select(id,gid=workspace.group,history=true){
  recordScroll();workspace.group=gid;const g=group(),t=g.tabs.find(t=>t.id===id);if(!t)return;g.active=id;if(history)addHistory(g,id);
  const seq=++serial;activating++;
  try{if(t.kind==='document'){await K.open(t.path,t.pinned);if(seq!==serial)return;K.elements.reader.scrollTop=t.scroll||0;}else if(t.kind==='graph')K.graph();else if(t.kind==='project-document'){if(state.project?.id!==t.project.id)await chooseProject(t.project);if(seq!==serial)return;originalShowView('work');}else if(t.kind!=='blank')originalShowView(t.kind==='distill'?'work':t.kind);}
  finally{activating--;if(seq===serial){render();if(t.kind==='document')requestAnimationFrame(()=>{K.elements.reader.scrollTop=t.scroll||0;});persist();}}
 }
 function openTab(t,pinned=true){const g=group();let target=g.tabs.find(x=>x.id===t.id);if(!target){if(!pinned&&t.kind==='document'){const old=g.tabs.find(x=>x.kind==='document'&&!x.pinned&&!K.ui.docs.get(x.path)?.dirty);if(old)g.tabs.splice(g.tabs.indexOf(old),1);}target={...t,pinned,scroll:0};g.tabs.push(target);}target.pinned=target.pinned||pinned;g.active=target.id;addHistory(g,target.id);changed();persist();return target;}
 function blank(){const t=openTab({id:'blank:'+Date.now()+':'+Math.random().toString(36).slice(2),kind:'blank'});select(t.id);}
 function page(kind){if(kind==='guide')return help();const t=openTab({id:'page:'+kind,kind});return select(t.id);}
 async function closeTab(id,gid=workspace.group){const g=workspace.groups.find(g=>g.id===gid),t=g?.tabs.find(t=>t.id===id);if(!t)return true;const elsewhere=workspace.groups.some(other=>other!==g&&other.tabs.some(x=>x.id===t.id));if(t.kind==='document'&&!elsewhere){if(!await K.close(t.path))return false;}workspace.closed.unshift({...t});workspace.closed=workspace.closed.slice(0,20);g.tabs=g.tabs.filter(x=>x.id!==id);if(g.active===id)g.active=g.tabs.at(-1)?.id||null;if(!g.tabs.length&&workspace.groups.length>1){workspace.groups=workspace.groups.filter(x=>x!==g);workspace.group=workspace.groups[0].id;}else workspace.group=g.id;if(!group().tabs.length)blank();else await select(group().active);persist();return true;}
 async function closeMany(mode){const g=group(),at=g.tabs.findIndex(t=>t.id===g.active);const list=g.tabs.filter((t,i)=>mode==='right'?i>at:t.id!==g.active).map(t=>t.id);for(const id of list)if(!await closeTab(id,g.id))break;}
 function reopen(){const t=workspace.closed.shift();if(!t)return;openTab(t,true);select(t.id);}
 function move(id,from,to,before){const source=workspace.groups.find(g=>g.id===from),target=workspace.groups.find(g=>g.id===to),t=source?.tabs.find(t=>t.id===id);if(!t||!target)return;source.tabs=source.tabs.filter(x=>x.id!==id);if(!target.tabs.some(x=>x.id===id)){const at=target.tabs.findIndex(x=>x.id===before);target.tabs.splice(at<0?target.tabs.length:at,0,t);}t.pinned=true;if(source.active===id)source.active=source.tabs.at(-1)?.id||null;workspace.groups=workspace.groups.filter(g=>g.tabs.length||g===target);select(id,to);}
 function split(moveIt=false){const t=active();const source=group(),other=ensureGroup();if(!t){workspace.group=other.id;blank();return;}if(moveIt){move(t.id,source.id,other.id);return;}if(!other.tabs.some(x=>x.id===t.id))other.tabs.push({...t,pinned:true});select(t.id,other.id);}
 async function back(delta){const g=group();let pos=g.position+delta;while(pos>=0&&pos<g.history.length&&!g.tabs.some(t=>t.id===g.history[pos])&&!g.locations?.[g.history[pos]])pos+=delta;if(pos<0||pos>=g.history.length)return;g.position=pos;const id=g.history[pos];if(!g.tabs.some(t=>t.id===id))g.tabs.push({...g.locations[id],pinned:true});await select(id,g.id,false);}
 const settingsModal=node('dialog',undefined,'ws-settings-modal');const settingView=$('settings');settingView.classList.remove('view');
 settingView.querySelector('.settings-layout').prepend(K.elements.settingsNav);K.elements.settingsNav.classList.remove('kb-settings-nav');
 const settingsClose=node('button','关闭设置','ws-settings-close');settingsClose.onclick=()=>settingsModal.close();settingsModal.append(settingsClose,settingView);document.body.append(settingsModal);
 let settingsFocus;
 function settings(){settingsFocus=document.activeElement;settingView.hidden=false;loadSettings();if(!settingsModal.open)settingsModal.showModal();settingsClose.focus();}
 settingsModal.addEventListener('close',()=>{if(settingsFocus?.isConnected)settingsFocus.focus();else stage.querySelector('.ws-tab.active button')?.focus();});
 const helpModal=node('dialog',undefined,'ws-help-modal');
 const helpHead=node('div',undefined,'ws-help-header');helpHead.append(node('h2','使用指南'));
 const helpClose=node('button','关闭','subtle');helpClose.setAttribute('aria-label','关闭使用指南');helpClose.onclick=()=>helpModal.close();helpHead.append(helpClose);
 const helpView=$('guide');helpView.classList.remove('view');helpModal.append(helpHead,helpView);helpModal.setAttribute('aria-label','使用指南');document.body.append(helpModal);
 let helpFocus;
 function help(){if(helpModal.open)return;helpFocus=document.activeElement;helpView.hidden=false;helpModal.showModal();helpClose.focus();}
 helpModal.addEventListener('close',()=>{if(helpFocus?.isConnected&&helpFocus.getClientRects().length)helpFocus.focus();else stage.querySelector('.ws-tab.active button')?.focus();});
 const originalShowView=showView;
 showView=function(name){if(name==='guide')return help();if(name==='settings')return settings();if(settingsModal.open)settingsModal.close();originalShowView(name);if(!ready||activating||name==='library')return;if(['home','work','guide'].includes(name))page(name);};
 document.addEventListener('workbench-view',e=>{if(e.detail==='settings')settings();});
 const W=window.LithosWorkspace={blank,page,active,settings,panel:name=>navigation.panel(name),workspace,renderProject:projectReader};
 W.openProject=(project,file)=>{const t=openTab({id:'project:'+project.id+':'+file.id,kind:'project-document',project:{id:project.id,name:project.name,area:project.area,path:project.path},file:{...file},path:file.id},true);return select(t.id);};
 const navigation=window.installLithosNavigation(W);
 document.querySelector('#project-list').addEventListener('click',e=>{if(e.target.closest('.project-item'))page('work');});
 openOffice=function(file){if(state.project)return W.openProject(state.project,file);};
 const register=(id,label,icon,run,enabled,key)=>C.register(id,{label,icon,run,enabled,key});
 const documentActive=()=>active()?.kind==='document';
 const editable=()=>documentActive()&&K.current()?.editable;
 register('sidebar','切换左侧边栏','sidebar',()=>{document.body.classList.toggle(matchMedia('(max-width:900px)').matches?'mobile-explorer':'sidebar-collapsed');K.ui.prefs.sidebarCollapsed=document.body.classList.contains('sidebar-collapsed');K.persist();});
 register('quick','快速切换','search',()=>switcher(false),null,'Ctrl+O');
 register('graph','关系图谱','graph',()=>page('graph'));
 register('commands','命令面板','command',()=>switcher(true),null,'Ctrl+P');
 register('project','项目空间','project',()=>{navigation.panel('files');page('work');});
 register('new-project','新建项目','project',()=>{$('create-dialog').showModal();});
 async function startDistill(){
  const t=active();
  if(state.generating){await page('distill');return;}
  if(t?.kind==='project-document'){
   if(t.file.evidence===false){notice('此格式仅支持阅读，暂不支持 AI 提炼。请选择 Markdown、TXT、DOCX 或文字型 PDF。');return;}
   if(state.project?.id!==t.project.id){await chooseProject(t.project);if(state.project?.id!==t.project.id)return;}
   if(!state.files.some(f=>f.id===t.file.id&&f.evidence!==false)){notice('当前资料不在可提炼清单中，请刷新项目资料后重试。');return;}
   state.selected.add(t.file.id);state.preview=null;$('preview-dialog').hidden=true;renderDocuments();
  }
  if(active()?.kind!=='project-document')await page('distill');document.dispatchEvent(new Event('lithos-distill-open'));
 }
 register('distill','知识沉淀','distill',startDistill);
 register('help','帮助','help',()=>page('guide'));
 register('overview','工作区总览','project',()=>page('home'));
 register('settings','设置','settings',settings,null,'Ctrl+,');
 register('blank','新标签页','plus',blank,null,'Ctrl+T');
 register('back','后退','back',()=>back(-1),()=>group().position>0,'Alt+Left');
 register('forward','前进','forward',()=>back(1),()=>group().position<group().history.length-1,'Alt+Right');
 register('other','在另一标签组打开','split',()=>split(false));
 register('split','左右分栏','split',()=>split(false));
 register('move','移至另一标签组','split',()=>split(true));
 register('switch-group','切换标签组','split',()=>{const other=workspace.groups.find(g=>g!==group());if(other?.active)select(other.active,other.id);},()=>workspace.groups.length>1);
 register('pin','固定 / 取消固定标签','bookmark',()=>{const t=active();if(t)t.pinned=K.ui.docs.get(t.path)?.dirty?true:!t.pinned;changed();persist();},()=>!!active());
 register('reveal','定位文件','reveal',()=>{navigation.panel('files');K.reveal(active().path);},documentActive);
 register('find','文内查找','search',find,documentActive,'Ctrl+F');
 register('copy','复制路径','file',async()=>{const t=active(),root=t.kind==='project-document'?t.project.path:(await K.get('browse')).root;await navigator.clipboard.writeText(root.replace(/[\\/]$/,'')+'/'+t.path);notice('已复制路径');},()=>documentActive()||active()?.kind==='project-document');
 register('download','下载原件','download',()=>{const a=node('a'),t=active();a.href=t.kind==='project-document'?'/api/project-file?'+new URLSearchParams({project:t.project.id,file:t.file.id}):'/api/library-download?path='+encodeURIComponent(t.path);a.download=title(t);a.click();},()=>documentActive()||active()?.kind==='project-document');
 register('reload','重新读取','history',()=>K.reload(),documentActive);
 register('save','保存','save',()=>['work','distill','project-document'].includes(active()?.kind)?saveProjectDraft():K.save(),()=>editable()||(['work','distill','project-document'].includes(active()?.kind)&&!!state.draft&&!state.draft.published&&!state.generating),'Ctrl+S');
 register('mode','阅读 / 编辑','edit',()=>K.mode(K.ui.mode==='edit'?'read':'edit'),editable);
 register('history','查看历史','history',()=>K.showHistory(K.current()),editable);
 register('favorite','收藏 / 取消收藏','bookmark',()=>K.favorite(active().path),documentActive);
 register('wide','适应宽度','read',()=>{K.elements.host.querySelector('.kb-layout').classList.toggle('kb-wide');K.ui.prefs.wide=K.elements.host.querySelector('.kb-layout').classList.contains('kb-wide');K.persist();},documentActive);
 register('focus','专注阅读','read',()=>document.body.classList.toggle('kb-focus'));
 register('info','切换辅助栏','sidebar',()=>{document.body.classList.remove('ws-show-info');document.body.classList.toggle('ws-info-hidden');K.ui.prefs.infoHidden=document.body.classList.contains('ws-info-hidden');K.persist();},documentActive);
 register('source','查看来源证据','project',()=>{K.elements.info.classList.add('ws-evidence');document.body.classList.remove('ws-info-hidden');document.body.classList.add('ws-show-info');K.elements.info.scrollTop=K.elements.info.scrollHeight;},documentActive);
 const closeInfo=node('button','关闭辅助栏','ws-close-info');closeInfo.onclick=()=>{document.body.classList.remove('ws-show-info');document.body.classList.add('ws-info-hidden');};document.body.append(closeInfo);
 register('material','加入沉淀材料','distill',startDistill,()=>active()?.kind==='project-document'&&active().file.evidence!==false&&!state.generating);
 register('close','关闭当前标签','close',()=>closeTab(group().active),()=>!!active(),'Ctrl+W');
 register('close-others','关闭其他标签','close',()=>closeMany('others'));
 register('close-right','关闭右侧标签','close',()=>closeMany('right'));
 register('reopen','重新打开已关闭标签','history',reopen,()=>workspace.closed.length>0,'Ctrl+Shift+T');
 const ribbon=document.querySelector('.header');ribbon.replaceChildren();ribbon.setAttribute('aria-label','功能栏');
 for(const id of ['sidebar','quick','graph','daily','template','commands','project','distill','help','settings']){if(id==='project')ribbon.append(node('hr'));if(id==='help')ribbon.append(node('div',undefined,'ws-ribbon-space'));ribbon.append(C.button(id));}
 const menu=node('dialog',undefined,'ws-menu');document.body.append(menu);let menuFocus;
 function more(){menuFocus=document.activeElement;menu.replaceChildren();for(const section of [['打开与布局','other','split','move','pin','reveal'],['文档操作','find','copy','download','reload','wide','favorite','focus','info'],['知识维护','save','history'],['项目沉淀','material','source'],['标签管理','close','close-others','close-right','reopen']]){menu.append(node('small',section[0]));for(const id of section.slice(1)){const b=C.button(id,false);b.onclick=()=>{menu.close();C.run(id);};menu.append(b);}}menu.showModal();menu.querySelector('button:not(:disabled)')?.focus();}
 menu.addEventListener('close',()=>menuFocus?.isConnected&&menuFocus.focus());menu.addEventListener('click',e=>{if(e.target===menu)menu.close();});
 menu.addEventListener('keydown',e=>{if(!['ArrowDown','ArrowUp'].includes(e.key))return;e.preventDefault();const choices=[...menu.querySelectorAll('button:not(:disabled)')],i=choices.indexOf(document.activeElement);choices[(i+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length]?.focus();});
 register('more','更多选项','more',more);
 function passive(pane,t){
  const content=node('div',undefined,'ws-passive');pane.append(content);
  if(!t)return;
  if(t.kind==='document'){const d=K.ui.docs.get(t.path);const article=node('article',undefined,'markdown kb-article');if(d?.format==='markdown')renderMarkdown(article,d.content,target=>{workspace.group=pane.dataset.group;K.open(t.path,true).then(()=>K.get('resolve',{path:t.path,target})).then(r=>r.candidates.length===1?K.open(r.candidates[0],true):notice('请在活动阅读器选择链接目标'));});else article.append(node('h2',title(t)),node('p','点击此标签启用原件阅读器。'));content.append(article);}
  else content.append(node('h2',title(t)),node('p','点击标签继续操作；页面中的资料选择和草稿仍保留。'));
  const activate=node('button','激活此标签组','ws-activate');activate.onclick=()=>select(t.id,pane.dataset.group);content.prepend(activate);content.scrollTop=t.scroll||0;
  content.onscroll=()=>{t.scroll=content.scrollTop;persist();};
 }
 function render(){
  if(!ready)return;
  for(const view of document.querySelectorAll('.ws-pane .view'))parking.append(view);
  stage.replaceChildren();paneNodes.clear();stage.classList.toggle('ws-split',workspace.groups.length===2);
  for(const g of workspace.groups){const pane=node('section',undefined,'ws-pane'+(g===group()?' is-active':''));pane.dataset.group=g.id;paneNodes.set(g.id,pane);stage.append(pane);
   const tabs=node('div',undefined,'ws-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label',(g.id==='left'?'左':'右')+'侧标签组');pane.append(tabs);
   for(const t of g.tabs){if(K.ui.docs.get(t.path)?.dirty)t.pinned=true;const wrap=node('div',undefined,'ws-tab'+(t.id===g.active?' active':'')+(!t.pinned?' preview':''));wrap.draggable=true;wrap.dataset.id=t.id;
    const open=node('button',title(t)+(K.ui.docs.get(t.path)?.dirty?' ●':''));open.setAttribute('role','tab');open.setAttribute('aria-selected',String(t.id===g.active));open.title=t.path||title(t);open.onclick=()=>select(t.id,g.id);open.ondblclick=()=>{t.pinned=true;persist();changed();};
    const close=node('button',undefined,'ws-icon ws-tab-close');close.append(C.icon('close'));close.setAttribute('aria-label','关闭 '+title(t));close.onclick=()=>closeTab(t.id,g.id);wrap.append(open,close);tabs.append(wrap);
    wrap.ondragstart=e=>e.dataTransfer.setData('application/lithos-tab',JSON.stringify({id:t.id,group:g.id}));wrap.ondragover=e=>e.preventDefault();wrap.ondrop=e=>{e.preventDefault();e.stopPropagation();try{const data=JSON.parse(e.dataTransfer.getData('application/lithos-tab'));move(data.id,data.group,g.id,t.id);}catch(_) {}};
    wrap.oncontextmenu=e=>{e.preventDefault();select(t.id,g.id).then(more);};
   }
   const plus=C.button('blank');plus.onclick=()=>{workspace.group=g.id;blank();};tabs.append(plus);tabs.ondragover=e=>e.preventDefault();tabs.ondrop=e=>{e.preventDefault();try{const data=JSON.parse(e.dataTransfer.getData('application/lithos-tab'));move(data.id,data.group,g.id);}catch(_) {}};
   const toolbar=node('div',undefined,'ws-document-tools');pane.append(toolbar);for(const [id,delta] of [['back',-1],['forward',1]]){const b=C.button(id);b.disabled=delta<0?g.position<=0:g.position>=g.history.length-1;b.onclick=()=>{workspace.group=g.id;back(delta);};toolbar.append(b);}
   const t=g.tabs.find(t=>t.id===g.active);toolbar.append(node('span',t?.path|| (t?title(t):''),'ws-document-title'));
   if(t?.kind==='document'){const d=K.ui.docs.get(t.path);const mode=node('button',undefined,'ws-icon');mode.append(C.icon(K.ui.mode==='edit'&&g===group()?'read':'edit'));mode.title=d?.editable?'阅读 / 编辑':'适应宽度';mode.setAttribute('aria-label',mode.title);mode.onclick=async()=>{if(g!==group())await select(t.id,g.id);C.run(d?.editable?'mode':'wide');};toolbar.append(mode);}
   if(t?.kind==='graph'){const b=node('button','图谱设置','subtle');b.onclick=()=>{select(t.id,g.id).then(()=>document.querySelector('#graph-depth')?.focus());};toolbar.append(b);}
   if(workspace.groups.length>1){const switchGroup=C.button('switch-group');switchGroup.classList.add('ws-switch-group');toolbar.append(switchGroup);}
   const moreButton=C.button('more');moreButton.onclick=()=>{if(g!==group())select(t.id,g.id).then(more);else more();};toolbar.append(moreButton);
   if(g!==group()){passive(pane,t);continue;}
   if(!t||t.kind==='blank'){const empty=node('div',undefined,'ws-blank');empty.append(node('img'));empty.firstChild.src='/brand.svg';empty.firstChild.alt='曜石';empty.append(node('h1','曜石 · Lithos'),node('p','打开资料，继续积累知识。','muted'),C.button('quick',false),C.button('new-note',false));const recent=node('div',undefined,'ws-recent');recent.append(node('h3','最近访问'));for(const path of K.ui.prefs.recent.slice(0,8)){const b=node('button',path);b.onclick=()=>K.open(path,true);recent.append(b);}empty.append(recent);pane.append(empty);}
   else if(t.kind==='project-document'){const view=$('work');view.hidden=false;pane.append(view);}
   else{const view=$(t.kind==='document'||t.kind==='graph'?'library':t.kind==='distill'?'work':t.kind);if(view){view.hidden=false;pane.append(view);}}
  }
  document.body.dataset.view=active()?.kind==='document'||active()?.kind==='graph'?'library':active()?.kind;document.dispatchEvent(new CustomEvent('lithos-page-render',{detail:active()?.kind}));
 }
 async function projectReader(pane,t){const content=node('div',undefined,'ws-passive');pane.append(content);content.append(node('p','项目原件 · 只读','small muted'));try{const response=await fetch('/api/project-file?'+new URLSearchParams({project:t.project.id,file:t.file.id}));if(!response.ok)throw Error((await response.json()).error);const buffer=await response.arrayBuffer();if(!content.isConnected)return;if(/\.(md|txt|log|json|yaml|yml|csv)$/i.test(t.file.name)){const article=node('article',undefined,'markdown kb-article'),text=new TextDecoder().decode(buffer);if(/\.md$/i.test(t.file.name))renderMarkdown(article,text,()=>notice('项目链接请从项目资料列表打开'));else article.append(node('pre',text));content.append(article);}else{const frame=node('iframe',undefined,'kb-office');frame.title=t.file.name;frame.sandbox='allow-scripts';frame.src='/office-frame.html';const send=e=>{if(e.source!==frame.contentWindow||e.data?.type!=='office-ready')return;window.removeEventListener('message',send);if(frame.isConnected)frame.contentWindow.postMessage({type:'office-document',name:t.file.name,buffer},'*',[buffer]);};window.addEventListener('message',send);frame.addEventListener('load',()=>setTimeout(()=>window.removeEventListener('message',send),10000),{once:true});content.append(frame);}content.scrollTop=t.scroll||0;content.onscroll=()=>{t.scroll=content.scrollTop;persist();};}catch(e){content.append(node('p','无法读取原件：'+e.message));}}
 const quick=node('dialog',undefined,'quick-switcher ws-switcher');document.body.append(quick);let quickSeq=0;
 function switcher(command){quick.replaceChildren();const input=node('input'),results=node('div');input.type='search';input.placeholder=command?'输入命令名称…':'搜索知识文件或项目…';input.setAttribute('aria-label',command?'命令面板':'快速切换');quick.append(input,results);const cancel=node('button','关闭');cancel.onclick=()=>quick.close();quick.append(cancel,node('p','↑ ↓ 导航　 Enter 打开　 Esc 退出','obs-picker-help'));
  async function update(){const seq=++quickSeq,q=input.value.trim();results.replaceChildren();const choices=command?[...C.commands].filter(([,c])=>c.enabled?.()!==false&&c.label.includes(q)).map(([id,c])=>({label:c.label,key:c.key,run:()=>C.run(id)})):state.projects.filter(p=>p.name.toLowerCase().includes(q.toLowerCase())).map(p=>({label:'项目 · '+p.name,run:()=>{page('work');chooseProject(p);}}));if(!command){const r=await K.get('search',{q,kind:'name'});if(seq!==quickSeq)return;choices.unshift(...r.items.slice(0,30).map(t=>({label:t.id,run:()=>K.open(t.id,true)})));}for(const item of choices.slice(0,40)){const b=node('button',item.label,'switcher-result');if(item.key)b.append(node('kbd',item.key));b.onclick=()=>{quick.close();item.run();};results.append(b);}if(!choices.length)results.append(node('p','没有匹配项','muted'));}
  input.oninput=()=>update().catch(e=>notice(e.message));quick.onkeydown=e=>{const choices=[...results.querySelectorAll('button')],i=choices.indexOf(document.activeElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();choices[Math.max(0,Math.min(choices.length-1,i+(e.key==='ArrowDown'?1:-1)))]?.focus();}if(e.key==='Enter'&&document.activeElement===input){e.preventDefault();choices[0]?.click();}};quick.showModal();input.focus();update().catch(e=>notice(e.message));
 }
 function find(){
  const editor=K.elements.reader.querySelector('.kb-editor'),article=K.elements.reader.querySelector('article');if(!editor&&!article)return;
  const box=node('dialog',undefined,'ws-find'),input=node('input'),hint=node('p',undefined,'small muted');input.setAttribute('aria-label','文内查找');input.placeholder='查找当前文档';let offset=0,last='';
  const next=node('button','下一个');next.onclick=()=>{const q=input.value.toLowerCase();if(!q)return;if(last!==q){offset=0;last=q;}const nodes=[];if(article){const walker=document.createTreeWalker(article,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode())nodes.push(n);}const content=editor?editor.value:nodes.map(n=>n.data).join('');let at=content.toLowerCase().indexOf(q,offset);if(at<0)at=content.toLowerCase().indexOf(q);if(at<0){hint.textContent='没有匹配';return;}offset=at+q.length;hint.textContent='已定位，继续查找可从头循环';if(editor){editor.setSelectionRange(at,offset);editor.scrollTop=editor.value.slice(0,at).split('\n').length*24-100;}else{let cursor=0,startNode,endNode,startOffset,endOffset;for(const n of nodes){if(!startNode&&cursor+n.length>at){startNode=n;startOffset=at-cursor;}if(cursor+n.length>=offset){endNode=n;endOffset=offset-cursor;break;}cursor+=n.length;}if(startNode&&endNode){const range=document.createRange();range.setStart(startNode,startOffset);range.setEnd(endNode,endOffset);getSelection().removeAllRanges();getSelection().addRange(range);startNode.parentElement.scrollIntoView({block:'center'});}}};
  const cancel=node('button','关闭');cancel.onclick=()=>box.close();box.append(input,next,hint,cancel);document.body.append(box);box.addEventListener('close',()=>box.remove());box.showModal();input.focus();input.onkeydown=e=>{if(e.key==='Enter')next.click();};
 }
 document.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]'))return;let id;if((e.ctrlKey||e.metaKey)&&!e.altKey){const key=e.key.toLowerCase();id=e.shiftKey&&key==='t'?'reopen':({o:'quick',p:'commands',',':'settings',t:'blank',n:'new-note',w:'close',s:'save',f:'find'}[key]);}else if(e.altKey&&!e.ctrlKey){id=e.key==='ArrowLeft'?'back':e.key==='ArrowRight'?'forward':null;}if(id){e.preventDefault();e.stopImmediatePropagation();C.run(id);}},true);
 document.addEventListener('lithos-open',e=>{if(!ready||activating)return;openTab({id:'doc:'+e.detail.path,kind:'document',path:e.detail.path},e.detail.pinned);render();});
 document.addEventListener('lithos-graph',()=>{if(ready&&!activating){openTab({id:'page:graph',kind:'graph'});changed();}});
 let passiveTimer;
 document.addEventListener('lithos-document-state',()=>{clearTimeout(passiveTimer);passiveTimer=setTimeout(()=>{for(const g of workspace.groups){if(g===group())continue;const t=g.tabs.find(t=>t.id===g.active),d=K.ui.docs.get(t?.path),container=paneNodes.get(g.id)?.querySelector('.ws-passive'),article=container?.querySelector('article');if(article&&d?.format==='markdown'){const scroll=container.scrollTop;renderMarkdown(article,d.content,()=>select(t.id,g.id));container.scrollTop=scroll;}}},200);});
 document.addEventListener('lithos-document-state',()=>{if(!ready)return;for(const g of workspace.groups)for(const t of g.tabs){if(K.ui.docs.get(t.path)?.dirty)t.pinned=true;const tab=[...(paneNodes.get(g.id)?.querySelectorAll('.ws-tab')||[])].find(el=>el.dataset.id===t.id);if(tab){tab.firstChild.textContent=title(t)+(K.ui.docs.get(t.path)?.dirty?' ●':'');tab.classList.toggle('preview',!t.pinned);}}persist();});
 async function initialize(){if(ready)return;const saved=K.ui.prefs.workspace;if(saved?.groups?.length){workspace.groups=saved.groups.slice(0,2).map(g=>({...g,tabs:g.tabs.filter(t=>t.kind!=='guide'&&(t.kind!=='document'||K.ui.docs.has(t.path))),history:g.history||[],position:g.position??-1}));workspace.group=saved.group;workspace.closed=saved.closed||[];}else{workspace.groups[0].tabs=K.ui.tabs.map(t=>({id:'doc:'+t.path,kind:'document',path:t.path,pinned:t.pinned,scroll:K.ui.prefs.scroll[t.path]||0}));workspace.groups[0].active=K.ui.active?'doc:'+K.ui.active:null;}
  for(const g of workspace.groups){if(!g.tabs.some(t=>t.id===g.active))g.active=g.tabs.at(-1)?.id||null;g.history=g.history.filter(id=>id!=='page:guide');if(g.locations)delete g.locations['page:guide'];g.position=Math.min(g.position,g.history.length-1);}workspace.closed=workspace.closed.filter(t=>t.kind!=='guide');
  ready=true;navigation.restore();document.body.classList.toggle('ws-info-hidden',!!K.ui.prefs.infoHidden);document.body.classList.toggle('sidebar-collapsed',!!K.ui.prefs.sidebarCollapsed);const route=Object.entries(viewPaths).find(([,path])=>path===location.pathname)?.[0];if(route==='guide'){if(!group().tabs.length)blank();else await select(group().active);help();}else if(route==='settings'){if(!group().tabs.length)blank();else await select(group().active||group().tabs[0].id);settings();}else if(route&&['work','guide'].includes(route))page(route);else if(group().tabs.length)await select(group().tabs.some(t=>t.id===group().active)?group().active:group().tabs[0].id);else blank();
 }
 window.addEventListener('popstate',()=>{if(!ready)return;const view=Object.entries(viewPaths).find(([,path])=>path===location.pathname)?.[0];if(view==='settings')settings();else if(view==='library'){const target=group().tabs.find(t=>t.kind==='document');if(target)select(target.id);else blank();}else if(view)page(view);});
 document.addEventListener('lithos-ready',initialize);if(K.ready)initialize();
})();
