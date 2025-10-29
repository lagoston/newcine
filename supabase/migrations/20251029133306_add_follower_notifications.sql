/*
  # Adicionar Notificações de Seguidores

  1. Mudanças na tabela recommendations
    - Adiciona coluna `type` (text) - Tipo de notificação: 'movie' ou 'follower'
    - Torna campos relacionados a filmes opcionais
    - Adiciona índice para type
  
  2. Nova tabela follower_notifications_log
    - Rastreia notificações de seguidores enviadas
    - Previne spam (máximo 1 notificação por dia por seguidor)
    - `id` (uuid, primary key)
    - `from_user_id` (uuid) - Quem seguiu
    - `to_user_id` (uuid) - Quem foi seguido
    - `created_at` (timestamptz)
  
  3. Segurança
    - RLS habilitado em follower_notifications_log
    - Políticas para controle de acesso

  4. Função Helper
    - `can_send_follower_notification` - Verifica se pode enviar notificação
*/

-- Adicionar coluna type à tabela recommendations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recommendations' AND column_name = 'type'
  ) THEN
    ALTER TABLE recommendations ADD COLUMN type text DEFAULT 'movie' NOT NULL;
  END IF;
END $$;

-- Tornar campos de filme opcionais (nullable)
ALTER TABLE recommendations ALTER COLUMN movie_id DROP NOT NULL;
ALTER TABLE recommendations ALTER COLUMN movie_title DROP NOT NULL;
ALTER TABLE recommendations ALTER COLUMN movie_poster DROP NOT NULL;
ALTER TABLE recommendations ALTER COLUMN message DROP NOT NULL;

-- Adicionar constraint para type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recommendations_type_check'
  ) THEN
    ALTER TABLE recommendations ADD CONSTRAINT recommendations_type_check 
      CHECK (type IN ('movie', 'follower'));
  END IF;
END $$;

-- Criar índice para type
CREATE INDEX IF NOT EXISTS idx_recommendations_type ON recommendations(type);

-- Criar tabela de log de notificações de seguidores
CREATE TABLE IF NOT EXISTS follower_notifications_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  to_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_follower_log_users ON follower_notifications_log(from_user_id, to_user_id);
CREATE INDEX IF NOT EXISTS idx_follower_log_created ON follower_notifications_log(created_at DESC);

-- Habilitar RLS
ALTER TABLE follower_notifications_log ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para follower_notifications_log
CREATE POLICY "Users can read own notification logs"
  ON follower_notifications_log
  FOR SELECT
  TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "System can insert notification logs"
  ON follower_notifications_log
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = from_user_id);

-- Função para verificar se pode enviar notificação de seguidor
CREATE OR REPLACE FUNCTION can_send_follower_notification(
  p_from_user_id uuid,
  p_to_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  last_notification timestamptz;
BEGIN
  -- Buscar última notificação enviada
  SELECT created_at INTO last_notification
  FROM follower_notifications_log
  WHERE from_user_id = p_from_user_id
    AND to_user_id = p_to_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Se não houver notificação anterior, pode enviar
  IF last_notification IS NULL THEN
    RETURN true;
  END IF;

  -- Se última notificação foi há mais de 24 horas, pode enviar
  IF last_notification < (now() - interval '24 hours') THEN
    RETURN true;
  END IF;

  -- Caso contrário, não pode enviar (anti-spam)
  RETURN false;
END;
$$;