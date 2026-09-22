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
            'SELECT id, nome, email, senha, tipo FROM usuarios WHERE email = ? AND ativo = 1 LIMIT 1',
            [email]
        );
        const usuario = usuarios[0];

        if (!usuario || !(await bcrypt.compare(senha, usuario.senha))) {
            return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
        }

        const token = jwt.sign(
            { id: usuario.id, nome: usuario.nome, perfil: usuario.tipo },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
        );

        return res.json({ token, usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.tipo } });
    } catch (erro) {
        console.error('❌ Erro no login:', erro);
        return res.status(500).json({ erro: 'Não foi possível realizar o login.' });
    }
});

router.get('/me', autenticar, (req, res) => res.json({ usuario: req.usuario }));

module.exports = router;
