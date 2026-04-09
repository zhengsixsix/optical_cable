const fs=require('fs');
const xml=fs.readFileSync('E:/xianyu/海底光缆/tmp/sld_compare/sample/xl/drawings/drawing2.xml','utf8');
const blocks=xml.match(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g)||[];
const idx=blocks.findIndex(b=>b.includes('name=\"正方形/長方形 317\"'));
const b=blocks[idx];
console.log(b);
console.log('len',b.length);
