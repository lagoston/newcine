/**
 * Liberação do salão no cliente (03/11/2026, aviso do coordenador): o main publica
 * sozinho, então `/blefe` só mostra o jogo quando o servidor diz que o poker está
 * aberto para a conta (`get_poker_home().enabled`). Enquanto o pokerApi (pacote C)
 * não existe, quem decide é esta constante, que fica `false` em produção e só a
 * prévia local liga (VITE_POKER_PREVIEW=1).
 */
export const POKER_PREVIEW: boolean = import.meta.env.VITE_POKER_PREVIEW === '1';
