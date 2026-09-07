import React, { useEffect, useRef } from 'react';
import lottie, { AnimationItem } from 'lottie-web';
import animationData from '../../../loader.json';

interface AppLoaderProps {
  size?: number;
  label?: string;
  className?: string;
}

/** Shared Lottie loader used by every blocking or data-loading state. */
export const AppLoader: React.FC<AppLoaderProps> = ({ size = 72, label = 'Loading', className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    let animation: AnimationItem | undefined;
    try {
      animation = lottie.loadAnimation({
        container: containerRef.current,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData,
        rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
      });
    } catch {
      // Keep the accessible status element visible if an animation cannot mount.
    }
    return () => animation?.destroy();
  }, []);

  return (
    <div
      ref={containerRef}
      role="status"
      aria-label={label}
      className={`shrink-0 overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    />
  );
};
