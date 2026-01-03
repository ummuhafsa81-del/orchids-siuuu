
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName PresentationCore,PresentationFramework

$code = @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    public const uint MOUSEEVENTF_LEFTDOWN = 2;
    public const uint MOUSEEVENTF_LEFTUP = 4;
    public const uint MOUSEEVENTF_RIGHTDOWN = 8;
    public const uint MOUSEEVENTF_RIGHTUP = 16;
    public const uint MOUSEEVENTF_MIDDLEDOWN = 32;
    public const uint MOUSEEVENTF_MIDDLEUP = 64;
    public const uint MOUSEEVENTF_WHEEL = 2048;
    public static void Click(int x, int y) { SetCursorPos(x, y); System.Threading.Thread.Sleep(50); mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0); mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0); }
    public static void RightClick(int x, int y) { SetCursorPos(x, y); System.Threading.Thread.Sleep(50); mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0); mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0); }
    public static void MiddleClick(int x, int y) { SetCursorPos(x, y); System.Threading.Thread.Sleep(50); mouse_event(MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, 0); mouse_event(MOUSEEVENTF_MIDDLEUP, 0, 0, 0, 0); }
    public static string GetActiveWindowTitle() { IntPtr h = GetForegroundWindow(); var sb = new System.Text.StringBuilder(256); GetWindowText(h, sb, 256); return sb.ToString(); }
}
"@
Add-Type -TypeDefinition $code

$consent = [System.Windows.MessageBox]::Show(
    "Nova Agent will allow AI to fully control your PC:" + [char]10 + [char]10 +
    "- Mouse clicks, movements, scrolling" + [char]10 +
    "- Keyboard typing and hotkeys" + [char]10 +
    "- Screenshots for AI vision" + [char]10 +
    "- Run ANY command or script" + [char]10 +
    "- Open any file, app, or URL" + [char]10 +
    "- Read/write files" + [char]10 +
    "- Full system access" + [char]10 + [char]10 +
    "This gives the AI complete control. Do you consent?",
    "Nova Agent - Full System Access",
    "YesNo",
    "Warning"
)

if ($consent -ne "Yes") {
    Write-Host "Consent denied. Exiting." -ForegroundColor Yellow
    exit
}

$port = 9147
$http = New-Object System.Net.HttpListener
$http.Prefixes.Add("http://localhost:$port/")
$http.Prefixes.Add("http://127.0.0.1:$port/")

try {
    $http.Start()
} catch {
    Write-Host "[WARN] Could not bind to port $port. Trying with admin reservation..." -ForegroundColor Yellow
    $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $addCmd = "netsh http add urlacl url=http://localhost:$port/ user=$user"
    $addCmd2 = "netsh http add urlacl url=http://127.0.0.1:$port/ user=$user"
    try {
        cmd /c $addCmd 2>$null
        cmd /c $addCmd2 2>$null
        $http.Start()
    } catch {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Red
        Write-Host "   ACCESS DENIED - ADMIN REQUIRED" -ForegroundColor Red  
        Write-Host "========================================" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please RIGHT-CLICK the .bat file and" -ForegroundColor Yellow
        Write-Host "select 'Run as administrator'" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Press any key to exit..."
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        exit 1
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   NOVA AGENT RUNNING ON PORT $port" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Full system control enabled!" -ForegroundColor Yellow
Write-Host "Waiting for commands from Nova AI..." -ForegroundColor Gray
Write-Host "Keep this window open!" -ForegroundColor Yellow
Write-Host ""

function SafeJson($obj) {
    return ($obj | ConvertTo-Json -Compress -Depth 10) -replace '[\r\n]', ' '
}

while ($http.IsListening) {
    $ctx = $http.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    
    $res.Headers.Add("Access-Control-Allow-Origin", "*")
    $res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    $res.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
    
    if ($req.HttpMethod -eq "OPTIONS") {
        $res.StatusCode = 200
        $res.Close()
        continue
    }
    
    $out = @{success=$false; error="unknown"}
    $path = $req.Url.LocalPath
    
    try {
        if ($req.HttpMethod -eq "GET" -and $path -eq "/status") {
            $out = @{success=$true; status="ready"; version="2.0"; capabilities=@("click","type","screenshot","run","file","anything")}
            Write-Host "[STATUS] Agent ready" -ForegroundColor Gray
        }
        elseif ($req.HttpMethod -eq "POST" -and $path -eq "/execute") {
            $sr = New-Object System.IO.StreamReader($req.InputStream)
            $body = $sr.ReadToEnd()
            $sr.Close()
            
            Write-Host "[EXEC] $body" -ForegroundColor Cyan
            
            $j = $body | ConvertFrom-Json
            
            switch ($j.action) {
                "click" {
                    [WinAPI]::Click([int]$j.x, [int]$j.y)
                    $out = @{success=$true; action="click"; x=$j.x; y=$j.y}
                }
                "rightclick" {
                    [WinAPI]::RightClick([int]$j.x, [int]$j.y)
                    $out = @{success=$true; action="rightclick"; x=$j.x; y=$j.y}
                }
                "middleclick" {
                    [WinAPI]::MiddleClick([int]$j.x, [int]$j.y)
                    $out = @{success=$true; action="middleclick"; x=$j.x; y=$j.y}
                }
                "doubleclick" {
                    [WinAPI]::Click([int]$j.x, [int]$j.y)
                    Start-Sleep -Milliseconds 100
                    [WinAPI]::Click([int]$j.x, [int]$j.y)
                    $out = @{success=$true; action="doubleclick"; x=$j.x; y=$j.y}
                }
                "tripleclick" {
                    [WinAPI]::Click([int]$j.x, [int]$j.y)
                    Start-Sleep -Milliseconds 80
                    [WinAPI]::Click([int]$j.x, [int]$j.y)
                    Start-Sleep -Milliseconds 80
                    [WinAPI]::Click([int]$j.x, [int]$j.y)
                    $out = @{success=$true; action="tripleclick"; x=$j.x; y=$j.y}
                }
                "move" {
                    [WinAPI]::SetCursorPos([int]$j.x, [int]$j.y)
                    $out = @{success=$true; action="move"; x=$j.x; y=$j.y}
                }
                "drag" {
                    [WinAPI]::SetCursorPos([int]$j.fromX, [int]$j.fromY)
                    Start-Sleep -Milliseconds 50
                    [WinAPI]::mouse_event([WinAPI]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
                    Start-Sleep -Milliseconds 50
                    $steps = 20
                    for ($i = 1; $i -le $steps; $i++) {
                        $nx = [int]($j.fromX + ($j.toX - $j.fromX) * $i / $steps)
                        $ny = [int]($j.fromY + ($j.toY - $j.fromY) * $i / $steps)
                        [WinAPI]::SetCursorPos($nx, $ny)
                        Start-Sleep -Milliseconds 10
                    }
                    [WinAPI]::mouse_event([WinAPI]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
                    $out = @{success=$true; action="drag"}
                }
                "type" {
                    [System.Windows.Forms.SendKeys]::SendWait($j.text)
                    $out = @{success=$true; action="type"; length=$j.text.Length}
                }
                "typeraw" {
                    Add-Type -AssemblyName Microsoft.VisualBasic
                    [Microsoft.VisualBasic.Interaction]::AppActivate([WinAPI]::GetActiveWindowTitle())
                    foreach ($char in $j.text.ToCharArray()) {
                        [System.Windows.Forms.SendKeys]::SendWait($char)
                        Start-Sleep -Milliseconds 30
                    }
                    $out = @{success=$true; action="typeraw"; length=$j.text.Length}
                }
                "hotkey" {
                    [System.Windows.Forms.SendKeys]::SendWait($j.keys)
                    $out = @{success=$true; action="hotkey"; keys=$j.keys}
                }
                "keydown" {
                    $wsh = New-Object -ComObject WScript.Shell
                    $wsh.SendKeys($j.key)
                    $out = @{success=$true; action="keydown"; key=$j.key}
                }
                "scroll" {
                    if ($j.x -and $j.y) { [WinAPI]::SetCursorPos([int]$j.x, [int]$j.y) }
                    [WinAPI]::mouse_event([WinAPI]::MOUSEEVENTF_WHEEL, 0, 0, [uint32]([int]$j.delta * 120), 0)
                    $out = @{success=$true; action="scroll"; delta=$j.delta}
                }
                "screenshot" {
                    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
                    $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
                    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
                    $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
                    $ms = New-Object System.IO.MemoryStream
                    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                    $b64 = [Convert]::ToBase64String($ms.ToArray())
                    $graphics.Dispose(); $bmp.Dispose(); $ms.Dispose()
                    $out = @{success=$true; action="screenshot"; width=$bounds.Width; height=$bounds.Height; image=$b64}
                }
                "screenshotRegion" {
                    $bmp = New-Object System.Drawing.Bitmap([int]$j.width, [int]$j.height)
                    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
                    $graphics.CopyFromScreen([int]$j.x, [int]$j.y, 0, 0, (New-Object System.Drawing.Size([int]$j.width, [int]$j.height)))
                    $ms = New-Object System.IO.MemoryStream
                    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                    $b64 = [Convert]::ToBase64String($ms.ToArray())
                    $graphics.Dispose(); $bmp.Dispose(); $ms.Dispose()
                    $out = @{success=$true; action="screenshotRegion"; image=$b64}
                }
                "open" {
                    Start-Process $j.target
                    $out = @{success=$true; action="open"; target=$j.target}
                }
                "openUrl" {
                    Start-Process $j.url
                    $out = @{success=$true; action="openUrl"; url=$j.url}
                }
                "run" {
                    $result = Invoke-Expression $j.command 2>&1 | Out-String
                    $out = @{success=$true; action="run"; output=$result}
                }
                "powershell" {
                    $result = Invoke-Expression $j.script 2>&1 | Out-String
                    $out = @{success=$true; action="powershell"; output=$result}
                }
                "cmd" {
                    $result = cmd /c $j.command 2>&1 | Out-String
                    $out = @{success=$true; action="cmd"; output=$result}
                }
                "readFile" {
                    $content = Get-Content -Path $j.path -Raw
                    $out = @{success=$true; action="readFile"; content=$content}
                }
                "writeFile" {
                    Set-Content -Path $j.path -Value $j.content
                    $out = @{success=$true; action="writeFile"; path=$j.path}
                }
                "appendFile" {
                    Add-Content -Path $j.path -Value $j.content
                    $out = @{success=$true; action="appendFile"; path=$j.path}
                }
                "deleteFile" {
                    Remove-Item -Path $j.path -Force
                    $out = @{success=$true; action="deleteFile"; path=$j.path}
                }
                "listDir" {
                    $items = Get-ChildItem -Path $j.path | Select-Object Name, Length, LastWriteTime, PSIsContainer
                    $out = @{success=$true; action="listDir"; items=$items}
                }
                "createDir" {
                    New-Item -Path $j.path -ItemType Directory -Force
                    $out = @{success=$true; action="createDir"; path=$j.path}
                }
                "copyFile" {
                    Copy-Item -Path $j.source -Destination $j.dest -Force
                    $out = @{success=$true; action="copyFile"}
                }
                "moveFile" {
                    Move-Item -Path $j.source -Destination $j.dest -Force
                    $out = @{success=$true; action="moveFile"}
                }
                "getClipboard" {
                    $clip = Get-Clipboard
                    $out = @{success=$true; action="getClipboard"; content=$clip}
                }
                "setClipboard" {
                    Set-Clipboard -Value $j.content
                    $out = @{success=$true; action="setClipboard"}
                }
                "getActiveWindow" {
                    $title = [WinAPI]::GetActiveWindowTitle()
                    $out = @{success=$true; action="getActiveWindow"; title=$title}
                }
                "focusWindow" {
                    $hwnd = [WinAPI]::FindWindow($null, $j.title)
                    if ($hwnd -ne [IntPtr]::Zero) {
                        [WinAPI]::SetForegroundWindow($hwnd)
                        $out = @{success=$true; action="focusWindow"; title=$j.title}
                    } else {
                        $out = @{success=$false; error="Window not found"}
                    }
                }
                "getProcesses" {
                    $procs = Get-Process | Select-Object -First 50 Id, ProcessName, CPU, WorkingSet64
                    $out = @{success=$true; action="getProcesses"; processes=$procs}
                }
                "killProcess" {
                    Stop-Process -Name $j.name -Force
                    $out = @{success=$true; action="killProcess"; name=$j.name}
                }
                "getScreenInfo" {
                    $screens = [System.Windows.Forms.Screen]::AllScreens | ForEach-Object {
                        @{
                            DeviceName = $_.DeviceName
                            Primary = $_.Primary
                            Width = $_.Bounds.Width
                            Height = $_.Bounds.Height
                            X = $_.Bounds.X
                            Y = $_.Bounds.Y
                        }
                    }
                    $out = @{success=$true; action="getScreenInfo"; screens=$screens}
                }
                "getCursorPos" {
                    $pos = [System.Windows.Forms.Cursor]::Position
                    $out = @{success=$true; action="getCursorPos"; x=$pos.X; y=$pos.Y}
                }
                "wait" {
                    Start-Sleep -Milliseconds ([int]$j.ms)
                    $out = @{success=$true; action="wait"; ms=$j.ms}
                }
                "notify" {
                    [System.Windows.Forms.MessageBox]::Show($j.message, $j.title)
                    $out = @{success=$true; action="notify"}
                }
                "inputBox" {
                    Add-Type -AssemblyName Microsoft.VisualBasic
                    $result = [Microsoft.VisualBasic.Interaction]::InputBox($j.prompt, $j.title, $j.default)
                    $out = @{success=$true; action="inputBox"; result=$result}
                }
                "ping" {
                    $out = @{success=$true; status="ready"}
                }
                default {
                    $out = @{success=$false; error="Unknown action: $($j.action)"}
                }
            }
        }
    } catch {
        $out = @{success=$false; error=$_.Exception.Message}
        Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    }
    
    $json = SafeJson $out
    $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
    $res.ContentType = "application/json"
    $res.ContentLength64 = $buffer.Length
    $res.OutputStream.Write($buffer, 0, $buffer.Length)
    $res.Close()
}
