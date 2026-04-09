const path = require('path');
const fs = require('fs');
const ExcelJS = require(path.resolve('E:/xianyu/海底光缆/node_modules/exceljs'));

async function enrich(kindData, workbookPath){
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(workbookPath);
  const ws = wb.worksheets[0];
  const rows = [];
  for (const item of kindData){
    const excelCol = item.fromCol + 2;
    const excelRow = item.fromRow + 4;
    const v = ws.getCell(excelRow, excelCol).value;
    let text = '';
    if (typeof v === 'string') text = v;
    else if (typeof v === 'number') text = String(v);
    else if (v && typeof v === 'object') {
      if (v.richText) text = v.richText.map(t=>t.text).join('');
      else if (v.text) text = v.text;
      else if (v.result !== undefined) text = String(v.result);
      else text = '';
    }
    rows.push({ ...item, excelCol, excelRow, cellValue: text || '' });
  }
  return rows;
}

(async ()=>{
  const base = 'E:/xianyu/海底光缆/tmp/sld_compare';
  const summary = JSON.parse(fs.readFileSync(path.join(base,'drawing1_summary.json'),'utf8'));
  const sampleRows = await enrich(summary.sample.names, 'E:/Desktop/SLD示例.xlsx');
  const currentRows = await enrich(summary.current.names, 'E:/网页下载/SLD_安全路线_SLD_20260407.xlsx');

  function stats(rows){
    const byKind = {};
    for (const r of rows){
      if (!byKind[r.kind]) byKind[r.kind] = {};
      const key = r.cellValue || '<empty>';
      byKind[r.kind][key] = (byKind[r.kind][key]||0)+1;
    }
    return byKind;
  }

  const out = { sampleRows, currentRows, sampleStats: stats(sampleRows), currentStats: stats(currentRows) };
  fs.writeFileSync(path.join(base,'drawing1_with_cells.json'), JSON.stringify(out, null, 2), 'utf8');
  console.log(JSON.stringify({
    sampleKinds: Object.keys(out.sampleStats),
    currentKinds: Object.keys(out.currentStats),
    sampleStats: out.sampleStats,
    currentStats: out.currentStats,
  }, null, 2));
})();
