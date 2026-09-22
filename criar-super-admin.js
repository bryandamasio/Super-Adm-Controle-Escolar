require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./config/database');

async function criarSuperAdmin() {
    const email = String(process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
    const senha = String(process.env.SUPER_ADMIN_PASSWORD || '');
    const nome = String(process.env.SUPER_ADMIN_NOME || 'Super Admin').trim();

    if (!email || !senha) throw new Error('Defina SUPER_ADMIN_EMAIL e SUPER_ADMIN_PASSWORD no arquivo .env.');
    if (senha.length < 8) throw new Error('A senha do Super Admin deve ter pelo menos 8 caracteres.');

    const hash = await bcrypt.hash(senha, 12);
    await pool.execute(`INSERT INTO usuarios (nome,email,senha,tipo,escola_id,ativo) VALUES (?,?,?,'SUPER_ADMIN',NULL,TRUE) ON DUPLICATE KEY UPDATE nome=VALUES(nome),senha=VALUES(senha),tipo='SUPER_ADMIN',escola_id=NULL,ativo=TRUE`, [nome,email,hash]);
    console.log(`✅ Super Admin ${email} criado/atualizado.`);
}

criarSuperAdmin().catch(e=>{console.error('❌',e.message);process.exitCode=1}).finally(()=>pool.end());
