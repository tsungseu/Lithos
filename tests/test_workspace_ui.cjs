// Isolated server only: real file creation/editing happens in the test workspace.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.LITHOS_BROWSER});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const base=process.env.LITHOS_TEST_URL;if(!base)throw Error('Set isolated LITHOS_TEST_URL');
 const command=id=>page.evaluate(id=>LithosCommands.run(id),id);
 try{
 const bootstrap=await page.request.get(base+'/app');const token=(await bootstrap.text()).match(/name="workbench-token" content="([^"]+)"/)[1];await page.request.post(base+'/api/kb/preferences',{headers:{'X-Workbench-Token':token},data:{}});
  await page.goto(base+'/app');await page.waitForSelector('.ws-pane');
  assert.deepEqual(await page.locator('.header button').evaluateAll(bs=>bs.map(b=>b.dataset.command)),['sidebar','quick','graph','daily','template','commands','project','distill','memory','help','settings']);
  await page.locator('.header [data-command=daily]').click();
  await page.waitForSelector('.kb-article h1');const daily=await page.evaluate(()=>LithosKnowledge.current().pathId);
  await command('daily');assert.equal(await page.evaluate(()=>LithosKnowledge.current().pathId),daily);
  await page.getByRole('button',{name:'阅读 / 编辑',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Markdown 编辑器'});await editor.fill('# Daily\n\nPreserved text\n');
  await editor.press('End');await page.locator('.header [data-command=template]').click();await page.getByRole('button',{name:'问题分析',exact:true}).click();
  assert.match(await editor.inputValue(),/问题分析/);
  await editor.press('Control+z');assert.doesNotMatch(await editor.inputValue(),/问题分析/);
  await editor.fill('# Daily\n\n| Item | Result |\n| --- | --- |\n| Test | Pass |\n\n<script>window.XSS=1</script>\n');
  await editor.press('Control+s');await page.waitForFunction(()=>!LithosKnowledge.current().dirty);
  await page.getByRole('button',{name:'阅读 / 编辑',exact:true}).click();
  assert.equal(await page.locator('.kb-article td').count(),2);assert.equal(await page.evaluate(()=>window.XSS),undefined);
  await command('daily');assert.match(await page.evaluate(()=>LithosKnowledge.current().content),/Preserved|Daily/);
  await page.getByRole('tab',{name:'搜索',exact:true}).click();await page.getByRole('searchbox',{name:'搜索知识',exact:true}).fill('Daily');
  await page.waitForSelector('.kb-search-results .kb-result');assert.equal(await page.locator('.kb-article td').count(),2);
  await page.locator('.header [data-command=settings]').click();await page.waitForSelector('.ws-settings-modal[open]');
  await page.getByRole('button',{name:'日记与模板',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'日记目录',exact:true}).inputValue(),'日记');
  await page.getByRole('button',{name:'关闭设置'}).click();assert.equal(await page.locator('.kb-article td').count(),2);
  await command('split');assert.equal(await page.locator('.ws-pane').count(),2);assert.equal(await page.locator('.ws-tabs').count(),2);
  await page.locator('.ws-pane.is-active [data-command=more]').click();await page.getByRole('button',{name:'新标签页',exact:true}).count();await page.keyboard.press('Escape');
  await page.locator('.ws-pane.is-active [data-command=blank]').click();assert.equal(await page.locator('.ws-blank').count(),1);
  await command('reopen');await command('back');
  await page.screenshot({path:process.env.LITHOS_SCREENSHOT||'workspace-ui.png'});
  await page.setViewportSize({width:800,height:750});assert.equal(await page.locator('.ws-pane:visible').count(),1);
  await page.locator('.header [data-command=sidebar]').click();assert.equal(await page.locator('.explorer:visible').count(),1);
  await page.locator('.header [data-command=sidebar]').click();
  await page.setViewportSize({width:1280,height:800});
  await command('new-note');await page.getByRole('textbox',{name:'知识库内相对目录'}).fill('');await page.getByRole('textbox',{name:'笔记标题',exact:true}).fill('UI-'+Date.now());await page.getByRole('button',{name:'创建',exact:true}).click();
  await editor.waitFor();await editor.fill('# Unsaved sentinel');
  await page.locator('.ws-pane.is-active .ws-tab.active .ws-tab-close').click();await page.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await editor.inputValue(),'# Unsaved sentinel');
  await editor.press('Control+s');await page.waitForFunction(()=>!LithosKnowledge.current().dirty);
  await page.waitForTimeout(600);
  await page.reload();await page.waitForSelector('.ws-pane');assert.equal(await page.locator('.ws-pane').count(),2);
  assert.deepEqual(errors,[]);console.log('Workspace UI passed: ribbon, daily idempotence, template undo, safe Markdown, sidebar search, modal, groups, unsaved cancel, persistence, narrow viewport.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
