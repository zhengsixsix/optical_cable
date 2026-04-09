import zipfile
path = r"E:\Desktop\SLD文件中海底设备图标解释.docx"
with zipfile.ZipFile(path) as z:
    for name in z.namelist():
        if name.startswith('word/media/'):
            print(name)
