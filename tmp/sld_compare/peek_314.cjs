const fs = require('fs');
const xml = fs.readFileSync('E:/xianyu/海底光缆/tmp/sld_compare/sample/xl/drawings/drawing2.xml','utf8');
const blocks = xml.match(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g) || [];
const idx = blocks.findIndex(b=>b.includes('name=\"グループ化 314\"'));
const b = blocks[idx];
console.log(b.substring(0, 2000));
console.log('...');
console.log(b.substring(b.length-1000));
console.log('len', b.length);
