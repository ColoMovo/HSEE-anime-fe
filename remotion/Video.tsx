import React, { useEffect, useRef, useState } from 'react';
import { useCurrentFrame, useVideoConfig, delayRender, continueRender, Audio, staticFile } from 'remotion';

export const GaokaoVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [handle] = useState(() => delayRender('Wait for BGM analysis'));
  const [isReady, setIsReady] = useState(false);

  const pageUrl = "http://localhost:4173/?remotion=true";

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Check if message is ready signal
      if (event.data && event.data.type === 'ready') {
        console.log('Iframe reported BGM analysis is ready.');
        setIsReady(true);
        try {
          continueRender(handle);
        } catch (e) {
          // ignore double call errors
        }
      }
    };
    window.addEventListener('message', handleMessage);
    
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [handle]);

  // Poll the check-ready status to ensure no race condition on load
  useEffect(() => {
    if (isReady) return;
    const interval = setInterval(() => {
      const iframe = iframeRef.current;
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'check-ready' }, '*');
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isReady]);

  // Synchronize the frame to the iframe via postMessage
  useEffect(() => {
    if (!isReady) return;
    const iframe = iframeRef.current;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'render-frame', frame }, '*');
    }
  }, [frame, isReady]);

  return (
    <div style={{ width: '100%', height: '100%', background: '#000', position: 'relative' }}>
      <iframe
        ref={iframeRef}
        src={pageUrl}
        style={{
          width: '1920px',
          height: '1080px',
          border: 'none',
          overflow: 'hidden',
          position: 'absolute',
          top: 0,
          left: 0,
        }}
        scrolling="no"
      />
      <Audio src={staticFile('Last Hope - Victor Cooper.flac')} />
    </div>
  );
};
