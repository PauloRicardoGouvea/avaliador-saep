import Fastify from "fastify";
import { Pool } from "pg";

const servidor = Fastify();
const sql = new Pool({
    user: "postgres",
    password: "senai",
    host: "localhost",
    port: 5432,
    database: "banco"
})

// Listar todos os produtos
servidor.get('/produto', async () => {
    const resultado = await sql.query('SELECT * FROM produto')
    return resultado.rows
});

// Listar todos os produtos
servidor.get('/SaidaDataDecrescente', async () => {
    const resultado = await sql.query(`SELECT * FROM estoque WHERE tipo_transacao = 'saida' ORDER BY data_transacao DESC`)
    return resultado.rows
});

// Cadastrar entrada
servidor.post('/entrada', async (request, reply) => {
    const body = request.body
    const resultado = await sql.query(
        'INSERT INTO estoque (id_produto, quantidade, tipo_transacao) VALUES ($1, $2, $3)',
        [body.id_produto, body.quantidade, body.tipo_transacao]
    )

    return reply.status(201).send({message: "Entrada efetuada"})
})

servidor.post('/entradaProduto', async (request, reply) => {
    const body = request.body

        if (!body || !body.nome || !body.categoria || !body.valor_unitario) {
        return resposta.status(404).send({
        message: 'Preencha todas as informações para cadastrar um produto'
        })

    }
    const resultado = await sql.query(
        'INSERT INTO produto (nome, categoria, valor_unitario) VALUES ($1, $2, $3)',
        [body.nome, body.categoria, body.valor_unitario]
    )

    return reply.status(201).send({message: "Produto cadastrado"})
})

try {
    await servidor.listen({
        port: process.env.PORT || 3000
    })

    console.log('Servidor rodando na porta 3000!')
} catch (erro) {
    console.error(erro)
    process.exit(1)
}
