using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
[assembly: System.Reflection.AssemblyTitle("曜石 · Lithos")]
[assembly: System.Reflection.AssemblyProduct("Project Knowledge Workbench")]
[assembly: System.Reflection.AssemblyVersion("3.2.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("3.2.0.0")]

class Workbench : Form {
    static string testHome;
    static int resultCode;
    readonly string home = testHome ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ProjectKnowledgeWorkbench");
    Process service;
    WebView2 view;
    string address;
    bool closing;
    Label status = new Label { Text = "正在启动曜石 · Lithos…", Dock = DockStyle.Fill, TextAlign = System.Drawing.ContentAlignment.MiddleCenter };
    public Workbench() {
        Text = "曜石 · Lithos"; Icon=System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath); Width = 1440; Height = 940; MinimumSize = new System.Drawing.Size(1000,700); StartPosition = FormStartPosition.CenterScreen;
        Controls.Add(status);
        Shown += async (s,e) => await Start();
        FormClosed += (s,e) => Stop();
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
            Controls.Add(view);view.BringToFront();
            var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(home,"browser"));
            await view.EnsureCoreWebView2Async(env);
            if(closing)return;
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
                using(var output=File.Create(Path.Combine(home,"desktop-preview.png")))await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,output);
                File.WriteAllText(Path.Combine(home,"smoke-result.txt"),"PASS: native WebView2 loaded offline workbench at "+address);
                Close();
            }
        } catch(Exception ex) {
            Stop();status.Text="启动失败\n\n"+ex.Message+"\n\n如缺少 WebView2，请重新运行安装包。";
            if(view!=null)view.Visible=false;status.Visible=true;status.BringToFront();
            if(testHome!=null){resultCode=1;File.WriteAllText(Path.Combine(home,"smoke-result.txt"),ex.ToString());Close();}
        }
    }
    void Stop() {
        closing=true;
        if(service!=null){try{service.StandardInput.Close();if(!service.WaitForExit(3000))service.Kill();}catch(InvalidOperationException){}service.Dispose();service=null;}
    }
    [STAThread] static int Main(string[] args) {
        if(args.Length>0 && args[0]=="--check-runtime") {try{CoreWebView2Environment.GetAvailableBrowserVersionString();return 0;}catch{return 1;}}
        if(args.Length==2 && args[0]=="--smoke-test")testHome=Path.GetFullPath(args[1]);
        bool fresh;
        using(var single=new Mutex(true,"Local\\ProjectKnowledgeWorkbenchDesktop",out fresh)) {
            if(!fresh){MessageBox.Show("工作台已打开，请切换到现有窗口。","曜石");return 0;}
            Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new Workbench());
        }
        return resultCode;
    }
}
