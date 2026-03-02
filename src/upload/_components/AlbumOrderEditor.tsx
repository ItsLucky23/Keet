import { useEffect, useState } from 'react';

import { reorderAlbumRequest } from 'src/_functions/galleryApi';
import notify from 'src/_functions/notify';
import { useTranslator } from 'src/_functions/translator';

interface Props {
  folder: string;
  files: string[];
  onSaved: () => void;
}

export default function AlbumOrderEditor({ folder, files, onSaved }: Props) {
  const translate = useTranslator();
  const [order, setOrder] = useState<string[]>(files);
  const [dragging, setDragging] = useState<string | null>(null);

  useEffect(() => {
    setOrder(files);
  }, [files]);

  const moveItem = (dragged: string, target: string) => {
    if (dragged === target) return;
    const current = [...order];
    const draggedIndex = current.indexOf(dragged);
    const targetIndex = current.indexOf(target);
    if (draggedIndex < 0 || targetIndex < 0) return;
    current.splice(draggedIndex, 1);
    current.splice(targetIndex, 0, dragged);
    setOrder(current);
  };

  const saveOrder = async () => {
    const result = await reorderAlbumRequest({ folder, order });
    if ('status' in result && result.status === 'success') {
      notify.success({ key: 'gallery.saved' });
      onSaved();
      return;
    }
    notify.error({ key: 'gallery.saveFailed' });
  };

  return (
    <div className={`flex flex-col gap-2 rounded-xl border border-container1-border bg-container1 p-3`}>
      <div className={`flex items-center justify-between`}>
        <div className={`text-sm font-semibold text-title`}>{translate({ key: 'gallery.orderTitle' })}</div>
        <button className={`rounded-lg border border-container1-border bg-container2 px-3 py-1 text-sm`} onClick={saveOrder}>
          {translate({ key: 'gallery.saveOrder' })}
        </button>
      </div>
      <div className={`flex flex-col gap-1`}>
        {order.map((fileName) => (
          <div
            key={fileName}
            draggable
            onDragStart={() => setDragging(fileName)}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={() => {
              if (!dragging) return;
              moveItem(dragging, fileName);
              setDragging(null);
            }}
            className={`flex items-center rounded-lg border border-container1-border bg-container2 px-2 py-1 text-sm text-title`}
          >
            {fileName}
          </div>
        ))}
      </div>
    </div>
  );
}
