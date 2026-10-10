import { Eye, EyeOff, TriangleAlert, Video, VideoOff } from 'lucide-react';
import { Badge } from '@/app/components/ui';
import { estadoDoVideo, estadoDoVideoPorId, publicacaoDe, publicacaoPorId } from '@/app/lib/ajuda';

const ICONE_DO_VIDEO = { SEM_VIDEO: VideoOff, EM_DIA: Video, DESATUALIZADO: TriangleAlert };

/**
 * Os dois selos de uma funcionalidade no admin: publicação e vídeo.
 *
 * Cada um com o próprio ícone, e não só a cor: "Despublicado" e "Sem vídeo"
 * dividem o cinza neutro, e é o olho riscado ou a câmera riscada que os separa
 * de relance. O texto continua dizendo tudo sozinho, para quem não vê o ícone.
 */
export function SelosDoTutorial({ feature }) {
  const publicacao = publicacaoPorId(publicacaoDe(feature));
  const video = estadoDoVideoPorId(estadoDoVideo(feature));
  const IconePub = feature?.published ? Eye : EyeOff;
  const IconeVideo = ICONE_DO_VIDEO[video.id] ?? VideoOff;
  return (
    <>
      <Badge variant={publicacao.variant}>
        <IconePub size={13} aria-hidden="true" /> {publicacao.label}
      </Badge>
      <Badge variant={video.variant}>
        <IconeVideo size={13} aria-hidden="true" /> {video.label}
      </Badge>
    </>
  );
}
