const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const {startFixture}=require('./fixture.cjs');
const executablePath=process.env.CHROMIUM_EXECUTABLE;
test('original txAdmin shell adapts ARK maps, live monitor, console, Discord admins and mobile navigation',async()=>{
 const fixture=await startFixture();let browser;
 try{
  browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(fixture.base);await page.getByRole('link',{name:'Acceder con Discord',exact:true}).waitFor();
  assert.equal(await page.locator('input[type=password]').count(),0);
  await context.addCookies([{name:'session',value:'fixture-owner',url:fixture.base},{name:'XSRF-TOKEN',value:'fixture-csrf',url:fixture.base}]);
  await page.goto(fixture.base+'/?map=island');await page.getByText('14.5%',{exact:true}).first().waitFor();
  await page.screenshot({path:'/tmp/obelisk-txadmin-desktop.png',fullPage:true});
  await page.getByRole('combobox',{name:'Mapa del clúster'}).click();await page.getByRole('option',{name:'Fixture Scorched Earth'}).click();
  await page.getByText('27.5%',{exact:true}).first().waitFor();assert.match(page.url(),/map=scorched/);
  await page.getByRole('link',{name:'Consola en directo',exact:true}).click();await page.locator('.xterm-screen').waitFor();
  await page.goto(fixture.base+'/server/resources?map=scorched');await page.getByText('oMonitor',{exact:true}).first().waitFor();
  await page.goto(fixture.base+'/admins?map=scorched');await page.getByRole('heading',{name:'Administradores',exact:true}).waitFor();
  await page.getByLabel('Alias del panel').fill('fixture-invited');await page.getByLabel('ID de usuario de Discord',{exact:true}).fill('100000000000000002');await page.getByRole('button',{name:'Autorizar cuenta',exact:true}).click();await page.getByText('fixture-invited',{exact:true}).waitFor();
  assert.equal(fixture.state.admins.find(a=>a.id==='invited').discordId,'100000000000000002');
  await page.goto(fixture.base+'/server/cfg-editor?map=scorched');await page.getByText('Detén el mapa antes de editar.',{exact:false}).waitFor();assert.equal(await page.locator('#ark-ini-content').getAttribute('readonly'),'');
  await page.goto(fixture.base+'/cluster?map=scorched');await page.getByRole('checkbox',{name:'Fixture Island',exact:true}).check();await page.getByRole('checkbox',{name:'Fixture Scorched Earth',exact:true}).check();await page.getByRole('button',{name:'Guardar seleccionados',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.locator('input').fill('GUARDAR 2');await dialog.getByRole('button',{name:'Guardar',exact:true}).click();await page.getByText('Fixture Island: Solicitud aceptada',{exact:true}).waitFor();assert.deepEqual(fixture.state.commands.slice(-2).map(item=>item.mapId),['island','scorched']);
  const routes=['/cluster','/','/players','/history','/allowlist','/server/console','/server/resources','/server/server-log','/server/cfg-editor','/admins','/settings','/hub','/tasks','/system/action-log','/system/diagnostics'];
  for(const route of routes){await page.goto(fixture.base+route+'?map=scorched');await page.locator('main').waitFor();await page.waitForTimeout(200);assert.equal(await page.getByText('Something went wrong',{exact:false}).count(),0,route);}
  for(const width of [320,390,768,1024,1280,1440]){
   await page.setViewportSize({width,height:950});await page.goto(fixture.base+'/cluster?map=scorched');await page.getByRole('heading',{name:'Clúster ARK',exact:true}).waitFor();
   const overflow=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth}));assert.ok(overflow.width<=width+1,JSON.stringify(overflow));
   if(width===390)await page.screenshot({path:'/tmp/obelisk-txadmin-mobile.png',fullPage:true});
  }
  await page.setViewportSize({width:390,height:950});await page.getByRole('button',{name:'Menú del servidor',exact:true}).click();await page.getByRole('dialog').getByRole('combobox',{name:'Mapa del clúster'}).waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);console.log('Browser verified: txAdmin shell, 2 fixture maps, 15 routes, 6 viewport widths, Discord invitation.');
 }finally{await browser?.close();await fixture.close();}
});
