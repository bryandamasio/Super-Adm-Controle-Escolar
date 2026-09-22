# Sistema de Presença Escolar

Sistema web para controle de entrada e saída de alunos usando QR Code.

## Stack
- Node.js + Express
- MySQL
- JWT + bcrypt
- QR Code (`qrcode`)
- Frontend HTML/CSS/JavaScript

## Funcionalidades
- Login de administradores/professores.
- Cadastro de turmas.
- Cadastro de alunos.
- Geração automática de QR Code individual.
- Download do QR Code do aluno.
- Leitura por webcam e leitor USB.
- Alternância automática entre ENTRADA e SAÍDA.
- Dashboard com resumo do dia.
- Últimos registros atualizados periodicamente.
- Histórico e filtros por período/aluno.
- Exportação do histórico para CSV.
- Health check do banco em `/api/health`.
- API autenticada via Bearer Token.

## Instalação

1. Instale Node.js LTS e MySQL.
2. Crie o banco executando `database.sql` no MySQL.
3. Copie `.env.example` para `.env` e preencha as credenciais.
4. Instale as dependências:

```powershell
npm install
```

5. Crie o primeiro administrador:

```powershell
npm run criar-admin
```

6. Inicie:

```powershell
npm start
```

Acesse `http://localhost:3000/login.html`.

## Fluxo recomendado

1. Entre como administrador.
2. Abra **Turmas** e cadastre as turmas.
3. Abra **Alunos** e cadastre cada aluno.
4. Baixe/imprima o QR Code de cada aluno.
5. Abra **Registrar presença**.
6. Use webcam ou leitor USB para registrar:
   - primeira leitura do dia: ENTRADA;
   - próxima leitura do mesmo aluno: SAÍDA;
   - novas leituras continuam alternando ENTRADA/SAÍDA.
7. Consulte o dashboard e os relatórios.

## Testes técnicos

```powershell
npm run check
```

## Observação sobre a câmera

A webcam funciona em `http://localhost:3000` ou em uma implantação HTTPS. O navegador precisa permitir acesso à câmera.
