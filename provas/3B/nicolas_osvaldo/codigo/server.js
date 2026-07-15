import Fastify from "fastify";
import { Pool } from "pg";

const servidor = Fastify();

const sql = new Pool ({
    user: "postgres",
    password: "senai",
    host: "localhost",
    port: 5432,
    database: "almoxarifado"
})

servidor.get('/produtos', async () => {
    const resultado = await sql.query('select * from produtos') 
    return resultado.rows
});

servidor.post('/produtos', async (request, reply) => {
    const body = request.body
    if (!body || !body.nome || body.categoria || !body.valor_unitario) {
        return reply.status(400).send({message: 'Nome, categoria e valor são obrigatórios'});
    }

    const resultado = await sql.query(
        'INSERT INTO produtos (nome, categoria, valor_unitario) VALUES ($1, $2, 3$)',
        [body.nome, body.categoria, body.valor_unitario]
    )
});

servidor.listen({port:3000}, () => {
    console.log('server on')
})