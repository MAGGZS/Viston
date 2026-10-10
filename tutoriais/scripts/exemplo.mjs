#!/usr/bin/env node
/**
 * Gera o pacote de exemplo em `tutoriais/exemplo/`, para testar a central de
 * ajuda sem a gravação de verdade pronta.
 *
 *   node tutoriais/scripts/exemplo.mjs
 *
 * O pacote é de uma funcionalidade real do catálogo (por padrão
 * `primeiros-passos/primeiros-passos-entrar-codigo`, a menor), com os quatro
 * arquivos do contrato: um vídeo de tela colorida com contador de segundos
 * (H.264 e AAC, um tom no áudio), a legenda com a narração do roteiro, a capa
 * tirada do primeiro quadro e o `passos.json` com o hash do catálogo. Cada aba
 * dura `SEGUNDOS_POR_ABA` segundos.
 *
 * Precisa do `ffmpeg` no PATH. O texto do vídeo usa a fonte Arial do Windows
 * quando ela existe; fora do Windows, a fonte padrão do fontconfig.
 *
 * Para outra funcionalidade: `node tutoriais/scripts/exemplo.mjs <pasta> <id>`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acharFuncionalidade, parseRoteiro, ROTEIRO } from './catalogo.mjs';

const SEGUNDOS_POR_ABA = 5;
const AQUI = dirname(fileURLToPath(import.meta.url));
const SAIDA = resolve(AQUI, '..', 'exemplo');

const [pasta = 'primeiros-passos', id = 'primeiros-passos-entrar-codigo'] = process.argv.slice(2);
const catalogo = parseRoteiro(readFileSync(ROTEIRO, 'utf8'));
const func = acharFuncionalidade(catalogo, pasta, id);
if (!func) {
  console.error(`A funcionalidade ${pasta}/${id} não existe no catálogo.`);
  process.exit(1);
}

const duracao = func.abas.length * SEGUNDOS_POR_ABA;
mkdirSync(SAIDA, { recursive: true });

/** 00:00:05.000 */
function vtt(segundos) {
  const h = String(Math.floor(segundos / 3600)).padStart(2, '0');
  const m = String(Math.floor((segundos % 3600) / 60)).padStart(2, '0');
  const s = (segundos % 60).toFixed(3).padStart(6, '0');
  return `${h}:${m}:${s}`;
}

// Legenda: uma fala por aba, do início dela até o início da próxima.
const falas = func.abas.map((aba, i) => {
  const inicio = i * SEGUNDOS_POR_ABA;
  return `${i + 1}\n${vtt(inicio)} --> ${vtt(inicio + SEGUNDOS_POR_ABA - 0.2)}\n${aba.narracao}\n`;
});
writeFileSync(resolve(SAIDA, 'legenda.vtt'), `WEBVTT\n\n${falas.join('\n')}`, 'utf8');

const passos = {
  pasta,
  id: func.id,
  script_hash: func.script_hash,
  duracao_s: duracao,
  abas: func.abas.map((aba, i) => ({
    ordem: aba.ordem,
    titulo: aba.titulo,
    texto: aba.narracao,
    inicio_s: i * SEGUNDOS_POR_ABA,
  })),
};
writeFileSync(resolve(SAIDA, 'passos.json'), `${JSON.stringify(passos, null, 2)}\n`, 'utf8');

// O ffmpeg lê `:` como separador de opção no filtro; o caminho da fonte no
// Windows precisa do `:` do drive escapado.
const arial = 'C:/Windows/Fonts/arial.ttf';
const fonte = existsSync(arial) ? `fontfile='C\\:/Windows/Fonts/arial.ttf':` : '';
const titulo = `${pasta}/${func.id}`.replace(/[:']/g, ' ');
const filtro = [
  `drawtext=${fonte}text='${titulo}':x=(w-text_w)/2:y=40:fontsize=22:fontcolor=white`,
  `drawtext=${fonte}text='%{eif\\:t\\:d}s':x=(w-text_w)/2:y=(h-text_h)/2:fontsize=120:fontcolor=white`,
  `drawtext=${fonte}text='Aba %{eif\\:floor(t/${SEGUNDOS_POR_ABA})+1\\:d}':x=(w-text_w)/2:y=h-90:fontsize=36:fontcolor=0xF5C518`,
].join(',');

execFileSync(
  'ffmpeg',
  [
    '-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `color=c=0x1E293B:s=640x360:r=15:d=${duracao}`,
    '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=44100:duration=${duracao}`,
    '-vf', filtro,
    '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-crf', '32',
    '-c:a', 'aac', '-b:a', '48k',
    '-movflags', '+faststart', '-shortest',
    resolve(SAIDA, 'video.mp4'),
  ],
  { stdio: 'inherit' }
);

execFileSync(
  'ffmpeg',
  ['-y', '-loglevel', 'error', '-ss', '1', '-i', resolve(SAIDA, 'video.mp4'), '-frames:v', '1', '-q:v', '5', resolve(SAIDA, 'capa.jpg')],
  { stdio: 'inherit' }
);

console.log(`Pacote de exemplo de ${pasta}/${func.id} gerado em ${SAIDA}.`);
