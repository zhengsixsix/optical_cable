const fs=require('fs');
const xml=fs.readFileSync('E:/xianyu/海底光缆/tmp/sld_compare/sample/xl/drawings/drawing2.xml','utf8');
const blocks=xml.match(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g)||[];
const idx314=blocks.findIndex(b=>b.includes('name=\"グループ化 314\"'));
const idx317=blocks.findIndex(b=>b.includes('name=\"正方形/長方形 317\"'));
fs.writeFileSync('E:/xianyu/海底光缆/tmp/sld_compare/group314_block.xml', blocks[idx314]);
fs.writeFileSync('E:/xianyu/海底光缆/tmp/sld_compare/rect317_block.xml', blocks[idx317]);
console.log('len314', blocks[idx314].length, 'len317', blocks[idx317].length);
