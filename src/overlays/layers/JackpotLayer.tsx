// A camada `jackpot`: a gaveta do Poster Jackpot desenhada pelo host de
// camadas (19/11/2026, Protocolo Reborn, onda 2b).
//
// Antes a gaveta só existia dentro da Home, e quem queria abri-la de outro
// lugar (sussurros, stories, pôquer, Premium, Sala do Diretor) navegava para
// '/' com location.state { openJackpot }: a página atual era desmontada e a
// Home inteira montada só para a gaveta abrir (medido na auditoria: 26
// chamadas ao banco, 8 delas do Jackpot). Agora
//   overlays.open('jackpot', { tab: 'trades' })
// abre a gaveta por cima da página em que a pessoa está, e fechar devolve a
// página como estava. O estado da roleta vem da camada de dados (uma leitura
// para a Home, o Perfil e esta gaveta).
import React, { useEffect, useRef } from 'react';
import GlassLoader from '../../components/GlassLoader';
import PosterJackpotSheet from '../../components/posterJackpot/PosterJackpotSheet';
import { useAuth } from '../../lib/auth';
import { loadJackpotFont, patchJackpotState, refreshJackpotState, useJackpotState } from '../../lib/posterJackpot';
import { useLayer } from '../hooks';
import type { JackpotParams } from '../registry';
import '../../styles/posterJackpot.css';
import '../../styles/flyingChip.css';

const reload = () => {
  void refreshJackpotState();
};

const JackpotLayer: React.FC<{ params: JackpotParams }> = ({ params }) => {
  const layer = useLayer();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const { data, error } = useJackpotState();
  const state = userId ? (data ?? null) : null;
  const enabled = !!state?.enabled;
  const close = layer.close;

  useEffect(() => {
    loadJackpotFont();
  }, []);

  // Sem conta, com erro, ou com o Jackpot fechado para esta pessoa: não há
  // gaveta para mostrar, a camada sai.
  const impossible = !userId || !!error || (state !== null && !enabled);
  useEffect(() => {
    if (impossible) close();
  }, [impossible, close]);

  // Avisa quem abriu, uma vez, quando a gaveta fecha por qualquer caminho.
  const told = useRef(false);
  const onCloseRef = useRef(params.onClose);
  onCloseRef.current = params.onClose;
  useEffect(() => {
    if (layer.open || told.current) return;
    told.current = true;
    onCloseRef.current?.();
  }, [layer.open]);

  if (!state || !enabled) {
    // o estado da roleta ainda não chegou (aberta fora da Home)
    return layer.open && !impossible ? (
      <div className="fixed inset-0 flex items-center justify-center bg-black/50" style={{ zIndex: layer.z }} role="status">
        <GlassLoader size="lg" />
      </div>
    ) : null;
  }
  return (
    <PosterJackpotSheet
      open={layer.open}
      onClose={close}
      state={state}
      onState={patchJackpotState}
      onReload={reload}
      initialTab={params.tab ?? 'machine'}
      dailyReward={params.dailyReward ?? null}
    />
  );
};

export default JackpotLayer;
