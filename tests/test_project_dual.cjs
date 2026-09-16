const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const base=process.env.LITHOS_TEST_URL;if(!base)throw Error('Isolated test URL required');
 const browser=await chromium.launch({headless:true,executablePath:process.env.LITHOS_BROWSER});
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base+'/app');await page.waitForSelector('.ws-pane');
  await page.waitForFunction(()=>state.projects.some(p=>p.name.includes('界面验收')));
  await page.evaluate(async()=>{await chooseProject(state.projects.find(p=>p.name.includes('界面验收')));await LithosWorkspace.page('work');});
  await page.locator('.project-file-picker').evaluate(el=>el.open=true);
  await page.getByRole('button',{name:'预览 需求.md',exact:true}).click();
  await page.locator('.project-preview-body table').waitFor();
  assert.equal(await page.locator('.obs-project-context #focus').isVisible(),true);
  await page.getByRole('button',{name:'加入沉淀材料',exact:true}).click();
  assert.equal(await page.evaluate(()=>state.selected.size),1);
  await page.locator('#manual-draft').click();await page.waitForFunction(()=>!!state.draft);
  await page.locator('#draft-content').fill('# 双栏草稿\n保留当前编辑');
  await page.evaluate(()=>LithosWorkspace.openProject(state.project,state.files.find(f=>f.name==='验收.docx')));
  await page.frameLocator('.project-preview-body iframe').getByText('项目 Word 验收',{exact:true}).waitFor();
  assert.match(await page.locator('#draft-content').inputValue(),/保留当前编辑/);
  assert.equal(await page.evaluate(()=>state.selected.size),1);
  const separator=page.getByRole('separator',{name:'调整预览与 AI 沉淀宽度'}),before=await separator.getAttribute('aria-valuenow');
  const box=await separator.boundingBox();await page.mouse.move(box.x+3,box.y+40);await page.mouse.down();await page.mouse.move(box.x-140,box.y+40,{steps:8});await page.mouse.up();
  assert.notEqual(await separator.getAttribute('aria-valuenow'),before);
  await separator.focus();await page.keyboard.press('ArrowRight');const ratio=await separator.getAttribute('aria-valuenow');
  await page.locator('#save-draft').click();await page.waitForFunction(()=>state.draft.content===document.querySelector('#draft-content').value);
  await page.waitForTimeout(600);await page.reload();await separator.waitFor();await page.waitForFunction(()=>state.project&&state.files.length);assert.equal(await separator.getAttribute('aria-valuenow'),ratio);
  await page.getByRole('button',{name:'展开 / 还原沉淀',exact:true}).click();assert.equal(await page.locator('.project-preview-pane').isVisible(),false);
  await page.getByRole('button',{name:'展开 / 还原沉淀',exact:true}).click();assert.equal(await page.locator('.project-preview-pane').isVisible(),true);
  await page.evaluate(()=>LithosWorkspace.openProject(state.project,state.files.find(f=>f.name==='验收.docx')));await page.frameLocator('.project-preview-body iframe').getByText('项目 Word 验收',{exact:true}).waitFor();
  if(process.env.LITHOS_SCREENSHOT)await page.screenshot({path:process.env.LITHOS_SCREENSHOT});
  assert.deepEqual(errors,[]);console.log('PASS: side-by-side Word/Markdown and AI, preserved draft/materials, pointer/keyboard resizing, persisted ratio, expand/restore.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
