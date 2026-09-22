const jwt = require('jsonwebtoken');

module.exports = function autenticar(req, res, next) {
    const cabecalho = req.headers.authorization || '';
    const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : null;

    if (!token) {
        return res.status(401).json({ erro: 'Autenticação necessária.' });
    }

    try {
        req.usuario = jwt.verify(token, process.env.JWT_SECRET);
        return next();
    } catch {
        return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    }
};

module.exports.apenasAdmin = function apenasAdmin(req, res, next) {
    if (req.usuario?.perfil !== 'ADMIN') {
        return res.status(403).json({ erro: 'Apenas administradores podem realizar esta operação.' });
    }
    next();
};
