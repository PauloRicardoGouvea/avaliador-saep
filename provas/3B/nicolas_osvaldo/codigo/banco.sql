create table produtos (
id serial primary key,
nome varchar(255) not null,
categoria varchar(255) not null,
quantidade integer not null,
valor_unitario numeric (10,2) not null
)

create table estoque (
id serial primary key,
id_produtos integer references produtos(id),
data_inicio timestamp not null,
data_fim timestamp
)
create view vv_estoque as 
select
produtos.nome,
produtos.categoria,
produtos.quantidade,
produtos.valor_unitario
from produtos;

insert into produtos (nome, categoria, quantidade, valor_unitario) values
('camiseta', 'roupa', 10,25),
('calça', 'roupa', 9,20),
('blusa', 'roupa', 20,30),
('bone', 'roupa', 5,10);

select * from produtos order by quantidade asc;

delete from produtos;
