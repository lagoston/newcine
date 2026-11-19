import React from 'react';

// A camada de movimento dos banners (18/11/2026, Protocolo Reborn, bateria A7).
//
// Alguns banners têm um desenho que anda POR BAIXO de uma máscara parada: as
// brasas do Motoqueiro somem ao subir, as bolhas da cerveja só aparecem dentro
// do líquido, a neve de Game of Thrones some para o lado do texto. Antes isso
// era um pseudo-elemento só, andando com background-position — e o navegador
// repintava o banner inteiro a cada quadro (617–785 ms de CPU por segundo num
// banner só, medido). Para andar com transform (só na placa de vídeo) a
// máscara precisa ficar num elemento e o desenho em outro, dentro dele: é este
// <span> (a máscara) e o ::before dele (o desenho que desliza). O desenho de
// cada banner continua em src/styles/cosmetics.css e cosmeticKits.css
// (.co-banner--<id> > .co-banner-fx).
//
// Quem desenha um banner (a classe de getBannerClass) põe <BannerFx /> como
// ÚLTIMO filho dele. Nos banners que não usam, o span não aparece (display:
// none). Sem o span, o banner fica só sem esse movimento.
export const BannerFx: React.FC = () => <span aria-hidden className="co-banner-fx" />;

export default BannerFx;
