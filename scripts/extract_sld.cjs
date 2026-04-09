const ExcelJS = require('../node_modules/exceljs');
const fs = require('fs');

async function run() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('E:/Desktop/SLD\u793a\u4f8b.xlsx');

  const result = {};
  wb.worksheets.forEach(ws => {
    const sheetName = ws.name.trim();
    const entries = [];
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      row.eachCell({ includeEmpty: true }, (cell, cn) => {
        // 跳过完全没有内容的空格（无值且无有任何边框样式）
        const bEmpty = !cell.border || (!cell.border.top && !cell.border.bottom && !cell.border.left && !cell.border.right);
        const isSlave = cell.type === 6;
        if (!isSlave && (cell.value === null || cell.value === undefined) && bEmpty) return;
        const f = cell.font || {}, b = cell.border || {};
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
        else if (bT === 'thin' && bB === 'thin' && bL === 'double' && bR === 'thin') bdr = 'thinDL';
        else if (!bT && !bB && bL === 'double' && bR === 'thin') bdr = 'dLtR';
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
  fs.writeFileSync('E:/xianyu/\u6d77\u5e95\u5149\u7f06/scripts/sld_data.json', JSON.stringify(result));
  console.log('Done.');
  Object.keys(result).forEach(k => console.log(k + ': ' + result[k].length + ' cells'));
}
run().catch(e => { console.error(e.message); process.exit(1); });
