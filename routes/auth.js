const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const autenticar = require('../middleware/autenticar');

const router = express.Router();

router.post('/login', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const senha = String(req.body.senha || '');

    if (!email || !senha) {
        return res.status(400).json({ erro: 'E-mail e senha são obrigatórios.' });
    }

    try {
        const [usuarios] = await pool.execute(
            `SELECT u.id, u.nome, u.email, u.senha, u.tipo, u.escola_id,
                    e.nome AS escola_nome, e.ativa AS escola_ativa
             FROM usuarios u
             LEFT JOIN escolas e ON e.id = u.escola_id
             WHERE u.email = ? AND u.ativo = 1
             LIMIT 1`,
            [email]
        );

        const usuario = usuarios[0];

        if (!usuario || !(await bcrypt.compare(senha, usuario.senha))) {
            return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
        }

        if (usuario.tipo !== 'SUPER_ADMIN') {
            if (!usuario.escola_id || !usuario.escola_ativa) {
                return res.status(403).json({ erro: 'Esta conta não está vinculada a uma escola ativa.' });
            }
        }

        const token = jwt.sign(
            {
                id: usuario.id,
                nome: usuario.nome,
                email: usuario.email,
                perfil: usuario.tipo,
                escola_id: usuario.escola_id || null,
                escola_nome: usuario.escola_nome || null
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
        );

        return res.json({
            token,
            usuario: {
                id: usuario.id,
                nome: usuario.nome,
                email: usuario.email,
                perfil: usuario.tipo,
                escola_id: usuario.escola_id || null,
                escola_nome: usuario.escola_nome || null
            }
        });
    } catch (erro) {
        console.error('❌ Erro no login:', erro);
        return res.status(500).json({ erro: 'Não foi possível realizar o login.' });
    }
});

router.get('/me', autenticar, async (req, res) => {
    try {
        const [usuarios] = await pool.execute(
            `SELECT u.id, u.nome, u.email, u.tipo, u.ativo, u.escola_id,
                    e.nome AS escola_nome, e.ativa AS escola_ativa
             FROM usuarios u
             LEFT JOIN escolas e ON e.id = u.escola_id
             WHERE u.id = ?
             LIMIT 1`,
            [req.usuario.id]
        );
        const usuario = usuarios[0];
        if (!usuario || !usuario.ativo) {
            return res.status(401).json({ erro: 'Usuário não encontrado ou inativo.' });
        }
        if (usuario.tipo !== 'SUPER_ADMIN' && (!usuario.escola_id || !usuario.escola_ativa)) {
            return res.status(403).json({ erro: 'A escola desta conta está desativada.' });
        }
        res.json({
            usuario: {
                id: usuario.id,
                nome: usuario.nome,
                email: usuario.email,
                perfil: usuario.tipo,
                escola_id: usuario.escola_id || null,
                escola_nome: usuario.escola_nome || null
            }
        });
    } catch (erro) {
        console.error('❌ Erro ao consultar sessão:', erro);
        res.status(500).json({ erro: 'Não foi possível validar a sessão.' });
    }
});

module.exports = router;
