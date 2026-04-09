const fs=require('fs');
const xml=fs.readFileSync('E:/xianyu/海底光缆/tmp/sld_compare/sample/xl/drawings/drawing1.xml','utf8');
const blocks=xml.match(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g)||[];
const idx=blocks.findIndex(b=>b.includes('name=\"Group 19\"'));
const b=blocks[idx];
fs.writeFileSync('E:/xianyu/海底光缆/tmp/sld_compare/group19_block.xml', b);
console.log('len', b.length);
