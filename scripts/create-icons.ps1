Add-Type -AssemblyName System.Drawing
$projectRoot=Split-Path $PSScriptRoot -Parent
$iconDir=Join-Path $projectRoot 'mobile\icons'
New-Item -ItemType Directory -Path $iconDir -Force | Out-Null
$surface=New-Object System.Drawing.Bitmap(64,64)
$g=[System.Drawing.Graphics]::FromImage($surface)
$g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::None
$g.Clear([System.Drawing.ColorTranslator]::FromHtml('#3d2b20'))
function Block([string]$color,[int]$x,[int]$y,[int]$w,[int]$h){$brush=New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($color));$g.FillRectangle($brush,$x,$y,$w,$h);$brush.Dispose()}
Block '#c08a4a' 5 5 54 54
Block '#f2d494' 8 8 48 48
Block '#d67d70' 13 18 41 28
Block '#d67d70' 16 42 32 11
Block '#d67d70' 10 22 6 24
Block '#d67d70' 22 12 8 14
Block '#d67d70' 42 12 8 14
Block '#a94f4c' 13 18 9 7
Block '#a94f4c' 42 18 8 7
Block '#a94f4c' 17 46 30 7
Block '#3d2b20' 19 29 6 6
Block '#3d2b20' 39 29 6 6
Block '#7d4540' 21 36 22 13
Block '#efaaa0' 23 38 18 9
Block '#7d4540' 26 40 4 5
Block '#7d4540' 34 40 4 5
$g.Dispose()
foreach($spec in @(@('icon-192.png',192,0),@('icon-512.png',512,0),@('apple-touch-icon.png',180,0),@('maskable-512.png',512,48))){
 $size=[int]$spec[1];$inset=[int]$spec[2];$out=New-Object System.Drawing.Bitmap($size,$size);$draw=[System.Drawing.Graphics]::FromImage($out)
 $draw.Clear([System.Drawing.ColorTranslator]::FromHtml('#3d2b20'));$draw.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor;$draw.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::Half
 $draw.DrawImage($surface,$inset,$inset,$size-2*$inset,$size-2*$inset);$draw.Dispose();$out.Save((Join-Path $iconDir $spec[0]),[System.Drawing.Imaging.ImageFormat]::Png);$out.Dispose()
}
$surface.Dispose()
Write-Output 'Created four app icons from the existing pixel pig mark.'
