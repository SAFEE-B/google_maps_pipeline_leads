@echo off
echo 🚀 Starting Naqvi AI Project Redis Setup...
echo.

REM Check if Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)

echo ✅ Docker is running
echo.

echo 🔄 Starting Redis and Redis Commander...
docker-compose up -d

if %errorlevel% equ 0 (
    echo.
    echo ✅ Redis services started successfully!
    echo.
    echo 📊 Services running:
    echo    • Redis: localhost:6379
    echo    • Redis Commander: http://localhost:8081
    echo.
    echo 🧪 Testing Redis connection...
    timeout /t 3 >nul
    docker exec naqvi-ai-redis redis-cli ping 2>nul
    if %errorlevel% equ 0 (
        echo ✅ Redis is responding to ping
    ) else (
        echo ⚠️  Redis may still be starting up...
    )
    echo.
    echo 🎯 Your Redis setup is ready for the Naqvi AI Project!
    echo    You can now start the Backend server.
) else (
    echo ❌ Failed to start Redis services
    echo Please check the error messages above
)

echo.
pause 