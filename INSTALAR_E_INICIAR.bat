@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo   CONTROLE ESCOLAR - SISTEMA DE PRESENCA
echo ==========================================
echo.

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo [1/4] Arquivo .env criado. Configure o MySQL e as credenciais.
) else (
  echo [1/4] .env ja existe.
)

echo.
echo [2/4] Instalando dependencias...
call npm install
if errorlevel 1 (
  echo ERRO: npm install falhou.
  pause
  exit /b 1
)

echo.
echo [3/4] Criando/atualizando Super Admin...
call npm run criar-super-admin
if errorlevel 1 (
  echo AVISO: Super Admin nao foi criado. Revise o .env e o banco.
)

echo.
echo [4/4] Criando/atualizando administrador da escola...
call npm run criar-admin
if errorlevel 1 (
  echo AVISO: Administrador nao foi criado. Revise o .env e o banco.
)

echo.
echo Para uma base existente, execute primeiro MIGRACAO_MULTI_ESCOLA.sql no MySQL.
echo Para uma base nova, execute database.sql no MySQL.
echo.
echo Iniciando servidor...
call npm start
pause
