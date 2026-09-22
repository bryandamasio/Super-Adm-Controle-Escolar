const express = require('express');
const pool = require('../config/database');
const autenticar = require('../middleware/autenticar');
const { apenasSuperAdmin } = require('../middleware/autenticar');

const router = express.Router();
router.use(autenticar);
router.use(apenasSuperAdmin);

router.get('/', async (req, res) => {
    try {
        const [escolas] = await pool.execute(`
            SELECT e.id, e.nome, e.cnpj, e.email, e.telefone, e.ativa,
                   e.valor_mensal, e.vencimento_dia, e.ultimo_pagamento, e.criado_em,
                   (SELECT COUNT(*) FROM usuarios u WHERE u.escola_id = e.id AND u.ativo = 1) AS usuarios_ativos,
                   (SELECT COUNT(*) FROM alunos a WHERE a.escola_id = e.id AND a.ativo = 1) AS alunos_ativos,
                   (SELECT MAX(p.pago_em) FROM pagamentos p WHERE p.escola_id = e.id AND p.status = 'PAGO') AS ultimo_pagamento_confirmado
            FROM escolas e
            ORDER BY e.nome ASC
        `);
        res.json(escolas);
    } catch (erro) {
        console.error('❌ Erro ao listar escolas:', erro);
        res.status(500).json({ erro: 'Não foi possível listar as escolas.' });
    }
});

router.post('/', async (req, res) => {
    const nome = String(req.body.nome || '').trim();
    const cnpj = String(req.body.cnpj || '').trim() || null;
    const email = String(req.body.email || '').trim().toLowerCase() || null;
    const telefone = String(req.body.telefone || '').trim() || null;
    const valorMensal = Number(req.body.valor_mensal || 0);
    const vencimentoDia = Number(req.body.vencimento_dia || 10);

    if (!nome || !Number.isFinite(valorMensal) || valorMensal < 0 || !Number.isInteger(vencimentoDia) || vencimentoDia < 1 || vencimentoDia > 28) {
        return res.status(400).json({ erro: 'Informe nome, valor mensal válido e vencimento entre 1 e 28.' });
    }

    try {
        const [resultado] = await pool.execute(
            `INSERT INTO escolas (nome, cnpj, email, telefone, valor_mensal, vencimento_dia, ativa)
             VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
            [nome, cnpj, email, telefone, valorMensal, vencimentoDia]
        );
        res.status(201).json({ mensagem: 'Escola cadastrada com sucesso.', escola: { id: resultado.insertId, nome, ativa: 1, valor_mensal: valorMensal, vencimento_dia: vencimentoDia } });
    } catch (erro) {
        if (erro.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'CNPJ já cadastrado.' });
        console.error('❌ Erro ao cadastrar escola:', erro);
        res.status(500).json({ erro: 'Não foi possível cadastrar a escola.' });
    }
});

router.patch('/:id/ativo', async (req, res) => {
    const id = Number(req.params.id);
    const ativa = req.body.ativa ? 1 : 0;
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID de escola inválido.' });
    try {
        const [resultado] = await pool.execute('UPDATE escolas SET ativa = ? WHERE id = ?', [ativa, id]);
        if (!resultado.affectedRows) return res.status(404).json({ erro: 'Escola não encontrada.' });
        res.json({ mensagem: ativa ? 'Escola ativada.' : 'Escola desativada.' });
    } catch (erro) {
        console.error('❌ Erro ao ativar/desativar escola:', erro);
        res.status(500).json({ erro: 'Não foi possível alterar o status da escola.' });
    }
});

router.post('/:id/pagamentos', async (req, res) => {
    const escolaId = Number(req.params.id);
    const valor = Number(req.body.valor || 0);
    const referencia = String(req.body.referencia || '').trim() || null;
    const observacao = String(req.body.observacao || '').trim() || null;
    const status = ['PAGO', 'PENDENTE', 'CANCELADO'].includes(String(req.body.status || '').toUpperCase())
        ? String(req.body.status).toUpperCase()
        : 'PAGO';

    if (!Number.isInteger(escolaId) || escolaId <= 0 || !Number.isFinite(valor) || valor <= 0) {
        return res.status(400).json({ erro: 'Escola e valor do pagamento são obrigatórios.' });
    }

    const conexao = await pool.getConnection();
    try {
        await conexao.beginTransaction();
        const [[escola]] = await conexao.execute('SELECT id, ativa FROM escolas WHERE id = ? LIMIT 1', [escolaId]);
        if (!escola) { await conexao.rollback(); return res.status(404).json({ erro: 'Escola não encontrada.' }); }

        const [resultado] = await conexao.execute(
            `INSERT INTO pagamentos (escola_id, valor, referencia, status, pago_em, observacao, criado_por)
             VALUES (?, ?, ?, ?, CASE WHEN ? = 'PAGO' THEN CURRENT_TIMESTAMP ELSE NULL END, ?, ?)`,
            [escolaId, valor, referencia, status, status, observacao, req.usuario.id]
        );

        if (status === 'PAGO') {
            await conexao.execute('UPDATE escolas SET ultimo_pagamento = CURRENT_DATE() WHERE id = ?', [escolaId]);
        }

        await conexao.commit();
        res.status(201).json({ mensagem: status === 'PAGO' ? 'Pagamento registrado com sucesso.' : 'Lançamento de cobrança registrado.', pagamento_id: resultado.insertId });
    } catch (erro) {
        try { await conexao.rollback(); } catch {}
        console.error('❌ Erro ao registrar pagamento:', erro);
        res.status(500).json({ erro: 'Não foi possível registrar o pagamento.' });
    } finally {
        conexao.release();
    }
});

router.get('/:id/pagamentos', async (req, res) => {
    const escolaId = Number(req.params.id);
    if (!Number.isInteger(escolaId) || escolaId <= 0) return res.status(400).json({ erro: 'ID inválido.' });
    try {
        const [pagamentos] = await pool.execute(
            `SELECT p.id, p.valor, p.referencia, p.status, p.pago_em, p.observacao, p.criado_em,
                    u.nome AS criado_por_nome
             FROM pagamentos p
             LEFT JOIN usuarios u ON u.id = p.criado_por
             WHERE p.escola_id = ?
             ORDER BY p.criado_em DESC
             LIMIT 100`,
            [escolaId]
        );
        res.json(pagamentos);
    } catch (erro) {
        console.error('❌ Erro ao listar pagamentos:', erro);
        res.status(500).json({ erro: 'Não foi possível listar os pagamentos.' });
    }
});

module.exports = router;
