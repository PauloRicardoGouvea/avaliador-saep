CREATE TABLE if not exists produto (
    id_produto SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    categoria TEXT NOT NULL,
    qtd INT NOT NULL DEFAULT 0,
    valor_unit DECIMAL (10,2) NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS saida(
    id_saida SERIAL PRIMARY KEY,
    saida TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    id_produto integer references produto(id_produto) 
)