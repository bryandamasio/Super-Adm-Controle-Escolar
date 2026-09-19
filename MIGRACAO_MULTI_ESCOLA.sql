USE sistema_presenca;

-- ATENÇÃO: faça backup do banco antes de executar esta migração.
-- Esta versão é feita para a estrutura antiga do projeto enviada.

CREATE TABLE IF NOT EXISTS escolas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(180) NOT NULL,
  cnpj VARCHAR(30) NULL UNIQUE,
  email VARCHAR(150) NULL,
  telefone VARCHAR(30) NULL,
  ativa BOOLEAN NOT NULL DEFAULT TRUE,
  valor_mensal DECIMAL(10,2) NOT NULL DEFAULT 0,
  vencimento_dia TINYINT UNSIGNED NOT NULL DEFAULT 10,
  ultimo_pagamento DATE NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO escolas (nome, ativa, valor_mensal, vencimento_dia)
SELECT 'Escola Principal', TRUE, 0, 10
WHERE NOT EXISTS (SELECT 1 FROM escolas LIMIT 1);

-- Colunas novas, adicionadas somente quando ainda não existem.
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'escola_id') = 0,
  'ALTER TABLE usuarios ADD COLUMN escola_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'turmas' AND column_name = 'escola_id') = 0,
  'ALTER TABLE turmas ADD COLUMN escola_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'alunos' AND column_name = 'escola_id') = 0,
  'ALTER TABLE alunos ADD COLUMN escola_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE usuarios
  MODIFY COLUMN tipo ENUM('SUPER_ADMIN','ADMIN','PROFESSOR','VICE_DIRECAO','COORDENACAO','SECRETARIA') NOT NULL;

SET @escola_padrao := (SELECT id FROM escolas ORDER BY id LIMIT 1);
UPDATE usuarios SET escola_id = @escola_padrao WHERE escola_id IS NULL AND tipo <> 'SUPER_ADMIN';
UPDATE turmas SET escola_id = @escola_padrao WHERE escola_id IS NULL;
UPDATE alunos SET escola_id = @escola_padrao WHERE escola_id IS NULL;

-- A matrícula deixa de ser única globalmente e passa a ser única por escola.
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'alunos' AND index_name = 'matricula') > 0,
  'ALTER TABLE alunos DROP INDEX matricula',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'alunos' AND index_name = 'uq_aluno_escola_matricula') = 0,
  'ALTER TABLE alunos ADD UNIQUE KEY uq_aluno_escola_matricula (escola_id, matricula)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Chaves estrangeiras, adicionadas apenas quando ainda não existem.
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'usuarios' AND constraint_name = 'fk_usuario_escola') = 0,
  'ALTER TABLE usuarios ADD CONSTRAINT fk_usuario_escola FOREIGN KEY (escola_id) REFERENCES escolas(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'turmas' AND constraint_name = 'fk_turma_escola') = 0,
  'ALTER TABLE turmas ADD CONSTRAINT fk_turma_escola FOREIGN KEY (escola_id) REFERENCES escolas(id) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'alunos' AND constraint_name = 'fk_aluno_escola') = 0,
  'ALTER TABLE alunos ADD CONSTRAINT fk_aluno_escola FOREIGN KEY (escola_id) REFERENCES escolas(id) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS professores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL,
  telefone VARCHAR(30) NULL,
  registro VARCHAR(50) NULL,
  escola_id INT NOT NULL,
  usuario_id INT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_prof_email_escola (escola_id,email),
  UNIQUE KEY uq_prof_registro_escola (escola_id,registro),
  CONSTRAINT fk_prof_escola FOREIGN KEY (escola_id) REFERENCES escolas(id) ON DELETE RESTRICT,
  CONSTRAINT fk_prof_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS pagamentos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  escola_id INT NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  referencia VARCHAR(100) NULL,
  status ENUM('PENDENTE','PAGO','CANCELADO') NOT NULL DEFAULT 'PENDENTE',
  pago_em DATETIME NULL,
  observacao VARCHAR(255) NULL,
  criado_por INT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pagamento_escola FOREIGN KEY (escola_id) REFERENCES escolas(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pagamento_usuario FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  KEY idx_pagamento_escola_status (escola_id,status)
);
