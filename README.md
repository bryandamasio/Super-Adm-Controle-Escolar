# Controle Escolar — Sistema de Presença

## Novidades desta versão

- Dashboard com layout profissional e menu lateral fixo.
- Menu protegido por perfil no front-end; o backend também valida as permissões.
- Novos perfis: `SUPER_ADMIN`, `ADMIN`, `PROFESSOR`, `VICE_DIRECAO`, `COORDENACAO`, `SECRETARIA`.
- Cadastro de professores com criação do acesso do professor.
- Cadastro de usuários da escola para vice-direção, coordenação, secretaria, professor e administrador.
- Cadastro e gestão de múltiplas escolas.
- Super Admin pode ativar/desativar escolas e registrar pagamentos/cobranças.
- Controle por escola no banco para evitar mistura de dados entre escolas.
- Registro de presença por QR Code **ou matrícula**.
- O cadastro do aluno não retorna falso erro caso a geração do QR falhe; o aluno permanece salvo.
- Ícones do dashboard foram substituídos por SVGs profissionais, sem dependência de biblioteca externa.

## Instalação de uma base nova

1. Execute `database.sql` no MySQL.
2. Configure `.env`.
3. Rode `npm install`.
4. Rode `npm run criar-super-admin` para criar o Super Admin.
5. Rode `npm run criar-admin` para criar o primeiro administrador vinculado à escola principal.
6. Rode `npm start`.

## Atualização de uma base existente

Faça backup antes. Execute `MIGRACAO_MULTI_ESCOLA.sql` e depois `npm install`/`npm start`.

A migração cria a `Escola Principal` quando não existe nenhuma escola e vincula os dados antigos a ela.

## Pagamentos

A tela de Super Admin registra o status e o histórico de pagamentos da escola no banco. Não há integração com gateway/banco financeiro nesta versão; o lançamento é administrativo.
