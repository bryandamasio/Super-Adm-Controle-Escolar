const express = require('express');
const pool = require('../config/database');
const autenticar = require('../middleware/autenticar');

const router = express.Router();
router.use(autenticar);

function apenasAdmin(req, res, next) {
    if (req.usuario?.perfil !== 'ADMIN') {
        return res.status(403).json({ erro: 'Apenas administradores podem alterar cadastros de turmas.' });
    }
    next();
}

router.get('/', async (req, res) => {
    try {
        const [turmas] = await pool.execute(`
            SELECT
                t.id,
                t.nome,
                t.ano,
                t.ativo,
                COUNT(a.id) AS total_alunos
            FROM turmas t
            LEFT JOIN alunos a ON a.turma_id = t.id AND a.ativo = 1
            GROUP BY t.id, t.nome, t.ano, t.ativo
            ORDER BY t.ano DESC, t.nome ASC
        `);
        res.json(turmas);
    } catch (erro) {
        console.error('❌ Erro ao listar turmas:', erro);
        res.status(500).json({ erro: 'Não foi possível carregar as turmas.' });
    }
});

router.post('/', apenasAdmin, async (req, res) => {
    const nome = String(req.body.nome || '').trim();
    const ano = String(req.body.ano || '').trim();

    if (!nome || !ano) {
        return res.status(400).json({ erro: 'Nome e ano da turma são obrigatórios.' });
    }

    try {
        const [resultado] = await pool.execute(
            'INSERT INTO turmas (nome, ano) VALUES (?, ?)',
            [nome, ano]
        );
        res.status(201).json({
            mensagem: 'Turma cadastrada com sucesso.',
            turma: { id: resultado.insertId, nome, ano, ativo: 1, total_alunos: 0 }
        });
    } catch (erro) {
        console.error('❌ Erro ao cadastrar turma:', erro);
        res.status(500).json({ erro: 'Não foi possível cadastrar a turma.' });
    }
});

router.patch('/:id', apenasAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const nome = String(req.body.nome || '').trim();
    const ano = String(req.body.ano || '').trim();
    const ativo = req.body.ativo === undefined ? 1 : (req.body.ativo ? 1 : 0);

    if (!Number.isInteger(id) || id <= 0 || !nome || !ano) {
        return res.status(400).json({ erro: 'Dados inválidos para atualização.' });
    }

    try {
        const [resultado] = await pool.execute(
            'UPDATE turmas SET nome = ?, ano = ?, ativo = ? WHERE id = ?',
            [nome, ano, ativo, id]
        );
        if (!resultado.affectedRows) {
            return res.status(404).json({ erro: 'Turma não encontrada.' });
        }
        res.json({ mensagem: 'Turma atualizada com sucesso.' });
    } catch (erro) {
        console.error('❌ Erro ao atualizar turma:', erro);
        res.status(500).json({ erro: 'Não foi possível atualizar a turma.' });
    }
});

module.exports = router;
