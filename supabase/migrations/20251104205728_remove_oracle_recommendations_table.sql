/*
  # Remove Oracle Recommendations Table

  1. Changes
    - Drop oracle_recommendations table (não é mais necessária)
    - Remove políticas RLS associadas
  
  2. Reason
    - Sistema de histórico de recomendações não é mais utilizado
    - Filtro de biblioteca já é suficiente para evitar repetições
*/

-- Drop table (cascade remove todas as políticas e constraints)
DROP TABLE IF EXISTS oracle_recommendations CASCADE;
