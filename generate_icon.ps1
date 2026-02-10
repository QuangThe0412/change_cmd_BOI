Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap 1024, 1024
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$brush = [System.Drawing.Brushes]::Blue
$graphics.FillRectangle($brush, 0, 0, 1024, 1024)
$bitmap.Save("app-icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
Write-Host "Generated app-icon.png"
