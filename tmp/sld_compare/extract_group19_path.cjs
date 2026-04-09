const fs = require('fs');
const xml = fs.readFileSync('E:/xianyu/海底光缆/tmp/sld_compare/sample/xl/drawings/drawing1.xml','utf8');
const blocks = xml.match(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g) || [];
const idx = blocks.findIndex(b=>b.includes('name=\"Group 19\"'));
const b = blocks[idx];
const sp = (b.match(/<xdr:sp[\s\S]*?<\/xdr:sp>/g)||[])[0] || '';
const path = (sp.match(/<a:pathLst>[\s\S]*?<\/a:pathLst>/)||[])[0] || '';
console.log(path.substring(0, 1200));
