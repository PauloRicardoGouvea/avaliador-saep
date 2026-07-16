document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('evaluationForm');
    const resultsSection = document.getElementById('resultsSection');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = submitBtn.querySelector('.btn-text');
    const spinner = submitBtn.querySelector('.spinner');
    const resetBtn = document.getElementById('resetBtn');
    const downloadBtn = document.getElementById('downloadBtn');

    let currentGabarito = null;
    let currentStudentName = 'aluno';

    // Backup UI Elements
    const exportBackupBtn = document.getElementById('exportBackupBtn');
    const importBackupBtn = document.getElementById('importBackupBtn');
    const backupFileInput = document.getElementById('backupFileInput');

    // Tab navigation
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(`tab-${targetTab}`).classList.add('active');

            if (targetTab === 'historico') {
                loadStudents();
            }
        });
    });

    // Turma filter buttons
    const filterBtns = document.querySelectorAll('.filter-btn');
    let currentFilter = 'all';

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            applyFilters();
        });
    });

    // Search input
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', () => {
        applyFilters();
    });

    let allStudentsData = {};

    async function loadStudents() {
        const container = document.getElementById('studentsContainer');
        const emptyState = document.getElementById('emptyState');

        container.innerHTML = '<div class="loading-students"><div class="spinner"></div><p>Carregando alunos...</p></div>';
        emptyState.classList.add('hidden');

        try {
            const response = await fetch('/api/alunos');
            const data = await response.json();
            allStudentsData = data.turmas || {};
            renderStudents();
        } catch (error) {
            console.error('Erro ao carregar alunos:', error);
            container.innerHTML = '<div class="empty-state"><div class="empty-icon">❌</div><p>Erro ao carregar alunos</p></div>';
        }
    }

    function applyFilters() {
        renderStudents();
    }

    function renderStudents() {
        const container = document.getElementById('studentsContainer');
        const emptyState = document.getElementById('emptyState');
        const searchTerm = searchInput.value.toLowerCase().trim();

        container.innerHTML = '';
        let totalStudents = 0;

        // Sort turma keys for consistent order
        const turmaKeys = Object.keys(allStudentsData).sort();

        for (const turmaKey of turmaKeys) {
            // Apply turma filter
            if (currentFilter !== 'all' && turmaKey.toUpperCase() !== currentFilter.toUpperCase()) {
                continue;
            }

            let students = allStudentsData[turmaKey];

            // Apply search filter
            if (searchTerm) {
                students = students.filter(s => s.nome.toLowerCase().includes(searchTerm));
            }

            if (students.length === 0) continue;

            totalStudents += students.length;

            const groupDiv = document.createElement('div');
            groupDiv.className = 'turma-group';
            groupDiv.innerHTML = `
                <div class="turma-group-title">
                    🏫 Turma ${turmaKey.toUpperCase()}
                    <span class="count-badge">${students.length} aluno${students.length > 1 ? 's' : ''}</span>
                </div>
            `;

            for (const student of students) {
                const card = document.createElement('div');
                card.className = 'student-card';

                const fileTags = student.arquivos.map(f => `<span class="file-tag">${f}</span>`).join('');
                const statusClass = student.avaliado ? 'avaliado' : 'pendente';
                const statusText = student.avaliado ? '✅ Avaliado' : '⏳ Pendente';

                card.innerHTML = `
                    <div class="student-card-info">
                        <div class="student-card-name">${student.nome}</div>
                        <div class="student-card-meta">
                            <span class="student-card-status ${statusClass}">${statusText}</span>
                            ${fileTags}
                        </div>
                    </div>
                    <div class="student-card-actions">
                        <button class="btn-reavaliar" data-nome="${student.nome}" data-turma="${student.turma}">🔄 Reavaliar</button>
                    </div>
                `;

                // Re-evaluate button click
                card.querySelector('.btn-reavaliar').addEventListener('click', () => {
                    reavaliarAluno(student.nome, student.turma);
                });

                groupDiv.appendChild(card);
            }

            container.appendChild(groupDiv);
        }

        if (totalStudents === 0) {
            container.innerHTML = '';
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
        }
    }

    function reavaliarAluno(nome, turma) {
        // Switch to evaluation tab
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        document.querySelector('[data-tab="avaliar"]').classList.add('active');
        document.getElementById('tab-avaliar').classList.add('active');

        // Show evaluation form, hide results
        resultsSection.classList.add('hidden');
        form.classList.remove('hidden');

        // Pre-fill the form
        document.getElementById('nome').value = nome;
        document.getElementById('turma').value = turma;

        // Reset file inputs display
        ['sql', 'js', 'der'].forEach(type => {
            document.getElementById(`name-${type}`).textContent = 'Nenhum arquivo selecionado';
            document.getElementById(`name-${type}`).style.color = 'var(--text-secondary)';
            document.getElementById(`zone-${type}`).style.borderColor = 'var(--panel-border)';
        });

        // Update button text
        btnText.textContent = 'Atualizar e Reavaliar';

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // File inputs visual feedback
    const fileInputs = ['sql', 'js', 'der'];
    
    fileInputs.forEach(type => {
        const input = document.getElementById(`${type}File`);
        const nameDisplay = document.getElementById(`name-${type}`);
        const zone = document.getElementById(`zone-${type}`);

        input.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                nameDisplay.textContent = e.target.files[0].name;
                nameDisplay.style.color = 'var(--success)';
                zone.style.borderColor = 'var(--success)';
            } else {
                nameDisplay.textContent = 'Nenhum arquivo selecionado';
                nameDisplay.style.color = 'var(--text-secondary)';
                zone.style.borderColor = 'var(--panel-border)';
            }
        });

        // Drag and drop effects
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('dragover');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('dragover');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                input.files = e.dataTransfer.files;
                input.dispatchEvent(new Event('change'));
            }
        });
    });

    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Show loading state
        submitBtn.disabled = true;
        btnText.classList.add('hidden');
        spinner.classList.remove('hidden');

        const formData = new FormData(form);

        try {
            const response = await fetch('/api/avaliar', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erro desconhecido');
            }

            showResults(data.result);
        } catch (error) {
            alert('Erro: ' + error.message);
        } finally {
            // Hide loading state
            submitBtn.disabled = false;
            btnText.classList.remove('hidden');
            spinner.classList.add('hidden');
            // Reset button text back to default
            btnText.textContent = 'Avaliar Projeto';
        }
    });

    resetBtn.addEventListener('click', () => {
        form.reset();
        fileInputs.forEach(type => {
            document.getElementById(`name-${type}`).textContent = 'Nenhum arquivo selecionado';
            document.getElementById(`name-${type}`).style.color = 'var(--text-secondary)';
            document.getElementById(`zone-${type}`).style.borderColor = 'var(--panel-border)';
        });
        resultsSection.classList.add('hidden');
        form.classList.remove('hidden');
        btnText.textContent = 'Avaliar Projeto';
    });

    function showResults(result) {
        form.classList.add('hidden');
        resultsSection.classList.remove('hidden');

        const { aluno, parecer, gabarito } = result;
        currentGabarito = gabarito;
        currentStudentName = aluno.nome;

        document.getElementById('res-nome').textContent = aluno.nome;
        document.getElementById('res-turma').textContent = `Turma ${aluno.turma}`;
        
        const percent = parecer.totais.percentual;
        document.getElementById('score-text').textContent = `${percent}%`;
        document.getElementById('score-path').setAttribute('stroke-dasharray', `${percent}, 100`);
        
        // Color code the score
        const scorePath = document.getElementById('score-path');
        if (percent >= 80) scorePath.style.stroke = 'var(--success)';
        else if (percent >= 50) scorePath.style.stroke = 'var(--warning)';
        else scorePath.style.stroke = 'var(--danger)';

        document.getElementById('res-tempo').textContent = parecer.totais.tempo;
        document.getElementById('res-ambiguo').textContent = parecer.totais.ambiguo;
        
        document.getElementById('res-parecer').textContent = parecer.texto;
    }

    downloadBtn.addEventListener('click', () => {
        if (!currentGabarito) return;
        const jsonString = JSON.stringify(currentGabarito, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeName = currentStudentName.replace(/[^a-zA-Z0-9]/g, '_');
        a.download = `${safeName}_gabarito.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // Backup & Restore Logic
    exportBackupBtn.addEventListener('click', () => {
        window.location.href = '/api/backup';
    });

    importBackupBtn.addEventListener('click', () => {
        backupFileInput.click();
    });

    backupFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('backupZip', file);

        importBackupBtn.textContent = '⏳ Importando...';
        importBackupBtn.disabled = true;

        try {
            const response = await fetch('/api/restore', {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            
            if (response.ok) {
                alert('✅ Backup restaurado com sucesso!');
                // Reload students if on the historico tab
                if (document.querySelector('[data-tab="historico"]').classList.contains('active')) {
                    loadStudents();
                }
            } else {
                alert('❌ Erro: ' + result.error);
            }
        } catch (error) {
            console.error('Error importing backup:', error);
            alert('❌ Erro na comunicação com o servidor.');
        } finally {
            importBackupBtn.textContent = '📥 Importar';
            importBackupBtn.disabled = false;
            backupFileInput.value = ''; // Reset input
        }
    });
});
