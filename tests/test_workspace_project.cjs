// Requires an isolated workspace with project 01_界面验收 and DOCX/XLSX fixtures.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.LITHOS_BROWSER}),base=process.env.LITHOS_TEST_URL;
 if(!base)throw Error('Set isolated LITHOS_TEST_URL');
 try{for(const scale of [1.25,1.5]){
  const context=await browser.newContext({viewport:{width:Math.round(1440/scale),height:Math.round(1080/scale)},deviceScaleFactor:scale});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/app');await page.waitForSelector('.ws-pane');
  await page.locator('.header [data-command=project]').click();
  await page.waitForFunction(()=>state.projects.some(p=>p.name.includes('界面验收')));
  await page.evaluate(async()=>{const p=state.projects.find(p=>p.name.includes('界面验收'));await chooseProject(p);});
  await page.getByRole('button',{name:'预览 需求.md',exact:true}).click();
  await page.locator('.ws-pane.is-active .ws-passive table').waitFor();assert.equal(await page.evaluate(()=>LithosCommands.commands.get('save').enabled()),false);
  if(scale===1.25)await page.locator('.header [data-command=distill]').click();
  else await page.getByRole('button',{name:'用 AI 沉淀此资料',exact:true}).click();
  await page.waitForSelector('#work:visible');assert.match(await page.locator('#selection-count').innerText(),/1 份/);
  assert.equal(await page.locator('#focus').isVisible(),true);assert.equal(await page.locator('#prepare').isEnabled(),true);
  await page.getByRole('button',{name:'预览待发送资料'}).click();await page.waitForFunction(()=>document.querySelector('#preview-content').textContent.includes('离线验收'));assert.match(await page.locator('#preview-content').textContent(),/离线验收/);
  for(const name of ['验收.docx','验收.xlsx']){
   await page.locator('.header [data-command=project]').click();await page.getByRole('button',{name:'预览 '+name,exact:true}).click();
   const frame=page.frameLocator('.ws-pane.is-active iframe');await frame.getByText(name==='验收.docx'?'项目 Word 验收':'Excel',{exact:true}).waitFor({timeout:20000});
  }
  await page.locator('.header [data-command=settings]').click();await page.locator('[data-setting=models]').click();assert.equal(await page.locator('#setting-models').isVisible(),true);await page.locator('[data-setting=account]').click();assert.equal(await page.locator('#setting-account').isVisible(),true);await page.getByRole('button',{name:'关闭设置'}).click();
  await page.screenshot({path:process.env.LITHOS_SCREENSHOT_PREFIX+'-'+scale+'.png'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await context.close();
 }console.log('PASS: project read-only Markdown, add evidence, review preview, offline Word/Excel, model/account settings, emulated 125% and 150% scaling.');}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
