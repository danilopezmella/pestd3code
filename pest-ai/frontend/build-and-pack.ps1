# Navegar al directorio frontend (asumiendo que ejecutamos desde frontend/)
Write-Host "🚀 Iniciando proceso de build y empaquetado..." -ForegroundColor Cyan

# Clean up previous builds and zip files
if (Test-Path "dist") {
    Remove-Item -Path "dist" -Recurse -Force
}
if (Test-Path "frontend-build.zip") {
    Remove-Item -Path "frontend-build.zip" -Force
}

# Run build command
Write-Host "Running npm build..."
npm run build

# Check if build was successful
if ($LASTEXITCODE -eq 0) {
    Write-Host "Build successful!"
    
    # Create zip file
    Write-Host "Creating zip file..."
    Compress-Archive -Path "dist\*" -DestinationPath "frontend-build.zip"
    
    if (Test-Path "frontend-build.zip") {
        Write-Host "Successfully created frontend-build.zip"
        Write-Host "You can now upload this file to GoDaddy"
    } else {
        Write-Host "Error: Failed to create zip file"
        exit 1
    }
} else {
    Write-Host "Error: Build failed"
    exit 1
} 