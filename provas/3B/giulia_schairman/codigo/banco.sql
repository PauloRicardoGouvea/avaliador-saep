CREATE TABlE produto(
 	id SERIAL PRIMARY KEY,
 	nome VARCHAR(255),
	categoria VARCHAR(255) NOT NULL,
	quantidade INTEGER NOT NULL,
 	valor_unitario DECIMAL(10,2) NOT NULL
);

CREATE TABLE estoque (
    id SERIAL PRIMARY KEY,
    data_entrada TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_saída TIMESTAMP,
	produto_id INTEGER REFERENCES produto(id)
);

CREATE VIEW vw_estoque AS
SELECT (p.valor_unitario * p.quantidade) AS valor_total
	produto.nome,
    produto.valor_unitario,
    produto.quantidade
FROM produto 
JOIN produto.quantidade ON produto.nome_id = quantidade.id * valor_unitario.id;

SELECT * FROM vw_estoque;
