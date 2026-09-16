'use strict';
const appearanceKey = 'workbench-appearance';
const themeMedia = matchMedia('(prefers-color-scheme: dark)');
let appearance = {theme:'dark',font:'100'};
try { const saved=JSON.parse(localStorage.getItem(appearanceKey)||'null'); if(saved) appearance={theme:['light','dark','system'].includes(saved.theme)?saved.theme:'system',font:['100','110','120'].includes(saved.font)?saved.font:'100'}; } catch (_) {}
function applyAppearance() {
 document.documentElement.dataset.theme=appearance.theme==='system'?(themeMedia.matches?'dark':'light'):appearance.theme;
 document.documentElement.dataset.font=appearance.font;
 $('settings-font').value=appearance.font;
 document.querySelectorAll('[data-theme-choice]').forEach(b=>{b.classList.toggle('active',b.dataset.themeChoice===appearance.theme);b.setAttribute('aria-pressed',String(b.dataset.themeChoice===appearance.theme));});
}
function saveAppearance() { applyAppearance(); try {localStorage.setItem(appearanceKey,JSON.stringify(appearance));} catch(_){notice('浏览器未允许保存偏好，本次设置仍生效。');} }
document.querySelectorAll('[data-theme-choice]').forEach(b=>b.addEventListener('click',()=>{appearance.theme=b.dataset.themeChoice;saveAppearance();}));
$('settings-font').addEventListener('change',()=>{appearance.font=$('settings-font').value;saveAppearance();});
themeMedia.addEventListener('change',applyAppearance); applyAppearance();
document.querySelectorAll('[data-setting]').forEach(b=>b.addEventListener('click',()=>{
 document.querySelectorAll('[data-setting]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});
 document.querySelectorAll('.setting-panel').forEach(x=>x.hidden=x.id!=='setting-'+b.dataset.setting);
}));
async function loadSettings(){
 renderProviders();
 try{const config=await api('/api/settings');$('settings-root').value=config.configured_root;$('settings-knowledge-name').value=config.knowledge_name||'技术知识库';$('settings-knowledge-parent').value=config.knowledge_parent||'.';$('settings-port').value=config.configured_port;$('settings-active-root').textContent=config.root;$('settings-active-port').textContent=config.port;$('settings-config-path').textContent=config.config_path;$('settings-drafts').textContent=config.draft_path;$('settings-version').textContent=config.version;$('settings-address').textContent=location.origin;$('settings-env').textContent=config.environment_override?'启动环境变量正在覆盖配置文件，请调整启动环境后再重启。':'';}catch(e){notice(e.message);}
}
document.querySelector('[data-view="settings"]').addEventListener('click',loadSettings);
$('settings-data-form').addEventListener('submit',e=>{e.preventDefault();busy(e.submitter,async()=>{
 const K=window.LithosKnowledge;
 if(state.generating)throw Error('模型正在生成，请完成后再切换资料目录。');
 if([...K.ui.docs.values()].some(d=>d.dirty))throw Error('请先保存未保存的笔记，再切换资料目录。');
 if(state.draft&&!state.draft.published&&$('draft-content').value!==state.draft.content){await api('/api/save-draft',{draft:state.draft.id,content:$('draft-content').value});state.draft.content=$('draft-content').value;}
 await K.flushForSwitch();
 try{
 const result=await api('/api/settings',{root:$('settings-root').value,port:Number($('settings-port').value),knowledge_name:$('settings-knowledge-name').value,knowledge_parent:$('settings-knowledge-parent').value});
 $('settings-data-status').textContent='目录配置已生效，正在刷新文件列表。'+(result.restart_required?'端口变更将在下次启动生效，当前仍使用原端口。':'');
 if(result.restart_required)sessionStorage.setItem('lithos-port-note','目录已生效；新端口 '+result.port+' 将在下次启动使用。');
 location.replace(location.origin+'/app');
 }catch(e){K.resumeAfterSwitchError();throw e;}

});});
$('settings-guide').addEventListener('click',()=>showView('guide'));
renderProviders();
if(location.pathname==='/app/settings'){showView('settings');loadSettings();}

const portNote=sessionStorage.getItem('lithos-port-note');if(portNote){sessionStorage.removeItem('lithos-port-note');notice(portNote);}
