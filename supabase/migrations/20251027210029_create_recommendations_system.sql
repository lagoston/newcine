/*
  # Sistema de Recomendações de Filmes

  1. Nova Tabela
    - `recommendations` - Armazena recomendações de filmes entre usuários
      - `id` (uuid, primary key)
      - `from_user_id` (uuid, referência para profiles) - Quem recomenda
      - `to_user_id` (uuid, referência para profiles) - Quem recebe
      - `movie_id` (integer) - ID do filme no TMDB
      - `movie_title` (text) - Título do filme
      - `movie_poster` (text) - Caminho do poster
      - `message` (text) - Mensagem da recomendação
      - `read` (boolean) - Se foi lida
      - `created_at` (timestamptz) - Data de criação

  2. Mudanças
    - Remove tabela `predictions` (funcionalidade antiga)
    - Remove dados relacionados a predições
    - Cria nova tabela para recomendações

  3. Segurança
    - RLS habilitado
    - Usuários podem criar recomendações
    - Usuários podem ler recomendações recebidas
    - Usuários podem atualizar status de leitura
    - Usuários podem deletar recomendações recebidas
*/

-- Remove tabela de predições antiga
DROP TABLE IF EXISTS predictions CASCADE;

-- Cria tabela de recomendações
CREATE TABLE IF NOT EXISTS recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  to_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  movie_id integer NOT NULL,
  movie_title text NOT NULL,
  movie_poster text NOT NULL,
  message text NOT NULL,
  read boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_recommendations_to_user ON recommendations(to_user_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_from_user ON recommendations(from_user_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_created_at ON recommendations(created_at DESC);

-- Habilitar RLS
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

-- Políticas RLS

-- Usuários podem criar recomendações
CREATE POLICY "Users can create recommendations"
  ON recommendations
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = from_user_id);

-- Usuários podem ler recomendações recebidas
CREATE POLICY "Users can read received recommendations"
  ON recommendations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = to_user_id);

-- Usuários podem ler recomendações enviadas
CREATE POLICY "Users can read sent recommendations"
  ON recommendations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = from_user_id);

-- Usuários podem marcar recomendações como lidas
CREATE POLICY "Users can update read status"
  ON recommendations
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = to_user_id)
  WITH CHECK (auth.uid() = to_user_id);

-- Usuários podem deletar recomendações recebidas
CREATE POLICY "Users can delete received recommendations"
  ON recommendations
  FOR DELETE
  TO authenticated
  USING (auth.uid() = to_user_id);
