import Fastify from 'fastify'
import {Pool} from 'pg'

const servidor = Fastify()

const sql = new Pool({
    user: 'vanessa',
    password: 'senai',
    host: 'localhost',
    port: 5432,
    database: 'saep_sistema_estoque',
})


servidor.get('/produtos', async () => {
    const resultado = await sql.query('select * from produto')
    return resultado.rows
})

servidor.post('/cadastrar_produto', async (request, reply) => {
    const produto = request.body;

    if (!produto.valor_unid || !produto.quantidade || !produto.categoria) {
        return reply.status(400).send({ error: "valor unitário, quantidade e categoria são obrigatórios!" });
    }
    await sql.query(
        'insert into produto (nome, valor_unid, quantidade, categoria) values ($1, $2, $3, $4)',
        [produto.nome, produto.valor_unid, produto.quantidade]
    );

    return reply.status(201).send({ message: "Produto cadastrado com sucesso!"});
});



servidor.get('/saidas', async (request, reply) => {
    const resultado = await sql.query(`
        SELECT s.id_saida, s.data_fim, p.id_produto, p.nome, p.categoria, p.quantidade, p.valor_unid FROM saida s INNER JOIN produto p ON s.id_produto = p.id_produto ORDER BY s.data_fim DESC
    `);

    return reply.status(200).send(resultado.rows);
});

servidor.get('/entradas', async (request, reply) => {
    const resultado = await sql.query(`
        SELECT e.id_entrada, e.data_inicio,p.id_produto, p.nome, p.categoria, p.quantidade, p.valor_unid FROM entrada e INNER JOIN produto p ON e.id_produto = p.id_produto
    `);

    return reply.status(200).send(resultado.rows);
});


servidor.listen ({
    port: 3000
})
