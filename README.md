# Controle de Chamada

Aplicação web para **controle de chamada e gestão escolar**: cadastros, registro
de presença em sala, grade semanal de aulas, dashboard e relatórios exportáveis.

Interface no estilo SaaS moderno (paleta ardósia + índigo), com Dark/Light Mode,
otimizada para o uso em tablet durante a aula e totalmente responsiva.

---

## Executando

Requer apenas **Node.js 18+** — não há dependências para instalar.

```bash
npm start
```

Depois abra <http://localhost:5173>.

> **Por que um servidor?** A aplicação usa módulos ES (`<script type="module">`),
> que o navegador bloqueia via CORS quando o arquivo é aberto direto do disco
> (`file://`). O `server.js` incluído é um servidor estático de ~50 linhas, sem
> dependências, só para servir os arquivos por HTTP.

**A aplicação abre com a base vazia.** O dashboard exibe uma tela de *Primeiros
passos* que conduz a sequência de cadastro — disciplinas → professores → turmas
→ alunos → horários → primeira chamada — marcando o progresso e liberando cada
etapa conforme as dependências são atendidas. Assim que a primeira chamada é
registrada, o dashboard passa a mostrar os indicadores de frequência.

Para avaliar o sistema com dados prontos, use **Dados e backup** (rodapé do menu
lateral) → **Restaurar dados de demonstração**: 6 professores, 10 disciplinas,
4 turmas, 93 alunos e ~10 semanas de histórico de chamadas.

---

## Estrutura de arquivos

```
controle-chamada/
├── index.html                  # Shell da página e carregamento dos módulos
├── server.js                   # Servidor estático (zero dependências)
├── package.json
│
├── assets/styles/
│   ├── base.css                # Design tokens, reset, tipografia, temas
│   ├── components.css          # Botões, campos, cards, tabelas, modais, toasts
│   └── layout.css              # Shell, navegação, telas, responsividade, impressão
│
└── src/
    ├── main.js                 # Ponto de entrada: shell, rotas, backup dos dados
    │
    ├── core/                   # Regras e infraestrutura (sem DOM, exceto dom.js)
    │   ├── store.js            # Estado, persistência em localStorage e pub/sub
    │   ├── seed.js             # Massa de demonstração (só sob ação explícita)
    │   ├── analytics.js        # Agregações de frequência (KPIs e relatórios)
    │   ├── router.js           # Roteador por hash com parâmetros na URL
    │   ├── utils.js            # Datas, formatação, ordenação, busca sem acento
    │   ├── export.js           # Geração de CSV e de documento para PDF
    │   ├── icons.js            # Ícones Lucide embutidos como SVG
    │   └── dom.js              # Helpers de DOM e `escapeHtml`
    │
    ├── ui/                     # Componentes reutilizáveis
    │   ├── table.js            # Tabela com busca, ordenação e paginação
    │   ├── modal.js            # Modais, confirmação e erros de validação
    │   ├── toast.js            # Notificações efêmeras
    │   └── theme.js            # Alternância claro/escuro
    │
    └── pages/                  # Uma tela por arquivo
        ├── dashboard.js
        ├── attendance.js       # Chamada interativa (funcionalidade central)
        ├── students.js
        ├── classes.js          # Turmas e disciplinas (abas)
        ├── teachers.js
        ├── schedule.js         # Dias e horários
        └── reports.js
```

---

## Módulos

### Dashboard
Enquanto não houver nenhuma chamada registrada, exibe a tela de **Primeiros
passos**: a sequência de cadastro com progresso, contagem do que já existe e a
próxima etapa em destaque — as etapas que dependem de outras ficam desabilitadas
até que a dependência seja atendida.

A partir da primeira chamada, mostra KPIs de presença do dia e do mês, total de
aulas dadas e contagem de alunos em risco de infrequência; série de presença dos
últimos 14 dias, lista dos alunos com maior percentual de falta e consolidado
por turma.

### Chamada (funcionalidade central)
Filtros de **turma**, **disciplina** e **data** no topo; lista com foto, nome e
número de chamada; botões de um toque para **Presente (P)**, **Ausente (F)** e
**Justificada (J)**. Inclui:

- ações em lote — *Marcar todos presentes*, *Inverter seleção* e *Limpar*;
- observação individual por aluno (ex.: "entrou após 15 min");
- resumo ao vivo com contagens e percentual de presença;
- gravação com feedback, indicador de chamada já registrada e **bloqueio**
  para consolidar a aula;
- aviso quando a data escolhida não consta na grade semanal da turma;
- confirmação antes de descartar marcações não gravadas ao trocar de filtro.

### Cadastros
- **Professores** — nome, e-mail, matrícula (única) e disciplinas ministradas.
- **Turmas & Disciplinas** — turma com professor responsável, sala, carga
  horária e disciplinas; disciplinas em aba própria.
- **Alunos** — nome, número de chamada, matrícula, foto e vínculo com turmas.
- **Dias e Horários** — grade semanal por turma, com detecção de conflito de
  horário.

Cada tela permite excluir **um registro por vez** (ícone na linha) ou **todos de
uma vez** (botão no canto do cabeçalho da tabela). A exclusão em massa aplica as
mesmas cascatas da individual e sempre pede confirmação, informando o que será
removido junto. Em Alunos, o botão respeita o filtro de turma: com uma turma
selecionada ele exclui apenas os alunos dela.

### Relatórios
Filtros por período, turma, disciplina e aluno, em duas visões — **por aluno**
(consolidado de P/F/J e situação) e **por aula** (uma linha por chamada, para
auditoria). Exportação em **CSV** e **PDF**.

---

## Decisões técnicas

**Stack: HTML5 + CSS moderno + JavaScript (módulos ES), sem build.**
O que se ganha é execução imediata e zero dependências para auditar ou atualizar;
o custo é não ter as garantias de um sistema de tipos nem renderização
declarativa. Para o tamanho deste escopo a troca compensa, e a divisão em
`core` / `ui` / `pages` mantém o caminho aberto para migrar telas para um
framework sem reescrever as regras de negócio.

**Persistência em `localStorage`, isolada no `store.js`.**
Nenhuma tela lê ou escreve o armazenamento diretamente — todas passam pelas
funções do store, que são síncronas e granulares. Trocar por uma API REST
significa reescrever só esse arquivo.

**Datas sempre como string `YYYY-MM-DD`.**
Evita o clássico erro de fuso em que `new Date('2026-03-10')` cai no dia 9 em
fusos negativos como o do Brasil. A conversão para `Date` local está
centralizada em `fromISODate`.

**Percentual de presença = `P / (P + F + J)`.**
A falta justificada abona a ausência para fins disciplinares, mas não conta como
aula assistida. A regra vive só em `analytics.js`; se a escola adotar outro
critério, é o único ponto a alterar.

**PDF por impressão do navegador.**
Em vez de embutir uma biblioteca de PDF de centenas de KB, o relatório é montado
como um documento HTML limpo em um iframe oculto e enviado para `print()`. O
usuário escolhe "Salvar como PDF" no diálogo do próprio navegador.

**Escape obrigatório de dados do usuário.**
As telas montam HTML como string, então todo dado vindo do usuário passa por
`escapeHtml` (`e()` nos templates) antes de ser interpolado.

**Um elemento novo por navegação.**
Cada rota recebe um container recém-criado, e as telas registram seus listeners
nele por delegação. Descartar o container garante que nenhum handler sobreviva à
troca de tela — sem isso, revisitar uma página faria cada clique disparar
múltiplas vezes.

---

## Dados e backup

Os dados ficam **no navegador do dispositivo** (`localStorage`), não no servidor.
Reiniciar o servidor não altera nem apaga nada; abrir em outro navegador ou em
outra máquina significa começar de uma base vazia.

Em **Dados e backup** (rodapé do menu lateral) é possível exportar a base como
JSON, importar um backup, restaurar os dados de demonstração ou apagar tudo.

Limpar os dados de navegação do browser apaga a base — exporte um backup antes
de trocar de máquina.

A chave de armazenamento carrega a versão do formato (`cc.database.v2`). Quando
o formato muda, a chave é incrementada e as bases das versões anteriores são
descartadas na carga — foi assim que a base de demonstração da v1, que ficava
presa no navegador de quem já havia aberto o sistema, deixou de reaparecer.

---

## Acessibilidade

Navegação completa por teclado, foco preso dentro de modais e devolvido ao
elemento de origem ao fechar, `aria-pressed` nos botões de status, `aria-live`
nos toasts, rótulos em todos os campos e respeito a `prefers-reduced-motion`.
