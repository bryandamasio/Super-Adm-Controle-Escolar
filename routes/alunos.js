const express = require('express');
const { randomUUID } = require('crypto');
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

        const codigoQr = String(aluno.codigo_qr || '').trim();
        if (!codigoQr) return res.status(400).json({ erro: 'O aluno não possui um QR Code.' });

        const png = await QRCode.toBuffer(codigoQr, {
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 500
        });
        const nomeArquivo = String(aluno.matricula || aluno.id).replace(/[^\w.-]/g, '_');
        res.set({
            'Content-Type': 'image/png',
            'Content-Disposition': `attachment; filename="qrcode_${nomeArquivo}.png"`,
            'Cache-Control': 'no-store'
        });
        return res.send(png);
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
    let conexao = null;
    try {
        const nome = String(req.body.nome || '').trim();
        const matricula = String(req.body.matricula || '').trim();
        const turmaId = Number(req.body.turma_id);
        const email = String(req.body.email || '').trim() || null;
        const whatsapp = String(req.body.whatsapp || '').trim() || null;

        if (!nome || !matricula || !Number.isInteger(turmaId) || turmaId <= 0) {
            return res.status(400).json({ erro: 'Nome, matrícula e turma são obrigatórios.' });
        }

        const usarPostgres = Boolean(process.env.DATABASE_URL);
        const escolaIdUsuario = Number(req.usuario.escola_id) || 0;
        const [[turma]] = await pool.execute(
            usarPostgres
                ? 'SELECT id, nome, ativo, escola_id FROM turmas WHERE id = ? AND escola_id = ? LIMIT 1'
                : 'SELECT id, nome, ativo FROM turmas WHERE id = ? LIMIT 1',
            usarPostgres ? [turmaId, escolaIdUsuario] : [turmaId]
        );
        if (!turma || !turma.ativo) {
            return res.status(400).json({ erro: 'A turma informada não existe ou está inativa.' });
        }

        const codigoQr = `ALUNO-${randomUUID()}`;
        let alunoId;

        if (usarPostgres) {
            conexao = await pool.getConnection();
            await conexao.beginTransaction();

            const matriculaNormalizada = matricula.normalize('NFKC').trim().toLocaleLowerCase('pt-BR');
            const chaveMatricula = `${Number(turma.escola_id) || 0}:${matriculaNormalizada}`;
            await conexao.execute(
                'SELECT pg_advisory_xact_lock(hashtextextended(?, 0))',
                [chaveMatricula]
            );

            const [[duplicado]] = await conexao.execute(
                `SELECT id FROM alunos
                 WHERE escola_id = ?
                   AND lower(btrim(matricula)) = lower(btrim(?))
                 LIMIT 1`,
                [turma.escola_id, matricula]
            );
            if (duplicado) {
                await conexao.rollback();
                return res.status(409).json({
                    erro: 'Já existe um aluno com esta matrícula nesta escola. O cadastro duplicado foi bloqueado.',
                    aluno_id: duplicado.id
                });
            }

            const [resultado] = await conexao.execute(
                `INSERT INTO alunos
                (nome, matricula, turma_id, email, whatsapp, codigo_qr, escola_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [nome, matricula, turmaId, email, whatsapp, codigoQr, turma.escola_id]
            );
            alunoId = resultado.insertId;
            await conexao.commit();
        } else {
            const [[duplicado]] = await pool.execute(
                `SELECT id FROM alunos
                 WHERE LOWER(TRIM(matricula)) = LOWER(TRIM(?))
                 LIMIT 1`,
                [matricula]
            );
            if (duplicado) {
                return res.status(409).json({
                    erro: 'Já existe um aluno com esta matrícula. O cadastro duplicado foi bloqueado.',
                    aluno_id: duplicado.id
                });
            }

            const [resultado] = await pool.execute(
                `INSERT INTO alunos
                (nome, matricula, turma_id, email, whatsapp, codigo_qr)
                VALUES (?, ?, ?, ?, ?, ?)`,
                [nome, matricula, turmaId, email, whatsapp, codigoQr]
            );
            alunoId = resultado.insertId;
        }

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
        if (conexao) {
            try { await conexao.rollback(); } catch {}
        }
        console.error('❌ Erro ao cadastrar aluno:', erro);

        if (erro.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ erro: 'Esta matrícula já está cadastrada.' });
        }

        res.status(500).json({
            erro: 'Erro ao cadastrar aluno.',
            detalhe: process.env.NODE_ENV === 'development' ? erro.message : undefined
        });
    } finally {
        conexao?.release();
    }
});

router.patch('/:id', apenasAdmin, async (req, res) => {
    let conexao = null;
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
        const usarPostgres = Boolean(process.env.DATABASE_URL);
        const escolaIdUsuario = Number(req.usuario.escola_id) || 0;
        const [[turma]] = await pool.execute(
            usarPostgres
                ? 'SELECT id, ativo, escola_id FROM turmas WHERE id = ? AND escola_id = ?'
                : 'SELECT id, ativo FROM turmas WHERE id = ?',
            usarPostgres ? [turmaId, escolaIdUsuario] : [turmaId]
        );
        if (!turma || !turma.ativo) {
            return res.status(400).json({ erro: 'A turma informada está inválida ou inativa.' });
        }

        let resultado;
        if (usarPostgres) {
            conexao = await pool.getConnection();
            await conexao.beginTransaction();
            const matriculaNormalizada = matricula.normalize('NFKC').trim().toLocaleLowerCase('pt-BR');
            const chaveMatricula = `${Number(turma.escola_id) || 0}:${matriculaNormalizada}`;
            await conexao.execute(
                'SELECT pg_advisory_xact_lock(hashtextextended(?, 0))',
                [chaveMatricula]
            );

            const [[duplicado]] = await conexao.execute(
                `SELECT id FROM alunos
                 WHERE escola_id = ? AND id <> ?
                   AND lower(btrim(matricula)) = lower(btrim(?))
                 LIMIT 1`,
                [turma.escola_id, id, matricula]
            );
            if (duplicado) {
                await conexao.rollback();
                return res.status(409).json({
                    erro: 'Já existe outro aluno com esta matrícula nesta escola. A alteração foi bloqueada.',
                    aluno_id: duplicado.id
                });
            }

            [resultado] = await conexao.execute(
                `UPDATE alunos
                 SET nome = ?, matricula = ?, turma_id = ?, email = ?, whatsapp = ?, ativo = ?
                 WHERE id = ? AND escola_id = ?`,
                [nome, matricula, turmaId, email, whatsapp, ativo, id, turma.escola_id]
            );
            await conexao.commit();
        } else {
            const [[duplicado]] = await pool.execute(
                `SELECT id FROM alunos
                 WHERE id <> ? AND LOWER(TRIM(matricula)) = LOWER(TRIM(?))
                 LIMIT 1`,
                [id, matricula]
            );
            if (duplicado) {
                return res.status(409).json({
                    erro: 'Já existe outro aluno com esta matrícula. A alteração foi bloqueada.',
                    aluno_id: duplicado.id
                });
            }

            [resultado] = await pool.execute(
                `UPDATE alunos
                 SET nome = ?, matricula = ?, turma_id = ?, email = ?, whatsapp = ?, ativo = ?
                 WHERE id = ?`,
                [nome, matricula, turmaId, email, whatsapp, ativo, id]
            );
        }

        if (!resultado.affectedRows) {
            return res.status(404).json({ erro: 'Aluno não encontrado.' });
        }

        res.json({ mensagem: 'Aluno atualizado com sucesso.' });
    } catch (erro) {
        if (conexao) {
            try { await conexao.rollback(); } catch {}
        }
        console.error('❌ Erro ao atualizar aluno:', erro);
        if (erro.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ erro: 'Esta matrícula já está cadastrada.' });
        }
        res.status(500).json({ erro: 'Não foi possível atualizar o aluno.' });
    } finally {
        conexao?.release();
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
