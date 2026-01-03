import { useEffect, useState } from "react";
import { NovaLogoSvg } from "@/components/NovaLogoSvg";
import { Download, CheckCircle, Shield } from "lucide-react";

const BAT_SCRIPT = `@echo off
setlocal enabledelayedexpansion
title Nova Agent v4.0

powershell -ExecutionPolicy Bypass -Command ^
"$ErrorActionPreference = 'Stop'; ^
$Host.UI.RawUI.WindowTitle = 'Nova Agent v4.0'; ^
Add-Type -AssemblyName System.Windows.Forms; ^
Add-Type -AssemblyName System.Drawing; ^
Add-Type -AssemblyName PresentationCore,PresentationFramework; ^
Add-Type -AssemblyName System.Net.Http; ^
$mutexName = 'Global\\NovaAgentMutex'; ^
$createdNew = $false; ^
$mutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$createdNew); ^
if (-not $createdNew) { ^
    [System.Windows.MessageBox]::Show('Nova Agent is already running!' + [char]10 + [char]10 + 'Only one instance can run at a time.' + [char]10 + 'Check your taskbar for the existing window.', 'Nova Agent - Already Running', 'OK', 'Warning'); ^
    exit; ^
} ^
try { ^
$code = @'
using System;
using System.Runtime.InteropServices;
public class WinAPI {
    [DllImport(\"user32.dll\")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport(\"user32.dll\")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
    [DllImport(\"user32.dll\")] public static extern short GetAsyncKeyState(int vKey);
    [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();
    [DllImport(\"user32.dll\")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
    [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport(\"user32.dll\")] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport(\"user32.dll\")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport(\"user32.dll\")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport(\"user32.dll\")] public static extern bool IsWindowVisible(IntPtr hWnd);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
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
'@; ^
Add-Type -TypeDefinition $code; ^
$global:callbackUrl = $null; ^
$global:httpClient = New-Object System.Net.Http.HttpClient; ^
$global:httpClient.Timeout = [TimeSpan]::FromSeconds(5); ^
$global:lastScreenHash = ''; ^
$global:screenshotHistory = @(); ^
$global:actionSequence = 0; ^
$global:sessionId = [Guid]::NewGuid().ToString().Substring(0,8); ^
function Take-Screenshot { param([string]$context = 'manual', [int]$quality = 60, [bool]$highlightCursor = $true, [int]$targetX = -1, [int]$targetY = -1); try { $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height); $graphics = [System.Drawing.Graphics]::FromImage($bmp); $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size); $cursorPos = [System.Windows.Forms.Cursor]::Position; if ($highlightCursor) { $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 255, 50, 50), 3); $graphics.DrawEllipse($pen, $cursorPos.X - 15, $cursorPos.Y - 15, 30, 30); $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 255, 50, 50)); $graphics.FillEllipse($brush, $cursorPos.X - 5, $cursorPos.Y - 5, 10, 10); $pen.Dispose(); $brush.Dispose(); }; if ($targetX -ge 0 -and $targetY -ge 0) { $targetPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 50, 255, 50), 2); $targetPen.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash; $graphics.DrawEllipse($targetPen, $targetX - 25, $targetY - 25, 50, 50); $targetPen.Dispose(); }; $ms = New-Object System.IO.MemoryStream; $encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() ^| Where-Object { $_.MimeType -eq 'image/jpeg' }; $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1); $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]$quality); $bmp.Save($ms, $encoder, $encoderParams); $b64 = [Convert]::ToBase64String($ms.ToArray()); $hash = [System.BitConverter]::ToString([System.Security.Cryptography.MD5]::Create().ComputeHash($ms.ToArray())).Replace('-','').Substring(0,16); $stateChanged = $hash -ne $global:lastScreenHash; $global:lastScreenHash = $hash; $graphics.Dispose(); $bmp.Dispose(); $ms.Dispose(); $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'; $activeWindow = [WinAPI]::GetActiveWindowTitle(); $global:actionSequence++; return @{image = $b64; context = $context; timestamp = $timestamp; width = $bounds.Width; height = $bounds.Height; cursorX = $cursorPos.X; cursorY = $cursorPos.Y; targetX = $targetX; targetY = $targetY; activeWindow = $activeWindow; stateChanged = $stateChanged; hash = $hash; sequenceNum = $global:actionSequence; sessionId = $global:sessionId}; } catch { return @{error = $_.Exception.Message; context = $context; timestamp = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff')}; } }; ^
function Take-ScreenshotWithContext { param([string]$phase, [string]$action, [hashtable]$actionParams = @{}, [string]$errorMsg = '', [int]$targetX = -1, [int]$targetY = -1); $contextStr = $phase + '_' + $action; $screenshot = Take-Screenshot -context $contextStr -targetX $targetX -targetY $targetY; $screenshot.phase = $phase; $screenshot.action = $action; $screenshot.actionParams = $actionParams; if ($errorMsg) { $screenshot.errorMessage = $errorMsg }; return $screenshot; }; ^
function Wait-ForStateChange { param([int]$maxWaitMs = 2000, [int]$checkInterval = 100); $startHash = $global:lastScreenHash; $elapsed = 0; while ($elapsed -lt $maxWaitMs) { Start-Sleep -Milliseconds $checkInterval; $elapsed += $checkInterval; $currentShot = Take-Screenshot -context 'state_check' -highlightCursor $false; if ($currentShot.hash -ne $startHash) { return @{changed=$true; elapsed=$elapsed; screenshot=$currentShot}; } }; return @{changed=$false; elapsed=$elapsed}; }; ^
$consent = [System.Windows.MessageBox]::Show('Nova Agent will allow AI to fully control your PC:' + [char]10 + [char]10 + '- Mouse clicks, movements, scrolling' + [char]10 + '- Keyboard typing and hotkeys' + [char]10 + '- Screenshots for AI vision' + [char]10 + '- Run ANY command or script' + [char]10 + '- Open any file, app, or URL' + [char]10 + '- Read/write files' + [char]10 + '- Full system access' + [char]10 + [char]10 + 'This gives the AI complete control. Do you consent?', 'Nova Agent - Full System Access', 'YesNo', 'Warning'); ^
if ($consent -ne 'Yes') { Write-Host ''; Write-Host 'Consent denied. You can close this window.' -ForegroundColor Yellow; Write-Host ''; Write-Host 'Press any key to exit...'; $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown'); exit; }; ^
$port = 9147; ^
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port); ^
try { $listener.Start(); } catch { Write-Host ''; Write-Host '========================================' -ForegroundColor Red; Write-Host '   PORT $port IN USE' -ForegroundColor Red; Write-Host '========================================' -ForegroundColor Red; Write-Host ''; Write-Host 'Another instance may be running.' -ForegroundColor Yellow; Write-Host 'Close it and try again.' -ForegroundColor Yellow; Write-Host ''; Write-Host 'Press any key to exit...'; $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown'); exit; }; ^
Write-Host ''; Write-Host '========================================' -ForegroundColor Cyan; Write-Host '   NOVA AGENT RUNNING ON PORT 9147' -ForegroundColor Green; Write-Host '========================================' -ForegroundColor Cyan; Write-Host ''; Write-Host 'Full system control enabled!' -ForegroundColor Yellow; Write-Host 'Waiting for commands from Nova AI...' -ForegroundColor Gray; Write-Host 'Keep this window open!' -ForegroundColor Yellow; Write-Host ''; ^
function SafeJson($obj) { return ($obj ^| ConvertTo-Json -Compress -Depth 10) -replace '[\\r\\n]', ' '; }; ^
function Send-Response($writer, $statusCode, $body, $contentType) { $statusText = if ($statusCode -eq 200) { 'OK' } else { 'Bad Request' }; $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body); $response = 'HTTP/1.1 ' + $statusCode + ' ' + $statusText + [char]13 + [char]10; $response += 'Content-Type: ' + $contentType + [char]13 + [char]10; $response += 'Content-Length: ' + $bodyBytes.Length + [char]13 + [char]10; $response += 'Access-Control-Allow-Origin: *' + [char]13 + [char]10; $response += 'Access-Control-Allow-Methods: GET, POST, OPTIONS' + [char]13 + [char]10; $response += 'Access-Control-Allow-Headers: Content-Type' + [char]13 + [char]10; $response += 'Connection: close' + [char]13 + [char]10; $response += [char]13 + [char]10; $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($response); $writer.Write($headerBytes, 0, $headerBytes.Length); $writer.Write($bodyBytes, 0, $bodyBytes.Length); $writer.Flush(); }; ^
while ($true) { $client = $listener.AcceptTcpClient(); $stream = $client.GetStream(); $reader = New-Object System.IO.StreamReader($stream); $writer = $stream; try { $requestLine = $reader.ReadLine(); if (-not $requestLine) { $client.Close(); continue; }; $parts = $requestLine -split ' '; $method = $parts[0]; $path = $parts[1]; $headers = @{}; $contentLength = 0; while ($true) { $line = $reader.ReadLine(); if ([string]::IsNullOrEmpty($line)) { break; }; if ($line -match '^([^:]+):\\s*(.+)$') { $headers[$matches[1].ToLower()] = $matches[2]; if ($matches[1].ToLower() -eq 'content-length') { $contentLength = [int]$matches[2]; } } }; $body = ''; if ($contentLength -gt 0) { $buffer = New-Object char[] $contentLength; $reader.Read($buffer, 0, $contentLength) ^| Out-Null; $body = [string]::new($buffer); }; if ($method -eq 'OPTIONS') { Send-Response $writer 200 '' 'text/plain'; $client.Close(); continue; }; $out = @{success=$false; error='unknown'}; ^
if ($method -eq 'GET' -and $path -eq '/status') { $out = @{success=$true; status='ready'; version='4.0'; sessionId=$global:sessionId; totalActions=$global:actionSequence; capabilities=@('click','rightclick','middleclick','doubleclick','tripleclick','type','typeraw','hotkey','keydown','scroll','drag','move','screenshot','screenshotWithContext','screenshotRegion','verifyState','waitForStateChange','getScreenshotHistory','run','cmd','powershell','readFile','writeFile','appendFile','deleteFile','listDir','createDir','copyFile','moveFile','getClipboard','setClipboard','open','openUrl','getActiveWindow','focusWindow','getProcesses','killProcess','getScreenInfo','getCursorPos','wait','notify','inputBox')}; Write-Host '[STATUS] Agent v4.0 ready' -ForegroundColor Green; } ^
elseif ($method -eq 'POST' -and $path -eq '/execute') { Write-Host '[EXEC]' $body -ForegroundColor Cyan; $j = $body ^| ConvertFrom-Json; $captureScreenshots = if ($j.captureScreenshots -ne $null) { $j.captureScreenshots } else { $true }; $beforeShot = $null; $afterShot = $null; ^
switch ($j.action) { ^
'click' { $tx = [int]$j.x; $ty = [int]$j.y; if ($captureScreenshots) { $beforeShot = Take-ScreenshotWithContext -phase 'before' -action 'click' -actionParams @{x=$tx; y=$ty} -targetX $tx -targetY $ty; }; [WinAPI]::Click($tx, $ty); Start-Sleep -Milliseconds 150; if ($captureScreenshots) { $afterShot = Take-ScreenshotWithContext -phase 'after' -action 'click' -actionParams @{x=$tx; y=$ty} -targetX $tx -targetY $ty; $stateResult = Wait-ForStateChange -maxWaitMs 500; }; $out = @{success=$true; action='click'; x=$tx; y=$ty; beforeScreenshot=$beforeShot; afterScreenshot=$afterShot; stateChanged=$afterShot.stateChanged; sessionId=$global:sessionId; seq=$global:actionSequence}; } ^
'rightclick' { $tx = [int]$j.x; $ty = [int]$j.y; if ($captureScreenshots) { $beforeShot = Take-ScreenshotWithContext -phase 'before' -action 'rightclick' -actionParams @{x=$tx; y=$ty} -targetX $tx -targetY $ty; }; [WinAPI]::RightClick($tx, $ty); Start-Sleep -Milliseconds 150; if ($captureScreenshots) { $afterShot = Take-ScreenshotWithContext -phase 'after' -action 'rightclick' -actionParams @{x=$tx; y=$ty} -targetX $tx -targetY $ty; }; $out = @{success=$true; action='rightclick'; x=$tx; y=$ty; beforeScreenshot=$beforeShot; afterScreenshot=$afterShot; stateChanged=$afterShot.stateChanged; sessionId=$global:sessionId}; } ^
'middleclick' { $tx = [int]$j.x; $ty = [int]$j.y; if ($captureScreenshots) { $beforeShot = Take-ScreenshotWithContext -phase 'before' -action 'middleclick' -actionParams @{x=$tx; y=$ty} -targetX $tx -targetY $ty; }; [WinAPI]::MiddleClick($tx, $ty); Start-Sleep -Milliseconds 150; if ($captureScreenshots) { $afterShot = Take-ScreenshotWithContext -phase 'after' -action 'middleclick' -actionParams @{x=$tx; y=$ty} -targetX $tx -targetY $ty; }; $out = @{success=$true; action='middleclick'; x=$tx; y=$ty; beforeScreenshot=$beforeShot; afterScreenshot=$afterShot; stateChanged=$afterShot.stateChanged; sessionId=$global:sessionId}; } ^
'doubleclick' { $tx = [int]$j.x; $ty = [int]$j.y; if ($captureScreenshots) { $beforeShot = Take-ScreenshotWithContext -phase 'before' -action 'doubleclick' -actionParams @{x=$tx; y=$ty} -targetX $tx -targetY $ty; }; [WinAPI]::Click($tx, $ty); Start-Sleep -Milliseconds 100; [WinAPI]::Click($tx, $ty); Start-Sleep -Milliseconds 150; if ($captureScreenshots) { $afterShot = Take-ScreenshotWithContext -phase 'after' -action 'doubleclick' -actionParams @{x=$tx; y=$ty} -targetX $tx -targetY $ty; }; $out = @{success=$true; action='doubleclick'; x=$tx; y=$ty; beforeScreenshot=$beforeShot; afterScreenshot=$afterShot; stateChanged=$afterShot.stateChanged; sessionId=$global:sessionId}; } ^
'tripleclick' { $tx = [int]$j.x; $ty = [int]$j.y; if ($captureScreenshots) { $beforeShot = Take-ScreenshotWithContext -phase 'before' -action 'tripleclick' -actionParams @{x=$tx; y=$ty} -targetX $tx -targetY $ty; }; [WinAPI]::Click($tx, $ty); Start-Sleep -Milliseconds 80; [WinAPI]::Click($tx, $ty); Start-Sleep -Milliseconds 80; [WinAPI]::Click($tx, $ty); Start-Sleep -Milliseconds 150; if ($captureScreenshots) { $afterShot = Take-ScreenshotWithContext -phase 'after' -action 'tripleclick' -actionParams @{x=$tx; y=$ty} -targetX $tx -targetY $ty; }; $out = @{success=$true; action='tripleclick'; x=$tx; y=$ty; beforeScreenshot=$beforeShot; afterScreenshot=$afterShot; stateChanged=$afterShot.stateChanged; sessionId=$global:sessionId}; } ^
'move' { [WinAPI]::SetCursorPos([int]$j.x, [int]$j.y); $out = @{success=$true; action='move'; x=$j.x; y=$j.y; sessionId=$global:sessionId}; } ^
'drag' { $fx = [int]$j.fromX; $fy = [int]$j.fromY; $tx = [int]$j.toX; $ty = [int]$j.toY; if ($captureScreenshots) { $beforeShot = Take-ScreenshotWithContext -phase 'before' -action 'drag' -actionParams @{fromX=$fx; fromY=$fy; toX=$tx; toY=$ty} -targetX $fx -targetY $fy; }; [WinAPI]::SetCursorPos($fx, $fy); Start-Sleep -Milliseconds 50; [WinAPI]::mouse_event([WinAPI]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0); Start-Sleep -Milliseconds 50; $steps = 20; for ($i = 1; $i -le $steps; $i++) { $nx = [int]($fx + ($tx - $fx) * $i / $steps); $ny = [int]($fy + ($ty - $fy) * $i / $steps); [WinAPI]::SetCursorPos($nx, $ny); Start-Sleep -Milliseconds 10; }; [WinAPI]::mouse_event([WinAPI]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0); Start-Sleep -Milliseconds 150; if ($captureScreenshots) { $afterShot = Take-ScreenshotWithContext -phase 'after' -action 'drag' -actionParams @{fromX=$fx; fromY=$fy; toX=$tx; toY=$ty} -targetX $tx -targetY $ty; }; $out = @{success=$true; action='drag'; fromX=$fx; fromY=$fy; toX=$tx; toY=$ty; beforeScreenshot=$beforeShot; afterScreenshot=$afterShot; stateChanged=$afterShot.stateChanged; sessionId=$global:sessionId}; } ^
'type' { if ($captureScreenshots) { $beforeShot = Take-ScreenshotWithContext -phase 'before' -action 'type' -actionParams @{length=$j.text.Length}; }; [System.Windows.Forms.SendKeys]::SendWait($j.text); Start-Sleep -Milliseconds 100; if ($captureScreenshots) { $afterShot = Take-ScreenshotWithContext -phase 'after' -action 'type' -actionParams @{length=$j.text.Length}; }; $out = @{success=$true; action='type'; length=$j.text.Length; beforeScreenshot=$beforeShot; afterScreenshot=$afterShot; stateChanged=$afterShot.stateChanged; sessionId=$global:sessionId}; } ^
'typeraw' { if ($captureScreenshots) { $beforeShot = Take-ScreenshotWithContext -phase 'before' -action 'typeraw' -actionParams @{length=$j.text.Length}; }; Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.Interaction]::AppActivate([WinAPI]::GetActiveWindowTitle()); foreach ($char in $j.text.ToCharArray()) { [System.Windows.Forms.SendKeys]::SendWait($char); Start-Sleep -Milliseconds 30; }; Start-Sleep -Milliseconds 100; if ($captureScreenshots) { $afterShot = Take-ScreenshotWithContext -phase 'after' -action 'typeraw' -actionParams @{length=$j.text.Length}; }; $out = @{success=$true; action='typeraw'; length=$j.text.Length; beforeScreenshot=$beforeShot; afterScreenshot=$afterShot; stateChanged=$afterShot.stateChanged; sessionId=$global:sessionId}; } ^
'hotkey' { if ($captureScreenshots) { $beforeShot = Take-ScreenshotWithContext -phase 'before' -action 'hotkey' -actionParams @{keys=$j.keys}; }; [System.Windows.Forms.SendKeys]::SendWait($j.keys); Start-Sleep -Milliseconds 200; if ($captureScreenshots) { $afterShot = Take-ScreenshotWithContext -phase 'after' -action 'hotkey' -actionParams @{keys=$j.keys}; }; $out = @{success=$true; action='hotkey'; keys=$j.keys; beforeScreenshot=$beforeShot; afterScreenshot=$afterShot; stateChanged=$afterShot.stateChanged; sessionId=$global:sessionId}; } ^
'keydown' { $wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys($j.key); $out = @{success=$true; action='keydown'; key=$j.key; sessionId=$global:sessionId}; } ^
'scroll' { $sx = if ($j.x) { [int]$j.x } else { -1 }; $sy = if ($j.y) { [int]$j.y } else { -1 }; if ($captureScreenshots) { $beforeShot = Take-ScreenshotWithContext -phase 'before' -action 'scroll' -actionParams @{delta=$j.delta; x=$sx; y=$sy} -targetX $sx -targetY $sy; }; if ($sx -ge 0 -and $sy -ge 0) { [WinAPI]::SetCursorPos($sx, $sy); }; [WinAPI]::mouse_event([WinAPI]::MOUSEEVENTF_WHEEL, 0, 0, [uint32]([int]$j.delta * 120), 0); Start-Sleep -Milliseconds 200; if ($captureScreenshots) { $afterShot = Take-ScreenshotWithContext -phase 'after' -action 'scroll' -actionParams @{delta=$j.delta; x=$sx; y=$sy}; }; $out = @{success=$true; action='scroll'; delta=$j.delta; beforeScreenshot=$beforeShot; afterScreenshot=$afterShot; stateChanged=$afterShot.stateChanged; sessionId=$global:sessionId}; } ^
'screenshot' { $shot = Take-Screenshot -context 'manual_request'; $out = @{success=$true; action='screenshot'; width=$shot.width; height=$shot.height; image=$shot.image; cursorX=$shot.cursorX; cursorY=$shot.cursorY; activeWindow=$shot.activeWindow; timestamp=$shot.timestamp; hash=$shot.hash; sessionId=$global:sessionId; seq=$shot.sequenceNum}; } ^
'screenshotWithContext' { $tx = if ($j.targetX) { [int]$j.targetX } else { -1 }; $ty = if ($j.targetY) { [int]$j.targetY } else { -1 }; $shot = Take-ScreenshotWithContext -phase $j.phase -action $j.contextAction -actionParams $j.params -targetX $tx -targetY $ty; $out = @{success=$true; action='screenshotWithContext'; screenshot=$shot; sessionId=$global:sessionId}; } ^
'verifyState' { $shot = Take-Screenshot -context 'state_verification'; $out = @{success=$true; action='verifyState'; screenshot=$shot; stateChanged=$shot.stateChanged; activeWindow=$shot.activeWindow; timestamp=$shot.timestamp; hash=$shot.hash; sessionId=$global:sessionId}; } ^
'waitForStateChange' { $maxMs = if ($j.maxWaitMs) { [int]$j.maxWaitMs } else { 2000 }; $result = Wait-ForStateChange -maxWaitMs $maxMs; $out = @{success=$true; action='waitForStateChange'; changed=$result.changed; elapsed=$result.elapsed; screenshot=$result.screenshot; sessionId=$global:sessionId}; } ^
'getScreenshotHistory' { $out = @{success=$true; action='getScreenshotHistory'; history=$global:screenshotHistory; sessionId=$global:sessionId; totalActions=$global:actionSequence}; } ^
'open' { Start-Process $j.target; $out = @{success=$true; action='open'; target=$j.target}; } ^
'openUrl' { Start-Process $j.url; $out = @{success=$true; action='openUrl'; url=$j.url}; } ^
'run' { $result = Invoke-Expression $j.command 2>&1 ^| Out-String; $out = @{success=$true; action='run'; output=$result}; } ^
'powershell' { $result = Invoke-Expression $j.script 2>&1 ^| Out-String; $out = @{success=$true; action='powershell'; output=$result}; } ^
'cmd' { $result = cmd /c $j.command 2>&1 ^| Out-String; $out = @{success=$true; action='cmd'; output=$result}; } ^
'readFile' { $content = Get-Content -Path $j.path -Raw; $out = @{success=$true; action='readFile'; content=$content}; } ^
'writeFile' { Set-Content -Path $j.path -Value $j.content; $out = @{success=$true; action='writeFile'; path=$j.path}; } ^
'appendFile' { Add-Content -Path $j.path -Value $j.content; $out = @{success=$true; action='appendFile'; path=$j.path}; } ^
'deleteFile' { Remove-Item -Path $j.path -Force; $out = @{success=$true; action='deleteFile'; path=$j.path}; } ^
'listDir' { $items = Get-ChildItem -Path $j.path ^| Select-Object Name, Length, LastWriteTime, PSIsContainer; $out = @{success=$true; action='listDir'; items=$items}; } ^
'createDir' { New-Item -Path $j.path -ItemType Directory -Force; $out = @{success=$true; action='createDir'; path=$j.path}; } ^
'copyFile' { Copy-Item -Path $j.source -Destination $j.dest -Force; $out = @{success=$true; action='copyFile'}; } ^
'moveFile' { Move-Item -Path $j.source -Destination $j.dest -Force; $out = @{success=$true; action='moveFile'}; } ^
'getClipboard' { $clip = Get-Clipboard; $out = @{success=$true; action='getClipboard'; content=$clip}; } ^
'setClipboard' { Set-Clipboard -Value $j.content; $out = @{success=$true; action='setClipboard'}; } ^
'getActiveWindow' { $title = [WinAPI]::GetActiveWindowTitle(); $out = @{success=$true; action='getActiveWindow'; title=$title}; } ^
'focusWindow' { $hwnd = [WinAPI]::FindWindow($null, $j.title); if ($hwnd -ne [IntPtr]::Zero) { [WinAPI]::SetForegroundWindow($hwnd); $out = @{success=$true; action='focusWindow'; title=$j.title}; } else { $out = @{success=$false; error='Window not found'}; } } ^
'getProcesses' { $procs = Get-Process ^| Select-Object -First 50 Id, ProcessName, CPU, WorkingSet64; $out = @{success=$true; action='getProcesses'; processes=$procs}; } ^
'killProcess' { Stop-Process -Name $j.name -Force; $out = @{success=$true; action='killProcess'; name=$j.name}; } ^
'getScreenInfo' { $screens = [System.Windows.Forms.Screen]::AllScreens ^| ForEach-Object { @{DeviceName = $_.DeviceName; Primary = $_.Primary; Width = $_.Bounds.Width; Height = $_.Bounds.Height; X = $_.Bounds.X; Y = $_.Bounds.Y} }; $out = @{success=$true; action='getScreenInfo'; screens=$screens}; } ^
'getCursorPos' { $pos = [System.Windows.Forms.Cursor]::Position; $out = @{success=$true; action='getCursorPos'; x=$pos.X; y=$pos.Y}; } ^
'wait' { Start-Sleep -Milliseconds ([int]$j.ms); $out = @{success=$true; action='wait'; ms=$j.ms}; } ^
'notify' { [System.Windows.Forms.MessageBox]::Show($j.message, $j.title); $out = @{success=$true; action='notify'}; } ^
'inputBox' { Add-Type -AssemblyName Microsoft.VisualBasic; $result = [Microsoft.VisualBasic.Interaction]::InputBox($j.prompt, $j.title, $j.default); $out = @{success=$true; action='inputBox'; result=$result}; } ^
'ping' { $out = @{success=$true; status='ready'; version='4.0'}; } ^
default { $out = @{success=$false; error='Unknown action: ' + $j.action}; } ^
}; }; } catch { $out = @{success=$false; error=$_.Exception.Message; action=$j.action}; Write-Host '[ERROR]' $_.Exception.Message -ForegroundColor Red; }; $json = SafeJson $out; Send-Response $writer 200 $json 'application/json'; $client.Close(); }; ^
} catch { Write-Host ''; Write-Host '========================================' -ForegroundColor Red; Write-Host '   FATAL ERROR' -ForegroundColor Red; Write-Host '========================================' -ForegroundColor Red; Write-Host ''; Write-Host $_.Exception.Message -ForegroundColor Yellow; Write-Host ''; Write-Host 'Press Enter to exit...'; Read-Host; } finally { if ($mutex) { $mutex.ReleaseMutex(); $mutex.Dispose(); }; if ($listener) { try { $listener.Stop(); } catch {}; } }"

pause
`;

const DownloadAgent = () => {
  const [downloaded, setDownloaded] = useState(false);

  const triggerDownload = () => {
    const batBlob = new Blob([BAT_SCRIPT], { type: "application/bat" });
    const batUrl = URL.createObjectURL(batBlob);
    const batLink = document.createElement("a");
    batLink.href = batUrl;
    batLink.download = "NovaAgent.bat";
    document.body.appendChild(batLink);
    batLink.click();
    document.body.removeChild(batLink);
    URL.revokeObjectURL(batUrl);

    setDownloaded(true);
  };

  useEffect(() => {
    triggerDownload();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-8">
        <NovaLogoSvg className="h-16 w-auto mx-auto" />
        
        <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-2xl p-8 space-y-6">
            {downloaded ? (
                <>
                  <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-8 h-8 text-green-400" />
                  </div>
                  <h1 className="text-2xl font-bold text-white">Download Started!</h1>
                  <p className="text-gray-400">
                    Check your downloads folder for <span className="text-pink-400 font-mono">NovaAgent.bat</span>
                  </p>
                </>
              ) : (
            <>
              <div className="w-16 h-16 mx-auto bg-pink-500/20 rounded-full flex items-center justify-center animate-pulse">
                <Download className="w-8 h-8 text-pink-400" />
              </div>
              <h1 className="text-2xl font-bold text-white">Preparing Download...</h1>
              <p className="text-gray-400">Your agent file is being prepared</p>
            </>
          )}
          
          <button
            onClick={triggerDownload}
            className="w-full py-3 px-6 bg-pink-600 hover:bg-pink-500 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <Download className="w-5 h-5" />
            {downloaded ? "Download Again" : "Download Now"}
          </button>
        </div>

        <div className="space-y-4 text-left bg-gray-800/30 border border-gray-700/50 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-pink-400" />
            How to run
          </h2>
            <ol className="space-y-3 text-gray-300 text-sm">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-pink-500/20 text-pink-400 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                <span>Double-click <span className="font-mono text-pink-400">NovaAgent.bat</span> in your Downloads folder</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-pink-500/20 text-pink-400 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                <span>Click "Yes" on the consent dialog to allow AI control</span>
              </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-pink-500/20 text-pink-400 rounded-full flex items-center justify-center text-xs font-bold">3</span>
            <span>Keep the window open - return to Nova and enable Auto Mode</span>
          </li>
          </ol>
        </div>

        <p className="text-gray-500 text-xs">
          You can close this tab after downloading
        </p>
      </div>
    </div>
  );
};

export default DownloadAgent;
