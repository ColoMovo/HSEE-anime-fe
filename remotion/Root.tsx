import { Composition, registerRoot } from 'remotion';
import { GaokaoVideo } from './Video';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="gaokao-video"
        component={GaokaoVideo}
        durationInFrames={7680} // 128 seconds * 60 fps
        fps={60}
        width={1920}
        height={1080}
      />
    </>
  );
};

registerRoot(RemotionRoot);
