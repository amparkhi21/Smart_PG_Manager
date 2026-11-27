# Reproduce all assets from the original approved raster, without redrawing it.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$brandRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public/brand'))
$resourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../android/app/src/main/res'))
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
public static class ApprovedBrand {
    // Remove only edge-connected near-white pixels, preserving interior highlights.
    public static Bitmap Trim(string path) {
        using (var original = new Bitmap(path)) {
            var image = new Bitmap(original);
            int w=image.Width, h=image.Height;
            var seen=new bool[w*h];
            var queue=new Queue<int>();
            for(int x=0;x<w;x++) { queue.Enqueue(x); queue.Enqueue((h-1)*w+x); }
            for(int y=0;y<h;y++) { queue.Enqueue(y*w); queue.Enqueue(y*w+w-1); }
            while(queue.Count>0) {
                int i=queue.Dequeue();
                if(seen[i]) continue;
                seen[i]=true;
                int x=i%w, y=i/w;
                var c=image.GetPixel(x,y);
                if(c.A!=0 && (c.R<235 || c.G<235 || c.B<235)) continue;
                image.SetPixel(x,y,Color.Transparent);
                if(x>0) queue.Enqueue(i-1);
                if(x+1<w) queue.Enqueue(i+1);
                if(y>0) queue.Enqueue(i-w);
                if(y+1<h) queue.Enqueue(i+w);
            }
            int left=w,top=h,right=0,bottom=0;
            for(int y=0;y<h;y++) for(int x=0;x<w;x++) {
                if(image.GetPixel(x,y).A==0) continue;
                left=Math.Min(left,x); top=Math.Min(top,y);
                right=Math.Max(right,x); bottom=Math.Max(bottom,y);
            }
            var crop=image.Clone(new Rectangle(left,top,right-left+1,bottom-top+1),PixelFormat.Format32bppArgb);
            image.Dispose();
            return crop;
        }
    }
    public static double Radius(Bitmap image) {
        double radius=0,side=Math.Max(image.Width,image.Height);
        for(int y=0;y<image.Height;y++) for(int x=0;x<image.Width;x++) {
            if(image.GetPixel(x,y).A==0) continue;
            double dx=(x+0.5-image.Width/2.0)/side,dy=(y+0.5-image.Height/2.0)/side;
            radius=Math.Max(radius,Math.Sqrt(dx*dx+dy*dy));
        }
        return radius;
    }
    public static void Save(Bitmap image,int size,double extent,string path,bool round) {
        System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(path));
        using(var output=new Bitmap(size,size)) using(var g=Graphics.FromImage(output)) {
            g.Clear(Color.Transparent);
            g.InterpolationMode=InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode=PixelOffsetMode.HighQuality;
            g.SmoothingMode=SmoothingMode.AntiAlias;
            if(round) using(var brush=new SolidBrush(ColorTranslator.FromHtml("#0B1A3A"))) g.FillEllipse(brush,0,0,size,size);
            double ratio=extent/Math.Max(image.Width,image.Height);
            int w=(int)Math.Round(image.Width*ratio),h=(int)Math.Round(image.Height*ratio);
            using(var attributes=new ImageAttributes()) {
                attributes.SetWrapMode(WrapMode.TileFlipXY);
                g.DrawImage(image,new Rectangle((size-w)/2,(size-h)/2,w,h),0,0,image.Width,image.Height,GraphicsUnit.Pixel,attributes);
            }
            output.Save(path,ImageFormat.Png);
        }
    }
}
'@
$source = Join-Path $brandRoot 'smart-pg-icon.png.png'
if (!(Test-Path -LiteralPath $source)) { throw "Approved source missing: $source" }
$art = [ApprovedBrand]::Trim($source)
try {
    $radius = [ApprovedBrand]::Radius($art)
    [ApprovedBrand]::Save($art, 1024, 1024, (Join-Path $brandRoot 'smart-pg-icon.png'), $false)
    foreach ($size in @(16,32,48,180)) {
        $name = if ($size -eq 180) { 'apple-touch-icon.png' } else { "favicon-$size.png" }
        [ApprovedBrand]::Save($art, $size, $size, (Join-Path $brandRoot $name), $false)
    }
    $densities = @{ mdpi = @(48,108,288); hdpi = @(72,162,432); xhdpi = @(96,216,576); xxhdpi = @(144,324,864); xxxhdpi = @(192,432,1152) }
    foreach ($density in $densities.Keys) {
        $sizes = $densities[$density]
        $mipmap = Join-Path $resourceRoot "mipmap-$density"
        $drawable = Join-Path $resourceRoot "drawable-$density"
        [ApprovedBrand]::Save($art, $sizes[0], $sizes[0], (Join-Path $mipmap 'ic_launcher.png'), $false)
        [ApprovedBrand]::Save($art, $sizes[0], ($sizes[0]*0.47/$radius), (Join-Path $mipmap 'ic_launcher_round.png'), $true)
        # Every visible pixel fits a 64dp circle on the 108dp adaptive canvas:
        # 1dp inside Android's guaranteed 66dp safe circle, for all mask shapes.
        [ApprovedBrand]::Save($art, $sizes[1], ($sizes[1]*32/108/$radius), (Join-Path $drawable 'ic_launcher_foreground.png'), $false)
        # The 288dp system splash canvas has a 192dp safe circle.
        [ApprovedBrand]::Save($art, $sizes[2], ($sizes[2]*94/288/$radius), (Join-Path $drawable 'splash_icon.png'), $false)
    }
    Write-Output "Generated web assets and five launcher/round/adaptive/splash densities. Trimmed source: $($art.Width)x$($art.Height)."
} finally { $art.Dispose() }
