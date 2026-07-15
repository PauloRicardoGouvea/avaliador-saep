import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { avaliarAluno } from './src/avaliadorCore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.get('/api/backup', (req, res) => {
  try {
    const provasDir = path.join(__dirname, 'provas');
    if (!fs.existsSync(provasDir)) {
      return res.status(404).json({ error: 'Nenhum dado encontrado para backup.' });
    }
    
    const zip = new AdmZip();
    zip.addLocalFolder(provasDir, "provas");
    
    const zipBuffer = zip.toBuffer();
    
    res.set('Content-Disposition', 'attachment; filename=backup-saep.zip');
    res.set('Content-Type', 'application/zip');
    res.send(zipBuffer);
  } catch (err) {
    console.error('Erro ao gerar backup:', err);
    res.status(500).json({ error: 'Erro ao gerar backup.' });
  }
});

app.post('/api/restore', upload.single('backupZip'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo zip enviado.' });
    }
    
    const zip = new AdmZip(req.file.buffer);
    const targetDir = path.join(__dirname);
    
    zip.extractAllTo(targetDir, true);
    
    res.json({ success: true, message: 'Backup restaurado com sucesso!' });
  } catch (err) {
    console.error('Erro ao restaurar backup:', err);
    res.status(500).json({ error: 'Erro ao restaurar arquivo de backup.' });
  }
});

app.get('/api/alunos', (req, res) => {
  try {
    const provasDir = path.join(__dirname, 'provas');
    if (!fs.existsSync(provasDir)) {
      return res.json({ turmas: {} });
    }

    const turmas = {};

    for (const turmaEntry of fs.readdirSync(provasDir, { withFileTypes: true })) {
      if (!turmaEntry.isDirectory()) continue;
      const turmaName = turmaEntry.name;
      turmas[turmaName] = [];

      const turmaPath = path.join(provasDir, turmaName);
      for (const alunoEntry of fs.readdirSync(turmaPath, { withFileTypes: true })) {
        if (!alunoEntry.isDirectory()) continue;

        const alunoPath = path.join(turmaPath, alunoEntry.name);
        const alunoJsonPath = path.join(alunoPath, 'aluno.json');
        const gabaritoPath = path.join(alunoPath, 'gabarito_avaliado.json');
        const parecerPath = path.join(alunoPath, 'parecer.txt');
        const codigoPath = path.join(alunoPath, 'codigo');

        let nome = alunoEntry.name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        let turma = turmaName;

        if (fs.existsSync(alunoJsonPath)) {
          try {
            const dados = JSON.parse(fs.readFileSync(alunoJsonPath, 'utf-8'));
            nome = dados.nome || nome;
            turma = dados.turma || turma;
          } catch (_) {}
        }

        let percentual = null;
        let avaliado = false;
        if (fs.existsSync(gabaritoPath)) {
          avaliado = true;
          if (fs.existsSync(parecerPath)) {
            try {
              const parecerText = fs.readFileSync(parecerPath, 'utf-8');
            } catch (_) {}
          }
        }

        let arquivos = [];
        if (fs.existsSync(codigoPath)) {
          arquivos = fs.readdirSync(codigoPath).filter(f => !f.startsWith('.'));
        }

        turmas[turmaName].push({
          id: alunoEntry.name,
          nome,
          turma,
          avaliado,
          arquivos,
          pasta: alunoPath
        });
      }

      turmas[turmaName].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }

    res.json({ turmas });
  } catch (err) {
    console.error('Erro ao listar alunos:', err);
    res.status(500).json({ error: 'Erro ao listar alunos.' });
  }
});

app.post('/api/avaliar', upload.fields([
  { name: 'sqlFile', maxCount: 1 },
  { name: 'jsFile', maxCount: 1 },
  { name: 'derFile', maxCount: 1 }
]), async (req, res) => {
  try {
    const { nome, turma } = req.body;
    
    if (!nome || !turma) {
      return res.status(400).json({ error: 'Nome e Turma são obrigatórios.' });
    }

    const files = req.files || {};

    const folderTurma = turma.toUpperCase().replace(/\s+/g, '_');
    const folderNome = nome.toLowerCase().replace(/\s+/g, '_');
    const alunoDir = path.join(__dirname, 'provas', folderTurma, folderNome);
    const codigoDir = path.join(alunoDir, 'codigo');

    if (!fs.existsSync(codigoDir)) {
      fs.mkdirSync(codigoDir, { recursive: true });
    }

    const saveFile = (fileObj, filename) => {
      if (fileObj && fileObj[0]) {
        const filePath = path.join(codigoDir, filename);
        fs.writeFileSync(filePath, fileObj[0].buffer);
      }
    };

    if (files.sqlFile) saveFile(files.sqlFile, files.sqlFile[0].originalname);
    if (files.jsFile) saveFile(files.jsFile, files.jsFile[0].originalname);
    if (files.derFile) saveFile(files.derFile, files.derFile[0].originalname);

    fs.writeFileSync(path.join(alunoDir, 'aluno.json'), JSON.stringify({ nome, turma }, null, 2));

    const gabaritoPath = path.join(alunoDir, 'gabarito.json');
    if (!fs.existsSync(gabaritoPath)) {
      const templatePath = path.join(__dirname, 'template_gabarito.json');
      if (fs.existsSync(templatePath)) {
        fs.copyFileSync(templatePath, gabaritoPath);
      } else {
        fs.writeFileSync(gabaritoPath, JSON.stringify({}, null, 2));
      }
    }

    const result = await avaliarAluno(alunoDir);

    res.json({ success: true, result });
  } catch (error) {
    console.error('Erro na avaliação:', error);
    res.status(500).json({ error: 'Erro ao avaliar o aluno.', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`🚀 Web Interface running at http://localhost:${port}`);
});
