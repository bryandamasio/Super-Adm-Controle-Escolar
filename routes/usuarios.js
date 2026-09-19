const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../config/database');
const autenticar = require('../middleware/autenticar');
const { permitirPerfis } = require('../middleware/autenticar');

const router = express.Router();
router.use(autenticar);

const PERFIS = [
    'ADMIN',
    'PROFESSOR',
    'VICE_DIRECAO',
    'COORDENACAO',
    'SECRETARIA'
];

const ROTULOS = {
    ADMIN: 'Administrador',
    PROFESSOR: 'Professor',
    VICE_DIRECAO: 'Vice-direção',
    COORDENACAO: 'Coordenação',
    SECRETARIA: 'Secretaria',
    SUPER_ADMIN: 'Super Admin'
};

router.get('/', permitirPerfis('ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    try {
        let sql = `SELECT u.id, u.nome, u.email, u.tipo, u.ativo, u.escola_id,
                          e.nome AS escola_nome, u.criado_em
                   FROM usuarios u
                   LEFT JOIN escolas e ON e.id = u.escola_id`;
        const params = [];

        if (req.usuario.perfil !== 'SUPER_ADMIN') {
            sql += " WHERE u.escola_id = ? AND u.tipo <> 'SUPER_ADMIN'";
            params.push(req.usuario.escola_id);
        }

        sql += ' ORDER BY u.nome ASC';
        const [usuarios] = await pool.execute(sql, params);
        res.json(usuarios);
    } catch (erro) {
        console.error('❌ Erro ao listar usuários:', erro);
        res.status(500).json({ erro: 'Não foi possível listar usuários.' });
    }
});

router.post('/', permitirPerfis('ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    const nome = String(req.body.nome || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const senha = String(req.body.senha || '');
    const tipo = String(req.body.tipo || 'PROFESSOR').toUpperCase();
    const escolaIdInformada = Number(req.body.escola_id || req.headers['x-escola-id'] || 0);

    if (!nome || !email || senha.length < 6 || !PERFIS.includes(tipo)) {
        return res.status(400).json({ erro: 'Informe nome, e-mail, senha (mín. 6 caracteres) e perfil válido.' });
    }

    if (tipo === 'SUPER_ADMIN') {
        return res.status(403).json({ erro: 'O Super Admin deve ser criado pelo script de implantação.' });
    }

    const escolaId = req.usuario.perfil === 'SUPER_ADMIN'
        ? escolaIdInformada
        : Number(req.usuario.escola_id || 0);

    if (!escolaId) {
        return res.status(400).json({ erro: 'Informe a escola do usuário.' });
    }

    try {
        const [[escola]] = await pool.execute(
            'SELECT id, ativa FROM escolas WHERE id = ? LIMIT 1',
            [escolaId]
        );
        if (!escola) return res.status(404).json({ erro: 'Escola não encontrada.' });
        if (!escola.ativa) return res.status(400).json({ erro: 'A escola está desativada.' });

        const senhaHash = await bcrypt.hash(senha, 12);
        const [resultado] = await pool.execute(
            'INSERT INTO usuarios (nome, email, senha, tipo, escola_id) VALUES (?, ?, ?, ?, ?)',
            [nome, email, senhaHash, tipo, escolaId]
        );

        res.status(201).json({
            mensagem: 'Usuário cadastrado com sucesso.',
            usuario: {
                id: resultado.insertId,
                nome,
                email,
                tipo,
                perfil_nome: ROTULOS[tipo],
                escola_id: escolaId,
                ativo: 1
            }
        });
    } catch (erro) {
        if (erro.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ erro: 'Este e-mail já está cadastrado.' });
        }
        console.error('❌ Erro ao cadastrar usuário:', erro);
        res.status(500).json({ erro: 'Não foi possível cadastrar usuário.' });
    }
});

router.patch('/:id/ativo', permitirPerfis('ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    const id = Number(req.params.id);
    const ativo = req.body.ativo ? 1 : 0;
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'ID inválido.' });

    try {
        let sql = 'UPDATE usuarios SET ativo = ? WHERE id = ?';
        const params = [ativo, id];
        if (req.usuario.perfil !== 'SUPER_ADMIN') {
            sql += " AND escola_id = ? AND tipo <> 'SUPER_ADMIN'";
            params.push(req.usuario.escola_id);
        }
        const [resultado] = await pool.execute(sql, params);
        if (!resultado.affectedRows) return res.status(404).json({ erro: 'Usuário não encontrado.' });
        res.json({ mensagem: ativo ? 'Usuário ativado.' : 'Usuário desativado.' });
    } catch (erro) {
        console.error('❌ Erro ao atualizar usuário:', erro);
        res.status(500).json({ erro: 'Não foi possível atualizar o usuário.' });
    }
});

module.exports = router;
