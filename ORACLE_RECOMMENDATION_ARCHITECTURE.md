# 🔮 Arquitetura do Oráculo de Recomendação - Análise Técnica Detalhada

## Visão Geral do Sistema

O **Oráculo de Recomendação** é um sistema de sugestão de filmes baseado em **humor/mood** do usuário, que usa IA generativa (DeepSeek) para selecionar o filme perfeito de um pool pré-filtrado de opções.

**Diferença fundamental vs. Previsão:**
- **Previsão:** Analisa o histórico do usuário para prever nota de um filme específico
- **Recomendação:** Sugere UM filme novo (que o usuário não possui) baseado apenas no humor atual

---

## 🎯 Fluxo Completo do Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                    1. USUÁRIO ESCOLHE MOOD                       │
│   Ex: "Adrenalina", "Preciso Chorar", "Mente Expandida"        │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              2. FRONTEND MONTA OS DADOS (React)                  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ A. Busca Biblioteca do Usuário (libraryMovies)          │  │
│  │    RPC: get_user_library(user_id)                       │  │
│  │    Retorna: [1234, 5678, 9012, ...]                     │  │
│  │    (IDs dos filmes que o usuário JÁ possui)             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ B. Busca Pool de Candidatos (moviePool)                 │  │
│  │    RPC: get_all_movie_ids(user_id)                      │  │
│  │    Retorna: [1111, 2222, 3333, ..., 9999] (500 filmes) │  │
│  │    (Filmes que o usuário NÃO possui, randomizados)      │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│         3. ENVIA REQUEST PARA EDGE FUNCTION (Backend)            │
│                                                                   │
│  POST /functions/v1/recommend-movie                             │
│  Body: {                                                         │
│    userId: "abc-123",                                           │
│    mood: "Adrenalina",                                          │
│    libraryMovieIds: [1234, 5678, 9012, ...],  ← BLACKLIST     │
│    moviePool: [1111, 2222, 3333, ...],        ← WHITELIST      │
│    language: "pt"                                               │
│  }                                                              │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│          4. VALIDAÇÕES E CONSUMO DE TICKETS                      │
│                                                                   │
│  ✓ Verificar se tem >= 50 tickets                              │
│  ✓ Verificar se tem >= 15 filmes avaliados                     │
│  ✓ Consumir 50 tickets                                         │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│            5. MONTA PROMPT PARA IA (DeepSeek)                    │
│                                                                   │
│  Prompt Structure:                                               │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ # Constraints                                          │   │
│  │ ✓ ONLY pick from these IDs: [1111, 2222, 3333, ...]  │   │
│  │ ✗ NEVER suggest these: [1234, 5678, 9012, ...]       │   │
│  │                                                        │   │
│  │ # Target Mood                                          │   │
│  │ "Adrenalina"                                          │   │
│  │                                                        │   │
│  │ # Instructions                                         │   │
│  │ 1. Analyze mood deeply                                │   │
│  │ 2. Select ONE film from allowed pool                  │   │
│  │ 3. Format: **[Title] ([Year])**: [Reason]            │   │
│  └────────────────────────────────────────────────────────┘   │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              6. IA ESCOLHE O FILME PERFEITO                      │
│                                                                   │
│  DeepSeek API (temperature: 0.8, max_tokens: 200)              │
│                                                                   │
│  Output Example:                                                 │
│  "**Mad Max: Fury Road (2015)**: Ação cinética sem parar       │
│   e intensidade visceral o tornam ideal para descarga          │
│   de adrenalina pura."                                          │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                7. RETORNA RECOMENDAÇÃO                           │
│                                                                   │
│  Response: {                                                     │
│    recommendation: "**Mad Max: Fury Road (2015)**: ...",       │
│    mood: "Adrenalina",                                          │
│    ticketsRemaining: 250                                        │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 Construção do Movie Pool - Análise Detalhada

### **1. Biblioteca do Usuário (libraryMovieIds) - BLACKLIST**

**Função RPC:**
```sql
CREATE OR REPLACE FUNCTION get_user_library(user_id_input uuid)
RETURNS TABLE (movie_id integer)
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT um.movie_id
  FROM user_movies um
  WHERE um.user_id = user_id_input;
END;
$$;
```

**O que faz:**
- Busca **TODOS** os filmes que o usuário já possui na biblioteca
- Inclui filmes avaliados, watchlist, favoritos - qualquer filme na `user_movies`
- **Propósito:** Criar uma BLACKLIST para evitar recomendar filmes que o usuário já conhece

**Exemplo de resultado:**
```json
[
  {"movie_id": 550},      // Fight Club
  {"movie_id": 13},       // Forrest Gump
  {"movie_id": 155},      // The Dark Knight
  {"movie_id": 238},      // The Godfather
  // ... todos os filmes do usuário
]
```

**Processamento no Frontend:**
```typescript
const { data: libraryData } = await supabase
  .rpc('get_user_library', { user_id_input: session.user.id });

const libraryMovieIds = libraryData.map(item => item.movie_id);
// Resultado: [550, 13, 155, 238, ...]
```

---

### **2. Pool de Candidatos (moviePool) - WHITELIST**

**Função RPC:**
```sql
CREATE OR REPLACE FUNCTION get_all_movie_ids(user_id_input uuid)
RETURNS TABLE (movie_id integer)
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT m.id
  FROM movies m
  WHERE m.id NOT IN (
    SELECT um.movie_id
    FROM user_movies um
    WHERE um.user_id = user_id_input
  )
  ORDER BY random()    -- ← RANDOMIZAÇÃO!
  LIMIT 500;          -- ← LIMITE DE 500 FILMES
END;
$$;
```

**O que faz:**

#### **A. Filtragem Inicial**
```sql
WHERE m.id NOT IN (
  SELECT um.movie_id FROM user_movies um WHERE um.user_id = user_id_input
)
```
- Exclui TODOS os filmes que o usuário já possui
- Garante que apenas filmes novos sejam considerados

#### **B. Randomização**
```sql
ORDER BY random()
```
- **CRÍTICO:** Embaralha a ordem dos filmes
- Cada consulta retorna um conjunto diferente de 500 filmes
- Evita sempre recomendar os mesmos filmes (ex: apenas blockbusters populares)
- **Benefício:** Descobre filmes obscuros, cult, indie, internacionais

#### **C. Limitação**
```sql
LIMIT 500
```
- Retorna apenas 500 filmes aleatórios do banco
- **Razão:** Enviar todos os IDs (potencialmente 50.000+) seria inviável no prompt
- 500 é um equilíbrio entre:
  - ✅ Diversidade suficiente para a IA escolher
  - ✅ Tamanho de prompt gerenciável
  - ✅ Performance da query

**Exemplo de resultado:**
```json
[
  {"movie_id": 27205},    // Inception
  {"movie_id": 680},      // Pulp Fiction
  {"movie_id": 372058},   // Your Name
  {"movie_id": 122},      // The Lord of the Rings
  {"movie_id": 1891},     // The Empire Strikes Back
  // ... 495 outros filmes randomizados
]
```

**Processamento no Frontend:**
```typescript
const { data: poolData } = await supabase
  .rpc('get_all_movie_ids', { user_id_input: session.user.id });

const moviePool = poolData.map(item => item.movie_id);
// Resultado: [27205, 680, 372058, 122, 1891, ...]
```

---

## 🧠 Engenharia do Prompt - Como a IA Escolhe

### **Estrutura do Prompt**

```
Você é o motor de recomendação do CineOracle.

# Restrições
✓ APENAS escolha destes IDs: [27205, 680, 372058, ..., 9999]  ← 500 filmes
✗ NUNCA sugira estes: [550, 13, 155, ...]                     ← Biblioteca do usuário

# Humor Alvo
"Adrenalina"

# Instruções
1. Analise o humor profundamente—que emoções, temas, ritmo ou tons ele implica?
2. Selecione UM filme do pool permitido que melhor capture este humor
3. Formate sua resposta EXATAMENTE como:
   **[Título] ([Ano])**: [Uma frase convincente]

# Exemplos
- **Mad Max: Fury Road (2015)**: Ação cinética sem parar...
- **Blade Runner 2049 (2017)**: Questões existenciais...
```

### **Por que esse design funciona:**

#### **1. Restrições Duplas (Whitelist + Blacklist)**
```typescript
✓ ONLY pick from: [1111, 2222, 3333, ...]  // moviePool (500 filmes novos)
✗ NEVER suggest: [1234, 5678, 9012, ...]   // libraryMovieIds (filmes do usuário)
```

**Vantagem:** A IA nunca recomenda um filme que o usuário já possui, garantindo sempre uma descoberta nova.

#### **2. Análise Profunda do Mood**
```
"Analise o humor profundamente—que emoções, temas, ritmo ou tons ele implica?"
```

A IA não apenas mapeia literalmente (Adrenalina → Ação), mas entende nuances:
- **"Adrenalina"** → Pode sugerir thriller psicológico intenso, não só ação
- **"Preciso Chorar"** → Drama emocional, não necessariamente triste
- **"Mente Expandida"** → Sci-fi filosófico, experimental, não linear

#### **3. Formato Controlado**
```
**[Título] ([Ano])**: [Justificativa em uma frase]
```

Garante resposta estruturada e facilmente parseable para o frontend.

#### **4. Temperature 0.8**
```typescript
temperature: 0.8,  // ← Mais criativo que o padrão (0.7)
max_tokens: 200    // ← Resposta curta e direta
```

**Efeito:** A IA é encorajada a ser ousada e surpreendente, não óbvia.

---

## 🎲 Por que a Randomização é Genial

### **Sem Randomização (Problema)**
```sql
SELECT m.id FROM movies m
WHERE m.id NOT IN (...)
LIMIT 500;  -- ← Sempre os mesmos 500 primeiros IDs
```

**Resultado:** IA sempre recomendaria dos mesmos 500 filmes
- Tenderia a escolher blockbusters populares
- Filmes "escondidos" no banco nunca seriam descobertos
- Experiência repetitiva

### **Com Randomização (Solução)**
```sql
ORDER BY random()
LIMIT 500;
```

**Resultado:** Cada consulta retorna 500 filmes diferentes
- **Consulta 1:** [Mad Max, Inception, Parasite, ...]
- **Consulta 2:** [Oldboy, Eternal Sunshine, Amélie, ...]
- **Consulta 3:** [Memories of Murder, Drive, Moon, ...]

**Benefícios:**
1. ✅ **Descoberta de Joias Ocultas:** Filmes cult, indie, internacionais
2. ✅ **Diversidade Cultural:** Não apenas Hollywood
3. ✅ **Recomendações Frescas:** Nunca a mesma sugestão duas vezes
4. ✅ **Surpreender o Usuário:** "Como ele achou esse filme?!"

---

## 🔬 Exemplo Real de Execução

### **Cenário:**
- Usuário: Bruno (@brunooaps)
- Biblioteca: 500 filmes
- Mood escolhido: "Mente Expandida"

### **Passo 1: Frontend busca dados**
```typescript
// Biblioteca do Bruno (BLACKLIST)
libraryMovieIds = [550, 13, 155, 238, 424, ...] // 500 filmes

// Pool de candidatos (WHITELIST - randomizado)
moviePool = [389, 13475, 38142, 694, 78, ...] // 500 filmes aleatórios
```

### **Passo 2: Edge Function recebe request**
```json
{
  "userId": "abc-123",
  "mood": "Mente Expandida",
  "libraryMovieIds": [550, 13, 155, ...], // 500 IDs
  "moviePool": [389, 13475, 38142, ...]   // 500 IDs
}
```

### **Passo 3: Prompt para DeepSeek**
```
# Restrições
✓ APENAS: [389, 13475, 38142, 694, 78, ...]
✗ NUNCA: [550, 13, 155, 238, 424, ...]

# Humor Alvo
"Mente Expandida"
```

### **Passo 4: IA analisa e escolhe**

**Raciocínio interno da IA:**
1. "Mente Expandida" sugere: narrativa não-linear, filosofia, experimentos visuais
2. Escaneia o moviePool
3. Identifica candidatos:
   - 389 = "12 Monkeys" (viagem no tempo paradoxal)
   - 13475 = "Star Trek" (sci-fi filosófico)
   - 78 = "Blade Runner" (questões existenciais)
4. Escolhe o mais adequado: **Blade Runner**

### **Passo 5: Resposta final**
```json
{
  "recommendation": "**Blade Runner (1982)**: Suas questões existenciais sobre humanidade e identidade em um futuro distópico expandem a mente através de uma narrativa filosófica envolta em neon.",
  "mood": "Mente Expandida",
  "ticketsRemaining": 250
}
```

---

## 📊 Comparação: Previsão vs. Recomendação

| Aspecto | Câmara de Previsão | Câmara de Recomendação |
|---------|-------------------|------------------------|
| **Input** | Nome do filme específico | Mood/Humor do usuário |
| **Dados Usados** | Perfil + 5 filmes relevantes + Âncora TMDB | Apenas moviePool + libraryMovieIds |
| **Output** | Nota prevista (0-10) + Análise | 1 filme recomendado + Justificativa |
| **Tickets** | 100 tickets | 50 tickets |
| **Complexidade** | Alta (modelo híbrido) | Média (seleção baseada em mood) |
| **Personalização** | Extrema (perfil IRX, etc.) | Baixa (apenas mood) |
| **Objetivo** | Prever compatibilidade | Descobrir novos filmes |

---

## 🎯 Vantagens da Arquitetura Atual

### **1. Simplicidade Eficaz**
- Não precisa de perfil de personalidade
- Não precisa de análise de histórico
- Apenas mood + pool filtrado

### **2. Descoberta Genuína**
- Randomização garante filmes sempre diferentes
- Usuário descobre filmes que nunca procuraria
- Não limitado por seus gostos conhecidos

### **3. Performance**
- Pool de 500 filmes é pequeno o suficiente
- Prompt enxuto (apenas IDs)
- Resposta rápida (~2-3 segundos)

### **4. Custo Controlado**
- Apenas 50 tickets (vs. 100 da Previsão)
- Max 200 tokens de resposta
- Sem múltiplas chamadas ao TMDB

### **5. Zero Spoilers**
- IA não conhece detalhes dos filmes (apenas IDs)
- Resposta baseada apenas em conhecimento geral
- Justificativa genérica, sem revelar plot

---

## 🚀 Possíveis Melhorias Futuras

### **1. Usar Perfil de Personalidade**
```typescript
// Em vez de apenas mood, também considerar:
{
  mood: "Adrenalina",
  archetypeCode: "IRX",  // ← Arquétipo do usuário
  genrePreferences: ["Sci-Fi", "Thriller"]  // ← Top 3 gêneros
}
```

**Prompt atualizado:**
```
# Usuário
Perfil: Arquiteto do Caos Experimental (IRX)
Gêneros favoritos: Sci-Fi, Thriller, Drama

# Mood
"Adrenalina"

→ IA escolheria "Inception" (Thriller Sci-Fi) em vez de "Fast & Furious" (Ação pura)
```

### **2. Pool Inteligente (Filtrado por Gênero)**
```sql
-- Em vez de random puro, favorecer gêneros do usuário
ORDER BY
  CASE
    WHEN genre IN (user_top_genres) THEN 1
    ELSE 2
  END,
  random()
LIMIT 500;
```

### **3. Evitar Recomendações Recentes**
```typescript
// Não recomendar filmes que o Oráculo já sugeriu nos últimos 30 dias
neverSuggest: [...libraryMovieIds, ...recentRecommendations]
```

### **4. Feedback Loop**
```typescript
// Se usuário adiciona filme recomendado à biblioteca:
markRecommendationAsSuccessful(movieId, mood);

// IA aprende quais moods funcionam melhor para quais filmes
```

---

## 🎭 Conclusão

O **Oráculo de Recomendação** é um sistema elegantemente simples que resolve um problema complexo:

**"Como sugerir filmes que o usuário vai amar, mas nunca procuraria sozinho?"**

**Solução:**
1. ✅ Randomizar pool de candidatos (diversidade)
2. ✅ Filtrar biblioteca do usuário (novidade garantida)
3. ✅ Usar IA generativa com mood (personalização leve)
4. ✅ Resposta rápida e barata (experiência ágil)

É o equilíbrio perfeito entre **simplicidade técnica** e **magia percebida** pelo usuário. 🔮✨
