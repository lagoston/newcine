interface GhostRiderFrameProps {
  /** URL da foto do usuário (frente do cartão). */
  src: string;
  alt?: string;
  /** Tamanho do avatar em pixels. */
  size?: number;
  className?: string;
}

/**
 * Ghost Rider Frame (Motoqueiro Fantasma)
 *
 * Adaptado do protótipo original (que usava Next.js + shadcn + cn()/
 * tailwind-merge, nenhum dos quais existe nesse projeto) — trocado por
 * template string simples, o mesmo padrão usado em todo o resto do site
 * pra combinar className condicional (ver getFrameClass em lib/frames.ts).
 *
 * Diferente dos frames baseados só em className (ring/shadow/::before),
 * este precisa de duas faces reais — frente (foto) e verso (caveira) — e
 * de estrutura 3D com giro. Por isso é um componente próprio, não uma
 * entrada de className em frames.ts (ver o comentário em frames.ts sobre
 * renderType:'component').
 *
 * A cada 10s o cartão gira em rotateY contínuo (sempre "para dentro"),
 * revela a caveira flamejante cuspindo fogo para além da borda, segura
 * por um instante e gira de volta. Toda a animação vive em CSS
 * (keyframes em tailwind.config.js, classes estruturais em index.css),
 * então roda sozinha sem estado nem timers.
 *
 * ATENÇÃO — risco conhecido a testar visualmente: o index.css do projeto
 * já tem uma regra global em toda tag <img> (transform: translateZ(0);
 * backface-visibility: hidden; will-change: auto;) — uma otimização
 * antiga contra flickering ao rolar a página. Isso força toda <img> pra
 * sua própria camada de composição na GPU, o que já causou um bug
 * documentado no Frame do Transformers (clip-path do pai não recortando
 * o filho de forma consistente). Aqui o risco é mais sério: esse
 * componente depende de backface-visibility:hidden para ESCONDER POR
 * COMPLETO a face de trás durante o giro — se a regra global da <img>
 * interferir na herança dessa propriedade, a foto ou a caveira podem
 * "vazar" através da face errada em alguns navegadores/GPUs. Precisa de
 * teste visual real em pelo menos Safari iOS e Chrome Android antes de
 * ativar em produção.
 */
export function GhostRiderFrame({ src, alt = '', size = 160, className = '' }: GhostRiderFrameProps) {
  return (
    <div
      // ring movido pra cá, no container mais externo — não participa
      // do preserve-3d/rotateY nem tem backface-visibility:hidden
      // (esses ficam só nas faces internas). Descoberto que era essa a
      // causa real da borda não aparecer: box-shadow (como o Tailwind
      // implementa ring) combinado com um elemento que TEM
      // backface-visibility:hidden e PARTICIPA de um contexto 3D
      // rotativo (mesmo estando "de frente", visível) tem seu
      // box-shadow renderizado de forma inconsistente/suprimido em
      // vários motores de navegador — um comportamento diferente do
      // ring "normal" nos frames convencionais (2D, sem rotação, sem
      // backface-visibility). Aqui, no container que só fica parado
      // (é o "palco" onde a rotação acontece, não o que rotaciona), o
      // ring sempre visível, sem depender de qual face está de frente.
      className={`ghost-rider-scene relative rounded-full ring-4 ring-[#c5b358] animate-ghost-rider-glow ${className}`}
      style={{ width: size, height: size }}
    >
      <div className="ghost-rider-card animate-ghost-rider-flip relative h-full w-full rounded-full">
        {/* FRENTE — foto do usuário */}
        <div className="ghost-rider-face absolute inset-0 overflow-hidden rounded-full">
          <img
            src={src || '/placeholder.svg'}
            alt={alt}
            className="h-full w-full object-cover"
            crossOrigin="anonymous"
          />
        </div>

        {/* VERSO — caveira cuspindo fogo. overflow visível deixa as chamas
            passarem da borda circular. */}
        <div className="ghost-rider-face ghost-rider-back absolute inset-0 rounded-full">
          {/* base circular escura (o "disco" atrás da caveira) */}
          <div className="absolute inset-0 rounded-full bg-[#0a0400]" />
          {/* brilho de fogo interno */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                'radial-gradient(circle at 50% 38%, rgba(249,115,22,0.55), rgba(120,20,0,0.15) 55%, transparent 72%)',
            }}
          />
          {/* a caveira flamejante — escala > 1 e sem clip para o fogo vazar.
              mix-blend-mode: screen faz o fundo preto da imagem sumir,
              deixando só a caveira e o fogo brilharem por cima. */}
          <img
            src="/ghost-rider-skull.webp"
            alt="Caveira do Motoqueiro Fantasma cuspindo fogo"
            className="animate-ghost-rider-fire absolute left-1/2 top-1/2 max-w-none"
            style={{
              width: size * 1.6,
              height: size * 1.6,
              mixBlendMode: 'screen',
              // desvanece as bordas da imagem até transparência total,
              // eliminando o corte reto e a película cinza do fundo preto
              WebkitMaskImage:
                'radial-gradient(circle at 50% 50%, black 42%, rgba(0,0,0,0.4) 55%, transparent 68%)',
              maskImage:
                'radial-gradient(circle at 50% 50%, black 42%, rgba(0,0,0,0.4) 55%, transparent 68%)',
            }}
            crossOrigin="anonymous"
          />
        </div>
      </div>
    </div>
  );
}

export default GhostRiderFrame;