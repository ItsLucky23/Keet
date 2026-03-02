import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useTranslator } from 'src/_functions/translator';
import type { GalleryMediaItem } from 'src/_functions/galleryApi';

interface Props {
  items: GalleryMediaItem[];
  activeIndex: number;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

export default function MediaLightbox({ items, activeIndex, onClose, onNext, onPrevious }: Props) {
  const translate = useTranslator();
  const navigate = useNavigate();

  const active = useMemo(() => items[activeIndex], [items, activeIndex]);
  if (!active) return null;

  return (
    <div className={`fixed inset-0 z-50 flex flex-col bg-black/90`}>
      <div className={`flex items-center justify-between p-3`}>
        <button className={`rounded-lg border border-container1-border bg-container1 px-3 py-1 text-title`} onClick={onClose}>
          {translate({ key: 'gallery.close' })}
        </button>
        <div className={`flex items-center gap-2`}>
          {active.folder && (
            <button
              className={`rounded-lg border border-container1-border bg-container1 px-3 py-1 text-title`}
              onClick={() => {
                void navigate(`/dashboard/${active.folder}`);
                onClose();
              }}
            >
              {translate({ key: 'gallery.goToAlbum' })}
            </button>
          )}
        </div>
      </div>

      <div className={`flex flex-1 items-center justify-center gap-2 p-2`}>
        <button className={`rounded-lg border border-container1-border bg-container1 px-3 py-2 text-title`} onClick={onPrevious}>
          {translate({ key: 'gallery.previous' })}
        </button>
        <div className={`h-full w-full max-w-5xl overflow-hidden rounded-xl border border-container1-border bg-container1`}>
          {active.kind === 'video' ? (
            <video src={active.originalUrl} controls autoPlay className={`h-full w-full object-contain`} />
          ) : (
            <img src={active.originalUrl} alt={active.fileName} className={`h-full w-full object-contain`} />
          )}
        </div>
        <button className={`rounded-lg border border-container1-border bg-container1 px-3 py-2 text-title`} onClick={onNext}>
          {translate({ key: 'gallery.next' })}
        </button>
      </div>
    </div>
  );
}