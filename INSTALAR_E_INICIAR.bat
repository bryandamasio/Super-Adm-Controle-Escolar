@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo   SISTEMA DE PRESENCA ESCOLAR
echo ==========================================
echo.

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo [1/3] Arquivo .env criado a partir do .env.example.
  echo       Abra o .env e informe os dados do MySQL.
) else (
  echo [1/3] .env ja existe.
)

echo.
echo [2/3] Instalando dependencias...
call npm install
if errorlevel 1 (
  echo.
  echo ERRO: npm install falhou.
  pause
  exit /b 1
)

echo.
echo [3/3] Inicializando administrador...
call npm run criar-admin
if errorlevel 1 (
  echo.
  echo AVISO: o administrador nao foi criado. Verifique o banco/MySQL e execute:
  echo        npm run criar-admin
) else (
  echo.
  echo Administrador inicializado.
)

echo.
echo Iniciando servidor...
call npm start
pause
