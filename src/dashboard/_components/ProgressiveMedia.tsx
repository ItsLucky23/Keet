import { useMemo, useState } from 'react';

import type { GalleryMediaItem } from 'src/_functions/galleryApi';

interface Props {
  media: GalleryMediaItem;
  alt: string;
  className?: string;
  onClick?: () => void;
}

export default function ProgressiveMedia({ media, alt, className, onClick }: Props) {
  const [loaded, setLoaded] = useState(false);

  const placeholder = useMemo(() => media.lowQualityUrl ?? media.thumbUrl ?? media.originalUrl, [media.lowQualityUrl, media.originalUrl, media.thumbUrl]);
  const interactiveClass = onClick ? 'cursor-pointer' : '';

  if (media.kind === 'video') {
    return (
      <video
        src={media.originalUrl}
        preload={`metadata`}
        controls
        className={`${className ?? ''} ${interactiveClass}`}
        onClick={onClick}
      />
    );
  }

  return (
    <div className={`relative overflow-hidden ${className ?? ''} ${interactiveClass}`} onClick={onClick} onKeyDown={(event) => {
      if (!onClick) return;
      if (event.key === 'Enter' || event.key === ' ') {
        onClick();
      }
    }} role={onClick ? `button` : undefined} tabIndex={onClick ? 0 : undefined}>
      {!loaded && (
        <img
          src={placeholder}
          alt={alt}
          loading={`lazy`}
          className={`absolute inset-0 h-full w-full object-cover blur-sm scale-105`}
        />
      )}
      <img
        src={media.originalUrl}
        alt={alt}
        loading={`lazy`}
        className={`h-full w-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}