require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./config/database');

async function criarAdmin() {
    const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const senha = String(process.env.ADMIN_PASSWORD || '');
    const nome = String(process.env.ADMIN_NOME || 'Administrador').trim();
    const escolaNome = String(process.env.ADMIN_ESCOLA_NOME || 'Escola Principal').trim();

    if (!email || !senha) throw new Error('Defina ADMIN_EMAIL e ADMIN_PASSWORD no arquivo .env antes de executar este comando.');

    const conexao = await pool.getConnection();
    try {
        await conexao.beginTransaction();
        const [[escolaExistente]] = await conexao.execute('SELECT id FROM escolas ORDER BY id LIMIT 1');
        let escolaId = escolaExistente?.id;
        if (!escolaId) {
            const [r] = await conexao.execute('INSERT INTO escolas (nome, ativa, valor_mensal, vencimento_dia) VALUES (?, TRUE, 0, 10)', [escolaNome]);
            escolaId = r.insertId;
        }
        const hash = await bcrypt.hash(senha, 12);
        await conexao.execute(`INSERT INTO usuarios (nome,email,senha,tipo,escola_id,ativo) VALUES (?,?,?,'ADMIN',?,TRUE) ON DUPLICATE KEY UPDATE nome=VALUES(nome),senha=VALUES(senha),tipo='ADMIN',escola_id=VALUES(escola_id),ativo=TRUE`, [nome,email,hash,escolaId]);
        await conexao.commit();
        console.log(`✅ Administrador ${email} criado/atualizado na escola ${escolaId}.`);
    } catch (erro) { try{await conexao.rollback()}catch{} throw erro; } finally { conexao.release(); }
}
criarAdmin().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>pool.end());
