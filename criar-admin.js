require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./config/database');

async function criarAdmin() {
    const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const senha = String(process.env.ADMIN_PASSWORD || '');
    const nome = String(process.env.ADMIN_NOME || 'Administrador').trim();

    if (!email || !senha) {
        throw new Error('Defina ADMIN_EMAIL e ADMIN_PASSWORD no arquivo .env antes de executar este comando.');
    }

    const senhaHash = await bcrypt.hash(senha, 12);
    await pool.execute(`
        INSERT INTO usuarios (nome, email, senha, tipo, ativo)
        VALUES (?, ?, ?, 'ADMIN', TRUE)
        ON DUPLICATE KEY UPDATE nome = VALUES(nome), senha = VALUES(senha), tipo = 'ADMIN', ativo = TRUE
    `, [nome, email, senhaHash]);
    console.log(`Administrador ${email} criado/atualizado.`);
}

criarAdmin()
    .catch((erro) => { console.error(erro.message); process.exitCode = 1; })
    .finally(() => pool.end());
