CREATE TABLE produto(
	id_produto SERIAL PRIMARY KEY,
	nome VARCHAR(255),
	categoria VARCHAR(255),
	valor_unitario DECIMAL
);

INSERT INTO produto (nome, categoria, valor_unitario) VALUES ('Produto teste', 'teste', 10);
INSERT INTO produto (nome, categoria, valor_unitario) VALUES ('Produto tese', 'teste', 15);
INSERT INTO produto (nome, categoria, valor_unitario) VALUES ('Produto filosofia', 'teste', 13);

CREATE TABLE estoque(
	id_transacao SERIAL PRIMARY KEY,
	id_produto INTEGER references produto(id_produto),
	quantidade INTEGER,
	tipo_transacao VARCHAR(255),
	data_transacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO estoque (id_produto, quantidade, tipo_transacao) VALUES ('1', '10', 'entrada');
INSERT INTO estoque (id_produto, quantidade, tipo_transacao) VALUES ('1', '10', 'entrada');
INSERT INTO estoque (id_produto, quantidade, tipo_transacao) VALUES ('1', '10', 'saida');



CREATE VIEW vw_estoque AS
SELECT (c.valor_unitario * p.quantidade) valor_total,
    c.id_produto,
    c.nome,
    c.valor_unitario,
	p.quantidade
FROM produto c
INNER JOIN estoque p
	ON c.id_produto = p.id_transacao;
