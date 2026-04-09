const ExcelJS = require('E:/xianyu/海底光缆/node_modules/exceljs');
const fs = require('fs');
const path = require('path');

async function run() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('E:/Desktop/SLD示例.xlsx');

  const result = {};
  wb.worksheets.forEach(ws => {
    const sheetName = ws.name.trim();
    const entries = [];
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      row.eachCell({ includeEmpty: false }, (cell, cn) => {
        const f = cell.font || {}, b = cell.border || {};
        const isSlave = cell.type === 6;
        const val = isSlave ? null : cell.value;
        const bold = !!f.bold;
        const size = f.size === 11 ? 11 : (f.size || 9);
        const bT = b.top?.style || '', bB = b.bottom?.style || '';
        const bL = b.left?.style || '', bR = b.right?.style || '';
        let bdr = '';
        if (bL === 'medium' && bR === 'medium' && bT === 'medium') bdr = 'mTLR';
        else if (bL === 'medium' && bR === 'medium' && bB === 'medium') bdr = 'mBLR';
        else if (bL === 'medium' && bR === 'medium') bdr = 'mLR';
        else if (bT === 'thin' && bB === 'thin' && bL === 'thin' && bR === 'thin') bdr = 'thin';
        else if (bT === 'thin' && bB === 'thin' && bL === 'double') bdr = 'thinDL';
        else if (bT === 'thin' || bB === 'thin' || bL === 'thin' || bR === 'thin') bdr = 'thinPart';
        const e = { r: rn, c: cn, v: val };
        if (bold) e.bold = 1;
        if (size !== 9) e.sz = size;
        if (bdr) e.bdr = bdr;
        if (isSlave) e.slave = 1;
        entries.push(e);
      });
    });
    result[sheetName] = entries;
  });
  fs.writeFileSync('E:/xianyu/海底光缆/scripts/sld_data.json', JSON.stringify(result, null, 0));
  console.log('Written:', path.join(__dirname, 'sld_data.json'));
  Object.keys(result).forEach(k => console.log(k + ': ' + result[k].length + ' cells'));
}
run().catch(e => { console.error(e.message); process.exit(1); });
