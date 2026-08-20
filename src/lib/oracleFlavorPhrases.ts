export interface OracleFlavorPhrase {
  pt: string;
  en: string;
}

// Banco de frases características de cada oráculo, mostradas num balão
// junto ao selo do oráculo (MovieDetailsModal). As frases NÃO são
// separadas por humor — "Surpresa Aleatória" já é a união das outras 9
// pools de cada oráculo, então sortear de qualquer frase do oráculo já
// cobre esse caso naturalmente, sem precisar rastrear qual humor "trouxe"
// o filme até aqui.
export const ORACLE_FLAVOR_PHRASES: Record<string, OracleFlavorPhrase[]> = {
  bogart: [
    { pt: 'Esse aqui vira sua cabeça do avesso e ainda cobra reentrada.', en: 'This one turns your head inside out and still charges for a return trip.' },
    { pt: 'Não tenta entender de primeira. Ninguém entendeu.', en: 'Don\'t try to get it the first time. Nobody did.' },
    { pt: 'Depois desse, você sai da sala uma pessoa levemente diferente.', en: 'After this one, you leave the room a slightly different person.' },
    { pt: 'Lógica é ótima. Aqui ela não vai te ajudar em nada.', en: 'Logic is great. Here, it won\'t help you one bit.' },
    { pt: 'Pausa se precisar. Ninguém vai julgar. Eu já pausei três vezes.', en: 'Pause if you need to. No one will judge. I paused three times myself.' },
    { pt: 'Esse filme não te dá respostas, te dá mais perguntas caras de resolver.', en: 'This film doesn\'t give you answers, it gives you pricier questions.' },
    { pt: 'Sucesso de bilheteria com cara de experimento de laboratório. Combinação rara.', en: 'Box office hit with the face of a lab experiment. Rare combo.' },
    { pt: 'Assiste uma vez pra curtir, assiste de novo pra entender o que curtiu.', en: 'Watch it once to enjoy, watch it again to understand what you enjoyed.' },
    { pt: 'Esse sofá é confortável. Sua cabeça, depois disso, não vai ser mais.', en: 'This couch is comfortable. Your head, after this, won\'t be anymore.' },
    { pt: 'Tem filme que te entretém. Esse aqui te reprograma.', en: 'Some movies entertain you. This one reprograms you.' },
    { pt: 'Cinto apertado. Esse aqui não dá tempo pra pipoca esfriar.', en: 'Buckle up. This one doesn\'t give your popcorn time to go cold.' },
    { pt: 'Batimento acelerado é normal. Se não acelerou, procura um médico.', en: 'Racing heartbeat is normal. If it didn\'t race, see a doctor.' },
    { pt: 'Esse filme não pausa pra explicar nada. Ou acompanha, ou fica pra trás.', en: 'This film doesn\'t pause to explain anything. Keep up or get left behind.' },
    { pt: 'Blockbuster de verdade, do tipo que ainda sabe o que é tensão.', en: 'A real blockbuster, the kind that still knows what tension means.' },
    { pt: 'Levanta do sofá se conseguir. Eu não consegui.', en: 'Get up off the couch if you can. I couldn\'t.' },
    { pt: 'Esse ritmo aí a Cobra ia achar bonitinho demais. Mas pra gente, já é o suficiente.', en: 'The Snake would find this pace way too tame. But for us, it\'s plenty.' },
    { pt: 'Ação com orçamento e com propósito. Rara combinação essa.', en: 'Action with a budget and a purpose. Rare combination, that.' },
    { pt: 'Não é o tipo de filme que você assiste. É o tipo que você sobrevive.', en: 'Not the kind of movie you watch. The kind you survive.' },
    { pt: 'Todo mundo saiu do cinema com o coração dois andares mais alto.', en: 'Everyone left the theater with their heart two floors higher.' },
    { pt: 'Esse aqui é pipoca com adrenalina misturada no óleo.', en: 'This one\'s popcorn with adrenaline mixed into the oil.' },
    { pt: 'Pega sua mochila imaginária. Essa jornada vale a viagem.', en: 'Grab your imaginary backpack. This journey is worth the trip.' },
    { pt: 'Tem filme que te leva pra outro lugar. Esse aqui te leva pra outro mundo.', en: 'Some movies take you somewhere else. This one takes you to another world.' },
    { pt: 'Épico de verdade, do tipo que ainda acredita em final feliz merecido.', en: 'A real epic, the kind that still believes in an earned happy ending.' },
    { pt: 'Esse filme tem escala de mapa e coração do tamanho do mapa também.', en: 'This film has a map-sized scale and a heart just as big.' },
    { pt: 'Sofá vira tapete mágico por duas horas. Aproveita a viagem.', en: 'The couch becomes a magic carpet for two hours. Enjoy the ride.' },
    { pt: 'Grandioso sem ser bobo. Isso já é raro o suficiente pra recomendar.', en: 'Grand without being silly. That alone is rare enough to recommend.' },
    { pt: 'Esse aqui tem tudo: perigo, descoberta e uma trilha sonora que gruda.', en: 'This one has it all: danger, discovery, and a score that sticks.' },
    { pt: 'Cansei só de assistir. E olha que eu nem levantei do sofá.', en: 'I got tired just watching. And I didn\'t even leave the couch.' },
    { pt: 'Aventura popular, dessas que enchem sala e ainda merecem encher.', en: 'Popular adventure, the kind that fills theaters and actually deserves to.' },
    { pt: 'Bilheteria alta, ambição maior ainda. Combinação que funciona.', en: 'High box office, even higher ambition. A combo that works.' },
    { pt: 'Deixa a luz acesa. Não por mim, por você mesmo.', en: 'Leave the light on. Not for me, for yourself.' },
    { pt: 'Vi coisa pior que esse filme em quarenta anos de sofá. Mas não muita coisa.', en: 'I\'ve seen worse than this film in forty years on this couch. But not much worse.' },
    { pt: 'Esse aqui não te assusta com susto barato. Te assusta com ideia.', en: 'This one doesn\'t scare you with a cheap jump. It scares you with an idea.' },
    { pt: 'Tem medo antigo que a gente carrega antes mesmo de nascer. Esse filme sabe disso.', en: 'There\'s an ancient fear we carry before we\'re even born. This film knows it.' },
    { pt: 'Terror popular, do bom, do que ainda assombra depois dos créditos.', en: 'Popular horror, the good kind, the kind that still haunts after the credits.' },
    { pt: 'Dorme com a porta trancada hoje. Depois me agradece.', en: 'Sleep with the door locked tonight. Thank me later.' },
    { pt: 'Já vi esse escuro antes, num sonho ruim de décadas atrás. Ele voltou.', en: 'I\'ve seen this darkness before, in a bad dream from decades ago. It came back.' },
    { pt: 'Sucesso de bilheteria e pesadelo garantido. Combinação rara e eficiente.', en: 'Box office hit and guaranteed nightmare. A rare and efficient combo.' },
    { pt: 'Esse filme não pede desculpa por te deixar mal. Ele nem devia.', en: 'This film doesn\'t apologize for messing you up. It shouldn\'t have to.' },
    { pt: 'Sapo velho reconhece medo de longe. Esse aqui, eu senti da porta da sala.', en: 'An old frog recognizes fear from a distance. This one, I felt from the doorway.' },
    { pt: 'Prepara o lenço. Não pro choro, pro suor da mão de tanta emoção.', en: 'Get a tissue ready. Not for crying, for the sweaty palms from all the feeling.' },
    { pt: 'Amor de verdade, do tipo que a gente torce mesmo sabendo que vai doer.', en: 'Real love, the kind you root for even knowing it\'s going to hurt.' },
    { pt: 'Esse filme não é piegas. É só sincero, o que hoje em dia parece piegas.', en: 'This film isn\'t sappy. It\'s just sincere, which nowadays looks sappy.' },
    { pt: 'Casal de cinema desses, a gente não esquece nem querendo.', en: 'A movie couple like this, you don\'t forget even if you try.' },
    { pt: 'Romance popular que não insulta sua inteligência. Raridade e tanto.', en: 'Popular romance that doesn\'t insult your intelligence. Quite the rarity.' },
    { pt: 'Vai fazer você ligar pra alguém depois. Não diz que eu não avisei.', en: 'This is going to make you call someone afterward. Don\'t say I didn\'t warn you.' },
    { pt: 'Final feliz? Talvez. Final sincero? Com certeza.', en: 'Happy ending? Maybe. Honest ending? Definitely.' },
    { pt: 'Esse aqui prova que química na tela ainda existe, e ainda funciona.', en: 'This one proves on-screen chemistry still exists, and it still works.' },
    { pt: 'Bilheteria de romance que faz jus ao gênero. Vale o abraço no sofá.', en: 'Romance box office numbers that do the genre justice. Worth the couch cuddle.' },
    { pt: 'Sapo velho não chora fácil. Nesse aqui, quase.', en: 'An old frog doesn\'t cry easily. With this one, almost.' },
    { pt: 'Chama todo mundo pro sofá. Esse aqui é pra assistir junto mesmo.', en: 'Call everyone to the couch. This one\'s meant to be watched together.' },
    { pt: 'Criança ri, adulto se emociona escondido. Fórmula perfeita.', en: 'Kids laugh, adults get emotional on the sly. Perfect formula.' },
    { pt: 'Esse filme é gostoso igual chocolate quente. Aquece sem enjoar.', en: 'This film is as cozy as hot chocolate. Warms you up without overdoing it.' },
    { pt: 'Sucesso de bilheteria que a família inteira concorda. Isso já é milagre.', en: 'A box office hit the whole family agrees on. That alone is a miracle.' },
    { pt: 'Lição sem sermão. Assim que se ensina algo direito.', en: 'A lesson without a lecture. That\'s how you teach something right.' },
    { pt: 'Esse aqui vira clássico de domingo à tarde na sua casa. Confia.', en: 'This one becomes your house\'s Sunday afternoon classic. Trust me.' },
    { pt: 'Pipoca extra pra essa sessão. Vale o filme inteiro em pé aplaudindo.', en: 'Extra popcorn for this session. Worth a full standing ovation.' },
    { pt: 'Diverte sem infantilizar. Respeita quem assiste, seja qual for a idade.', en: 'Entertains without dumbing down. Respects the viewer, whatever their age.' },
    { pt: 'Esse filme é daqueles que três gerações assistem e todas gostam por motivos diferentes.', en: 'This is the kind of film three generations watch and each likes for different reasons.' },
    { pt: 'Sapo velho aprova. E olha que eu sou difícil de agradar depois de tanto sofá.', en: 'Old frog approves. And I\'m hard to please after this much couch time.' },
    { pt: 'Separa um tempo pra rir sem vergonha. Esse aqui não perdoa.', en: 'Set aside some time to laugh without shame. This one shows no mercy.' },
    { pt: 'Comédia popular que ainda arranca risada de verdade, não só sorrisinho educado.', en: 'Popular comedy that still gets real laughs, not just polite smiles.' },
    { pt: 'Esse filme é tipo pipoca: começa uma cena e você já quer a próxima.', en: 'This film is like popcorn: one scene starts and you already want the next.' },
    { pt: 'Ri até doer a barriga. Depois ri de novo porque doeu.', en: 'Laugh until it hurts. Then laugh again because it hurt.' },
    { pt: 'Timing de piada impecável. Isso não se ensina em escola nenhuma.', en: 'Impeccable comic timing. You can\'t teach that in any school.' },
    { pt: 'Bilheteria de comédia que não envelheceu mal. Raridade e tanto no gênero.', en: 'A comedy box office hit that didn\'t age badly. Quite the rarity in the genre.' },
    { pt: 'Esse aqui é antídoto pra dia ruim. Receita simples, efeito garantido.', en: 'This one\'s an antidote for a bad day. Simple recipe, guaranteed effect.' },
    { pt: 'Elenco com química de sobra. Risada contagia, e aqui contagia rápido.', en: 'Cast with chemistry to spare. Laughter is contagious, and here it spreads fast.' },
    { pt: 'Leve, popular e engraçado sem ser bobo. Combinação rara de achar.', en: 'Light, popular, and funny without being dumb. A rare combo to find.' },
    { pt: 'Sapo velho não ri fácil. Nesse aqui, gargalhei feio.', en: 'Old frog doesn\'t laugh easily. With this one, I cackled ugly.' },
    { pt: 'Não precisa de nada além de um sofá confortável pra essa viagem. Palavra de sapo.', en: 'You don\'t need anything but a comfy couch for this trip. Frog\'s word.' },
    { pt: 'Esse filme mexe com a cabeça sem pedir licença. E ainda faz sucesso de bilheteria.', en: 'This film messes with your head without asking permission. And it\'s still a box office hit.' },
    { pt: 'Visual que hipnotiza, roteiro que confunde de propósito. Funciona direitinho.', en: 'Visuals that hypnotize, a script that confuses on purpose. Works just fine.' },
    { pt: 'A Cobra ia adorar esse aqui. Mas garanto, popular como é, também merece seu tempo.', en: 'The Snake would love this one. But trust me, popular as it is, it still deserves your time.' },
    { pt: 'Esse filme não segue as regras do tempo nem do espaço. Só senta e aceita.', en: 'This film doesn\'t follow the rules of time or space. Just sit back and accept it.' },
    { pt: 'Sensorial de doer. Isso aqui é experiência, não só filme.', en: 'Sensory overload in the best way. This is an experience, not just a film.' },
    { pt: 'Bilheteria alta pra um filme desse tanto estranho. O público topou a viagem.', en: 'High box office for something this strange. The audience signed up for the trip.' },
    { pt: 'Esse aqui você não assiste, você atravessa.', en: 'This one you don\'t watch, you go through it.' },
    { pt: 'Trilha sonora e imagem grudam na sua cabeça por dias. Consideração pra quem tem compromisso amanhã.', en: 'Soundtrack and imagery stick in your head for days. Fair warning if you\'ve got plans tomorrow.' },
    { pt: 'Sapo velho viu muita coisa estranha nesse sofá. Esse filme ainda me surpreendeu.', en: 'Old frog has seen plenty of strange things on this couch. This film still surprised me.' },
    { pt: 'Esse filme não quer te fazer feliz. Quer te fazer sentir alguma coisa de verdade.', en: 'This film doesn\'t want to make you happy. It wants to make you feel something real.' },
    { pt: 'Prepara o peito pra apertar. Não tem como sair ileso desse.', en: 'Brace your chest for tightness. There\'s no leaving this one unscathed.' },
    { pt: 'Chorei igual não choro há anos. E olha que eu já vi muita coisa desse sofá.', en: 'I cried like I haven\'t in years. And I\'ve seen plenty from this couch.' },
    { pt: 'Esse filme dói de um jeito bom. Existe esse tipo de dor, e é esse aqui.', en: 'This film hurts in a good way. That kind of pain exists, and this is it.' },
    { pt: 'Sucesso de bilheteria que também sabe partir seu coração com classe.', en: 'A box office hit that also knows how to break your heart with class.' },
    { pt: 'Não é filme leve. Mas é filme necessário. Tem diferença.', en: 'Not a light film. But a necessary one. There\'s a difference.' },
    { pt: 'Depois desse, você vai precisar de um tempo antes de assistir qualquer outra coisa.', en: 'After this one, you\'ll need a moment before watching anything else.' },
    { pt: 'Esse filme te esvazia pra depois te encher de novo, diferente.', en: 'This film empties you out just to fill you back up, different.' },
    { pt: 'Elenco entregando tudo que tinha. Dá pra sentir cada centímetro disso na tela.', en: 'A cast giving everything they had. You can feel every inch of it on screen.' },
    { pt: 'Sapo velho não se emociona fácil depois de tantas décadas de sofá. Esse me pegou.', en: 'Old frog doesn\'t get emotional easily after this many decades on the couch. This one got me.' },
  ],
  fincher: [
    // TODO: 90 frases (9 humores x 10) — ainda não fornecidas
  ],
  cypher: [
    // TODO: 90 frases (9 humores x 10) — ainda não fornecidas
  ]
};

export function getRandomFlavorPhrase(oracle: string): OracleFlavorPhrase | null {
  const phrases = ORACLE_FLAVOR_PHRASES[oracle];
  if (!phrases || phrases.length === 0) return null;
  return phrases[Math.floor(Math.random() * phrases.length)];
}