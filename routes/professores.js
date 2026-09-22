const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../config/database');
const autenticar = require('../middleware/autenticar');

const router = express.Router();
router.use(autenticar);

function apenasAdmin(req, res, next) {
    if (!['ADMIN', 'SUPER_ADMIN'].includes(req.usuario?.perfil)) {
        return res.status(403).json({ erro: 'Apenas administradores podem administrar professores.' });
    }
    next();
}

async function escolaDoAdministrador(req, conexao = pool) {
    const [[usuario]] = await conexao.execute(
        'SELECT escola_id FROM usuarios WHERE id = ? LIMIT 1',
        [req.usuario.id]
    );
    if (usuario?.escola_id) return Number(usuario.escola_id);
    const [[escola]] = await conexao.execute(
        'SELECT id FROM escolas WHERE ativa = 1 ORDER BY id ASC LIMIT 1'
    );
    return escola ? Number(escola.id) : null;
}
router.get('/', apenasAdmin, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT
                p.id,
                p.usuario_id,
                p.nome,
                p.email,
                p.telefone,
                p.registro,
                e.nome AS escola,
                p.escola_id,
                p.ativo,
                p.criado_em
             FROM professores p
             LEFT JOIN escolas e ON e.id = p.escola_id
             ORDER BY p.nome ASC`
        );
        res.json(rows);
    } catch (erro) {
        console.error('❌ Erro ao listar professores:', erro);
        res.status(500).json({ erro: 'Não foi possível carregar os professores.', detalhe: process.env.NODE_ENV === 'development' ? erro.message : undefined });
    }
});

router.post('/', apenasAdmin, async (req, res) => {
    const nome = String(req.body.nome || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const senha = String(req.body.senha || '');
    const telefone = String(req.body.telefone || '').trim() || null;
    const registro = String(req.body.registro || '').trim() || null;

    if (!nome || !email || senha.length < 6) {
        return res.status(400).json({ erro: 'Nome, e-mail e senha de no mínimo 6 caracteres são obrigatórios.' });
    }

    const conexao = await pool.getConnection();
    try {
        await conexao.beginTransaction();

        const escolaId = Number(req.body.escola_id || 0) || await escolaDoAdministrador(req, conexao);
        if (!escolaId) throw Object.assign(new Error('Nenhuma escola ativa foi encontrada para vincular o professor.'), { status: 400 });

        const [[escola]] = await conexao.execute(
            'SELECT id, nome FROM escolas WHERE id = ? AND ativa = 1 LIMIT 1',
            [escolaId]
        );
        if (!escola) throw Object.assign(new Error('A escola informada não existe ou está inativa.'), { status: 400 });

        const senhaHash = await bcrypt.hash(senha, 12);
        const [usuario] = await conexao.execute(
            'INSERT INTO usuarios (nome, email, senha, tipo, escola_id, ativo) VALUES (?, ?, ?, \'PROFESSOR\', ?, 1)',
            [nome, email, senhaHash, escolaId]
        );

        const [professor] = await conexao.execute(
            'INSERT INTO professores (nome, email, telefone, registro, escola_id, usuario_id, ativo) VALUES (?, ?, ?, ?, ?, ?, 1)',
            [nome, email, telefone, registro, escolaId, usuario.insertId]
        );

        await conexao.commit();

        return res.status(201).json({
            mensagem: 'Professor cadastrado com sucesso.',
            professor: { id: professor.insertId, usuario_id: usuario.insertId, nome, email, telefone, registro, escola_id: escolaId, escola: escola.nome, ativo: 1 }
        });
    } catch (erro) {
        try { await conexao.rollback(); } catch {}
        if (erro.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ erro: 'Este e-mail ou registro já está cadastrado para esta escola.' });
        }
        if (erro.status) return res.status(erro.status).json({ erro: erro.message });
        console.error('❌ Erro ao cadastrar professor:', erro);
        res.status(500).json({ erro: 'Não foi possível cadastrar o professor.', detalhe: process.env.NODE_ENV === 'development' ? erro.message : undefined });
    } finally {
        conexao.release();
    }
});
router.get('/minha-presenca', async (req, res) => {
    if (req.usuario?.perfil !== 'PROFESSOR') {
        return res.status(403).json({ erro: 'Acesso exclusivo para professores.' });
    }

    try {
        const [[professor]] = await pool.execute(
            `SELECT p.id, p.usuario_id, p.nome, p.email, p.telefone, p.registro,
                    e.nome AS escola, p.escola_id, p.ativo
             FROM professores p
             LEFT JOIN escolas e ON e.id = p.escola_id
             WHERE p.usuario_id = ? LIMIT 1`,
            [req.usuario.id]
        );

        if (!professor || !professor.ativo) {
            return res.status(404).json({ erro: 'Perfil de professor não encontrado.' });
        }

        const [historico] = await pool.execute(
            `SELECT id, DATE_FORMAT(data, '%Y-%m-%d') AS data,
                    entrada, saida, status
             FROM professor_presencas
             WHERE professor_id = ?
             ORDER BY data DESC
             LIMIT 30`,
            [professor.id]
        );

        const [hojeRows] = await pool.execute(
            `SELECT id, DATE_FORMAT(data, '%Y-%m-%d') AS data,
                    entrada, saida, status
             FROM professor_presencas
             WHERE professor_id = ? AND data = CURRENT_DATE()
             LIMIT 1`,
            [professor.id]
        );

        res.json({ professor, hoje: hojeRows[0] || null, historico });
    } catch (erro) {
        console.error('❌ Erro na presença do professor:', erro);
        res.status(500).json({ erro: 'Não foi possível carregar sua presença.' });
    }
});
async function obterProfessorAtual(conexao, usuarioId) {
    const [[professor]] = await conexao.execute(
        'SELECT id, ativo FROM professores WHERE usuario_id = ? LIMIT 1 FOR UPDATE',
        [usuarioId]
    );
    return professor;
}

router.post('/entrada', async (req, res) => {
    if (req.usuario?.perfil !== 'PROFESSOR') return res.status(403).json({ erro: 'Acesso exclusivo para professores.' });
    const conexao = await pool.getConnection();
    try {
        await conexao.beginTransaction();
        const professor = await obterProfessorAtual(conexao, req.usuario.id);
        if (!professor || !professor.ativo) throw Object.assign(new Error('Perfil de professor não encontrado.'), { status: 404 });

        const [existente] = await conexao.execute(
            'SELECT id, entrada, saida FROM professor_presencas WHERE professor_id = ? AND data = CURRENT_DATE() LIMIT 1 FOR UPDATE',
            [professor.id]
        );
        if (existente[0]?.entrada) {
            await conexao.rollback();
            return res.status(409).json({ erro: 'Você já registrou sua entrada hoje.' });
        }

        if (existente[0]) {
            await conexao.execute("UPDATE professor_presencas SET entrada = NOW(), status = 'ABERTA' WHERE id = ?", [existente[0].id]);
        } else {
            await conexao.execute("INSERT INTO professor_presencas (professor_id, data, entrada, status) VALUES (?, CURRENT_DATE(), NOW(), 'ABERTA')", [professor.id]);
        }

        await conexao.commit();
        res.json({ mensagem: 'Entrada registrada com sucesso.' });
    } catch (erro) {
        try { await conexao.rollback(); } catch {}
        if (erro.status) return res.status(erro.status).json({ erro: erro.message });
        console.error('❌ Erro entrada professor:', erro);
        res.status(500).json({ erro: 'Não foi possível registrar a entrada.' });
    } finally { conexao.release(); }
});
router.post('/saida', async (req, res) => {
    if (req.usuario?.perfil !== 'PROFESSOR') return res.status(403).json({ erro: 'Acesso exclusivo para professores.' });
    const conexao = await pool.getConnection();
    try {
        await conexao.beginTransaction();
        const professor = await obterProfessorAtual(conexao, req.usuario.id);
        if (!professor || !professor.ativo) throw Object.assign(new Error('Perfil de professor não encontrado.'), { status: 404 });

        const [[registro]] = await conexao.execute(
            'SELECT id, entrada, saida FROM professor_presencas WHERE professor_id = ? AND data = CURRENT_DATE() LIMIT 1 FOR UPDATE',
            [professor.id]
        );
        if (!registro?.entrada) {
            await conexao.rollback();
            return res.status(409).json({ erro: 'Não é possível registrar a saída antes da entrada.' });
        }
        if (registro.saida) {
            await conexao.rollback();
            return res.status(409).json({ erro: 'Você já registrou sua saída hoje.' });
        }

        await conexao.execute("UPDATE professor_presencas SET saida = NOW(), status = 'COMPLETA' WHERE id = ?", [registro.id]);
        await conexao.commit();
        res.json({ mensagem: 'Saída registrada com sucesso.' });
    } catch (erro) {
        try { await conexao.rollback(); } catch {}
        if (erro.status) return res.status(erro.status).json({ erro: erro.message });
        console.error('❌ Erro saída professor:', erro);
        res.status(500).json({ erro: 'Não foi possível registrar a saída.' });
    } finally { conexao.release(); }
});

module.exports = router;
