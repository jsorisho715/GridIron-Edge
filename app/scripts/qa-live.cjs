// Functional and accessibility checks use synthetic league data, never cookies.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {AxeBuilder}=require(process.env.AXE_MODULE||'@axe-core/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawn,spawnSync}=require('node:child_process');
let devServer;
process.on('exit',()=>devServer?.kill());
(async()=>{
  if(process.env.SPAWN_QA_SERVER==='1'){
    devServer=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173'],{stdio:'ignore'});
    let ready=false;for(let i=0;i<40;i++){try{const r=await fetch('http://127.0.0.1:5173/app');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert(ready,'QA server did not start');
  }
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage(),errors=[],audits=[];
  const generated=spawnSync('bun',['run','scripts/qa-fixture.ts'],{encoding:'utf8'});assert.equal(generated.status,0,generated.stderr);
  let state=JSON.parse(generated.stdout),locked=true,failSync=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/gridiron/workspace',async route=>{
    if(locked)return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Unlock your private workspace.',code:'locked'})});
    const body=route.request().postDataJSON();let result=state;
    if(body?.action==='preferences'){state.preferences={...state.preferences,...body,updatedAt:Date.now()};result={preferences:state.preferences};}
    if(body?.action==='sync')result={synced:!failSync,workspace:state,...(failSync?{error:'Synthetic provider outage'}:{})};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
  });
  const overflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Page overflows viewport');
  const axe=async label=>{const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();audits.push({label,violations:result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.slice(0,3).map(n=>n.target)}))});};
  await page.goto('http://127.0.0.1:5173/app',{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'Your league. Your eyes only.'}).waitFor();
  assert.equal(await page.getByText(state.snapshot.teamName,{exact:true}).count(),0);
  await axe('locked');
  locked=false;await page.reload({waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'This week. Your edge.'}).waitFor();await overflow();await axe('desktop-today');
  await page.screenshot({path:'/tmp/gridiron-live-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Review lineup',exact:true}).click();await page.getByRole('dialog').waitFor();await axe('lineup-dialog');await page.keyboard.press('Escape');
  const desktopNav=page.getByRole('navigation',{name:'Main navigation'});
  await desktopNav.getByRole('button',{name:'Players',exact:true}).click();
  await page.getByLabel('Search players').fill('Alex');
  const select=page.getByRole('button',{name:/Select .* for comparison/});await select.nth(0).click();await select.nth(1).click();await page.getByRole('button',{name:'Compare players',exact:true}).click();await page.getByRole('heading',{name:'Make the clearer call.'}).waitFor();await axe('comparison-dialog');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:/^Watch Alex/}).first().click();assert.equal(state.preferences.watched.length,1);
  await desktopNav.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Private notes, synced across your devices').fill('Synthetic cross-device game plan');await page.getByRole('button',{name:'Save notes',exact:true}).click();await page.getByText('Notes saved across your devices.',{exact:true}).waitFor();assert.equal(state.preferences.notes,'Synthetic cross-device game plan');await axe('settings');
  await page.reload({waitUntil:'networkidle'});assert.equal(await page.getByLabel('Private notes, synced across your devices').inputValue(),'Synthetic cross-device game plan');
  assert.equal(await page.evaluate(()=>localStorage.getItem('gridiron-sample-v1')),null);
  for(const width of [360,412,448]){
    await page.setViewportSize({width,height:998});await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('button',{name:'Today',exact:true}).click();await overflow();
    if(width===448){await axe('pixel-today');await page.screenshot({path:'/tmp/gridiron-live-pixel.png',fullPage:true});}
    await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('button',{name:'More',exact:true}).click();await overflow();
    await page.locator('.ge-more').getByRole('button',{name:'Waiver wire',exact:true}).click();await overflow();
    if(width===448)await axe('pixel-waivers');
    await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('button',{name:'More',exact:true}).click();await page.locator('.ge-more').getByRole('button',{name:'Reports',exact:true}).click();await overflow();
    if(width===448)await axe('pixel-reports');
    await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('button',{name:'More',exact:true}).click();await page.locator('.ge-more').getByRole('button',{name:'League & history',exact:true}).click();await overflow();
  }
  failSync=true;await page.getByRole('button',{name:'Refresh league',exact:true}).click();await page.getByText('Synthetic provider outage',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'The bigger picture.'}).count(),1);
  await page.reload({waitUntil:'networkidle'});locked=true;await page.reload({waitUntil:'networkidle'});await page.getByRole('heading',{name:'Your league. Your eyes only.'}).waitFor();
  assert.equal(await page.getByText('Synthetic cross-device game plan',{exact:true}).count(),0);
  await browser.close();devServer?.kill();const report={errors,audits,screenshots:['/tmp/gridiron-live-desktop.png','/tmp/gridiron-live-pixel.png'],viewports:[360,412,448,1440]};fs.writeFileSync('/tmp/gridiron-ui-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  assert.equal(errors.length,0);assert.equal(audits.flatMap(a=>a.violations).length,0,'Accessibility violations remain');
})().catch(error=>{console.error(error.stack);process.exit(1);});
