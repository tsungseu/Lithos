[Setup]
AppId={{D7EEFF58-734E-48AB-B2AF-35F39BC45C90}
AppName=曜石 · Lithos
AppVersion=3.6.1
AppPublisher=项目知识工作台
DefaultDirName={localappdata}\Programs\ProjectKnowledgeWorkbench
DefaultGroupName=曜石 · Lithos
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19045
OutputDir=..\..\outputs
OutputBaseFilename=曜石-Lithos-v3.6.1-Setup-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\..\work\desktop-build\app.ico
UninstallDisplayIcon={app}\Workbench.exe
CloseApplications=yes
RestartApplications=no
SetupLogging=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
WelcomeLabel1=欢迎安装 [name]
WelcomeLabel2=安装完成后可直接打开桌面工作台，无需单独安装 Python 或 Node。%n%n升级前请关闭正在运行的桌面工作台。
ButtonNext=下一步(&N) >
ButtonBack=< 上一步(&B)
ButtonInstall=安装(&I)
ButtonCancel=取消
ButtonFinish=完成(&F)
SelectDirLabel3=请选择应用程序安装位置。项目、知识库与草稿保存在独立的数据目录。
FinishedHeadingLabel=安装完成
FinishedLabelNoIcons=工作台已安装。可从安装目录打开 Workbench.exe。
FinishedLabel=工作台已安装。可从开始菜单打开“曜石 · Lithos”。

[Tasks]
Name: "desktopicon"; Description: "创建桌面图标"; Flags: unchecked

[Files]
Source: "..\..\work\desktop-build\payload\*"; DestDir: "{app}"; Excludes: "*.pyc,__pycache__\*,*\__pycache__\*"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\work\desktop-build\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: NeedWebView

[Icons]
Name: "{group}\曜石 · Lithos"; Filename: "{app}\Workbench.exe"
Name: "{autodesktop}\曜石 · Lithos"; Filename: "{app}\Workbench.exe"; Tasks: desktopicon

[Run]
Filename: "{tmp}\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"; Parameters: "/silent /install"; StatusMsg: "Installing the offline WebView2 runtime..."; Flags: waituntilterminated; Check: NeedWebView
Filename: "{app}\Workbench.exe"; Description: "打开曜石 · Lithos"; Flags: nowait postinstall skipifsilent

[Code]
function NeedWebView(): Boolean;
var Code: Integer;
begin
  Result := True;
  if FileExists(ExpandConstant('{app}\Workbench.exe')) then
    if Exec(ExpandConstant('{app}\Workbench.exe'), '--check-runtime', '', SW_HIDE, ewWaitUntilTerminated, Code) then
      Result := Code <> 0;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssDone then
    if NeedWebView() then
      MsgBox('WebView2 runtime could not be installed. Please run the installer again or contact your Windows administrator.', mbError, MB_OK);
end;
