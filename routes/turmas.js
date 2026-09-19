const express = require('express');
const pool = require('../config/database');
const autenticar = require('../middleware/autenticar');
const { permitirPerfis } = require('../middleware/autenticar');

const router = express.Router();
router.use(autenticar);

function escolaDoUsuario(req) { return req.usuario.perfil === 'SUPER_ADMIN' ? Number(req.headers['x-escola-id'] || 0) : Number(req.usuario.escola_id || 0); }

router.get('/', async (req, res) => {
    try {
        let sql = `SELECT t.id, t.nome, t.ano, t.ativo, t.escola_id, COUNT(a.id) AS total_alunos
                   FROM turmas t LEFT JOIN alunos a ON a.turma_id = t.id AND a.ativo = 1`;
        const params = [];
        const escolaId = escolaDoUsuario(req);
        if (escolaId) { sql += ' WHERE t.escola_id = ?'; params.push(escolaId); }
        sql += ' GROUP BY t.id, t.nome, t.ano, t.ativo, t.escola_id ORDER BY t.ano DESC, t.nome ASC';
        const [turmas] = await pool.execute(sql, params);
        res.json(turmas);
    } catch (erro) { console.error('❌ Erro ao listar turmas:', erro); res.status(500).json({ erro: 'Não foi possível carregar as turmas.' }); }
});

router.post('/', permitirPerfis('SUPER_ADMIN','ADMIN','VICE_DIRECAO','COORDENACAO','SECRETARIA'), async (req, res) => {
    const nome = String(req.body.nome || '').trim();
    const ano = String(req.body.ano || '').trim();
    const escolaId = escolaDoUsuario(req);
    if (!nome || !ano || !escolaId) return res.status(400).json({ erro: 'Nome, ano e escola são obrigatórios.' });
    try {
        const [[escola]] = await pool.execute('SELECT id, ativa FROM escolas WHERE id = ?', [escolaId]);
        if (!escola || !escola.ativa) return res.status(400).json({ erro: 'A escola não está disponível.' });
        const [resultado] = await pool.execute('INSERT INTO turmas (nome, ano, escola_id) VALUES (?, ?, ?)', [nome, ano, escolaId]);
        res.status(201).json({ mensagem: 'Turma cadastrada com sucesso.', turma: { id: resultado.insertId, nome, ano, ativo: 1, total_alunos: 0, escola_id: escolaId } });
    } catch (erro) { console.error('❌ Erro ao cadastrar turma:', erro); res.status(500).json({ erro: 'Não foi possível cadastrar a turma.' }); }
});

router.patch('/:id', permitirPerfis('SUPER_ADMIN','ADMIN','VICE_DIRECAO','COORDENACAO','SECRETARIA'), async (req, res) => {
    const id = Number(req.params.id); const nome = String(req.body.nome || '').trim(); const ano = String(req.body.ano || '').trim(); const ativo = req.body.ativo === undefined ? 1 : (req.body.ativo ? 1 : 0); const escolaId = escolaDoUsuario(req);
    if (!Number.isInteger(id) || id <= 0 || !nome || !ano || !escolaId) return res.status(400).json({ erro: 'Dados inválidos para atualização.' });
    try { const [r] = await pool.execute('UPDATE turmas SET nome = ?, ano = ?, ativo = ? WHERE id = ? AND escola_id = ?', [nome, ano, ativo, id, escolaId]); if (!r.affectedRows) return res.status(404).json({ erro: 'Turma não encontrada.' }); res.json({ mensagem: 'Turma atualizada com sucesso.' }); }
    catch (erro) { console.error('❌ Erro ao atualizar turma:', erro); res.status(500).json({ erro: 'Não foi possível atualizar a turma.' }); }
});

module.exports = router;
