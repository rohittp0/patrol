// Playwright CLI callback. Run against npm run dev in an isolated CLI session.
async basePage => {
  const context = await basePage.context().browser().newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  // Test the real renderer independently of map layout/ResizeObservers.
  await page.route('**/src/main.ts', route => route.fulfill({ contentType:'text/javascript', body:'' }));
  await page.routeWebSocket('**', socket => socket.close());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('http://localhost:3000/patrol/');
    const result = await page.evaluate(async () => {
      const renderer = await import('/patrol/src/poster-renderer.ts');
      const { CASE_FILES, portraitPath } = await import('/patrol/src/game/case-files.ts');
      const assert = (condition, message) => { if (!condition) throw new Error(message); };
      const originalDraw = CanvasRenderingContext2D.prototype.drawImage;
      const passed = [], timings = [];
      const originalDecode = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = function() {
        return this.src.includes('arrest-scene') ? Promise.reject(new DOMException('Decode failure fixture','EncodingError')) : originalDecode.call(this);
      };
      try {
        let rejected = false;
        try { await renderer.prepareNewspaperAssets('india'); } catch { rejected = true; }
        assert(rejected, 'failed scene decode was accepted');
        passed.push('scene decode failure rejects preparation');
      } finally { HTMLImageElement.prototype.decode = originalDecode; }
      let blankSceneOnce = true;
      // A decoded image that rasterizes to nothing must fail preparation, rather
      // than enabling an export of floating heads. The failed cache must retry.
      CanvasRenderingContext2D.prototype.drawImage = function(...args) {
        if (blankSceneOnce && args[0] instanceof HTMLImageElement && args[0].src.includes('arrest-scene')) {
          blankSceneOnce = false; return;
        }
        return originalDraw.apply(this, args);
      };
      try {
        let rejected = false;
        try { await renderer.prepareNewspaperAssets('india'); } catch { rejected = true; }
        assert(rejected, 'empty scene raster was accepted');
        passed.push('empty raster rejects asset preparation');
      } finally { CanvasRenderingContext2D.prototype.drawImage = originalDraw; }
      const started = performance.now();
      const india = await renderer.prepareNewspaperAssets('india');
      timings.push({ operation: 'India scene and officer preparation after retry', ms: performance.now() - started });
      assert(india.scene.width === 768 && india.scene.height === 512, 'scene raster exceeded its bounded size');
      assert(await renderer.prepareNewspaperAssets('india') === india, 'warm assets were not cached');
      passed.push('failed preparation retries; warm assets reused; scene buffer bounded');
      const officer = india.officer.canvas, pixels = officer.getContext('2d').getImageData(0,0,officer.width,officer.height).data;
      assert(pixels[(420 * officer.width + 80) * 4 + 3] === 0, 'officer shirt remains outside the neck');
      assert(pixels[(400 * officer.width + 256) * 4 + 3] > 0, 'officer neck was removed');
      passed.push('default officer shirt removed while retaining the neck');

      // Model a dropped filtered multiply draw. Before the fix this produces the
      // reported heads-only symptom (body-region contrast 6.1 rather than 50+).
      // This is a regression probe, not a claim to reproduce the OnePlus driver.
      CanvasRenderingContext2D.prototype.drawImage = function(...args) {
        if (this.filter === 'grayscale(1)' && this.globalCompositeOperation === 'multiply') return;
        return originalDraw.apply(this,args);
      };
      const gallery = document.createElement('div'); gallery.id = 'art-gallery';
      gallery.style.cssText = 'position:absolute;z-index:10000;inset:0 auto auto 0;width:1200px;display:grid;grid-template-columns:repeat(3,400px);background:#ede3cc';
      document.body.append(gallery);
      try {
        for (const [country, cases] of Object.entries(CASE_FILES)) {
          const assets = await renderer.prepareNewspaperAssets(country);
          for (const file of cases) {
            const fugitive = new Image(); fugitive.src = '/patrol/' + portraitPath(file); await fugitive.decode();
            const report = { file, country, countryId:country, region:'Test region', moves:2, squads:3, score:6, hunt:1 };
            const newspaper = document.createElement('canvas'), start = performance.now();
            renderer.drawNewspaper(newspaper, report, '', fugitive, null, assets);
            timings.push({ operation:file.id, ms:performance.now()-start });
            const data = newspaper.getContext('2d').getImageData(60,700,680,170).data;
            let sum=0, squares=0, n=0;
            for(let i=0;i<data.length;i+=4) { sum+=data[i]; squares+=data[i]*data[i]; n++; }
            const contrast = Math.sqrt(squares/n-(sum/n)**2);
            assert(contrast>25, `${country}/${file.id}: missing scene, body contrast ${contrast}`);
            const tile=document.createElement('div'), label=document.createElement('p'), photo=document.createElement('canvas');
            label.textContent=country+' / '+file.shortName; label.style.margin='8px';
            photo.width=715; photo.height=430; photo.style.width='400px'; photo.style.display='block';
            photo.getContext('2d').drawImage(newspaper,48,456,715,430,0,0,715,430);
            tile.append(label,photo);gallery.append(tile);
          }
        }
        passed.push('all 18 cases retain scene content with the filtered blend draw disabled');
        const source = new Image(); source.src = '/patrol/' + india.artwork.officerPath; await source.decode();
        const crop = document.createElement('canvas'); crop.width=crop.height=512;
        const cropContext=crop.getContext('2d'); cropContext.beginPath(); cropContext.arc(256,256,256,0,Math.PI*2); cropContext.clip();
        cropContext.drawImage(source,-77,-26,666,666);
        const before=crop.toDataURL(), newspaper=document.createElement('canvas'), calls=[];
        CanvasRenderingContext2D.prototype.drawImage=function(...args) {
          if(this.canvas===newspaper && args.length===9) calls.push(args);
          return originalDraw.apply(this,args);
        };
        const file=CASE_FILES.india[0], fugitive=new Image(); fugitive.src='/patrol/'+portraitPath(file); await fugitive.decode();
        renderer.drawNewspaper(newspaper,{file,country:'India',countryId:'india',region:'Test region',moves:2,squads:3,score:6,hunt:1},'',fugitive,crop,india);
        const placed=calls[0];
        assert(Math.abs(placed[7]-133.2)<1 && Math.abs(placed[8]-133.2)<1, 'uploaded circular crop changed its chosen print scale');
        assert(before===crop.toDataURL(), 'saved player crop was mutated');
        const tile=document.createElement('div'),label=document.createElement('p'),photo=document.createElement('canvas');
        label.textContent='India / generated circular player crop';label.style.margin='8px';photo.width=715;photo.height=430;photo.style.width='400px';
        photo.getContext('2d').drawImage(newspaper,48,456,715,430,0,0,715,430);tile.append(label,photo);gallery.append(tile);
        passed.push('uploaded crop keeps previous print scale and source pixels');
      } finally { CanvasRenderingContext2D.prototype.drawImage = originalDraw; }
      return { passed, timings };
    });
    await page.locator('#art-gallery').screenshot({ path:`output/playwright/newspaper-art-gallery-${basePage.context().browser().browserType().name()}.png` });
    if (errors.length) throw new Error(errors.join('; '));
    return result;
  } finally { await context.close(); }
}
