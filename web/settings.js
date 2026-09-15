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
 try{const config=await api('/api/settings');$('settings-root').value=config.configured_root;$('settings-port').value=config.configured_port;$('settings-active-root').textContent=config.root;$('settings-active-port').textContent=config.port;$('settings-config-path').textContent=config.config_path;$('settings-drafts').textContent=config.draft_path;$('settings-version').textContent=config.version;$('settings-address').textContent=location.origin;$('settings-env').textContent=config.environment_override?'启动环境变量正在覆盖配置文件，请调整启动环境后再重启。':'';}catch(e){notice(e.message);}
}
document.querySelector('[data-view="settings"]').addEventListener('click',loadSettings);
$('settings-data-form').addEventListener('submit',e=>{e.preventDefault();busy(e.submitter,async()=>{
 const result=await api('/api/settings',{root:$('settings-root').value,port:Number($('settings-port').value)});
 $('settings-data-status').textContent=`已保存。当前服务与资料位置保持不变；关闭服务窗口后重新启动，访问 http://127.0.0.1:${result.port} 生效。`;
});});
$('settings-guide').addEventListener('click',()=>showView('guide'));
renderProviders();
if(location.pathname==='/app/settings'){showView('settings');loadSettings();}
