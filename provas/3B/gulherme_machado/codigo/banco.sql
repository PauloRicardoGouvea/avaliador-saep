CREATE TABLE produto (
	id SERIAL PRIMARY KEY,
	nome VARCHAR(255) NOT NULL,
	categoria VARCHAR(255) NOT NULL,
	quantidade INTEGER NOT NULL,
	valor_unitario NUMERIC(10,2) NOT NULL
);

CREATE TABLE estoque (
	id SERIAL PRIMARY KEY,
	data_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	data_fim TIMESTAMP,
	id_produto INTEGER REFERENCES produto(id)
);

CREATE VIEW vw_estoque2 AS
SELECT (p.valor_unitario * p.quantidade) AS valor_total,
       p.nome ,
       p.categoria ,
       p.valor_unitario,
       p.quantidade
FROM produto p
INNER JOIN estoque e ON p.id = e.id;