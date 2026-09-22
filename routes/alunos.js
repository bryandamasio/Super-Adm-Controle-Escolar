const express = require('express');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs/promises');
const QRCode = require('qrcode');

const pool = require('../config/database');
const autenticar = require('../middleware/autenticar');

const router = express.Router();
router.use(autenticar);

function apenasAdmin(req, res, next) {
    if (req.usuario?.perfil !== 'ADMIN') {
        return res.status(403).json({ erro: 'Apenas administradores podem alterar cadastros de alunos.' });
    }
    next();
}

const PASTA_QR = path.join(__dirname, '..', 'python', 'qrcodes');

async function gerarQr(alunoId, codigoQr) {
    await fs.mkdir(PASTA_QR, { recursive: true });
    const arquivo = path.join(PASTA_QR, `aluno_${alunoId}.png`);
    await QRCode.toFile(arquivo, codigoQr, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 500
    });
    return arquivo;
}

router.get('/', async (req, res) => {
    try {
        const [alunos] = await pool.execute(`
            SELECT
                a.id,
                a.nome,
                a.matricula,
                a.turma_id,
                t.nome AS turma_nome,
                t.ano AS turma_ano,
                a.email,
                a.whatsapp,
                a.codigo_qr,
                a.ativo,
                a.criado_em
            FROM alunos a
            INNER JOIN turmas t ON t.id = a.turma_id
            WHERE a.ativo = 1
            ORDER BY a.nome ASC
        `);
        res.json(alunos);
    } catch (erro) {
        console.error('❌ Erro ao buscar alunos:', erro);
        res.status(500).json({ erro: 'Erro ao buscar alunos.' });
    }
});

router.get('/:id/qrcode', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ erro: 'ID de aluno inválido.' });
    }

    try {
        const [[aluno]] = await pool.execute(
            'SELECT id, nome, matricula, codigo_qr FROM alunos WHERE id = ? LIMIT 1',
            [id]
        );
        if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado.' });

        const arquivo = path.join(PASTA_QR, `aluno_${aluno.id}.png`);
        try {
            await fs.access(arquivo);
        } catch {
            await gerarQr(aluno.id, aluno.codigo_qr);
        }

        res.download(
            arquivo,
            `qrcode_${aluno.matricula || aluno.id}.png`,
            { headers: { 'Content-Type': 'image/png' } }
        );
    } catch (erro) {
        console.error('❌ Erro ao gerar/enviar QR Code:', erro);
        res.status(500).json({ erro: 'Não foi possível gerar o QR Code.' });
    }
});

router.get('/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ erro: 'ID inválido.' });
    }

    try {
        const [[aluno]] = await pool.execute(`
            SELECT a.*, t.nome AS turma_nome, t.ano AS turma_ano
            FROM alunos a
            INNER JOIN turmas t ON t.id = a.turma_id
            WHERE a.id = ?
        `, [id]);
        if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado.' });
        res.json(aluno);
    } catch (erro) {
        console.error('❌ Erro ao buscar aluno:', erro);
        res.status(500).json({ erro: 'Não foi possível carregar o aluno.' });
    }
});

router.post('/', apenasAdmin, async (req, res) => {
    try {
        const nome = String(req.body.nome || '').trim();
        const matricula = String(req.body.matricula || '').trim();
        const turmaId = Number(req.body.turma_id);
        const email = String(req.body.email || '').trim() || null;
        const whatsapp = String(req.body.whatsapp || '').trim() || null;

        if (!nome || !matricula || !Number.isInteger(turmaId) || turmaId <= 0) {
            return res.status(400).json({ erro: 'Nome, matrícula e turma são obrigatórios.' });
        }

        const [[turma]] = await pool.execute(
            'SELECT id, nome, ativo FROM turmas WHERE id = ? LIMIT 1',
            [turmaId]
        );
        if (!turma || !turma.ativo) {
            return res.status(400).json({ erro: 'A turma informada não existe ou está inativa.' });
        }

        const codigoQr = `ALUNO-${randomUUID()}`;

        const [resultado] = await pool.execute(
            `INSERT INTO alunos
            (nome, matricula, turma_id, email, whatsapp, codigo_qr)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [nome, matricula, turmaId, email, whatsapp, codigoQr]
        );

        const alunoId = resultado.insertId;
        await gerarQr(alunoId, codigoQr);

        res.status(201).json({
            mensagem: 'Aluno cadastrado com sucesso!',
            aluno: {
                id: alunoId,
                nome,
                matricula,
                turma_id: turmaId,
                turma_nome: turma.nome,
                email,
                whatsapp,
                codigo_qr: codigoQr,
                ativo: 1
            }
        });
    } catch (erro) {
        console.error('❌ Erro ao cadastrar aluno:', erro);

        if (erro.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ erro: 'Esta matrícula já está cadastrada.' });
        }

        res.status(500).json({
            erro: 'Erro ao cadastrar aluno.',
            detalhe: process.env.NODE_ENV === 'development' ? erro.message : undefined
        });
    }
});

router.patch('/:id', apenasAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const nome = String(req.body.nome || '').trim();
    const matricula = String(req.body.matricula || '').trim();
    const turmaId = Number(req.body.turma_id);
    const email = String(req.body.email || '').trim() || null;
    const whatsapp = String(req.body.whatsapp || '').trim() || null;
    const ativo = req.body.ativo === undefined ? 1 : (req.body.ativo ? 1 : 0);

    if (!Number.isInteger(id) || id <= 0 || !nome || !matricula || !Number.isInteger(turmaId) || turmaId <= 0) {
        return res.status(400).json({ erro: 'Dados inválidos.' });
    }

    try {
        const [[turma]] = await pool.execute(
            'SELECT id, ativo FROM turmas WHERE id = ?',
            [turmaId]
        );
        if (!turma || !turma.ativo) {
            return res.status(400).json({ erro: 'A turma informada está inválida ou inativa.' });
        }

        const [resultado] = await pool.execute(
            `UPDATE alunos
             SET nome = ?, matricula = ?, turma_id = ?, email = ?, whatsapp = ?, ativo = ?
             WHERE id = ?`,
            [nome, matricula, turmaId, email, whatsapp, ativo, id]
        );

        if (!resultado.affectedRows) {
            return res.status(404).json({ erro: 'Aluno não encontrado.' });
        }

        res.json({ mensagem: 'Aluno atualizado com sucesso.' });
    } catch (erro) {
        console.error('❌ Erro ao atualizar aluno:', erro);
        if (erro.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ erro: 'Esta matrícula já está cadastrada.' });
        }
        res.status(500).json({ erro: 'Não foi possível atualizar o aluno.' });
    }
});


// Exclusão lógica: preserva o histórico de presença e ocorrências.
router.delete('/', async (req, res) => {
    if (req.usuario?.perfil !== 'ADMIN') {
        return res.status(403).json({ erro: 'Apenas administradores podem excluir alunos.' });
    }

    const ids = Array.isArray(req.body?.ids)
        ? [...new Set(req.body.ids.map(Number).filter(id => Number.isInteger(id) && id > 0))]
        : [];

    if (!ids.length) {
        return res.status(400).json({ erro: 'Informe pelo menos um aluno para excluir.' });
    }

    const conexao = await pool.getConnection();

    try {
        await conexao.beginTransaction();

        const placeholders = ids.map(() => '?').join(', ');
        const [resultado] = await conexao.execute(
            `UPDATE alunos SET ativo = 0 WHERE id IN (${placeholders}) AND ativo = 1`,
            ids
        );

        await conexao.commit();

        const quantidade = resultado.affectedRows;
        return res.json({
            mensagem: quantidade === 1
                ? 'Aluno excluído com sucesso.'
                : `${quantidade} alunos excluídos com sucesso.`,
            quantidade
        });
    } catch (erro) {
        try { await conexao.rollback(); } catch {}
        console.error('❌ Erro ao excluir aluno(s):', erro);
        return res.status(500).json({ erro: 'Não foi possível excluir os alunos.' });
    } finally {
        conexao.release();
    }
});

// Exclusão lógica individual: preserva o histórico de presença e ocorrências.
router.delete('/:id', async (req, res) => {
    if (req.usuario?.perfil !== 'ADMIN') {
        return res.status(403).json({ erro: 'Apenas administradores podem excluir alunos.' });
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ erro: 'ID de aluno inválido.' });
    }

    try {
        const [resultado] = await pool.execute(
            'UPDATE alunos SET ativo = 0 WHERE id = ? AND ativo = 1',
            [id]
        );

        if (!resultado.affectedRows) {
            return res.status(404).json({ erro: 'Aluno não encontrado ou já excluído.' });
        }

        return res.json({ mensagem: 'Aluno excluído com sucesso.' });
    } catch (erro) {
        console.error('❌ Erro ao excluir aluno:', erro);
        return res.status(500).json({ erro: 'Não foi possível excluir o aluno.' });
    }
});

module.exports = router;
