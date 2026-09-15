'use strict';
// Workspace chrome is independent of document and provider persistence.
(() => {
 const logo=document.querySelector('.logo');logo.replaceChildren();const mark=document.createElement('img');mark.src='/brand.svg';mark.alt='曜石';mark.width=28;mark.height=32;logo.append(mark);
 const labels={home:'新标签页',work:'项目空间',library:'知识库',guide:'使用指南',settings:'设置'};
 const icons={home:'⌂',work:'▱',library:'⌘',guide:'?',settings:'⚙'};
 const explorer=node('aside',undefined,'explorer'); explorer.setAttribute('aria-label','文件导航');
 const heading=node('div',undefined,'vault-heading'); heading.append(node('strong','曜石'),node('span','本地知识库')); explorer.append(heading);
 const projects=document.querySelector('.workspace > .sidebar'); explorer.append(projects);
 const knowledge=node('div',undefined,'knowledge-explorer');
 for(const selector of ['.search-bar','.knowledge-nav','.library-toolbar','#knowledge-results'])knowledge.append(document.querySelector(selector));
 explorer.append(knowledge); document.body.append(explorer);
 const bar=node('div',undefined,'workspace-tabs');bar.setAttribute('aria-label','工作区标签');
 const toggle=node('button','☰','sidebar-toggle');toggle.title='切换侧栏';toggle.setAttribute('aria-label','切换侧栏');toggle.setAttribute('aria-expanded','true');
 toggle.onclick=()=>{if(matchMedia('(max-width:720px)').matches){const open=document.body.classList.toggle('mobile-explorer');toggle.setAttribute('aria-expanded',String(open));}else{const closed=document.body.classList.toggle('sidebar-collapsed');toggle.setAttribute('aria-expanded',String(!closed));}};bar.append(toggle);
 const tabs=node('div',undefined,'tab-list');bar.append(tabs);document.body.append(bar);
 const status=node('footer',undefined,'status-bar');status.append(node('span','曜石 · 本地工作区'),node('span','Ctrl + O 快速切换　 ·　 Ctrl + P 命令　 ·　 Ctrl + , 设置'));document.body.append(status);
 document.querySelectorAll('.header .nav').forEach(button=>{const view=button.dataset.view;button.textContent=icons[view];button.title=labels[view];button.setAttribute('aria-label',labels[view]);});
 const opened=[];let current='home';
 function sync(view){
  current=view;if(!opened.includes(view))opened.push(view);tabs.replaceChildren();
  for(const name of opened){const item=node('div',undefined,'workspace-tab'+(name===view?' active':''));const open=node('button',labels[name]);open.setAttribute('aria-current',name===view?'page':'false');open.onclick=()=>showView(name);const close=node('button','×','tab-close');close.setAttribute('aria-label','关闭'+labels[name]);close.onclick=()=>{opened.splice(opened.indexOf(name),1);if(name===current)showView(opened.at(-1)||'home');else sync(current);};item.append(open,close);tabs.append(item);}
  projects.hidden=view==='library';knowledge.hidden=view!=='library';document.body.dataset.view=view;
 }
 const previous=showView;showView=function(view){previous(view);sync(view);if(view==='settings')loadSettings();};
 window.addEventListener('popstate',()=>sync(Object.keys(viewPaths).find(k=>viewPaths[k]===location.pathname)||'home'));
 sync(Object.keys(viewPaths).find(k=>viewPaths[k]===location.pathname)||'home');
 // The project explorer is useful from every document tab.
 $('project-list').addEventListener('click',e=>{if(e.target.closest('.project-item'))showView('work');});
 document.querySelector('.home-intro h1').textContent='曜石 · Lithos';
 document.querySelector('.home-intro .muted').textContent='打开项目，阅读资料，记录可复用的知识。';
 document.querySelector('#library .page-heading h1').textContent='知识库';
 document.querySelector('#guide .page-heading h1').textContent='使用指南';
 const switcher=node('dialog',undefined,'quick-switcher');const search=node('input');search.type='search';search.placeholder='输入项目名称或页面名称…';search.setAttribute('aria-label','快速切换');const results=node('div');const exit=node('button','关闭','subtle');exit.onclick=()=>switcher.close();switcher.append(search,results,exit);document.body.append(switcher);
 let commandMode=false;
 const commands=[{label:'项目：新建项目',run:()=>$('new-project').click()},{label:'知识库：打开图谱',run:()=>{showView('library');showGraph(true);}},{label:'工作区：切换侧栏',run:()=>toggle.click()},{label:'设置：模型供应商',run:()=>$('open-model-settings').click()},{label:'项目：手动沉淀',enabled:()=>!!state.project,run:()=>{showView('work');$('manual-draft').click();}}];
 function matches(){results.replaceChildren();const q=search.value.trim().toLowerCase();const choices=commandMode?commands.filter(c=>!c.enabled||c.enabled()):Object.entries(labels).map(([id,label])=>({label,run:()=>showView(id)})).concat(state.projects.map(p=>({label:p.name,run:()=>{showView('work');chooseProject(p);}})));for(const choice of choices.filter(c=>c.label.toLowerCase().includes(q)).slice(0,20)){const b=node('button',choice.label,'switcher-result');b.onclick=()=>{switcher.close();choice.run();};results.append(b);}if(!results.children.length)results.append(node('p','没有匹配项','empty'));}
 function openSwitcher(asCommand){commandMode=asCommand;search.placeholder=asCommand?'输入命令名称…':'输入项目名称或页面名称…';search.setAttribute('aria-label',asCommand?'命令面板':'快速切换');search.value='';matches();if(!switcher.open)switcher.showModal();search.focus();}
 const quick=node('button','⌕','nav');quick.title='快速切换 (Ctrl + O)';quick.setAttribute('aria-label','快速切换');quick.onclick=()=>openSwitcher(false);document.querySelector('.header nav').append(quick);
 search.oninput=matches;search.onkeydown=e=>{if(e.key==='Enter')results.querySelector('button')?.click();};
 document.addEventListener('keydown',e=>{if(!(e.ctrlKey||e.metaKey)||e.altKey)return;if(e.key===','){e.preventDefault();showView('settings');}if(['o','p'].includes(e.key.toLowerCase())){e.preventDefault();openSwitcher(e.key.toLowerCase()==='p');}});
})();

// Suggestions remain separate from the editable, authoritative task text.
(() => {
 const input=$('focus'), presets={
  '综合经验':'提炼可复用的方法、典型问题处理经验和适用边界。注明来源与验证依据，区分已验证结论和待验证建议。',
  '问题复盘':'围绕问题现象、复现条件、根因分析、修复方法、复测结果和预防措施沉淀经验。引用原始证据，明确未验证的推断和适用边界。',
  '测试验证':'提炼测试场景、样本与版本、评测指标、验证步骤、结果和局限。区分观测事实与推断，形成可复用的验证方法，并保留来源。',
  '架构设计':'总结设计目标、约束、候选方案、取舍依据、接口边界和实施效果。标注来源与验证情况，提炼可复用的设计原则及适用条件。',
  '数据闭环':'提炼采集、清洗、质量准入、问题定位、修复及复测中的有效方法。保留样本和指标依据，明确闭环条件、适用边界和未解决问题。',
  '交付总结':'总结交付范围、版本与配置、验收依据、遗留问题和交接注意事项。提炼可复用的交付检查方法，不将未验收内容写成已完成成果。'
 };
 const controls=node('div',undefined,'focus-controls'), select=node('select');select.setAttribute('aria-label','沉淀目标预设');
 const custom=node('option','自定义 / 选择预设');custom.value='';select.append(custom);
 for(const name of Object.keys(presets)){const option=node('option',name);option.value=name;select.append(option);}
 const model=node('button','模型建议','secondary');model.type='button';controls.append(select,model);input.before(controls);input.maxLength=2000;
 const box=node('div',undefined,'focus-suggestion'), text=node('p'), accept=node('button','采用建议 · Tab','subtle'), dismiss=node('button','忽略','subtle'), note=node('p','预设和 Tab 建议可离线使用；点击“模型建议”仅发送项目名、所选文件名及当前目标，不发送正文。','small muted');
 box.append(text,accept,dismiss);input.after(box,note);box.hidden=true;
 let suggestion='',request=0,pending=false,dismissed='';
 const signature=()=>JSON.stringify([state.project?.id,[...state.selected].sort()]);
 function offer(value,label){suggestion=value;text.textContent=label+'：'+value;box.hidden=!value||value===input.value;}
 function recommend(){if(pending||state.generating||dismissed===signature())return;const context=[state.project?.name,...state.selected].join(' ');const name=/bug|问题|故障|修复/i.test(context)?'问题复盘':/测试|评测|验证/.test(context)?'测试验证':/架构|设计|接口/.test(context)?'架构设计':/采集|数据|质量/.test(context)?'数据闭环':/交付|验收/.test(context)?'交付总结':'综合经验';offer(presets[name],'本地推荐 · '+name);}
 function apply(value){if(state.generating||input.readOnly)return;input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));suggestion='';box.hidden=true;input.focus();}
 select.onchange=()=>{const name=select.value;if(name){apply(presets[name]);select.value=name;}};
 accept.onclick=()=>apply(suggestion);dismiss.onclick=()=>{dismissed=signature();box.hidden=true;suggestion='';};
 input.addEventListener('keydown',e=>{if(e.key==='Tab'&&!e.shiftKey&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.isComposing&&!box.hidden&&suggestion&&!input.readOnly){e.preventDefault();apply(suggestion);}if(e.key==='Escape'){box.hidden=true;suggestion='';}});
 input.addEventListener('input',()=>{select.value='';request++;box.hidden=true;suggestion='';});
 input.addEventListener('focus',recommend);
 $('doc-list').addEventListener('change',()=>{request++;recommend();});
 new MutationObserver(()=>{request++;if(!pending)recommend();}).observe($('project-name'),{childList:true});
 model.onclick=async()=>{
  if(pending||state.generating)return;
  if(!state.project)return notice('请先选择项目');
  const version=++request,scope=signature(),original=input.value;
  try{const config=generationConfig();pending=true;model.disabled=true;model.textContent='正在建议…';
   const result=await api('/api/focus-suggest',{project:state.project.id,files:[...state.selected],focus:original,...config});
   if(version!==request||scope!==signature()||input.value!==original||state.generating){notice('项目或目标已变化，已忽略过期建议。');return;}
   offer(result.suggestion,'模型建议 · '+result.model);
  }catch(e){notice(e.message+'；仍可使用离线预设或自定义。');}
  finally{pending=false;model.disabled=false;model.textContent='模型建议';}
 };
 recommend();
})();
