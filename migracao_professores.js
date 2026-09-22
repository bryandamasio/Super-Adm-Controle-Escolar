const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  await db.execute(`
    CREATE TABLE IF NOT EXISTS professores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id INT NOT NULL UNIQUE,
      telefone VARCHAR(30) NULL,
      registro VARCHAR(50) NULL,
      escola VARCHAR(150) NULL,
      ativo BOOLEAN DEFAULT TRUE,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_professor_usuario FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS professor_presencas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      professor_id INT NOT NULL,
      data DATE NOT NULL,
      entrada DATETIME NULL,
      saida DATETIME NULL,
      status ENUM('ABERTA','COMPLETA') NOT NULL DEFAULT 'ABERTA',
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_prof_pres_prof FOREIGN KEY (professor_id)
        REFERENCES professores(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      UNIQUE KEY uq_professor_data (professor_id, data),
      KEY idx_professor_data (professor_id, data)
    ) ENGINE=InnoDB
  `);
  console.log('TABELAS_PROFESSORES_OK');
  await db.end();
}

main().catch(async erro => {
  console.error('ERRO_MIGRACAO:', erro.message);
  process.exitCode = 1;
});
