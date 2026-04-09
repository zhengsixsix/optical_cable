import zipfile
import xml.etree.ElementTree as ET

path = r"E:\Desktop\SLD文件中海底设备图标解释.docx"
with zipfile.ZipFile(path) as z:
    xml = z.read('word/document.xml')
root = ET.fromstring(xml)
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
idx = 1
for p in root.findall('.//w:p', ns):
    texts = [t.text for t in p.findall('.//w:t', ns) if t.text]
    if texts:
        print(f"{idx:03d}: {''.join(texts)}")
        idx += 1
