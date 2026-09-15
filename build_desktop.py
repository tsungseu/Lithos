"""Build per-user offline Windows desktop installer from verified local inputs."""
from pathlib import Path
import hashlib, shutil, subprocess, zipfile
import build_package
from PIL import Image, ImageDraw, ImageFont

BASE=Path(__file__).resolve().parent
CACHE=BASE.parent/'work/desktop-build'
PAYLOAD=CACHE/'payload'
PAYLOAD.mkdir(exist_ok=True)
for name in build_package.FILES:
    if name=='启动工作台.cmd':continue
    shutil.copy2(BASE/name,PAYLOAD/name)
shutil.copytree(build_package.PACKAGE/'runtime',PAYLOAD/'runtime',dirs_exist_ok=True)
shutil.copytree(BASE/'vendor',PAYLOAD/'vendor',dirs_exist_ok=True)
shutil.copy2(BASE/'desktop_host.py',PAYLOAD/'desktop_host.py')
shutil.copy2(BASE/'desktop/安装版使用说明.txt',PAYLOAD/'安装版使用说明.txt')
shutil.copy2(build_package.PACKAGE/'第三方组件声明.txt',PAYLOAD/'第三方组件声明.txt')
with zipfile.ZipFile(CACHE/'webview2.nupkg') as z:
    for name in ['lib/net462/Microsoft.Web.WebView2.Core.dll','lib/net462/Microsoft.Web.WebView2.WinForms.dll','runtimes/win-x64/native/WebView2Loader.dll']:
        (PAYLOAD/Path(name).name).write_bytes(z.read(name))
    for name in z.namelist():
        if 'license' in name.lower() and not name.endswith('/'):
            (PAYLOAD/'WebView2-LICENSE.txt').write_bytes(z.read(name));break
csc=Path('C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe')
icon=Image.new('RGBA',(256,256),(0,0,0,0));draw=ImageDraw.Draw(icon)
for points,color in [([(32,3),(55,17),(51,45),(29,61),(9,45),(12,19)],'#7f6df2'), ([(32,3),(29,28),(12,19)],'#a68af9'), ([(32,3),(55,17),(29,28)],'#c4b5fd'), ([(29,28),(55,17),(51,45)],'#8b5cf6'), ([(29,28),(51,45),(29,61)],'#6d42b5'), ([(9,45),(29,28),(29,61)],'#4c2889')]:
    draw.polygon([(x*4,y*4) for x,y in points],fill=color)
icon.save(CACHE/'app.ico',sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
subprocess.run([str(csc),'/nologo','/target:winexe','/platform:x64','/win32icon:'+str(CACHE/'app.ico'),'/out:'+str(PAYLOAD/'Workbench.exe'),'/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:'+str(PAYLOAD/'Microsoft.Web.WebView2.Core.dll'),'/reference:'+str(PAYLOAD/'Microsoft.Web.WebView2.WinForms.dll'),str(BASE/'desktop/App.cs')],check=True)
with (PAYLOAD/'第三方组件声明.txt').open('a',encoding='utf-8') as f:
    f.write('\n桌面版：Microsoft WebView2 SDK 1.0.2903.40；WebView2-LICENSE.txt。\n内含微软签名的WebView2 Evergreen x64离线安装程序，来源https://go.microsoft.com/fwlink/p/?LinkId=2124701。\n安装程序由Inno Setup 6.4.3构建。桌面外壳为本项目实现。\n')
subprocess.run([str(CACHE/'inno643/ISCC.exe'),'/Qp',str(BASE/'desktop/installer.iss')],check=True)
installer=BASE.parent/'outputs/曜石-Lithos-v3.2.0-Setup-x64.exe'
digest=hashlib.sha256(installer.read_bytes()).hexdigest()
installer.with_suffix('.sha256.txt').write_text(digest+'  '+installer.name+'\n',encoding='utf-8')
print('Installer ready:',installer,'SHA256:',digest,flush=True)
