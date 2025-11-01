# 🎯 Guia de Rebalanceamento de Gêneros

## Como Fazer um Rebalanceamento

Sempre que você quiser ajustar os pesos dos gêneros, siga este processo:

### 1️⃣ Criar Nova Migração

```bash
# O nome deve ser descritivo
filename: adjust_drama_weights
```

### 2️⃣ Atualizar a Função `get_genre_base_points`

Na migração, use `CREATE OR REPLACE FUNCTION`:

```sql
CREATE OR REPLACE FUNCTION get_genre_base_points(genre_name text)
RETURNS TABLE (e numeric, i numeric, c numeric, s numeric, r numeric)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN QUERY SELECT
    CASE genre_name
      WHEN 'Drama' THEN 3.0  -- Seu novo valor
      -- ... resto dos gêneros
      ELSE 0.0
    END as e,
    -- ... outros espectros
END;
$$;
```

### 3️⃣ Executar Recálculo Automático

No final da migração, adicione:

```sql
SELECT auto_recalculate_after_rebalance('Motivo da mudança: Ex: Ajuste Drama para melhor distribuição');
```

### 4️⃣ Verificar Resultado

```sql
-- Ver último rebalanceamento
SELECT * FROM genre_rebalance_history ORDER BY rebalanced_at DESC LIMIT 1;

-- Ver distribuição de arquétipos atualizada
SELECT
  arquetipo_primario,
  COUNT(*) as usuarios,
  ROUND(AVG(pontos_e), 2) as avg_e,
  ROUND(AVG(pontos_i), 2) as avg_i,
  ROUND(AVG(pontos_c), 2) as avg_c,
  ROUND(AVG(pontos_s), 2) as avg_s,
  ROUND(AVG(pontos_r), 2) as avg_r
FROM profiles
WHERE arquetipo_primario IS NOT NULL
GROUP BY arquetipo_primario
ORDER BY usuarios DESC;
```

---

## ⚙️ Sistema Automático

O sistema **SEMPRE** executa automaticamente:

1. ✅ Recalcula **TODOS os usuários** com os novos pesos
2. ✅ Registra no log (`genre_rebalance_log`)
3. ✅ Mostra estatísticas (sucesso, falhas, tempo)
4. ✅ Mantém histórico completo

---

## 📊 Matriz de Gêneros Atual (19 Gêneros)

| Gênero | E | I | C | S | R | Total |
|--------|---|---|---|---|---|-------|
| Action | 0 | 0 | 0 | 4 | 1 | 5 |
| Adventure | 0 | 0 | 3 | 0 | 2 | 5 |
| Animation | 0 | 0 | 0 | 0 | 5 | 5 |
| Comedy | 0 | 0 | 0 | 0 | 5 | 5 |
| Crime | 1 | 1 | 1 | 2 | 0 | 5 |
| Documentary | 0 | 0 | 5 | 0 | 0 | 5 |
| **Drama** | **3** | **1** | **0** | **1** | **0** | **5** |
| Family | 0 | 0 | 0 | 0 | 5 | 5 |
| Fantasy | 0 | 0 | 0 | 4 | 1 | 5 |
| History | 0 | 1 | 4 | 0 | 0 | 5 |
| Horror | 0 | 0 | 0 | 5 | 0 | 5 |
| Music | 0 | 0 | 0 | 5 | 0 | 5 |
| Mystery | 0 | 5 | 0 | 0 | 0 | 5 |
| Romance | 5 | 0 | 0 | 0 | 0 | 5 |
| Science Fiction | 0 | 4 | 0 | 1 | 0 | 5 |
| Thriller | 0 | 5 | 0 | 0 | 0 | 5 |
| TV Movie | 0 | 0 | 0 | 0 | 5 | 5 |
| War | 0 | 0 | 5 | 0 | 0 | 5 |
| Western | 0 | 0 | 5 | 0 | 0 | 5 |

**Legenda:**
- **E** = Emocional
- **I** = Intelectual
- **C** = Cultural
- **S** = Sensorial
- **R** = Recreativo

---

## 🔍 Consultas Úteis

### Ver Histórico Completo de Rebalanceamentos

```sql
SELECT
  id,
  rebalanced_at,
  reason,
  total_users,
  users_successful,
  execution_time_seconds || 's' as tempo
FROM genre_rebalance_history
ORDER BY rebalanced_at DESC;
```

### Validar Todos os Gêneros

```sql
SELECT
  genre,
  e + i + c + s + r as total,
  CASE WHEN e + i + c + s + r = 5 THEN '✅' ELSE '❌' END as ok
FROM (
  SELECT 'Drama' as genre, * FROM get_genre_base_points('Drama')
  UNION ALL SELECT 'Action', * FROM get_genre_base_points('Action')
  -- ... adicione todos os 19 gêneros
) all_genres;
```

### Testar Impacto de um Gênero

```sql
-- Quantos usuários têm filmes de Drama avaliados?
SELECT COUNT(DISTINCT um.user_id) as usuarios_afetados
FROM user_movies um
JOIN movie_genres_cache mgc ON mgc.movie_id = um.movie_id
WHERE um.rating IS NOT NULL
  AND mgc.genres @> '[{"name": "Drama"}]'::jsonb;
```

---

## ⚠️ Regras Importantes

1. **Cada gênero DEVE somar exatamente 5 pontos**
2. **SEMPRE execute `auto_recalculate_after_rebalance()` após alterar pesos**
3. **Documente o motivo do rebalanceamento** no parâmetro da função
4. **Valores negativos nos usuários são normais** (representam aversão)

---

## 📈 Impacto do Último Rebalanceamento

**Data:** 2025-11-01 21:34:38
**Alteração:** Drama E=4→3, S=0→1
**Resultado:**
- ✅ 13 usuários recalculados com sucesso
- ⏱️ Tempo: 0.55 segundos
- 📊 Nova distribuição:
  - Intelectuais (I): 7 usuários
  - Recreativos (R): 4 usuários
  - Emocionais (E): 2 usuários

---

## 🚀 Exemplo Completo de Rebalanceamento

```sql
/*
  # Ajustar Romance para distribuir melhor entre E e I

  Antes: Romance E=5, I=0, C=0, S=0, R=0
  Depois: Romance E=4, I=1, C=0, S=0, R=0
*/

-- 1. Atualizar função
CREATE OR REPLACE FUNCTION get_genre_base_points(genre_name text)
RETURNS TABLE (e numeric, i numeric, c numeric, s numeric, r numeric)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN QUERY SELECT
    CASE genre_name
      WHEN 'Romance' THEN 4.0  -- AJUSTADO
      -- ... outros gêneros
      ELSE 0.0
    END as e,
    CASE genre_name
      WHEN 'Romance' THEN 1.0  -- AJUSTADO
      -- ... outros gêneros
      ELSE 0.0
    END as i,
    -- ... resto
END;
$$;

-- 2. Recalcular automaticamente
SELECT auto_recalculate_after_rebalance('Romance: E=5→4, I=0→1 para adicionar componente intelectual');

-- 3. Verificar resultado
SELECT * FROM genre_rebalance_history ORDER BY rebalanced_at DESC LIMIT 1;
```

---

## 📞 Troubleshooting

### Problema: Recálculo não executou

```sql
-- Executar manualmente
SELECT auto_recalculate_after_rebalance('Recálculo manual');
```

### Problema: Usuário específico com dados incorretos

```sql
-- Recalcular apenas um usuário
SELECT recalculate_user_spectrogram_with_cache('user-uuid-aqui');
```

### Problema: Cache de gêneros desatualizado

```sql
-- Verificar status do cache
SELECT check_cache_status();

-- Popular cache via edge function se necessário
-- Chamar: /functions/v1/populate-genres-cache
```
