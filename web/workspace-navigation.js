'use strict';
// Navigation and note utilities operate on the existing knowledge service.
window.installLithosNavigation = W => {
 const K=window.LithosKnowledge,C=window.LithosCommands,E=K.elements;
 const explorer=document.querySelector('.explorer');
 const panels=node('div',undefined,'ws-nav-tabs');panels.setAttribute('role','tablist');
 const files=node('div',undefined,'ws-nav-panel'),search=node('div',undefined,'ws-nav-panel'),bookmarks=node('div',undefined,'ws-nav-panel');
 const containers={files,search,bookmarks};
 explorer.prepend(panels);E.nav.replaceChildren(files,search,bookmarks);
 const tools=node('div',undefined,'ws-file-tools');
 files.append(tools);
 const projects=node('details',undefined,'ws-project-root');projects.open=true;projects.append(node('summary','项目资料'));
 const projectNav=document.querySelector('.explorer>.sidebar');projects.append(projectNav);files.append(projects);
 const projectTree=node('div',undefined,'ws-project-tree');projects.append(projectTree);projectNav.hidden=true;
 function renderProjectsTree(){projectTree.replaceChildren();const areas=[...new Set(state.projects.map(p=>p.area))];if(!areas.length){const create=btn('新建项目',()=>{$('create-dialog').showModal();});projectTree.append(create);}for(const area of areas){const root=node('details');root.open=true;root.append(node('summary',area.replace(/^\d+[_-]/,'')));projectTree.append(root);for(const project of state.projects.filter(p=>p.area===area)){const entry=node('details'),summary=node('summary',project.name);entry.append(summary);root.append(entry);let loaded=false;entry.addEventListener('toggle',async()=>{if(!entry.open||loaded)return;loaded=true;const contents=node('div',undefined,'ws-project-files');entry.append(contents);try{const result=await api('/api/documents?project='+encodeURIComponent(project.id));const trie={children:new Map(),files:[]};for(const f of result.files){const parts=f.id.replaceAll('\\','/').split('/');parts.pop();let current=trie;for(const part of parts){if(!current.children.has(part))current.children.set(part,{children:new Map(),files:[]});current=current.children.get(part);}current.files.push(f);}function draw(branch,container){for(const [name,child] of branch.children){const folder=node('details');folder.append(node('summary',name));container.append(folder);let done=false;folder.ontoggle=()=>{if(folder.open&&!done){done=true;draw(child,folder);}};}let offset=0;function batch(){for(const file of branch.files.slice(offset,offset+100)){const b=btn(file.name,()=>W.openProject(project,file));b.className='subtle kb-file';b.title=file.id;container.append(b);}offset+=100;if(offset<branch.files.length){const more=btn('加载更多…',()=>{more.remove();batch();});container.append(more);}}batch();}draw(trie,contents);if(!result.files.length)contents.append(node('p','暂无可阅读资料','small muted'));}catch(e){contents.append(node('p',e.message));}});}}}
 new MutationObserver(renderProjectsTree).observe($('project-list'),{childList:true});queueMicrotask(renderProjectsTree);
 const knowledge=node('details',undefined,'ws-knowledge-root');knowledge.open=true;knowledge.append(node('summary','技术知识库'),E.tree);files.append(knowledge);
 search.append(E.search,E.filters,E.searchResults,E.navStatus);
 const bookmarkList=node('div',undefined,'ws-bookmarks');bookmarks.append(bookmarkList,E.shortcuts);
 function renderBookmarks(){bookmarkList.replaceChildren(node('h3','书签'));for(const path of K.ui.prefs.favorites){const row=node('div',undefined,'ws-bookmark-row'),b=btn(path,async()=>{try{await K.get('browse',{folder:path});K.ui.folder=path;K.ui.prefs.scope=path;panel('files');await K.renderTree();K.persist();}catch(_){await K.open(path,true);}});b.title=path;row.append(b);bookmarkList.append(row);K.get('browse',{folder:path}).catch(()=>K.get('read',{path})).catch(()=>{if(b.isConnected){b.textContent=path+'（不可用）';b.disabled=true;}});}if(!K.ui.prefs.favorites.length)bookmarkList.append(node('p','从文档更多菜单添加收藏，或在目录旁收藏。','small muted'));}
 const footer=node('div',undefined,'ws-vault-footer');explorer.append(footer);
 let activePanel='files',expanding=false,cancelExpand=false;
 function panel(name){if(!containers[name])return;K.ui.prefs.panelScroll=K.ui.prefs.panelScroll||{};K.ui.prefs.panelScroll[activePanel]=containers[activePanel].scrollTop;activePanel=name;for(const [key,el] of Object.entries(containers)){el.hidden=key!==name;panels.querySelector('[data-panel='+key+']').setAttribute('aria-selected',String(key===name));}containers[name].scrollTop=K.ui.prefs.panelScroll[name]||0;K.ui.prefs.panel=name;K.persist();if(name==='search')E.search.focus();if(name==='bookmarks')renderBookmarks();}
 for(const [id,label,ico] of [['files','文件列表','file'],['search','搜索','search'],['bookmarks','书签','bookmark']]){const b=node('button',undefined,'ws-icon');b.append(C.icon(ico));b.title=label;b.setAttribute('aria-label',label);b.setAttribute('role','tab');b.dataset.panel=id;b.onclick=()=>panel(id);panels.append(b);}
 const modal=node('dialog',undefined,'kb-dialog');document.body.append(modal);
 const btn=(text,run)=>{const b=node('button',text);b.onclick=()=>Promise.resolve().then(run).catch(e=>notice(e.message));return b;};
 function dialog(title){if(modal.open)modal.close();modal.replaceChildren(node('h2',title));modal.showModal();return modal;}
 function field(label,value){const wrapper=node('label',label),input=node('input');input.value=value;input.setAttribute('aria-label',label);wrapper.append(input);return {wrapper,input};}
 async function newFolder(){const box=dialog('新建知识文件夹'),folder=field('知识库内父目录',K.ui.folder),name=field('文件夹名称','');box.append(folder.wrapper,name.wrapper,btn('创建',async()=>{await K.request('folder',{folder:folder.input.value,name:name.input.value});modal.close();await K.renderTree();}),btn('取消',()=>modal.close()));name.input.focus();}
 function sortMenu(){const box=dialog('文件排序');for(const [value,label] of [['name-asc','名称升序'],['name-desc','名称降序'],['modified-desc','修改时间：最新优先'],['modified-asc','修改时间：最旧优先']])box.append(btn(label,()=>{K.ui.prefs.sort=value;K.persist();K.renderTree();modal.close();}));box.append(btn('取消',()=>modal.close()));}
 async function expand(){
  if(expanding){cancelExpand=true;return;}
  const existing=[...E.tree.querySelectorAll('details')];
  if(existing.length&&existing.every(d=>d.open)){K.ui.prefs.expanded=[];await K.renderTree();K.persist();return;}
  expanding=true;cancelExpand=false;let count=0;
  const progress=node('div',undefined,'ws-expand-progress'),message=node('span'),stop=btn('中止',()=>cancelExpand=true);progress.append(message,stop);tools.after(progress);
  // Load breadth-first in 100-item pages with a render yield between pages. Bound each request and total work.
  const queue=[K.ui.prefs.scope||''];
  try{while(queue.length&&!cancelExpand&&count<500){const folder=queue.shift();let offset=0;do{const result=await K.get('browse',{folder,offset,sort:K.ui.prefs.sort||'name-asc'});for(const item of result.items)if(item.kind==='directory'&&!K.ui.prefs.expanded.includes(item.id)){K.ui.prefs.expanded.push(item.id);queue.push(item.id);count++;}offset=result.next_offset;message.textContent=`已展开 ${count} 个目录`;await new Promise(r=>setTimeout(r,20));}while(offset!==null&&!cancelExpand&&count<500);}
   await K.renderTree();K.persist();notice(cancelExpand?'已中止，保留已展开目录':count>=500?'已达到本次 500 个目录上限，可按需继续展开':'目录展开完成');
  }finally{expanding=false;progress.remove();}
 }
 const canWrite=()=>!K.ui.prefs.projectSelected&&!K.ui.folderReadOnly;
 C.register('new-note',{label:'新建知识笔记',icon:'file',key:'Ctrl+N',enabled:canWrite,run:()=>K.create()});
 C.register('new-folder',{label:'新文件夹',icon:'folder',enabled:canWrite,run:newFolder});
 C.register('sort',{label:'排序',icon:'sort',run:sortMenu});
 C.register('auto-reveal',{label:'自动显示当前文件',icon:'reveal',run:()=>{K.ui.prefs.autoReveal=K.ui.prefs.autoReveal===false;K.persist();tools.querySelector('[data-command=auto-reveal]').setAttribute('aria-pressed',String(K.ui.prefs.autoReveal));if(K.ui.prefs.autoReveal&&K.ui.active)K.reveal(K.ui.active);}});
 C.register('expand',{label:'展开 / 折叠全部',icon:'expand',run:expand});
 for(const id of ['new-note','new-folder','sort','auto-reveal','expand'])tools.append(C.button(id));
 function selectedProject(value){K.ui.prefs.projectSelected=value;for(const id of ['new-note','new-folder'])tools.querySelector('[data-command='+id+']').disabled=!canWrite();}
 document.addEventListener('lithos-folder',()=>selectedProject(false));
 knowledge.firstChild.addEventListener('click',()=>{K.ui.folder='';K.ui.folderReadOnly='';selectedProject(false);});
 projects.addEventListener('click',()=>selectedProject(true));knowledge.addEventListener('click',()=>selectedProject(false));
 const daily=()=>K.request('daily',{folder:K.ui.prefs.dailyFolder||'日记'}).then(d=>K.open(d.id,true));
 const builtins=[['项目复盘','# {{title}}\n\n日期：{{date}}\n\n## 背景与目标\n\n## 有效做法\n\n## 验证依据\n\n## 适用边界\n'],['问题分析','## 问题分析 · {{date}}\n\n### 现象与复现\n\n### 根因与证据\n\n### 修复与复测\n\n### 预防措施\n'],['技术调研','# {{title}}\n\n调研时间：{{date}} {{time}}\n\n## 研究问题\n\n## 来源与对比\n\n## 结论与局限\n']];
 async function templates(){
  const d=K.current();if(!d?.editable||W.active()?.kind!=='document')return notice('请先打开可写的 Markdown 知识笔记');
  const target=d.pathId,box=dialog('插入模板');
  const apply=text=>{if(K.current()?.pathId!==target)throw Error('活动笔记已变化，请重新选择模板');const now=new Date(),date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');text=text.replace(/\{\{(date|time|title)\}\}/g,(_,key)=>({date,time:now.toLocaleTimeString('zh-CN',{hour12:false}),title:d.title.replace(/\.md$/i,'')}[key]));modal.close();K.insertText(text);};
  for(const [title,text] of builtins)box.append(btn(title,()=>apply(text)));
  box.append(node('h3','本地模板'));
  try{const result=await K.get('templates',{folder:K.ui.prefs.templateFolder||'模板'});for(const item of result.items)box.append(btn(item.name,async()=>{const template=await K.get('read',{path:item.path});if(!template.editable)throw Error(template.readonly_reason);apply(template.content);}));if(!result.items.length)box.append(node('p','未设置本地模板，可使用上方内置模板。','muted'));}catch(e){box.append(node('p',e.message));}
  box.append(btn('关闭',()=>modal.close()));
 }
 C.register('daily',{label:'今天的日记',icon:'daily',run:daily});C.register('template',{label:'插入模板',icon:'template',run:templates});
 const setting=node('section',undefined,'setting-panel');setting.hidden=true;document.querySelector('.settings-content').append(setting);
 const settingsTab=btn('日记与模板',()=>{document.querySelectorAll('.setting-panel').forEach(p=>p.hidden=true);setting.hidden=false;renderSettings();});settingsTab.className='setting-tab';E.settingsNav.append(settingsTab);
 function renderSettings(){const df=field('日记目录',K.ui.prefs.dailyFolder||'日记'),tf=field('模板目录',K.ui.prefs.templateFolder||'模板');setting.replaceChildren(node('h2','日记与模板'),node('p','知识库内的相对目录。日记首次打开时创建；模板目录仅在点击“创建模板目录”时创建。'),df.wrapper,tf.wrapper,btn('保存偏好',async()=>{for(const folder of [df.input.value,tf.input.value])await K.get('templates',{folder});K.ui.prefs.dailyFolder=df.input.value;K.ui.prefs.templateFolder=tf.input.value;K.persist();notice('日记与模板目录已保存');}),btn('创建模板目录',async()=>{await K.request('setup-templates',{folder:tf.input.value});K.ui.prefs.templateFolder=tf.input.value;K.persist();await K.renderTree();notice('模板目录已就绪');}),node('p','支持 {{date}}、{{time}}、{{title}}。插入可撤销；Ctrl+S 才写入原文件。'));
 }
 const vault=btn('曜石本地工作区　⌄',async()=>{const result=await api('/api/settings');const box=dialog('当前工作区');box.append(node('p',result.root,'path'),btn('工作区配置',()=>{modal.close();W.settings();document.querySelector('[data-setting=data]')?.click();}),btn('索引状态',()=>{modal.close();W.settings();E.settingsButton.click();}),btn('关闭',()=>modal.close()));});footer.append(vault);
 E.search.addEventListener('input',()=>{K.ui.prefs.searchQuery=E.search.value;K.persist();});for(const select of E.filters.querySelectorAll('select'))select.addEventListener('change',()=>{K.ui.prefs.searchFilters=[...E.filters.querySelectorAll('select')].map(x=>x.value);K.persist();});
 function restore(){E.search.value=K.ui.prefs.searchQuery||'';[...E.filters.querySelectorAll('select')].forEach((el,i)=>{if(K.ui.prefs.searchFilters?.[i]!==undefined)el.value=K.ui.prefs.searchFilters[i];});panel(K.ui.prefs.panel||'files');tools.querySelector('[data-command=auto-reveal]').setAttribute('aria-pressed',String(K.ui.prefs.autoReveal!==false));}
 return {panel,restore,files,search,bookmarks};
};
