const express = require('express');
const pool = require('../config/database');
const autenticar = require('../middleware/autenticar');

const router = express.Router();
router.use(autenticar);

router.post('/registrar', async (req, res) => {
    const codigoQr = String(req.body.codigo_qr || '').trim();
    if (!codigoQr) {
        return res.status(400).json({ erro: 'Informe o código do QR Code.' });
    }

    const conexao = await pool.getConnection();
    try {
        await conexao.beginTransaction();

        const [alunos] = await conexao.execute(
            `SELECT a.id, a.nome, a.matricula, a.turma_id, t.nome AS turma_nome
             FROM alunos a
             INNER JOIN turmas t ON t.id = a.turma_id
             WHERE a.codigo_qr = ? AND a.ativo = 1 AND t.ativo = 1
             LIMIT 1 FOR UPDATE`,
            [codigoQr]
        );

        const aluno = alunos[0];
        if (!aluno) {
            await conexao.rollback();
            return res.status(404).json({ erro: 'QR Code não pertence a um aluno ativo.' });
        }

        const [ultimos] = await conexao.execute(
            `SELECT id, tipo, data_hora
             FROM registros
             WHERE aluno_id = ? AND DATE(data_hora) = CURRENT_DATE()
             ORDER BY data_hora DESC
             LIMIT 1`,
            [aluno.id]
        );

        const tipo = ultimos[0]?.tipo === 'ENTRADA' ? 'SAIDA' : 'ENTRADA';

        const [resultado] = await conexao.execute(
            `INSERT INTO registros (aluno_id, tipo, dispositivo)
             VALUES (?, ?, ?)`,
            [aluno.id, tipo, req.ip || 'Painel web']
        );

        await conexao.commit();

        return res.status(201).json({
            mensagem: `${tipo === 'ENTRADA' ? 'Entrada' : 'Saída'} registrada com sucesso.`,
            registro: {
                id: resultado.insertId,
                tipo,
                data_hora: new Date(),
                aluno
            }
        });
    } catch (erro) {
        await conexao.rollback();
        console.error('❌ Erro ao registrar presença:', erro);
        return res.status(500).json({ erro: 'Não foi possível registrar a presença.' });
    } finally {
        conexao.release();
    }
});

router.get('/resumo', async (req, res) => {
    try {
        const [[resumo]] = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM alunos WHERE ativo = 1) AS total_alunos,
                (
                    SELECT COUNT(*)
                    FROM (
                        SELECT r.aluno_id,
                               SUBSTRING_INDEX(GROUP_CONCAT(r.tipo ORDER BY r.data_hora DESC), ',', 1) AS ultimo_tipo
                        FROM registros r
                        INNER JOIN alunos a ON a.id = r.aluno_id AND a.ativo = 1
                        WHERE DATE(r.data_hora) = CURRENT_DATE()
                        GROUP BY r.aluno_id
                    ) hoje
                    WHERE hoje.ultimo_tipo = 'ENTRADA'
                ) AS presentes,
                (
                    SELECT COUNT(*)
                    FROM (
                        SELECT r.aluno_id,
                               SUBSTRING_INDEX(GROUP_CONCAT(r.tipo ORDER BY r.data_hora DESC), ',', 1) AS ultimo_tipo
                        FROM registros r
                        INNER JOIN alunos a ON a.id = r.aluno_id AND a.ativo = 1
                        WHERE DATE(r.data_hora) = CURRENT_DATE()
                        GROUP BY r.aluno_id
                    ) hoje
                    WHERE hoje.ultimo_tipo = 'ENTRADA'
                ) AS sem_saida,
                (
                    SELECT COUNT(*)
                    FROM ocorrencias
                    WHERE status <> 'RESOLVIDA'
                ) AS ocorrencias
        `);

        res.json(resumo);
    } catch (erro) {
        console.error('❌ Erro ao consultar resumo:', erro);
        res.status(500).json({ erro: 'Não foi possível consultar o resumo.' });
    }
});

router.get('/recentes', async (req, res) => {
    try {
        const limite = Math.min(Math.max(Number(req.query.limite) || 10, 1), 50);
        const [registros] = await pool.execute(`
            SELECT
                r.id,
                r.tipo,
                r.data_hora AS registrado_em,
                a.nome,
                a.matricula,
                t.nome AS turma_nome
            FROM registros r
            INNER JOIN alunos a ON a.id = r.aluno_id
            INNER JOIN turmas t ON t.id = a.turma_id
            ORDER BY r.data_hora DESC
            LIMIT ${limite}
        `);
        res.json(registros);
    } catch (erro) {
        console.error('❌ Erro ao consultar registros:', erro);
        res.status(500).json({ erro: 'Não foi possível consultar os registros.' });
    }
});

router.get('/historico', async (req, res) => {
    const dataInicial = /^\d{4}-\d{2}-\d{2}$/.test(req.query.inicio || '') ? req.query.inicio : null;
    const dataFinal = /^\d{4}-\d{2}-\d{2}$/.test(req.query.fim || '') ? req.query.fim : null;
    const alunoId = Number(req.query.aluno_id || 0);

    try {
        let sql = `
            SELECT
                r.id,
                r.tipo,
                r.data_hora AS registrado_em,
                r.dispositivo,
                a.id AS aluno_id,
                a.nome,
                a.matricula,
                t.nome AS turma_nome
            FROM registros r
            INNER JOIN alunos a ON a.id = r.aluno_id
            INNER JOIN turmas t ON t.id = a.turma_id
            WHERE 1=1
        `;
        const params = [];

        if (dataInicial) {
            sql += ' AND DATE(r.data_hora) >= ?';
            params.push(dataInicial);
        }
        if (dataFinal) {
            sql += ' AND DATE(r.data_hora) <= ?';
            params.push(dataFinal);
        }
        if (Number.isInteger(alunoId) && alunoId > 0) {
            sql += ' AND a.id = ?';
            params.push(alunoId);
        }

        sql += ' ORDER BY r.data_hora DESC LIMIT 1000';

        const [registros] = await pool.execute(sql, params);
        res.json(registros);
    } catch (erro) {
        console.error('❌ Erro no histórico:', erro);
        res.status(500).json({ erro: 'Não foi possível consultar o histórico.' });
    }
});

module.exports = router;
