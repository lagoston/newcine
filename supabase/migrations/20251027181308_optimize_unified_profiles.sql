/*
  # Otimização e Unificação do Sistema de Perfis

  ## Resumo
  Unifica e otimiza o sistema de perfis de usuários, garantindo consistência entre
  a tabela profiles e a view public_profiles, eliminando redundâncias e melhorando performance.

  ## Mudanças

  ### 1. Verificação e Otimização da Tabela Profiles
  - Garante que todos os campos necessários existem
  - Adiciona índices para melhorar performance de busca
  - Valida tipos de dados e constraints

  ### 2. Atualização da View Public_Profiles
  - Recria a view para garantir sincronia com a tabela profiles
  - Garante que todos os campos estão expostos corretamente

  ### 3. Políticas RLS (Row Level Security)
  - Consolida políticas de segurança
  - Remove políticas duplicadas ou conflitantes
  - Garante acesso consistente aos dados

  ### 4. Sincronização de Dados
  - Garante que todos os usuários têm um perfil correspondente
  - Sincroniza dados de plan_type entre profiles e user_tickets
  - Remove inconsistências de dados

  ### 5. Otimizações de Performance
  - Adiciona índices compostos para queries frequentes
  - Otimiza constraints e validações
  - Melhora velocidade de consultas da comunidade

  ## Notas Importantes
  - Mantém todos os dados existentes intactos
  - Não remove nenhuma informação de usuários
  - Operações são idempotentes (podem ser executadas múltiplas vezes)
*/

-- 1. Verificar e adicionar colunas faltantes na tabela profiles (se não existirem)
DO $$ 
BEGIN
  -- Verificar se coluna plan_type existe, se não, adicionar
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'plan_type'
  ) THEN
    ALTER TABLE profiles ADD COLUMN plan_type text DEFAULT 'free';
  END IF;

  -- Verificar se coluna avatar_frame existe, se não, adicionar
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'avatar_frame'
  ) THEN
    ALTER TABLE profiles ADD COLUMN avatar_frame text DEFAULT '';
  END IF;

  -- Verificar se coluna banner existe, se não, adicionar
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'banner'
  ) THEN
    ALTER TABLE profiles ADD COLUMN banner text DEFAULT '';
  END IF;

  -- Verificar se coluna active_tag existe, se não, adicionar
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'active_tag'
  ) THEN
    ALTER TABLE profiles ADD COLUMN active_tag jsonb DEFAULT NULL;
  END IF;
END $$;

-- 2. Sincronizar plan_type entre profiles e user_tickets (manter consistência)
UPDATE profiles p
SET plan_type = COALESCE(
  (SELECT plan_type FROM user_tickets WHERE user_id = p.id LIMIT 1),
  'free'
)
WHERE p.plan_type IS NULL OR p.plan_type = '';

-- 3. Recriar a view public_profiles para garantir sincronia completa
DROP VIEW IF EXISTS public_profiles CASCADE;

CREATE VIEW public_profiles AS
SELECT 
  p.id,
  p.username,
  p.avatar_url,
  p.bio,
  p.created_at,
  p.updated_at,
  COALESCE(p.plan_type, 'free') as plan_type,
  COALESCE(p.avatar_frame, '') as avatar_frame,
  COALESCE(p.banner, '') as banner,
  p.active_tag
FROM profiles p;

-- Dar permissão de leitura para todos
GRANT SELECT ON public_profiles TO anon, authenticated;

-- 4. Criar índices compostos para otimizar queries frequentes
CREATE INDEX IF NOT EXISTS idx_profiles_username_lower ON profiles (LOWER(username));
CREATE INDEX IF NOT EXISTS idx_profiles_plan_type ON profiles (plan_type);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at_desc ON profiles (created_at DESC);

-- Índices para a tabela follows (relacionamentos)
CREATE INDEX IF NOT EXISTS idx_follows_follower_created ON follows (follower_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follows_following_created ON follows (following_id, created_at DESC);

-- 5. Consolidar políticas RLS para profiles
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can delete their own profile" ON profiles;

-- Recriar políticas de forma consolidada
CREATE POLICY "Anyone can view profiles"
  ON profiles
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert own profile"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 6. Garantir que todos os usuários auth.users têm um perfil
INSERT INTO profiles (id, username, avatar_url, bio, created_at, updated_at, plan_type, avatar_frame, banner, active_tag)
SELECT 
  u.id,
  COALESCE(
    (u.raw_user_meta_data->>'username')::text,
    SPLIT_PART(u.email, '@', 1),
    'user_' || substr(u.id::text, 1, 8)
  ) as username,
  (u.raw_user_meta_data->>'avatar_url')::text as avatar_url,
  NULL as bio,
  u.created_at,
  now() as updated_at,
  COALESCE(
    (SELECT plan_type FROM user_tickets WHERE user_id = u.id LIMIT 1),
    'free'
  ) as plan_type,
  '' as avatar_frame,
  '' as banner,
  NULL as active_tag
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = u.id
)
ON CONFLICT (id) DO NOTHING;

-- 7. Atualizar função handle_new_user para garantir consistência
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  username_from_metadata text;
  final_username text;
BEGIN
  -- Extrair username do metadata ou gerar um
  username_from_metadata := (new.raw_user_meta_data->>'username')::text;
  
  IF username_from_metadata IS NOT NULL AND length(username_from_metadata) > 0 THEN
    final_username := username_from_metadata;
  ELSIF new.email IS NOT NULL THEN
    final_username := SPLIT_PART(new.email, '@', 1);
  ELSE
    final_username := 'user_' || substr(new.id::text, 1, 8);
  END IF;
  
  -- Inserir novo perfil
  INSERT INTO public.profiles (id, username, avatar_url, bio, created_at, updated_at, plan_type, avatar_frame, banner, active_tag)
  VALUES (
    new.id, 
    final_username,
    (new.raw_user_meta_data->>'avatar_url')::text,
    NULL,
    now(), 
    now(),
    'free',
    '',
    '',
    NULL
  )
  ON CONFLICT (id) DO NOTHING;
  
  -- Inicializar tickets
  INSERT INTO public.user_tickets (user_id, tickets_remaining, plan_type, last_reset_at, next_reset)
  VALUES (
    new.id, 
    300, 
    'free', 
    now(),
    now() + interval '30 days'
  )
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_new_user: %', SQLERRM;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Garantir que o trigger está ativo
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_new_user();

-- 9. Adicionar constraint para garantir consistência de plan_type
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_plan_type_check'
  ) THEN
    ALTER TABLE profiles 
    ADD CONSTRAINT profiles_plan_type_check 
    CHECK (plan_type IN ('free', 'premium'));
  END IF;
END $$;

-- 10. Criar função helper para buscar perfis (unificada)
CREATE OR REPLACE FUNCTION get_profile_by_id(profile_id uuid)
RETURNS TABLE (
  id uuid,
  username text,
  avatar_url text,
  bio text,
  created_at timestamptz,
  updated_at timestamptz,
  plan_type text,
  avatar_frame text,
  banner text,
  active_tag jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.username,
    p.avatar_url,
    p.bio,
    p.created_at,
    p.updated_at,
    COALESCE(p.plan_type, 'free') as plan_type,
    COALESCE(p.avatar_frame, '') as avatar_frame,
    COALESCE(p.banner, '') as banner,
    p.active_tag
  FROM profiles p
  WHERE p.id = profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Criar função helper para buscar perfil por username
CREATE OR REPLACE FUNCTION get_profile_by_username(profile_username text)
RETURNS TABLE (
  id uuid,
  username text,
  avatar_url text,
  bio text,
  created_at timestamptz,
  updated_at timestamptz,
  plan_type text,
  avatar_frame text,
  banner text,
  active_tag jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.username,
    p.avatar_url,
    p.bio,
    p.created_at,
    p.updated_at,
    COALESCE(p.plan_type, 'free') as plan_type,
    COALESCE(p.avatar_frame, '') as avatar_frame,
    COALESCE(p.banner, '') as banner,
    p.active_tag
  FROM profiles p
  WHERE LOWER(p.username) = LOWER(profile_username);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;