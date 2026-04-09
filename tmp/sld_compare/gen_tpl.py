import re
import pathlib
base = pathlib.Path(r"E:\xianyu\海底光缆\tmp\sld_compare")

def make_template(path):
    xml = pathlib.Path(path).read_text(encoding='utf-8').strip()
    after_to = xml.split('</xdr:to>', 1)[1]
    body = after_to[:-len('</xdr:twoCellAnchor>')]
    anchor = ('<xdr:twoCellAnchor>'
              '<xdr:from><xdr:col>{{FROM_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{FROM_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>'
              '<xdr:to><xdr:col>{{TO_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{TO_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>'
              + body + '</xdr:twoCellAnchor>')
    idx = 0
    def rep(_):
        nonlocal idx
        out = f'<xdr:cNvPr id="{{{{ID_{idx}}}}}" name="{{{{NAME}}}}"'
        idx += 1
        return out
    anchor = re.sub(r'<xdr:cNvPr id="[^"]*" name="[^"]*"', rep, anchor)
    return anchor, idx

tpls = {
    'SE_BU': make_template(base / 'group19_block.xml'),
    'OADM_CORE': make_template(base / 'group314_block.xml'),
    'OADM_BAR': make_template(base / 'rect317_block.xml'),
}
out = []
for k, (v, count) in tpls.items():
    out.append(f'===== {k} ids={count} len={len(v)} =====')
    out.append(v)
    out.append('')
(base / 'generated_templates.txt').write_text('\n'.join(out), encoding='utf-8')
print('wrote', base / 'generated_templates.txt')
