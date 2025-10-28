/*
  # Adicionar função get_user_premium_status

  Cria função simples que retorna boolean indicando se usuário é premium,
  usada pelo frontend para verificação rápida de status.
*/

CREATE OR REPLACE FUNCTION get_user_premium_status(user_id_input uuid)
RETURNS boolean AS $$
BEGIN
  RETURN is_premium_active(user_id_input);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_user_premium_status IS 'Retorna true se usuário tem assinatura premium ativa, false caso contrário';