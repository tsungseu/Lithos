using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Windows.Forms;

// Native window controls; no privileged window actions are exposed to web content.
class CaptionButton : Control {
    public readonly string Action;
    public bool WindowActive=true;
    public bool RestoredGlyph;
    bool hover;
    public CaptionButton(string action,string label) {
        Action=action;AccessibleName=label;AccessibleRole=AccessibleRole.PushButton;
        Size=new Size(46,36);TabStop=true;Cursor=Cursors.Default;
        SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer,true);
    }
    public void PerformClick(){OnClick(EventArgs.Empty);}
    protected override void OnMouseEnter(EventArgs e){hover=true;Invalidate();base.OnMouseEnter(e);}
    protected override void OnMouseLeave(EventArgs e){hover=false;Invalidate();base.OnMouseLeave(e);}
    protected override void OnGotFocus(EventArgs e){Invalidate();base.OnGotFocus(e);}
    protected override void OnLostFocus(EventArgs e){Invalidate();base.OnLostFocus(e);}
    protected override void OnKeyDown(KeyEventArgs e){if(e.KeyCode==Keys.Enter||e.KeyCode==Keys.Space){e.Handled=true;PerformClick();}base.OnKeyDown(e);}
    protected override void OnPaint(PaintEventArgs e){
        base.OnPaint(e);var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;
        float scale=Height/36f,d=10*scale,x=(Width-d)/2,y=(Height-d)/2;
        if(hover)using(var brush=new SolidBrush(Action=="close"?Color.FromArgb(196,43,28):Color.FromArgb(30,ForeColor)))g.FillRectangle(brush,ClientRectangle);
        Color glyph=hover&&Action=="close"?Color.White:WindowActive?ForeColor:Color.Gray;
        using(var pen=new Pen(glyph,scale)){
            if(Action=="close"){g.DrawLine(pen,x,y,x+d,y+d);g.DrawLine(pen,x+d,y,x,y+d);}
            else if(Action=="minimize")g.DrawLine(pen,x,y+d/2,x+d,y+d/2);
            else if(RestoredGlyph){g.DrawRectangle(pen,x,y+3*scale,d-3*scale,d-3*scale);g.DrawLines(pen,new[]{new PointF(x+3*scale,y+3*scale),new PointF(x+3*scale,y),new PointF(x+d,y),new PointF(x+d,y+7*scale),new PointF(x+7*scale,y+7*scale)});}
            else g.DrawRectangle(pen,x,y,d,d);
        }
        if(Focused)ControlPaint.DrawFocusRectangle(g,new Rectangle(3,3,Width-6,Height-6),ForeColor,BackColor);
    }
}

class ChromeForm : Form {
    [DllImport("user32.dll")] static extern bool ReleaseCapture();
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h,int m,IntPtr w,IntPtr l);
    [StructLayout(LayoutKind.Sequential)] struct PointInfo {public int X,Y;}
    [StructLayout(LayoutKind.Sequential)] struct MinMaxInfo {public PointInfo Reserved,MaxSize,MaxPosition,MinTrackSize,MaxTrackSize;}
    protected readonly Panel TitleStrip=new Panel {Height=40,Width=138,Anchor=AnchorStyles.Top|AnchorStyles.Left};
    protected readonly CaptionButton CloseControl=new CaptionButton("close","关闭窗口");
    protected readonly CaptionButton MinimizeControl=new CaptionButton("minimize","最小化窗口");
    protected readonly CaptionButton MaximizeControl=new CaptionButton("maximize","最大化 / 还原窗口");
    readonly ToolTip tips=new ToolTip();
    public ChromeForm(){
        FormBorderStyle=FormBorderStyle.None;Padding=new Padding(5);AutoScaleMode=AutoScaleMode.Dpi;
        var controls=new FlowLayoutPanel {Dock=DockStyle.Right,Width=138,Padding=Padding.Empty,WrapContents=false};
        controls.Controls.AddRange(new Control[]{MinimizeControl,MaximizeControl,CloseControl});
        foreach(Control c in controls.Controls)c.Margin=Padding.Empty;
        TitleStrip.Controls.Add(controls);
        foreach(Control c in controls.Controls)c.Height=40;
        Controls.Add(TitleStrip);
        CloseControl.Click+=(s,e)=>Close();MinimizeControl.Click+=(s,e)=>WindowState=FormWindowState.Minimized;
        MaximizeControl.Click+=(s,e)=>ToggleMaximize();
        tips.SetToolTip(CloseControl,"关闭窗口 (Alt+F4)");tips.SetToolTip(MinimizeControl,"最小化");tips.SetToolTip(MaximizeControl,"最大化 / 还原");
        Activated+=(s,e)=>SetActive(true);Deactivate+=(s,e)=>SetActive(false);
        Resize+=(s,e)=>{Padding=WindowState==FormWindowState.Maximized?Padding.Empty:new Padding(5);MaximizeControl.RestoredGlyph=WindowState==FormWindowState.Maximized;MaximizeControl.AccessibleName=MaximizeControl.RestoredGlyph?"还原窗口":"最大化窗口";MaximizeControl.Invalidate();};
    }
    protected override void OnLayout(LayoutEventArgs e){base.OnLayout(e);if(TitleStrip!=null){TitleStrip.Location=new Point(ClientSize.Width-Padding.Right-TitleStrip.Width,Padding.Top);TitleStrip.BringToFront();}}
    protected void DragWindow(){ReleaseCapture();SendMessage(Handle,0xA1,new IntPtr(2),IntPtr.Zero);}
    void SetActive(bool active){foreach(var b in new[]{CloseControl,MinimizeControl,MaximizeControl}){b.WindowActive=active;b.Invalidate();}}
    protected void ToggleMaximize(){if(WindowState==FormWindowState.Maximized){WindowState=FormWindowState.Normal;MaximumSize=Size.Empty;}else{MaximumSize=Screen.FromHandle(Handle).WorkingArea.Size;WindowState=FormWindowState.Maximized;}}
    protected void SetChromeTheme(bool dark){
        BackColor=TitleStrip.BackColor=dark?Color.FromArgb(38,38,38):Color.FromArgb(246,246,246);
        TitleStrip.ForeColor=dark?Color.FromArgb(218,218,218):Color.FromArgb(34,34,34);
        foreach(var b in new[]{CloseControl,MinimizeControl,MaximizeControl}){b.BackColor=TitleStrip.BackColor;b.ForeColor=TitleStrip.ForeColor;b.Invalidate();}
    }
    protected override CreateParams CreateParams {get{var cp=base.CreateParams;cp.Style|=0x40000|0x20000|0x10000|0x80000;return cp;}}
    protected override void WndProc(ref Message m){
        if(m.Msg==0x83&&m.WParam!=IntPtr.Zero){m.Result=IntPtr.Zero;return;} // Remove native caption, retain resize/snap styles.
        if(m.Msg==0x24){
            base.WndProc(ref m);var info=(MinMaxInfo)Marshal.PtrToStructure(m.LParam,typeof(MinMaxInfo));
            var screen=Screen.FromHandle(Handle);var work=screen.WorkingArea;var bounds=screen.Bounds;
            info.MaxPosition.X=work.Left-bounds.Left;info.MaxPosition.Y=work.Top-bounds.Top;
            info.MaxSize.X=work.Width;info.MaxSize.Y=work.Height;
            info.MaxTrackSize.X=work.Width;info.MaxTrackSize.Y=work.Height;
            Marshal.StructureToPtr(info,m.LParam,false);return;
        }
        base.WndProc(ref m);
        if(m.Msg==0x84&&WindowState==FormWindowState.Normal){
            long point=m.LParam.ToInt64();var p=PointToClient(new Point((short)(point&0xffff),(short)((point>>16)&0xffff)));
            int edge=Math.Max(5,Padding.Left);bool l=p.X<edge,r=p.X>=ClientSize.Width-edge,t=p.Y<edge,b=p.Y>=ClientSize.Height-edge;
            if(t)m.Result=new IntPtr(l?13:r?14:12);else if(b)m.Result=new IntPtr(l?16:r?17:15);else if(l)m.Result=new IntPtr(10);else if(r)m.Result=new IntPtr(11);
        }
    }
    protected override void Dispose(bool disposing){if(disposing)tips.Dispose();base.Dispose(disposing);}
}
