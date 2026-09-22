const express = require('express');
const pool = require('../config/database');
const autenticar = require('../middleware/autenticar');

const router = express.Router();
router.use(autenticar);

router.get('/', async (req, res) => {
    try {
        const status = ['PENDENTE', 'EM_ANALISE', 'RESOLVIDA'].includes(req.query.status)
            ? req.query.status
            : null;

        let sql = `
            SELECT o.id, o.tipo, o.descricao, o.status, o.criado_em, o.atualizado_em,
                   a.id AS aluno_id, a.nome, a.matricula, t.nome AS turma_nome,
                   u.nome AS resolvido_por_nome
            FROM ocorrencias o
            INNER JOIN alunos a ON a.id = o.aluno_id
            INNER JOIN turmas t ON t.id = a.turma_id
            LEFT JOIN usuarios u ON u.id = o.resolvido_por
            WHERE 1=1
        `;
        const params = [];
        if (status) {
            sql += ' AND o.status = ?';
            params.push(status);
        }
        sql += ' ORDER BY o.criado_em DESC LIMIT 500';

        const [dados] = await pool.execute(sql, params);
        res.json(dados);
    } catch (erro) {
        console.error('❌ Erro ao listar ocorrências:', erro);
        res.status(500).json({ erro: 'Não foi possível carregar as ocorrências.' });
    }
});

router.post('/', async (req, res) => {
    const alunoId = Number(req.body.aluno_id);
    const tipo = String(req.body.tipo || '').trim().toUpperCase();
    const descricao = String(req.body.descricao || '').trim() || null;

    if (!Number.isInteger(alunoId) || alunoId <= 0 || !['SEM_SAIDA', 'SAIDA_ANTECIPADA'].includes(tipo)) {
        return res.status(400).json({ erro: 'Aluno e tipo de ocorrência são obrigatórios.' });
    }

    try {
        const [[aluno]] = await pool.execute(
            'SELECT id FROM alunos WHERE id = ? AND ativo = 1',
            [alunoId]
        );
        if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado.' });

        const [resultado] = await pool.execute(
            'INSERT INTO ocorrencias (aluno_id, tipo, descricao) VALUES (?, ?, ?)',
            [alunoId, tipo, descricao]
        );

        res.status(201).json({ mensagem: 'Ocorrência registrada.', id: resultado.insertId });
    } catch (erro) {
        console.error('❌ Erro ao criar ocorrência:', erro);
        res.status(500).json({ erro: 'Não foi possível registrar a ocorrência.' });
    }
});

router.patch('/:id/status', async (req, res) => {
    const id = Number(req.params.id);
    const status = String(req.body.status || '').toUpperCase();

    if (!Number.isInteger(id) || !['PENDENTE', 'EM_ANALISE', 'RESOLVIDA'].includes(status)) {
        return res.status(400).json({ erro: 'Status inválido.' });
    }

    try {
        const [resultado] = await pool.execute(
            `UPDATE ocorrencias
             SET status = ?, resolvido_por = CASE WHEN ? = 'RESOLVIDA' THEN ? ELSE NULL END
             WHERE id = ?`,
            [status, status, status === 'RESOLVIDA' ? req.usuario.id : null, id]
        );
        if (!resultado.affectedRows) return res.status(404).json({ erro: 'Ocorrência não encontrada.' });
        res.json({ mensagem: 'Status atualizado com sucesso.' });
    } catch (erro) {
        console.error('❌ Erro ao atualizar ocorrência:', erro);
        res.status(500).json({ erro: 'Não foi possível atualizar a ocorrência.' });
    }
});

module.exports = router;
