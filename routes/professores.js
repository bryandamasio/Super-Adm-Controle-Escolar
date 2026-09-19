const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../config/database');
const autenticar = require('../middleware/autenticar');
const { permitirPerfis } = require('../middleware/autenticar');

const router = express.Router();
router.use(autenticar);

router.get('/', permitirPerfis('ADMIN', 'SUPER_ADMIN', 'VICE_DIRECAO', 'COORDENACAO', 'SECRETARIA'), async (req, res) => {
    try {
        let sql = `SELECT p.id, p.nome, p.email, p.telefone, p.registro, p.ativo,
                          p.escola_id, e.nome AS escola_nome, p.usuario_id, p.criado_em
                   FROM professores p
                   INNER JOIN escolas e ON e.id = p.escola_id`;
        const params = [];
        if (req.usuario.perfil !== 'SUPER_ADMIN') {
            sql += ' WHERE p.escola_id = ?';
            params.push(req.usuario.escola_id);
        }
        sql += ' ORDER BY p.nome ASC';
        const [professores] = await pool.execute(sql, params);
        res.json(professores);
    } catch (erro) {
        console.error('❌ Erro ao listar professores:', erro);
        res.status(500).json({ erro: 'Não foi possível listar professores.' });
    }
});

router.post('/', permitirPerfis('ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    const nome = String(req.body.nome || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const telefone = String(req.body.telefone || '').trim() || null;
    const registro = String(req.body.registro || '').trim() || null;
    const senha = String(req.body.senha || '');
    const escolaIdInformada = Number(req.body.escola_id || req.headers['x-escola-id'] || 0);
    const escolaId = req.usuario.perfil === 'SUPER_ADMIN' ? escolaIdInformada : Number(req.usuario.escola_id || 0);

    if (!nome || !email || senha.length < 6 || !escolaId) {
        return res.status(400).json({ erro: 'Informe nome, e-mail, senha (mín. 6 caracteres) e escola.' });
    }

    const conexao = await pool.getConnection();
    try {
        await conexao.beginTransaction();
        const [[escola]] = await conexao.execute(
            'SELECT id, ativa FROM escolas WHERE id = ? LIMIT 1',
            [escolaId]
        );
        if (!escola) {
            await conexao.rollback();
            return res.status(404).json({ erro: 'Escola não encontrada.' });
        }
        if (!escola.ativa) {
            await conexao.rollback();
            return res.status(400).json({ erro: 'A escola está desativada.' });
        }

        const senhaHash = await bcrypt.hash(senha, 12);
        const [u] = await conexao.execute(
            "INSERT INTO usuarios (nome, email, senha, tipo, escola_id) VALUES (?, ?, ?, 'PROFESSOR', ?)",
            [nome, email, senhaHash, escolaId]
        );
        await conexao.execute(
            'INSERT INTO professores (nome, email, telefone, registro, escola_id, usuario_id) VALUES (?, ?, ?, ?, ?, ?)',
            [nome, email, telefone, registro, escolaId, u.insertId]
        );
        await conexao.commit();

        res.status(201).json({ mensagem: 'Professor cadastrado com sucesso.', professor: { id: u.insertId, nome, email, telefone, registro, escola_id: escolaId, usuario_id: u.insertId } });
    } catch (erro) {
        try { await conexao.rollback(); } catch {}
        if (erro.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Este e-mail ou registro já está cadastrado.' });
        console.error('❌ Erro ao cadastrar professor:', erro);
        res.status(500).json({ erro: 'Não foi possível cadastrar o professor.' });
    } finally {
        conexao.release();
    }
});

router.patch('/:id/ativo', permitirPerfis('ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    const id = Number(req.params.id);
    const ativo = req.body.ativo ? 1 : 0;
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID inválido.' });
    try {
        let sql = 'UPDATE professores SET ativo = ? WHERE id = ?';
        const params = [ativo, id];
        if (req.usuario.perfil !== 'SUPER_ADMIN') { sql += ' AND escola_id = ?'; params.push(req.usuario.escola_id); }
        const [resultado] = await pool.execute(sql, params);
        if (!resultado.affectedRows) return res.status(404).json({ erro: 'Professor não encontrado.' });
        await pool.execute('UPDATE usuarios u INNER JOIN professores p ON p.usuario_id = u.id SET u.ativo = ? WHERE p.id = ?', [ativo, id]);
        res.json({ mensagem: ativo ? 'Professor ativado.' : 'Professor desativado.' });
    } catch (erro) {
        console.error('❌ Erro ao atualizar professor:', erro);
        res.status(500).json({ erro: 'Não foi possível atualizar o professor.' });
    }
});

module.exports = router;
