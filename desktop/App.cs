using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
[assembly: System.Reflection.AssemblyTitle("曜石 · Lithos")]
[assembly: System.Reflection.AssemblyProduct("Project Knowledge Workbench")]
[assembly: System.Reflection.AssemblyVersion("3.6.1.0")]
[assembly: System.Reflection.AssemblyFileVersion("3.6.1.0")]

class Workbench : ChromeForm {
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
    void ApplyCaption(bool dark) {
        int immersive=dark?1:0;
        int caption=dark?0x262626:0xF6F6F6;
        int foreground=dark?0xDADADA:0x222222;
        try {
            if(DwmSetWindowAttribute(Handle,20,ref immersive,4)!=0)
                DwmSetWindowAttribute(Handle,19,ref immersive,4);
            DwmSetWindowAttribute(Handle,35,ref caption,4);
            DwmSetWindowAttribute(Handle,36,ref foreground,4);
        } catch(DllNotFoundException) {} catch(EntryPointNotFoundException) {}
        SetChromeTheme(dark);
    }
    protected override void OnHandleCreated(EventArgs e) {base.OnHandleCreated(e);ApplyCaption(true);}
    static string testHome;
    static int resultCode;
    readonly string home = testHome ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ProjectKnowledgeWorkbench");
    Process service;
    WebView2 view;
    string address;
    bool closing;
    bool checkingClose,approvedClose;
    System.Drawing.Rectangle lastClip;
    System.Drawing.Size lastViewSize;
    void LayoutWindowControls() {
        if(view==null||view.IsDisposed||view.ClientSize.Width<=0||view.ClientSize.Height<=0)return;
        var clip=view.RectangleToClient(TitleStrip.RectangleToScreen(TitleStrip.ClientRectangle));
        if(view.Region!=null&&clip==lastClip&&view.ClientSize==lastViewSize)return;
        var region=new System.Drawing.Region(view.ClientRectangle);
        region.Exclude(clip);lastClip=clip;lastViewSize=view.ClientSize;
        var old=view.Region;view.Region=region;if(old!=null)old.Dispose();
        TitleStrip.BringToFront();
    }
    Label status = new Label { Text = "正在启动曜石 · Lithos…", Dock = DockStyle.Fill, TextAlign = System.Drawing.ContentAlignment.MiddleCenter };
    public Workbench() {
        Text = "曜石 · Lithos"; Icon=System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath); Width = 1440; Height = 940; MinimumSize = new System.Drawing.Size(1000,700); StartPosition = FormStartPosition.CenterScreen;
        Controls.Add(status);
        Layout+=(s,e)=>LayoutWindowControls();
        Shown += async (s,e) => await Start();
        FormClosed += (s,e) => Stop();
        FormClosing += async (s,e) => {
            if(approvedClose||view==null||view.CoreWebView2==null)return;
            e.Cancel=true;if(checkingClose)return;checkingClose=true;
            try {
                var check=view.CoreWebView2.ExecuteScriptAsync("!!(window.LithosKnowledge && [...LithosKnowledge.ui.docs.values()].some(d=>d.dirty)) || !!(typeof state!=='undefined' && state.draft && !state.draft.published && document.getElementById('draft-content').value!==state.draft.content)");
                bool uncertain=await Task.WhenAny(check,Task.Delay(5000))!=check;
                bool dirty=uncertain||await check!="false";
                if(dirty&&MessageBox.Show(this,"存在未保存内容，或暂时无法确认保存状态。\n关闭会放弃尚未保存的修改；只有已写入的恢复草稿可恢复。\n\n确定关闭窗口？选择“否”返回继续编辑。","关闭曜石",MessageBoxButtons.YesNo,MessageBoxIcon.Warning,MessageBoxDefaultButton.Button2)!=DialogResult.Yes)return;
                approvedClose=true;Close();
            } catch {MessageBox.Show(this,"无法确认编辑状态，请先保存内容再关闭。","曜石");}
            finally {checkingClose=false;}
        };
    }
    async Task Start() {
        try {
            CoreWebView2Environment.GetAvailableBrowserVersionString();
            Directory.CreateDirectory(home);
            var start = new ProcessStartInfo(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"runtime","python.exe"), "-B -u desktop_host.py");
            start.WorkingDirectory=AppDomain.CurrentDomain.BaseDirectory;start.UseShellExecute=false;start.CreateNoWindow=true;
            start.RedirectStandardInput=true;start.RedirectStandardOutput=true;start.RedirectStandardError=true;
            foreach(var key in new[]{"WORKBENCH_ROOT","WORKBENCH_PORT","WORKBENCH_DATA","PYTHONHOME","PYTHONPATH"}) start.EnvironmentVariables.Remove(key);
            start.EnvironmentVariables["WORKBENCH_HOME"]=home;
            service=Process.Start(start);
            // Drain errors without retaining project content or credentials.
            service.ErrorDataReceived += (s,e) => {}; service.BeginErrorReadLine();
            var ready=service.StandardOutput.ReadLineAsync();
            if(await Task.WhenAny(ready,Task.Delay(30000)) != ready) throw new Exception("本机服务启动超时。请检查应用数据目录权限。");
            address=await ready;
            Uri uri;
            if(!Uri.TryCreate(address,UriKind.Absolute,out uri) || uri.Host!="127.0.0.1" || uri.Scheme!="http") throw new Exception("本机服务未能启动。请检查应用数据中的 config.json；端口可能被占用，可将 port 改为其他空闲端口后重试。");
            if(closing) return;
            view=new WebView2 { Dock=DockStyle.Fill };
            Controls.Add(view);view.BringToFront();TitleStrip.BringToFront();
            view.SizeChanged+=(s,e)=>LayoutWindowControls();LayoutWindowControls();
            var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(home,"browser"));
            await view.EnsureCoreWebView2Async(env);
            if(closing)return;
            view.DefaultBackgroundColor=System.Drawing.Color.FromArgb(30,30,30);
            view.CoreWebView2.WebMessageReceived += (s,e) => {
                Uri source;
                if(!Uri.TryCreate(e.Source,UriKind.Absolute,out source) || source.GetLeftPart(UriPartial.Authority)!=uri.GetLeftPart(UriPartial.Authority))return;
                string message;
                try {message=e.TryGetWebMessageAsString();}catch(ArgumentException){return;}
                if(message=="lithos-theme:dark")ApplyCaption(true);
                else if(message=="lithos-theme:light")ApplyCaption(false);
                else if(message=="lithos-window:drag")DragWindow();
                else if(message=="lithos-window:maximize")ToggleMaximize();
            };
            await view.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync("(()=>{const sync=()=>chrome.webview.postMessage('lithos-theme:'+(document.documentElement.dataset.theme==='light'?'light':'dark'));const start=()=>{sync();new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});};if(document.documentElement)start();else document.addEventListener('DOMContentLoaded',start,{once:true});})();");
            await view.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(@"(()=>{if(window!==top)return;const start=()=>{document.documentElement.classList.add('lithos-desktop');};document.addEventListener('DOMContentLoaded',start,{once:true});document.addEventListener('mousedown',e=>{if(e.isTrusted&&e.button===0&&e.target.matches('.ws-tabs')&&e.detail===1){e.preventDefault();chrome.webview.postMessage('lithos-window:drag');}});document.addEventListener('dblclick',e=>{if(e.isTrusted&&e.button===0&&e.target.matches('.ws-tabs'))chrome.webview.postMessage('lithos-window:maximize');});})();");
            view.CoreWebView2.Settings.AreDevToolsEnabled=false;
            view.CoreWebView2.Settings.IsPasswordAutosaveEnabled=false;
            view.CoreWebView2.Settings.IsGeneralAutofillEnabled=false;
            view.CoreWebView2.NavigationStarting += (s,e) => {Uri target; if(!Uri.TryCreate(e.Uri,UriKind.Absolute,out target) || target.GetLeftPart(UriPartial.Authority)!=uri.GetLeftPart(UriPartial.Authority))e.Cancel=true;};
            view.CoreWebView2.NewWindowRequested += (s,e) => {e.Handled=true;Uri auth;if(Uri.TryCreate(e.Uri,UriKind.Absolute,out auth) && auth.GetLeftPart(UriPartial.Authority)==uri.GetLeftPart(UriPartial.Authority) && auth.AbsolutePath=="/oauth/launch")Process.Start(new ProcessStartInfo(auth.AbsoluteUri){UseShellExecute=true});};
            var loaded=new TaskCompletionSource<bool>();
            view.CoreWebView2.NavigationCompleted += (s,e) => loaded.TrySetResult(e.IsSuccess);
            view.Source=uri;status.Visible=false;
            if(testHome!=null) {
                if(await Task.WhenAny(loaded.Task,Task.Delay(20000))!=loaded.Task || !await loaded.Task)throw new Exception("Desktop navigation failed");
                await Task.Delay(1000);
                var check=await view.CoreWebView2.ExecuteScriptAsync("document.title === '曜石 · Lithos' && !!document.getElementById('project-list') && !!document.getElementById('knowledge-graph')");
                if(check!="true")throw new Exception("Desktop content check failed: "+check);
                if(view.Top!=TitleStrip.Top)throw new Exception("Standalone title row must not exist");
                var integrated=await view.CoreWebView2.ExecuteScriptAsync("document.documentElement.classList.contains('lithos-desktop') && getComputedStyle(document.querySelector('.ws-pane:last-child .ws-tabs')).marginRight==='138px'");
                if(integrated!="true")throw new Exception("Caption space missing from tab row: "+await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify({cls:document.documentElement.className,margin:getComputedStyle(document.querySelector('.ws-pane:last-child .ws-tabs')).marginRight,styles:[...document.querySelectorAll('style')].map(s=>s.textContent)})"));
                if(!(MinimizeControl.Left<MaximizeControl.Left&&MaximizeControl.Left<CloseControl.Left)||CloseControl.Parent.Right<TitleStrip.Width-2)throw new Exception("Caption controls must be ordered on the right");
                MaximizeControl.PerformClick();if(WindowState!=FormWindowState.Maximized)throw new Exception("Maximize failed");
                await Task.Delay(300);LayoutWindowControls();
                var controlPoint=view.PointToClient(CloseControl.PointToScreen(new System.Drawing.Point(10,10)));
                if(view.Region==null||view.Region.IsVisible(controlPoint))throw new Exception("WebView covers maximized caption buttons");
                if(!view.Region.IsVisible(new System.Drawing.Point(view.Width/2,view.Height/2)))throw new Exception("Web content clipped");
                if(await view.CoreWebView2.ExecuteScriptAsync("!!document.querySelector('.ws-pane')")!="true")throw new Exception("Workspace missing after maximize");
                if(!Screen.FromHandle(Handle).WorkingArea.Contains(CloseControl.RectangleToScreen(CloseControl.ClientRectangle)))throw new Exception("Caption buttons outside screen: "+CloseControl.RectangleToScreen(CloseControl.ClientRectangle)+" work="+Screen.FromHandle(Handle).WorkingArea+" window="+Bounds+" strip="+TitleStrip.Bounds);
                if(!MaximizeControl.RestoredGlyph)throw new Exception("Restore glyph missing");
                MaximizeControl.PerformClick();if(WindowState!=FormWindowState.Normal)throw new Exception("Restore failed");
                MinimizeControl.PerformClick();if(WindowState!=FormWindowState.Minimized)throw new Exception("Minimize failed");
                WindowState=FormWindowState.Normal;
                using(var output=File.Create(Path.Combine(home,"desktop-preview.png")))await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,output);
                File.WriteAllText(Path.Combine(home,"smoke-result.txt"),"PASS: native WebView2 loaded offline workbench at "+address);
                approvedClose=true;CloseControl.PerformClick();
            }
        } catch(Exception ex) {
            Stop();status.Text="启动失败\n\n"+ex.Message+"\n\n如缺少 WebView2，请重新运行安装包。";
            if(view!=null)view.Visible=false;status.Visible=true;status.BringToFront();
            if(testHome!=null){resultCode=1;File.WriteAllText(Path.Combine(home,"smoke-result.txt"),ex.ToString());approvedClose=true;Close();}
        }
    }
    void Stop() {
        closing=true;
        if(service!=null){try{service.StandardInput.Close();if(!service.WaitForExit(3000))service.Kill();}catch(InvalidOperationException){}service.Dispose();service=null;}
    }
    [STAThread] static int Main(string[] args) {
        SetProcessDPIAware();
        if(args.Length>0 && args[0]=="--check-runtime") {try{CoreWebView2Environment.GetAvailableBrowserVersionString();return 0;}catch{return 1;}}
        if(args.Length==2 && args[0]=="--smoke-test")testHome=Path.GetFullPath(args[1]);
        bool fresh;
        string mutexName="Local\\ProjectKnowledgeWorkbenchDesktop"+(testHome==null?"":".Test."+testHome.GetHashCode().ToString("X"));
        using(var single=new Mutex(true,mutexName,out fresh)) {
            if(!fresh){if(testHome!=null)return 2;MessageBox.Show("工作台已打开，请切换到现有窗口。","曜石");return 0;}
            Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new Workbench());
        }
        return resultCode;
    }
}
