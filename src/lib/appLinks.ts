// Links do site abrindo DENTRO do app (20/11/2026, Protocolo Reborn, fecho).
//
// Alguém manda no WhatsApp https://cineoracle.com/?o=title.movie.27205 (o
// endereço que o site mostra com o menu de um título aberto) ou o perfil de um
// amigo. Sem isto o link abre no navegador mesmo com o app instalado. O Android
// entrega o link ao app (o filtro está no AndroidManifest.xml) e o Capacitor
// avisa pelo evento `appUrlOpen`, tanto com o app já aberto quanto na partida;
// este arquivo leva o link para a página certa e abre a camada pedida.
//
// Só vale dentro do app nativo: quem chama é lib/nativeShell.ts, que o site não
// baixa.
//
// O que NÃO entra aqui (e fica de fora do filtro do AndroidManifest.xml):
// /auth e /reset-password. São os links de convite, de confirmação de e-mail e
// de troca de senha: continuam abrindo no navegador, como sempre.
import { hostReady, openAddress, readAddress } from '../overlays/host';

// O site fica em cineoracle.com (o www redireciona para lá); o filtro do
// Android só entrega esse, o www fica aceito para o dia em que mudar.
const HOSTS = new Set(['cineoracle.com', 'www.cineoracle.com']);
// A MESMA lista do <intent-filter> de android/app/src/main/AndroidManifest.xml.
// Mudou aqui, muda lá (e vice-versa): lá diz o que o Android entrega, aqui o
// que o app aceita.
const acceptsPath = (pathname: string): boolean => pathname === '/' || pathname.startsWith('/profile/');

export interface LinkTarget {
  // caminho + busca dentro do app, já sem o `o` (a camada)
  href: string;
  // o endereço da camada (`title.movie.27205`), se o link trouxe um
  layer: string | null;
  // o link traz uma senha de uso único (confirmação de e-mail que caiu na
  // página inicial): só o Supabase sabe ler, e só na ABERTURA da página
  reload: boolean;
}

// O que fazer com um link. null = não é nosso (outro site, outra página): o app
// só vem para a frente, sem mexer em nada.
export function linkTarget(url: string): LinkTarget | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || !HOSTS.has(parsed.hostname.toLowerCase())) return null;
  if (!acceptsPath(parsed.pathname)) return null;
  const params = parsed.searchParams;
  const reload = /(^#|&)(access_token|refresh_token|error_description)=/.test(parsed.hash) || params.has('code') || params.has('token_hash');
  if (reload) return { href: parsed.pathname + parsed.search + parsed.hash, layer: null, reload: true };
  const layer = params.get('o');
  params.delete('o');
  const search = params.toString();
  return { href: parsed.pathname + (search ? `?${search}` : ''), layer, reload: false };
}

// Troca de página sem recarregar. O roteador (BrowserRouter) escuta o
// `popstate` e lê o endereço da janela; a entrada vai na forma que ele mesmo
// grava ({ usr, key, idx }) e com uma chave NOVA: as camadas abertas pertencem
// à página em que abriram (overlays/host.ts fecha as de outra chave), então as
// que estavam na tela fecham e a que abrirmos em seguida fica.
function go(href: string): void {
  const state = window.history.state as { idx?: unknown } | null;
  const idx = typeof state?.idx === 'number' ? state.idx + 1 : 1;
  const key = `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  window.history.pushState({ usr: null, key, idx }, '', href);
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
}

// Na partida do app o link chega antes de o anfitrião de camadas estar na tela:
// espera por ele (até 15 s; passou disso, fica só a página).
const LAYER_WAIT_MS = 250;
const LAYER_TRIES = 60;
let layerTimer: number | undefined;
function openLayer(address: string, tries = LAYER_TRIES): void {
  window.clearTimeout(layerTimer);
  if (!hostReady()) {
    if (tries > 0) layerTimer = window.setTimeout(() => openLayer(address, tries - 1), LAYER_WAIT_MS);
    return;
  }
  const wanted = readAddress(address);
  if (wanted) openAddress(wanted);
}

// Devolve true se o link era nosso e foi atendido.
export function openAppLink(url: string): boolean {
  const target = linkTarget(url);
  if (!target) return false;
  if (target.reload) {
    // abre o endereço como o site abriria: o Supabase lê a senha na partida
    window.location.replace(target.href);
    return true;
  }
  window.clearTimeout(layerTimer);
  if (target.href !== window.location.pathname + window.location.search) go(target.href);
  if (target.layer) openLayer(target.layer);
  return true;
}
