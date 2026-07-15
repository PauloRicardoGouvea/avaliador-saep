import Fastify from 'fastify'
import { Pool } from 'pg';

const sql = new Pool({
  user: 'postgres',
  password: 'senai',
  database: 'saep_estoque',
  host: 'localhost',
  port: 5432
});

const servidor = Fastify();

servidor.get('/produto', async () => {
    const resultado = await sql.query('SELECT * FROM produto');
    return resultado.rows
});

servidor.post('/produto', async (request, reply) => {
    const body = request.body;
    if( !body || !body.nome || !body.categoria || !body.quantidade || !body.valor_unitario){
        reply.code(404).send({error: "Digite os dados corretamente!"})
    }
    const resultado = await sql.query('INSERT INTO produto (nome, categoria, quantidade, valor_unitario) VALUES ($1, $2, $3, $4)', [body.nome, body.categoria, body.quantidade, body.valor_unitario]);
    return reply.code(200).send({message: "Produto adicionado ao estoque!"});
});

servidor.put('/produto/:id', async (request,reply) => {
    const id = request.params.id;
    const body = request.body;
    if( !body || !body.nome || !body.categoria || !body.quantidade || !body.valor_unitario){
        reply.code(404).send({error: "Digite os dados corretamente."})
    }
    const resultado = await sql.query(`
        UPDATE produto
        SET nome = $1, 
        categoria = $2, 
        quantidade = $3, 
        valor_unitario = $4
        WHERE id = $5`, [body.nome, body.categoria, body.quantidade, body.valor_unitario, id]);
        reply.code(200).send({message: "Atualização de dados do produto concluída!"})
    });
    
    servidor.delete('/produto/:id', async (request,reply) => {
        const id = request.params.id;
        const resultado = await sql.query(`
            DELETE FROM produto
            WHERE id = $1`, [id]);
            reply.code(200).send({message: "Seu produto foi retirado do sistema com sucesso!"})
        });
        
        servidor.get('/estoque', async () => {
            const resultado = await sql.query('SELECT * FROM estoque');
            return resultado.rows
        });
        
        servidor.get('/vw_estoque', async () => {
            const resultado = await sql.query('SELECT * FROM vw_estoque');
            return resultado.rows
        });
        
        servidor.listen({ port: 3000});