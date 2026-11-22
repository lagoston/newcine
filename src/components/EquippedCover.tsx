import React, { Suspense } from 'react';
import { useAuth } from '../lib/auth';
import { useEquippedPoster } from '../lib/equippedPosters';
import type { MarkSize } from './posterJackpot/CollectorMark';

// O pôster equipado no lugar da capa, em qualquer ladrilho do site
// (22/11/2026; pedido do Bruno: "os pôsteres equipados pelo usuário devem se
// perpetuar para ele em todos os locais do site onde o título possa aparecer
// além da sua biblioteca").
//
// Uso: embrulhar a capa de sempre.
//   <EquippedCover id={movie.id} type={movie.media_type}>
//     <img src={...} className="absolute inset-0 w-full h-full object-cover" />
//   </EquippedCover>
//
// • Título sem pôster equipado (quase todos): devolve o filho como veio, sem
//   nenhum elemento a mais. Nada muda no desenho nem no carregamento.
// • Título com pôster equipado: o pôster da coleção, com o efeito (holográfico,
//   negativo, ultra vermelho, dourado), nas MESMAS classes e estilo do filho,
//   ou seja, na mesma caixa. Enquanto o desenho dos efeitos não chega (ele só
//   é baixado na primeira vez que um pôster equipado aparece), fica a capa
//   comum.
// • De quem é o pôster: de quem está OLHANDO, por padrão. Onde o título
//   pertence a outra pessoa (a biblioteca, o perfil e os stories de um amigo),
//   passe `owner`: aparece o pôster que o dono equipou.
// • Visitante (sem login) e `owner` vazio: sempre a capa comum.
const PosterArt = React.lazy(() => import('./posterJackpot/PosterArt'));

interface EquippedCoverProps {
  // id do TMDB do título (o que a tela tiver; texto ou número)
  id: number | string | null | undefined;
  // 'movie' | 'tv' (sem tipo = filme)
  type?: string | null;
  // de quem é o pôster equipado; por padrão, de quem está olhando
  owner?: string | null;
  // a marca de colecionador (cristal + número): só onde o ladrilho comporta
  mark?: MarkSize;
  // o tamanho da imagem do TMDB (padrão w342, o das grades)
  size?: 'w185' | 'w342' | 'w500';
  animated?: boolean;
  // quando a caixa do pôster não pode ser a do filho (ver os usos)
  className?: string;
  children: React.ReactElement<{ className?: string; style?: React.CSSProperties; alt?: string }>;
}

const EquippedCover: React.FC<EquippedCoverProps> = ({ id, type, owner, mark, size = 'w342', animated = true, className, children }) => {
  const { session } = useAuth();
  const ownerId = owner === undefined ? session?.user?.id ?? null : owner;
  const equipped = useEquippedPoster(ownerId, type, id);
  if (!equipped) return children;
  return (
    <Suspense fallback={children}>
      <PosterArt
        filePath={equipped.file_path}
        effect={equipped.effect}
        alt={children.props.alt ?? ''}
        size={size}
        animated={animated}
        className={className ?? children.props.className ?? ''}
        style={children.props.style}
        mark={mark ? { rarity: equipped.rarity, serial: equipped.serial, size: mark } : null}
      />
    </Suspense>
  );
};

export default React.memo(EquippedCover);
