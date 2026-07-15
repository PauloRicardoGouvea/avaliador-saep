import Fastify from 'fastify'
import { Pool } from 'pg'
import cors from '@fastify/cors'

const sql = new Pool({
    user: "postgres",
    password: "senai",
    host: "localhost",
    port: 5432,
    database: "amoxarifado"
})

const servidor = Fastify();

servidor.register(cors, {
    origin: '*',
    methods:['PUT', 'POST', 'DELETE', 'GET']
});

servidor.post('/pedido', async (request, reply) => {
    const body = request.body;
    if (!body || !body.item || !body.valor) {
        reply.status(400).send({error: "item e valor obrigatórios!"})
    }
    const resultado = await sql.query('select * from estoque where nome = $1 AND categoria = $2', [body.nome, body.categoria])    

    if (resultado.rows.length === 0) {
        reply.status(401).send({message: " nome ou categoria inválidos!", login: false})
    } else if (resultado.rows.length === 1) {
        reply.status(200).send({message: "pedido confirmado", login: true})
    }

})

servidor.get('/estoque', async () => {
    const resultado = await sql.query('select * from estoque')
    return resultado.rows
})

servidor.post('/estoque', async (request, reply) => {
    const body = request.body;

    if (!body || !body.nome || !body.categoria || !body.quantidade) {
        return reply.status(400).send({
            message:"nome, categoria e quantidade são obrigatórios!"
        })
    }

    const resultado = await sql.query('INSERT INTO estoque (nome, quantidade, categoria) VALUES ($1, $2, $3)', [body.nome, body.quantidade, body.categoria])          
    reply.status(201).send({message: 'item do estoque criado!'})
})

servidor.put('/estoque/:id', async (request, reply) => {
    const body = request.body;
    const id = request.params.id;

    if (!body || !body.nome || !body.quantidade || !body.categoria) {
        return reply.status(400).send({
            message: "nome, categoria e quantidade são obrigatórios!"
        })
    } else if (!id) {
        return reply.status(400).send({
            message: "Faltou o ID!"
        })
    }

    const estoque = await sql.query('select * from estoque where id = $1', [id])  
    if (estoque.rows.length === 0) {
        return reply.status(400).send({
            message: "item de estoque não existe!"
        })
    }

    const resultado = await sql.query('UPDATE estoque SET nome = $1, quantidade = $2, categoria = $4 WHERE id = $3', [body.nome, body.quantidade, id, body.categoria])      
    reply.status(201).send({message: `estoque ${body.nome} alterado!`})          
})

servidor.delete('/estoque/:id', async (request, reply) => {
    const id = request.params.id
    const resultado = await sql.query('DELETE FROM estoque where id = $1', [id]) 
    console.log(resultado);    
    reply.status(200).send({message:'item de estoque Deletado!'})
})

servidor.listen({   
    port: 3000
})