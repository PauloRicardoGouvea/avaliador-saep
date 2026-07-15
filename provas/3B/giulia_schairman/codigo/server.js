import Fastify from 'fastify'
import { Pool } from 'pg'

const servidor = Fastify()

const sql = new Pool({
    user: 'postgres',
    password: 'senai',
    host: 'localhost',
    database: 'Banco_estoque',
    port: 5432
})


servidor.get('/produto', async () => {
    const resultado = await sql.query('SELECT * FROM produto')
    return resultado.rows
})

servidor.post('/produto', async (requisicao, resposta) => {
    const { nome, categoria, quantidade, valor_unitario } = requisicao.body

    const resultado = await sql.query(
        'INSERT INTO produto (nome, categoria, quantidade, valor_unitario) VALUES ($1, $2, $3, $4) RETURNING *',
        [nome, categoria, quantidade, valor_unitario]
    )

    return resposta.status(201).send(resultado.rows[0])
})

servidor.put('/produto/:id', async (requisicao, resposta) => {
    const { id } = requisicao.params.id;
    const { nome, categoria, quantidade, valor_unitario } = requisicao.body

    const resultado = await sql.query(
        `UPDATE produto
         SET nome = $1,
         categoria = $2,
         quantidade = $3,
         valor_unitario = $4
         WHERE id = $5
         RETURNING *`,
        [nome, categoria, quantidade, valor_unitario, id]
    )

    return resposta.status(200).send({message: "td certo"})
})






servidor.get('/estoque', async () => {
    const resultado = await sql.query('SELECT * FROM estoque')
    return resultado.rows
})

servidor.post('/estoque', async (requisicao, resposta) => {
    const { data_entrada, data_saida, produto_id } = requisicao.body

    const resultado = await sql.query(
        'INSERT INTO estoque ( data_entrada, data_saida, produto_id) VALUES ($1, $2, $3) RETURNING *',
        [ data_entrada, data_saida, produto_id ]
    )

    return resposta.status(201).send(resultado.rows[0])
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