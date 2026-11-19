# Rebuild the native PNG fallbacks using Windows' built-in renderer. No service,
# secret, or runtime dependency is needed. SVG/vector sources remain editable.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$resourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../android/app/src/main/res'))
$navy = [Drawing.ColorTranslator]::FromHtml('#0B1A3A')
$white = [Drawing.ColorTranslator]::FromHtml('#F8FAFC')
$teal = [Drawing.ColorTranslator]::FromHtml('#14B8A6')

function Paint-Mark($graphics, [float]$scale = 1) {
    $state = $graphics.Save()
    $graphics.TranslateTransform(54, 54)
    $graphics.ScaleTransform($scale, $scale)
    $graphics.TranslateTransform(-54, -54)
    $pen = [Drawing.Pen]::new($white, 5)
    $pen.StartCap = $pen.EndCap = [Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [Drawing.Drawing2D.LineJoin]::Round
    $graphics.DrawLines($pen, [Drawing.PointF[]]@([Drawing.PointF]::new(31,46), [Drawing.PointF]::new(54,28), [Drawing.PointF]::new(77,46)))
    $lightBrush = [Drawing.SolidBrush]::new($white)
    $darkBrush = [Drawing.SolidBrush]::new($navy)
    $tealBrush = [Drawing.SolidBrush]::new($teal)
    $graphics.FillRectangle($lightBrush, 36, 44, 36, 33)
    foreach ($x in @(43,58)) { foreach ($y in @(49,60)) { $graphics.FillRectangle($darkBrush, $x, $y, 7, 6) } }
    $graphics.FillRectangle($darkBrush, 50, 69, 8, 8)
    $graphics.FillEllipse($tealBrush, 61, 60, 24, 24)
    $pen.Width = 3.5
    $graphics.DrawLines($pen, [Drawing.PointF[]]@([Drawing.PointF]::new(67,72), [Drawing.PointF]::new(71,76), [Drawing.PointF]::new(79,67)))
    $pen.Dispose(); $lightBrush.Dispose(); $darkBrush.Dispose(); $tealBrush.Dispose()
    $graphics.Restore($state)
}

function Save-Icon([int]$size, [string]$path, [bool]$round = $false, [bool]$foreground = $false) {
    $canvas = [Drawing.Bitmap]::new(864, 864)
    $graphics = [Drawing.Graphics]::FromImage($canvas)
    $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.ScaleTransform(8, 8)
    $graphics.Clear([Drawing.Color]::Transparent)
    $brush = [Drawing.SolidBrush]::new($navy)
    if (!$foreground) {
        if ($round) { $graphics.FillEllipse($brush, 0, 0, 108, 108) }
        else {
            $silhouette = [Drawing.Drawing2D.GraphicsPath]::new()
            $silhouette.AddArc(2, 2, 44, 44, 180, 90)
            $silhouette.AddArc(62, 2, 44, 44, 270, 90)
            $silhouette.AddArc(62, 62, 44, 44, 0, 90)
            $silhouette.AddArc(2, 62, 44, 44, 90, 90)
            $silhouette.CloseFigure()
            $graphics.FillPath($brush, $silhouette)
            $silhouette.Dispose()
        }
    }
    Paint-Mark $graphics $(if ($foreground) { 0.86 } else { 1.1 })
    $result = [Drawing.Bitmap]::new($size, $size)
    $resizer = [Drawing.Graphics]::FromImage($result)
    $resizer.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $resizer.DrawImage($canvas, 0, 0, $size, $size)
    $result.Save($path, [Drawing.Imaging.ImageFormat]::Png)
    $brush.Dispose(); $graphics.Dispose(); $resizer.Dispose(); $canvas.Dispose(); $result.Dispose()
}

$densities = @{ mdpi = @(48,108); hdpi = @(72,162); xhdpi = @(96,216); xxhdpi = @(144,324); xxxhdpi = @(192,432) }
foreach ($density in $densities.Keys) {
    $directory = Join-Path $resourceRoot "mipmap-$density"
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    Save-Icon $densities[$density][0] (Join-Path $directory 'ic_launcher.png')
    Save-Icon $densities[$density][0] (Join-Path $directory 'ic_launcher_round.png') $true
    # Adaptive foregrounds use the vector drawable at every density.
    $obsoleteLayer = Join-Path $directory 'ic_launcher_foreground.png'
    if (Test-Path -LiteralPath $obsoleteLayer) { Remove-Item -LiteralPath $obsoleteLayer }
}

# Android 12+ supports a separate branding image below the system splash icon.
$wordmark = [Drawing.Bitmap]::new(600, 100)
$graphics = [Drawing.Graphics]::FromImage($wordmark)
$graphics.Clear([Drawing.Color]::Transparent)
$graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$font = [Drawing.Font]::new('Segoe UI', 42, [Drawing.FontStyle]::Bold, [Drawing.GraphicsUnit]::Pixel)
$brush = [Drawing.SolidBrush]::new($white)
$format = [Drawing.StringFormat]::new()
$format.Alignment = $format.LineAlignment = [Drawing.StringAlignment]::Center
$graphics.DrawString('Smart PG Manager', $font, $brush, [Drawing.RectangleF]::new(0,0,600,100), $format)
$wordmarkDirectory = Join-Path $resourceRoot 'drawable-xxhdpi'
New-Item -ItemType Directory -Force -Path $wordmarkDirectory | Out-Null
$wordmark.Save((Join-Path $wordmarkDirectory 'splash_wordmark.png'), [Drawing.Imaging.ImageFormat]::Png)
$obsoleteWordmark = Join-Path $resourceRoot 'drawable/splash_wordmark.png'
if (Test-Path -LiteralPath $obsoleteWordmark) { Remove-Item -LiteralPath $obsoleteWordmark }
$font.Dispose(); $brush.Dispose(); $format.Dispose(); $graphics.Dispose(); $wordmark.Dispose()

# Remove only the old generated Capacitor splash bitmaps. The system splash now
# draws the vector mark, so no second bitmap splash is packaged or shown.
$oldSplashFiles = @(Get-ChildItem -LiteralPath $resourceRoot -Filter 'splash.png' -File -Recurse)
foreach ($file in $oldSplashFiles) {
    $resolved = [IO.Path]::GetFullPath($file.FullName)
    if (!$resolved.StartsWith($resourceRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected splash path' }
    Remove-Item -LiteralPath $resolved
}
Write-Output 'Generated launcher/round icons at 48,72,96,144,192px, adaptive layers, and native splash wordmark.'
