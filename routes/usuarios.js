const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../config/database');
const autenticar = require('../middleware/autenticar');

const router = express.Router();
router.use(autenticar);

router.get('/', async (req, res) => {
    try {
        const [usuarios] = await pool.execute(
            'SELECT id, nome, email, tipo, ativo, criado_em FROM usuarios ORDER BY nome ASC'
        );
        res.json(usuarios);
    } catch (erro) {
        console.error('❌ Erro ao listar usuários:', erro);
        res.status(500).json({ erro: 'Não foi possível listar usuários.' });
    }
});

router.post('/', async (req, res) => {
    if (req.usuario?.perfil !== 'ADMIN') {
        return res.status(403).json({ erro: 'Apenas administradores podem cadastrar usuários.' });
    }

    const nome = String(req.body.nome || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const senha = String(req.body.senha || '');
    const tipo = String(req.body.tipo || 'PROFESSOR').toUpperCase();

    if (!nome || !email || senha.length < 6 || !['ADMIN', 'PROFESSOR'].includes(tipo)) {
        return res.status(400).json({ erro: 'Informe nome, e-mail, senha (mín. 6 caracteres) e perfil válido.' });
    }

    try {
        const senhaHash = await bcrypt.hash(senha, 12);
        const [resultado] = await pool.execute(
            'INSERT INTO usuarios (nome, email, senha, tipo) VALUES (?, ?, ?, ?)',
            [nome, email, senhaHash, tipo]
        );
        res.status(201).json({
            mensagem: 'Usuário cadastrado com sucesso.',
            usuario: { id: resultado.insertId, nome, email, tipo, ativo: 1 }
        });
    } catch (erro) {
        if (erro.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ erro: 'Este e-mail já está cadastrado.' });
        }
        console.error('❌ Erro ao cadastrar usuário:', erro);
        res.status(500).json({ erro: 'Não foi possível cadastrar usuário.' });
    }
});

module.exports = router;
