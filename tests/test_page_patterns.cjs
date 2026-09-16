// Use an isolated QA workspace; no model requests or production document writes.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const base=process.env.LITHOS_TEST_URL;if(!base)throw Error('Set isolated LITHOS_TEST_URL');
 const browser=await chromium.launch({headless:true,executablePath:process.env.LITHOS_BROWSER});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const shot=async name=>{if(process.env.LITHOS_SCREENSHOT_PREFIX)await page.screenshot({path:process.env.LITHOS_SCREENSHOT_PREFIX+'-'+name+'.png'});};
 const command=id=>page.evaluate(id=>LithosCommands.run(id),id);
 try{
  await page.goto(base+'/app');await page.waitForSelector('.ws-pane');
  await page.evaluate(()=>LithosWorkspace.page('home'));await page.waitForTimeout(600);
  assert.doesNotMatch(await page.locator('#notice').textContent(),/Cannot read|TypeError|ReferenceError/);await shot('home');
  await command('project');await page.waitForFunction(()=>state.projects.some(p=>p.name.includes('界面验收')));
  await page.evaluate(()=>chooseProject(state.projects.find(p=>p.name.includes('界面验收'))));
  await page.locator('.project-file-picker').evaluate(el=>el.open=true);await page.locator('.obs-files input[type=checkbox]').first().check();
  const selected=await page.locator('#selection-count').innerText();await shot('project');
  await page.locator('.header [data-command=distill]').click();
  assert.equal(await page.locator('#selection-count').innerText(),selected);
  await page.locator('#prepare').click();await page.locator('#preview-dialog:visible').waitFor();
  let generated=false;
  await page.route('**/api/generate',async route=>{generated=true;assert.ok(route.request().postDataJSON().preview);await route.fulfill({json:{id:'test-ai',project:'界面验收',model:'模拟模型',created:'2026-09-16T00:00:00',content:'# AI 测试草稿',published:false}});});
  await page.evaluate(()=>{generationConfig=()=>({endpoint:'http://127.0.0.1:1/v1',model:'test',key:''});});
  await page.locator('#generate').click();await page.waitForFunction(()=>state.draft?.id==='test-ai');assert.equal(generated,true);
  assert.equal(await page.locator('#reviewed').isChecked(),false);
  await page.evaluate(()=>{state.draft=null;});
  await page.locator('#manual-draft').click();await page.waitForFunction(()=>state.draft && state.draft.id!=='test-ai');await page.locator('#draft-form:visible').waitFor();
  await page.locator('#draft-content').fill('# 测试草稿\n\n保留来源并审核后入库。');
  await page.locator('#draft-content').press('Control+s');await page.waitForFunction(()=>state.draft.content===document.querySelector('#draft-content').value);
  let releaseSave,receivedSave;
  const received=new Promise(r=>receivedSave=r),release=new Promise(r=>releaseSave=r);
  await page.route('**/api/save-draft',async route=>{receivedSave();await release;await route.continue();});
  await page.locator('#draft-content').fill('# 保存快照');await page.locator('#save-draft').click();await received;
  await page.locator('#draft-content').fill('# 测试草稿\n\n保存期间继续编辑');releaseSave();
  await page.waitForFunction(()=>state.draft.content==='# 保存快照');assert.notEqual(await page.locator('#draft-content').inputValue(),await page.evaluate(()=>state.draft.content));
  await page.unroute('**/api/save-draft');
  await command('project');await command('distill');
  assert.match(await page.locator('#draft-content').inputValue(),/测试草稿/);await shot('distill');
  await command('settings');await page.getByRole('searchbox',{name:'搜索设置',exact:true}).fill('供应商');
  assert.equal(await page.locator('.settings-tabs button:visible').count(),1);
  await page.locator('[data-setting=models]').click();await shot('models');
  await page.locator('#provider-add').click();await page.locator('.obs-provider-edit').waitFor();
  assert.equal(await page.locator('#provider-list').isVisible(),false);await shot('provider');
  await page.getByRole('button',{name:'返回供应商列表',exact:true}).click();
  assert.equal(await page.locator('#settings-model-form').isVisible(),false);
  await page.getByRole('searchbox',{name:'搜索设置',exact:true}).fill('');
  for(const tab of await page.locator('.settings-tabs button').all()){await tab.click();assert.equal(await page.locator('.settings-tabs button.active').count(),1);}
  await page.locator('[data-setting=interface]').click();const nav=page.getByRole('checkbox',{name:'显示左侧导航',exact:true});await nav.uncheck();assert.equal(await page.evaluate(()=>document.body.classList.contains('sidebar-collapsed')),true);await nav.check();
  await page.locator('[data-setting=editor]').click();const wide=page.getByRole('checkbox',{name:'宽幅阅读',exact:true});await wide.check();assert.equal(await page.evaluate(()=>document.querySelector('.kb-layout').classList.contains('kb-wide')),true);await wide.uncheck();
  await page.locator('[data-setting=shortcuts]').click();assert.ok(await page.locator('#setting-shortcuts kbd').count()>0);
  await page.locator('[data-setting=appearance]').click();await page.locator('[data-theme-choice=light]').click();await shot('settings-light');
  await page.getByRole('button',{name:'关闭设置'}).click();await command('help');await shot('help');await page.getByRole('button',{name:'关闭使用指南',exact:true}).click();
  await page.setViewportSize({width:780,height:850});await command('distill');await shot('narrow');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);console.log('PASS: page layouts, preserved material/draft, settings categories/search/provider subpage, narrow viewport.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
