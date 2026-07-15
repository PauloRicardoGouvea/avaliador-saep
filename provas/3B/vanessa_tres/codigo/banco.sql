CREATE TABLE produto(
	id_produto serial primary key,
	nome varchar(255) not null unique,
	categoria varchar(255),
	quantidade int not null,
	valor_unid decimal(10,2) not null
)

CREATE TABLE entrada(
	id_entrada serial primary key,
	data_inicio timestamp default current_timestamp not null,
	id_produto integer references produto(id_produto) on delete cascade
)

CREATE TABLE saida(
	id_saida serial primary key,
	data_fim timestamp default current_timestamp not null,
	id_produto integer references produto(id_produto) on delete cascade
)

