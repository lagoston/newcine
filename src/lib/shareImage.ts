import { IS_NATIVE_APP } from './platform';

// Compartilhar / baixar uma imagem gerada no app (13/10/2026). Um caminho só
// para todos os botões de "compartilhar nos stories".
//
// Por quê: dentro do app Android (Capacitor) o WebView não tem
// navigator.share, e o <a download> não faz nada (o Capacitor não trata
// downloads) — os botões antigos mostravam "Imagem baixada!" sem baixar.
// Agora:
//   • no app: grava a imagem no cache do app (@capacitor/filesystem) e abre
//     a folha de compartilhar do Android (@capacitor/share). Os dois plugins
//     são importados só aqui dentro, então o site não baixa nada disso;
//   • no navegador: Web Share com o arquivo, quando o navegador deixa;
//   • senão: baixa o arquivo.
//
// Cancelar a folha de compartilhar não é erro: devolve 'cancelled'.

export type ShareImageRoute = 'native' | 'web-share' | 'download' | 'cancelled';

export interface ShareImageOptions {
  // Assunto (e-mail) / título do compartilhamento.
  title?: string;
  // Texto que acompanha a imagem. Alguns apps (stories) ignoram; deixe de
  // fora quando a imagem precisa ir sozinha.
  text?: string;
  // Título da folha de compartilhar (só Android).
  dialogTitle?: string;
}

// No app não existe "baixar" de verdade (o WebView não salva arquivos);
// as telas podem esconder o botão de baixar quando isto é false.
export const CAN_DOWNLOAD_IMAGE = !IS_NATIVE_APP;

const errorName = (err: unknown) => (err as { name?: string } | null)?.name ?? '';
const errorMessage = (err: unknown) => String((err as { message?: string } | null)?.message ?? err ?? '');

// Baixa o arquivo pelo navegador.
function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revogar na hora pode cancelar o download em alguns navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });

// Nome seguro para arquivo (sem barras, acentos estranhos ou espaços).
const safeFileName = (fileName: string) =>
  fileName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-') || 'cineoracle.png';

// App nativo: grava no cache e abre a folha de compartilhar do sistema.
// O cache-path do FileProvider (android/app/src/main/res/xml/file_paths.xml)
// já cobre a pasta de cache, que é a que o plugin de share usa.
async function shareNative(blob: Blob, fileName: string, opts: ShareImageOptions): Promise<ShareImageRoute> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const data = await blobToBase64(blob);
  const { uri } = await Filesystem.writeFile({
    path: `share/${safeFileName(fileName)}`,
    data,
    directory: Directory.Cache,
    recursive: true,
  });
  try {
    await Share.share({
      title: opts.title,
      text: opts.text,
      files: [uri],
      dialogTitle: opts.dialogTitle,
    });
    return 'native';
  } catch (err) {
    // Android/iOS rejeitam com "Share canceled" quando a pessoa fecha a folha.
    if (/cancel/i.test(errorMessage(err))) return 'cancelled';
    throw err;
  }
}

// Compartilha a imagem (folha do sistema no app; Web Share no navegador;
// senão baixa). Devolve o caminho usado. Lança erro só quando algo falhou
// de verdade (não ao cancelar).
//
// Na web, chame direto no toque do botão e com a imagem já pronta: o
// navigator.share exige um toque recente. Se o navegador recusar por isso
// (NotAllowedError), a imagem é baixada.
export async function shareImageFile(blob: Blob, fileName: string, opts: ShareImageOptions = {}): Promise<ShareImageRoute> {
  if (IS_NATIVE_APP) return shareNative(blob, fileName, opts);

  const file = new File([blob], fileName, { type: blob.type || 'image/png' });
  let canShareFile = false;
  try {
    canShareFile = typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    canShareFile = false;
  }
  if (canShareFile) {
    try {
      const data: ShareData = { files: [file] };
      if (opts.title) data.title = opts.title;
      if (opts.text) data.text = opts.text;
      await navigator.share(data);
      return 'web-share';
    } catch (err) {
      if (errorName(err) === 'AbortError') return 'cancelled';
      // NotAllowedError: o toque "venceu" (a imagem demorou) ou o navegador
      // bloqueou; TypeError/DataError: o arquivo não passou. Baixa.
      if (!['NotAllowedError', 'TypeError', 'DataError'].includes(errorName(err))) throw err;
    }
  }
  downloadBlob(blob, fileName);
  return 'download';
}

// Botão "Baixar": no navegador, baixa o arquivo. No app (onde não há como
// baixar), abre a folha de compartilhar — dali dá para salvar no Fotos /
// Arquivos.
export async function downloadImageFile(blob: Blob, fileName: string, opts: ShareImageOptions = {}): Promise<ShareImageRoute> {
  if (IS_NATIVE_APP) return shareNative(blob, fileName, opts);
  downloadBlob(blob, fileName);
  return 'download';
}
