import { useMemo, useState } from 'react';

import type { GalleryMediaItem } from 'src/_functions/galleryApi';

interface Props {
  media: GalleryMediaItem;
  alt: string;
  className?: string;
  onClick?: () => void;
  fit?: 'cover' | 'contain' | 'natural';
}

export default function ProgressiveMedia({ media, alt, className, onClick, fit = 'cover' }: Props) {
  const [loaded, setLoaded] = useState(false);

  const placeholder = useMemo(() => media.lowQualityUrl ?? media.thumbUrl ?? media.originalUrl, [media.lowQualityUrl, media.originalUrl, media.thumbUrl]);
  const interactiveClass = onClick ? 'cursor-pointer' : '';
  const fitClass = fit === 'natural'
    ? 'h-full w-auto object-contain'
    : fit === 'contain'
      ? 'h-full w-full object-contain'
      : 'h-full w-full object-cover';

  if (media.kind === 'video') {
    return (
      <video
        src={media.originalUrl}
        preload={`metadata`}
        controls
        className={`${className ?? ''} ${interactiveClass} ${fitClass}`}
        onClick={onClick}
        onDragStart={(event) => event.preventDefault()}
        draggable={false}
      />
    );
  }

  return (
    <div
      className={`relative overflow-hidden select-none ${className ?? ''} ${interactiveClass}`}
      onClick={onClick}
      onDragStart={(event) => event.preventDefault()}
      onKeyDown={(event) => {
      if (!onClick) return;
      if (event.key === 'Enter' || event.key === ' ') {
        onClick();
      }
    }}
      role={onClick ? `button` : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {!loaded && (
        <img
          src={placeholder}
          alt={alt}
          loading={`lazy`}
          className={`absolute inset-0 ${fitClass} blur-sm scale-105`}
          draggable={false}
        />
      )}
      <img
        src={media.originalUrl}
        alt={alt}
        loading={`lazy`}
        className={`${fitClass} transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        draggable={false}
      />
    </div>
  );
}