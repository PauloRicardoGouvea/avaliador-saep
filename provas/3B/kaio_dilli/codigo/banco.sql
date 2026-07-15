

CREATE TABLE ESTOQUE (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    categoria VARCHAR(255) NOT NULL,
    quantidade VARCHAR(255) NOT NULL 
);


CREATE TABLE PEDIDO (
    id SERIAL PRIMARY KEY,
    item VARCHAR(255),
    valor DECIMAL(10,2),
    id_estoque INTEGER REFERENCES ESTOQUE(id) ON DELETE CASCADE 
);


INSERT INTO ESTOQUE (nome, categoria, quantidade)
VALUES
    ('detergente', 'Limpeza', '50'),
    ('desengordurante', 'Limpeza', '20'),
    ('balde de agua', 'Utensílios', '10');


INSERT INTO PEDIDO (item, valor, id_estoque)
VALUES
    ('detergente', 5.99, 1);

INSERT INTO PEDIDO (item, valor, id_estoque)
VALUES
    ('desengordurante', 29.75, 2);

INSERT INTO PEDIDO (item, valor, id_estoque)
VALUES
    ('balde de agua', 60.00, 3);


SELECT
    e.nome AS produto,
    p.item,
    p.valor AS preco
FROM estoque e
INNER JOIN pedido p ON e.id = p.id_estoque;