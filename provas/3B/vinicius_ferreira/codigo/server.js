import { Pool } from 'pg';
import Fastify from 'fastify';

const servidor = Fastify()

const sql = new Pool({
  user: 'karateka',
  host: 'localhost',
  database: 'produtos',
  password: '12345',
  port: 5432,
});


servidor.get('/produtos', async () => {
    const resultado = await sql.query('select categoria, valor_unit from produto order by categoria asc, valor_unit asc')
    return resultado.rows
})

servidor.post('/produtos', async (request, reply) => {
    const body = request.body;

    if (!body || !body.nome || !body.qtd || !body.categoria || !body.valor_unit) {
        return reply.status(400).send({
            message:"Estão faltando informações!"
        })
    }

    const resultado = await sql.query('INSERT INTO produto (nome, qtd, categoria, valor_unit) VALUES ($1, $2, $3, $4)', [body.nome, body.qtd, body.categoria, body.valor_unit])          
    reply.status(201).send({message: 'Produto Adicionado!'})
})

servidor.put('/produtos/:id', async (request, reply) => {
    const body = request.body;
    const id = request.params.id;

    if (!body || !body.nome || !body.qtd || !body.categoria || !body.valor_unit) {
        return reply.status(400).send({
            message: "Estão faltando informações!"
        })
    }

    const usuario = await sql.query('select * from produtos where id = $1', [id])  
    if (usuario.rows.length === 0) {
        return reply.status(400).send({
            message: "Usuário não existe!"
        })
    }

    const resultado = await sql.query('UPDATE usuario SET nome = $1, senha = $2, email = $3 WHERE id = $4', [body.nome, body.qtd, body.categoria, body.valor_unit])      
    reply.status(201).send({message: `usuario: ${body.nome} alterado!`})          
})

servidor.delete('/usuarios/:id', async (request, reply) => {
    const id = request.params.id
    const resultado = await sql.query('DELETE FROM usuario where id = $1', [id]) 
    console.log(resultado);    
    reply.status(200).send({message:'Usuário Deletado!'})
})

servidor.listen({   
    port: 3000
})

