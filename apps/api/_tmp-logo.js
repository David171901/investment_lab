const KEY = process.argv[2];
const T = ['ADBE','BAP','BVN','CRWD','FDX','FDXF','GOOG','LMND','META','MSFT','NFLX','PEP','PG','V'];
(async () => {
  let ok = 0, sin = 0, fail = 0;
  for (const t of T) {
    const p = await (await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${t}&token=${KEY}`)).json();
    if (!p.logo) { console.log('  ' + t.padEnd(6) + String(p.name||'').padEnd(36) + 'SIN LOGO'); sin++; continue; }
    try {
      const r = await fetch(p.logo);
      const ct = r.headers.get('content-type') || '';
      if (r.status === 200 && ct.startsWith('image/')) { console.log('  ' + t.padEnd(6) + String(p.name).padEnd(36) + 'logo OK (' + ct + ')'); ok++; }
      else { console.log('  ' + t.padEnd(6) + String(p.name).padEnd(36) + 'logo HTTP ' + r.status); fail++; }
    } catch (e) { console.log('  ' + t.padEnd(6) + 'error ' + e.message); fail++; }
    await new Promise(r => setTimeout(r, 250));
  }
  console.log('\n  con logo: ' + ok + ' | sin logo: ' + sin + ' | fallo: ' + fail + '  (de ' + T.length + ')');
})();
