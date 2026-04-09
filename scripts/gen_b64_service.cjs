const fs = require('fs');

const b64 = fs.readFileSync('E:/Desktop/SLD\u793a\u4f8b.xlsx').toString('base64');
const lines = b64.match(/.{1,120}/g);

const content = `/**
 * SLD Excel \u5bfc\u51fa\u670d\u52a1
 * \u8f93\u51fa\u4e0e SLD\u793a\u4f8b.xlsx \u5b8c\u5168\u76f8\u540c\u7684\u683c\u5f0f\uff1aTrunk + Branch \u4e24\u4e2a Sheet\uff0c
 * \u5305\u542b\u6240\u6709 AutoShape \u56fe\u5f62\u7b26\u53f7\uff08\u83f1\u5f62\u7ec8\u7aef\u3001REP\u516d\u8fb9\u5f62\u3001BU\u8239\u5f62\u3001OADM\u8776\u5f62\u7b49\uff09
 *
 * \u5f53\u524d\u4e3a\u6a21\u677f\u6a21\u5f0f\uff1a\u76f4\u63a5\u8f93\u51fa\u793a\u4f8b\u6587\u4ef6\u7684\u5185\u5bb9
 * TODO: \u540e\u7eed\u66ff\u6362\u4e3a\u52a8\u6001\u6570\u636e\u6a21\u677f\u6ce8\u5165\u6a21\u5f0f
 */

// \u793a\u4f8b\u6587\u4ef6 base64\uff08\u542b\u5b8c\u6574\u56fe\u5f62+\u683c\u5f0f\uff09
const SLD_TEMPLATE_B64 =
  '${lines.join("'\n  + '")}';

function b64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

export async function exportSLDToExcel(_table?: unknown): Promise<void> {
  const buf  = b64ToBuffer(SLD_TEMPLATE_B64)
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const ts   = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  link.href     = url
  link.download = \`SLD_\${ts}.xlsx\`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
`;

fs.writeFileSync('E:/xianyu/\u6d77\u5e95\u5149\u7f06/src/services/SLDExcelExportService.ts', content, 'utf8');
const size = fs.statSync('E:/xianyu/\u6d77\u5e95\u5149\u7f06/src/services/SLDExcelExportService.ts').size;
console.log('Written:', size, 'bytes (~' + Math.round(size/1024) + ' KB)');
