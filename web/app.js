'use strict';
const $ = id => document.getElementById(id);
const state = {projects: [], project: null, files: [], selected: new Set(), preview: null, draft: null};
const token = document.querySelector('meta[name="workbench-token"]').content;
let toastTimer;
function notice(message) { $('notice').textContent = message; $('notice').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('notice').hidden = true, 9000); }
async function api(path, body) {
 const response = await fetch(path, body === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Workbench-Token': token}, body: JSON.stringify(body)});
 const result = await response.json(); if (!response.ok) throw Error(result.error || '操作失败'); return result;
}
function node(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
async function busy(button, fn, text='处理中…') { const previous = button.textContent; button.disabled = true; button.textContent = text; try { await fn(); } catch (e) { notice(e.message); } finally { button.disabled = false; button.textContent = previous; } }
function showView(name) { document.querySelectorAll('.view').forEach(e => e.hidden = e.id !== name); document.querySelectorAll('.nav').forEach(e => e.classList.toggle('active', e.dataset.view === name)); if (name === 'library' && !window.LithosKnowledge) searchKnowledge(); if(name === 'home') refreshHome(); document.dispatchEvent(new CustomEvent('workbench-view',{detail:name})); }
document.querySelectorAll('.nav').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => { if (!state.generating) button.closest('dialog').close(); else notice('模型正在处理，请等待返回。'); }));
$('hide-preview').addEventListener('click',()=>{if(!state.generating)$('preview-dialog').hidden=true;});
function renderProjects() {
 const filter = $('project-search').value.toLowerCase(); const list = $('project-list'); list.replaceChildren();
 state.projects.filter(p => p.name.toLowerCase().includes(filter)).forEach(p => {
  const button = node('button', p.name, 'project-item' + (state.project?.id === p.id ? ' selected' : ''));
  button.append(node('small', p.area.slice(3) + (p.protected ? ' · 原路径保护' : '')));
  button.addEventListener('click', () => chooseProject(p)); list.append(button);
 });
 if (!list.children.length) list.append(node('p', '暂无匹配项目，可点击＋新增。', 'empty'));
}
async function refreshProjects(prefer) {
 const data = await api('/api/state'); state.projects = data.projects; state.knowledgeName=data.knowledge_name;const knowledgeTitle=document.querySelector('.ws-knowledge-root>summary');if(knowledgeTitle){knowledgeTitle.textContent=data.knowledge_name||'技术知识库';knowledgeTitle.title=data.knowledge_path||'';document.querySelector('.ws-knowledge-location')?.remove();} state.categories = data.categories; renderCategories(); refreshHome();
 $('category').replaceChildren(...data.categories.map(c => { const option = node('option', c.replace('/', ' / ')); option.value = c; return option; }));
 renderProjects();
 const initial = state.projects.find(p => p.id === prefer) || state.projects.find(p => p.name === '08_数据工程') || state.projects[0];
 if (initial) await chooseProject(initial);
}
async function chooseProject(project) {
 if (state.generating) return notice('请等待当前模型任务完成。');
 if (state.draft && !state.draft.published && $('draft-content').value !== state.draft.content) {
  try { await api('/api/save-draft', {draft: state.draft.id, content: $('draft-content').value}); }
  catch(e) { notice('草稿未保存，暂不切换项目：' + e.message); return; }
 }
 state.draft = null; $('draft-form').hidden = true; $('draft-empty').hidden = false;
 document.querySelectorAll('.steps span').forEach((e,i) => e.classList.toggle('current', i === 0));
 closeOffice(); state.project = project; state.selected.clear(); state.preview = null; $('preview-dialog').hidden=true;
 $('project-name').textContent = project.name; $('project-area').textContent = project.area.slice(3) + (project.protected ? ' / 原路径保护' : ' / 项目事实');
 $('project-path').textContent = project.path; $('copy-path').disabled = false; $('prepare').disabled = true;
 $('doc-list').replaceChildren(node('div', '正在读取资料目录…', 'empty')); renderProjects();
 try { const data = await api('/api/documents?project=' + encodeURIComponent(project.id)); if (state.project.id !== project.id) return; state.files = data.files; $('doc-warning').textContent = data.warnings.join('；'); $('doc-search').value = ''; renderDocuments(); }
 catch (e) { notice(e.message); state.files = []; renderDocuments(); }
}
function renderDocuments() {
 const filter = $('doc-search').value.toLowerCase(); $('doc-list').replaceChildren();
 state.files.filter(f => f.id.toLowerCase().includes(filter)).forEach(f => {
  const label = node('div', undefined, 'doc-row'), check = document.createElement('input'); check.type = 'checkbox'; check.disabled = f.evidence === false || !!state.generating; check.setAttribute('aria-label', '选择资料 '+f.name); check.dataset.evidence = String(f.evidence !== false); check.checked = state.selected.has(f.id);
  check.addEventListener('change', () => { if (check.checked) state.selected.add(f.id); else state.selected.delete(f.id); state.preview = null; $('preview-dialog').hidden=true; updateCount(); });
  const text = node('span', f.name); text.append(node('small', f.id + ' · ' + Math.max(1, Math.round(f.size / 1024)) + ' KB')); const read=node('button','预览','subtle'); read.setAttribute('aria-label','预览 '+f.name); read.onclick=()=>openOffice(f); if(f.evidence===false)text.append(node('small','仅本地阅读 · 暂不支持模型提炼')); label.append(check, text, read); $('doc-list').append(label);
 });
 if (!$('doc-list').children.length) $('doc-list').append(node('div', '没有匹配资料。可先在项目中保存需求、测试或复盘文档，再重新选择项目刷新。', 'empty'));
 updateCount();
}
function updateCount() { $('selection-count').textContent = state.selected.size + ' 份已选'; $('prepare').disabled = state.selected.size === 0; }
$('project-search').addEventListener('input', renderProjects); $('doc-search').addEventListener('input', renderDocuments);
$('copy-path').addEventListener('click', () => navigator.clipboard.writeText(state.project.path).then(() => notice('已复制项目真实路径')).catch(() => notice('请从页面选择并复制路径')));
$('new-project').addEventListener('click', () => $('create-dialog').showModal());
$('create-form').addEventListener('submit', e => { e.preventDefault(); busy(e.submitter, async () => {
 const created = await api('/api/projects', {name: $('new-name').value, area: $('new-area').value}); $('create-dialog').close(); $('new-name').value = ''; await refreshProjects(created.id); showView('work'); notice('已创建项目：' + created.path);
 }); });
$('prepare').addEventListener('click', () => busy($('prepare'), async () => {
 state.preview = await api('/api/preview', {project: state.project.id, files: [...state.selected], focus: $('focus').value});
 $('preview-summary').textContent = `查看待发送内容 · ${state.preview.sources.length}份 · ${state.preview.characters.toLocaleString()}字`; $('preview-content').textContent = '[系统提炼规则]\n' + state.preview.system + '\n\n[所选资料与任务]\n' + state.preview.prompt;
 $('generation-state').textContent = ''; $('preview-dialog').hidden=false; refreshInlineModel(); $('preview-dialog').scrollIntoView({block:'nearest',behavior:'smooth'});
 }, '本地提取中…'));
$('generate').addEventListener('click', () => busy($('generate'), async () => {
 if (!state.preview) throw Error('请先预览资料');
 const modelConfig = generationConfig();
 state.generating = true; $('focus').readOnly=true; document.querySelectorAll('#doc-list input').forEach(e=>e.disabled=true); $('generation-state').textContent = '正在调用所选模型，最长等待约120秒；成功后自动保存为本地草稿。';
 try {
  const draft = await api('/api/generate', {preview: state.preview.id, ...modelConfig});
  displayDraft(draft); notice('草稿已生成并保存。请核对事实和来源后再入库。');
 } finally { state.generating = false; $('focus').readOnly=false; document.querySelectorAll('#doc-list input').forEach(e=>e.disabled=e.dataset.evidence==='false'); $('generation-state').textContent = ''; refreshInlineModel(); }
 }, '模型正在生成…'));
function displayDraft(draft) {
 state.draft = draft; $('draft-content').readOnly = !!draft.published; $('draft-empty').hidden = true; $('draft-form').hidden = false;
 $('draft-meta').textContent = `${draft.project} · ${draft.model} · ${draft.created.slice(0,16).replace('T',' ')}${draft.published ? ' · 已入库' : ' · 待审核'}`;
 $('draft-content').value = draft.content; $('draft-content').hidden = false; $('draft-render').hidden = true; $('knowledge-title').value = draft.content.split('\n').find(x => /^#\s/.test(x))?.replace(/^#\s+/, '').slice(0,70) || '';
 $('reviewed').checked = false; $('publish').disabled = !!draft.published; $('save-draft').disabled = !!draft.published;
 $('published-path').textContent = draft.knowledge_path || '';
 document.querySelectorAll('.steps span').forEach((e,i) => e.classList.toggle('current', i === 2));
}
async function saveProjectDraft(){
 const draft=state.draft;if(!draft||draft.published)return;
 const content=$('draft-content').value;
 await api('/api/save-draft',{draft:draft.id,content});
 if(state.draft===draft)draft.content=content;
 notice('修改已保存到本地草稿。');
}
$('save-draft').addEventListener('click', () => busy($('save-draft'), saveProjectDraft));
$('publish').addEventListener('click', async () => {
 await busy($('publish'), async () => {
  const result = await api('/api/publish', {draft: state.draft.id, title: $('knowledge-title').value, content: $('draft-content').value, category: $('category').value, reviewed: $('reviewed').checked});
  state.draft.published = true; $('published-path').textContent = result.path; $('save-draft').disabled = true; notice('已入库：' + result.path);
 });
 if (state.draft?.published) $('publish').disabled = true;
});
$('load-drafts').addEventListener('click', () => busy($('load-drafts'), async () => {
 const drafts = await api('/api/drafts'); $('draft-list').replaceChildren();
 drafts.forEach(draft => { const button = node('button', `${draft.project} · ${draft.published ? '已入库' : '待审核'}`, 'knowledge-item'); button.append(node('small', draft.created.slice(0,16).replace('T',' ') + ' · ' + draft.model)); button.addEventListener('click', async () => { try { if(state.draft && !state.draft.published) await api('/api/save-draft',{draft:state.draft.id,content:$('draft-content').value}); displayDraft(draft); $('drafts-dialog').close(); if(window.LithosWorkspace)LithosWorkspace.page('distill');else showView('work'); } catch(e) { notice('当前草稿未保存：'+e.message); } }); $('draft-list').append(button); });
 if (!drafts.length) $('draft-list').append(node('p', '尚无草稿。模型生成成功后会自动保存在本机。', 'empty')); $('drafts-dialog').showModal();
}));
let libraryRequest = 0, previewRequest = 0;
state.knowledgeFolder = '';
function enterLibrary(folder) {
 state.knowledgeFolder=folder; $('knowledge-search').value='';
 $('knowledge-name').textContent='选择文件'; $('knowledge-path').textContent='';
 $('knowledge-content').replaceChildren(node('p','可进入文件夹，或选择文件预览。'));
 previewRequest++; renderCategories(); searchKnowledge(); document.dispatchEvent(new Event("library-scope"));
}
async function searchKnowledge(offset=0) {
 if(!Number.isInteger(offset)) offset=0;
 const request=++libraryRequest;
 $('library-status').textContent='正在读取目录与资料…';
 try {
  const result=await api('/api/library?folder='+encodeURIComponent(state.knowledgeFolder||'')+'&q='+encodeURIComponent($('knowledge-search').value)+'&offset='+offset);
  if(request!==libraryRequest)return;
  $('library-location').textContent=result.root+(result.folder?' / '+result.folder:'');
  $('library-up').disabled=!result.folder;
  $('library-status').textContent=`${result.total} 项 · 显示 ${result.items.length ? offset+1 : 0}—${offset+result.items.length}`+(result.warnings.length?' · '+result.warnings.join('；'):'');
  $('knowledge-results').replaceChildren();
  result.items.forEach(record=>{
   const button=node('button',(record.kind==='directory'?'▸ ':'')+record.title,'knowledge-item');
   button.append(node('small',(record.kind==='directory'?'文件夹':'文件 · '+Math.max(1,Math.round(record.size/1024))+' KB')+' · '+record.id));
   button.addEventListener('click',()=>{
    if(record.kind==='directory'){enterLibrary(record.id);return;}
    displayKnowledge(record); document.querySelectorAll('#knowledge-results .knowledge-item').forEach(x=>x.classList.remove('selected'));button.classList.add('selected');
   }); $('knowledge-results').append(button);
  });
  if(!result.items.length)$('knowledge-results').append(node('p',$('knowledge-search').value?'未找到匹配项。可缩短关键词，或返回根目录检索。':'此目录暂无可显示内容。','empty'));
  const pages=node('div',undefined,'actions');
  if(offset){const b=node('button','上一页','secondary');b.addEventListener('click',()=>searchKnowledge(Math.max(0,offset-100)));pages.append(b);}
  if(result.next_offset!==null){const b=node('button','下一页','secondary');b.addEventListener('click',()=>searchKnowledge(result.next_offset));pages.append(b);}
  $('knowledge-results').append(pages);
 }catch(e){if(request===libraryRequest){$('library-status').textContent='读取失败：'+e.message;notice(e.message);}}
}
async function displayKnowledge(record) {
 if(window.LithosKnowledge) return window.LithosKnowledge.open(record.id || record.path, true);
 const request=++previewRequest;
 $('knowledge-name').textContent=record.title;$('knowledge-path').textContent=record.path;
 const target=$('knowledge-content');target.replaceChildren(node('p','正在读取文件…'));
 try{
  const detail=record.id?await api('/api/library-preview?path='+encodeURIComponent(record.id)):record;
  if(request!==previewRequest)return;
  target.replaceChildren();
  if(detail.warning)target.append(node('p',detail.warning,'setting-info'));
  if(detail.content){const body=node('div');if(detail.format==='text'){body.append(node('pre',detail.content));}else renderMarkdown(body,detail.content);target.append(body);}
  if(detail.id){const download=node('a','下载原件','secondary');download.href='/api/library-download?path='+encodeURIComponent(detail.id);download.setAttribute('download',detail.title);target.append(download);}
 }catch(e){if(request===previewRequest)target.replaceChildren(node('p','无法预览：'+e.message));}
}
async function renderCategories() {
 try{
  if(window.LithosKnowledge)return;
  const listing=await api('/api/library');const root=$('knowledge-categories');if(!root)return;root.replaceChildren();
  const add=(label,value)=>{const active=value?state.knowledgeFolder===value||state.knowledgeFolder.startsWith(value+'/'):!state.knowledgeFolder;const b=node('button',label,'category-item'+(active?' selected':''));b.addEventListener('click',()=>enterLibrary(value));root.append(b);};
  add('全部目录','');listing.items.filter(x=>x.kind==='directory').forEach(x=>add(x.title,x.id));
 }catch(e){notice(e.message);}
}
$('library-up').addEventListener('click',()=>{const parts=(state.knowledgeFolder||'').split('/');parts.pop();enterLibrary(parts.join('/'));});
$('library-refresh').addEventListener('click',()=>{renderCategories();searchKnowledge();});
async function refreshHome() {
 $('stat-projects').textContent = state.projects.length; const cards = $('home-projects'); cards.replaceChildren();
 state.projects.slice(0, 6).forEach(p => { const b = node('button', undefined, 'project-card'); b.append(node('span', p.area.replace(/^\d+_/, ''), 'card-area'), node('h3', p.name), node('p', p.protected ? '现有布局保护 · 文档可读取' : '需求 / 设计 / 验证 / 问题 / 交付'), node('span', '打开项目空间 ↗', 'card-link')); b.addEventListener('click', () => { showView('work'); chooseProject(p); }); cards.append(b); });
 if (!state.projects.length) cards.append(node('p', '从第一个项目开始。点击“新增项目”创建五类资料目录。', 'empty'));
 try { const [records, drafts] = await Promise.all([api('/api/knowledge?q='), api('/api/drafts')]); $('stat-knowledge').textContent = records.length; $('stat-drafts').textContent = drafts.filter(d=>!d.published).length; $('home-knowledge').replaceChildren(); records.slice(0, 4).forEach(r => { const b = node('button', r.title, 'knowledge-item'); b.append(node('small', r.category)); b.addEventListener('click', () => { state.knowledgeFolder = ''; renderCategories(); showView('library'); displayKnowledge(r); }); $('home-knowledge').append(b); }); if(!records.length) $('home-knowledge').append(node('p', '知识库正在积累。完成一次项目复盘，就有了第一篇可复用的方法。', 'empty')); } catch(e) { notice(e.message); }
}
// Render a deliberately small Markdown subset with DOM nodes only; source HTML is always text.
$('home-new-project').addEventListener('click', () => $('create-dialog').showModal());
$('home-all-projects').addEventListener('click', () => showView('work'));
$('home-library').addEventListener('click', () => showView('library'));
$('home-guide').addEventListener('click', () => showView('guide'));
$('manual-draft').addEventListener('click', () => busy($('manual-draft'), async () => {
 if(!state.project) throw Error('请先选择一个项目');
 if(state.draft && !state.draft.published) await api('/api/save-draft', {draft:state.draft.id,content:$('draft-content').value});
 const draft = await api('/api/manual-draft', {project:state.project.id,files:[...state.selected]}); displayDraft(draft); notice(state.selected.size ? '已创建离线草稿。补充方法、验证依据和边界后审核入库。' : '已创建离线草稿。正式入库需要来源证据；请选择资料后重新创建。');
}));
$('preview-mode').addEventListener('click', () => { renderMarkdown($('draft-render'),$('draft-content').value); $('draft-render').hidden=false; $('draft-content').hidden=true; });
$('edit-mode').addEventListener('click', () => { $('draft-render').hidden=true; $('draft-content').hidden=false; });
window.addEventListener('beforeunload', e => { if(state.draft && !state.draft.published && $('draft-content').value !== state.draft.content) {e.preventDefault(); e.returnValue='';} });
$('search-knowledge').addEventListener('click', searchKnowledge); $('knowledge-search').addEventListener('keydown', e => { if (e.key === 'Enter') searchKnowledge(); });
fetch('/使用说明.md').then(r => r.text()).then(text => renderMarkdown($('guide-text'),text)).catch(() => $('guide-text').textContent = '请打开工具目录中的使用说明.md。');
refreshProjects().catch(e => notice(e.message));

document.querySelector('.brand').addEventListener('click', e => { e.preventDefault(); showView('home'); });

$('focus').addEventListener('input',()=>{state.preview=null;$('preview-dialog').hidden=true;});
$('open-model-settings').addEventListener('click',()=>{showView('settings');document.querySelector('[data-setting="models"]').click();});

let officeRequest=0,officeFrame=null,officePayload=null;
function closeOffice(){officeRequest++;$('office-reader').classList.remove('office-expanded');$('office-expand').textContent='展开阅读';officePayload=null;officeFrame=null;$('office-reader').hidden=true;$('office-host').replaceChildren();}
$('office-close').onclick=closeOffice;
$('office-expand').onclick=()=>{$('office-reader').classList.toggle('office-expanded');$('office-expand').textContent=$('office-reader').classList.contains('office-expanded')?'还原':'展开阅读';};
async function openOffice(file){
 closeOffice();const request=officeRequest;
 $('office-reader').hidden=false;$('office-title').textContent=file.name;$('office-path').textContent=file.id;
 const url='/api/project-file?'+new URLSearchParams({project:state.project.id,file:file.id});$('office-download').href=url;$('office-download').download=file.name;
 $('office-host').textContent='正在本机读取原件…';$('office-reader').scrollIntoView({block:'nearest',behavior:'smooth'});
 try{const response=await fetch(url);if(!response.ok)throw Error((await response.json()).error);const buffer=await response.arrayBuffer();if(request!==officeRequest)return;
 officePayload={type:'office-document',name:file.name,buffer};officeFrame=document.createElement('iframe');officeFrame.title='文档离线阅读器';officeFrame.setAttribute('sandbox','allow-scripts');officeFrame.src='/office-frame.html';$('office-host').replaceChildren(officeFrame);
 }catch(e){if(request===officeRequest)$('office-host').textContent='无法预览：'+e.message;}
}
window.addEventListener('message',e=>{if(e.source===officeFrame?.contentWindow&&e.data?.type==='office-ready'&&officePayload){officeFrame.contentWindow.postMessage(officePayload,'*',[officePayload.buffer]);officePayload=null;}});
