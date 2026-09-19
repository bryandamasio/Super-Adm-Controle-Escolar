const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

require('./config/database');

const alunosRoutes = require('./routes/alunos');
const authRoutes = require('./routes/auth');
const presencasRoutes = require('./routes/presencas');
const turmasRoutes = require('./routes/turmas');
const usuariosRoutes = require('./routes/usuarios');
const professoresRoutes = require('./routes/professores');
const escolasRoutes = require('./routes/escolas');
const ocorrenciasRoutes = require('./routes/ocorrencias');

const app = express();
const PORT = Number(process.env.PORT || 3000);

const corsOrigin = process.env.CORS_ORIGIN || `http://localhost:${PORT}`;

app.use(cors({
    origin: corsOrigin.split(',').map(v => v.trim()),
    credentials: false
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/qrcodes', express.static(path.join(__dirname, 'python', 'qrcodes')));

app.get('/api/health', async (req, res) => {
    try {
        await require('./config/database').query('SELECT 1');
        res.json({ ok: true, banco: 'MySQL', hora: new Date().toISOString() });
    } catch (erro) {
        res.status(503).json({ ok: false, banco: 'indisponível', erro: erro.message });
    }
});

app.use('/api/auth', authRoutes);
app.use('/api/alunos', alunosRoutes);
app.use('/api/presencas', presencasRoutes);
app.use('/api/turmas', turmasRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/professores', professoresRoutes);
app.use('/api/escolas', escolasRoutes);
app.use('/api/ocorrencias', ocorrenciasRoutes);

app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ erro: 'Rota não encontrada.' });
    }
    res.status(404).send('Página não encontrada.');
});

app.use((erro, req, res, next) => {
    console.error('❌ Erro não tratado:', erro);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
});

app.listen(PORT, () => {
    console.log(`🚀 Sistema de Presença rodando em http://localhost:${PORT}`);
});
