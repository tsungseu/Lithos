"""Assemble offline macOS app bundles on any host; native validation needs a Mac."""
import hashlib
import importlib.metadata
import json
from pathlib import Path
import plistlib
import posixpath
import stat
import tarfile
import zipfile
from PIL import Image,ImageDraw
from build_package import FILES, source as source_file

BASE=Path(__file__).resolve().parents[1]
OUT=BASE.parent/'outputs'
CACHE=BASE.parent/'work/mac-build'
VERSION='3.5.5'
TAG='20260901'

def build(arch):
    source=CACHE/f'cpython-3.12.14+{TAG}-{arch}-apple-darwin-install_only_stripped.tar.gz'
    expected={'aarch64':'81a359f1cfadd4da11766534c5913791cea55f26e1bb902cacd2a531bb1e4b2b','x86_64':'65b195c9cedc1fef6767f044f9822069adbd1bd9204d424ece4628776fdc04bb'}
    if hashlib.sha256(source.read_bytes()).hexdigest()!=expected[arch]:raise ValueError('Runtime archive differs from upstream GitHub release SHA256')
    target=OUT/f'Lithos-v{VERSION}-macOS-{arch}-preview.zip'
    prefix='Lithos.app/Contents/'
    resources=prefix+'Resources/'
    entries={}
    def add(z,name,data,mode=0o644):
        item=zipfile.ZipInfo(name);item.create_system=3;item.external_attr=(stat.S_IFREG|mode)<<16;item.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(item,data);entries[name]=hashlib.sha256(data).hexdigest()
    with zipfile.ZipFile(target,'w') as z:
        for name in FILES:
            if name=='启动工作台.cmd':continue
            add(z,resources+name,source_file(name).read_bytes())
        for p in (BASE/'web/vendor').iterdir():
            if p.is_file():add(z,resources+'vendor/'+p.name,p.read_bytes())
        add(z,resources+'mac_host.py',(BASE/'desktop/mac_host.py').read_bytes())
        add(z,prefix+'MacOS/Lithos',b'#!/bin/sh\nHERE="$(CDPATH= cd -- "$(dirname -- "$0")/../Resources" && pwd)"\nexec "$HERE/runtime/bin/python3.12" "$HERE/mac_host.py"\n',0o755)
        add(z,prefix+'Info.plist',plistlib.dumps({'CFBundleName':'Lithos','CFBundleDisplayName':'曜石 · Lithos','CFBundleIdentifier':'local.lithos.workbench','CFBundleVersion':VERSION,'CFBundleShortVersionString':VERSION,'CFBundleExecutable':'Lithos','CFBundlePackageType':'APPL','CFBundleIconFile':'Lithos.icns','LSMinimumSystemVersion':'14.0','NSHighResolutionCapable':True}))
        icon=Image.new('RGBA',(1024,1024));draw=ImageDraw.Draw(icon)
        for points,color in [([(32,3),(55,17),(51,45),(29,61),(9,45),(12,19)],'#7f6df2'), ([(32,3),(29,28),(12,19)],'#a68af9'), ([(32,3),(55,17),(29,28)],'#c4b5fd'), ([(29,28),(55,17),(51,45)],'#8b5cf6'), ([(29,28),(51,45),(29,61)],'#6d42b5'), ([(9,45),(29,28),(29,61)],'#4c2889')]:draw.polygon([(x*16,y*16) for x,y in points],fill=color)
        import io
        buffer=io.BytesIO();icon.save(buffer,format='ICNS');add(z,resources+'Lithos.icns',buffer.getvalue())
        with tarfile.open(source) as tar:
            members={m.name:m for m in tar.getmembers()}
            def resolve(member,seen=None):
                seen=set() if seen is None else seen
                if member.name in seen:raise ValueError('Archive link cycle')
                seen.add(member.name)
                if member.issym() or member.islnk():
                    name=posixpath.normpath(posixpath.join(posixpath.dirname(member.name),member.linkname) if member.issym() else member.linkname)
                    if not name.startswith('python/'):raise ValueError('External archive link')
                    return resolve(members[name],seen)
                return member
            for member in members.values():
                if member.isdir():continue
                if not member.name.startswith('python/') or '..' in member.name.split('/'):raise ValueError('Invalid runtime path')
                real=resolve(member)
                if not real.isfile():raise ValueError('Unexpected runtime entry')
                add(z,resources+'runtime/'+member.name[len('python/'):],tar.extractfile(real).read(),real.mode&0o777)
        dist=importlib.metadata.distribution('pypdf')
        for item in dist.files:
            if '__pycache__' in item.parts or '..' in item.parts or str(item).endswith('.pyc'):continue
            p=Path(dist.locate_file(item))
            if p.is_file():add(z,resources+'runtime/lib/python3.12/site-packages/'+item.as_posix(),p.read_bytes())
        notice=f'Python standalone source: https://github.com/astral-sh/python-build-standalone/releases/tag/{TAG}\nRuntime archive: {source.name}\nSHA256: {hashlib.sha256(source.read_bytes()).hexdigest()}\nPython and bundled dependency licenses are included in runtime.\npypdf {dist.version}: license included in site-packages metadata.\nOffice dependency licenses: vendor/.\n'
        add(z,resources+'THIRD-PARTY.txt',notice.encode())
        add(z,'macOS使用说明.md',(BASE/'docs/macOS使用说明.md').read_bytes())
        add(z,'SHA256SUMS.txt',''.join(f'{digest}  {name}\n' for name,digest in entries.items()).encode())
    with zipfile.ZipFile(target) as z:
        for line in z.read('SHA256SUMS.txt').decode().splitlines():
            digest,name=line.split('  ',1);assert hashlib.sha256(z.read(name)).hexdigest()==digest
        binary=z.read(resources+'runtime/bin/python3.12')
        assert binary[:4]==b'\xcf\xfa\xed\xfe','Not Mach-O 64-bit'
        assert int.from_bytes(binary[4:8],'little')==({'aarch64':0x100000c,'x86_64':0x1000007}[arch])
        assert (z.getinfo(prefix+'MacOS/Lithos').external_attr>>16)&0o111
        assert not any(stat.S_ISLNK(i.external_attr>>16) for i in z.infolist())
    print(json.dumps({'path':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'verification':'archive, architecture, executable modes; NOT native execution'},ensure_ascii=False))

if __name__=='__main__':
    for arch in ['aarch64','x86_64']:build(arch)
