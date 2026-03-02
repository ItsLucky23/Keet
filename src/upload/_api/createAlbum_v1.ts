import { AuthProps, SessionLayout } from '../../../config';
import { ApiResponse, Functions } from '../../../src/_sockets/apiTypes.generated';
import { createAlbum } from '../../../server/media/mediaLibrary';

export const auth: AuthProps = {
  login: false,
  additional: [],
};

export interface ApiParams {
  data: {
    albumName: string;
    theme?: string;
  };
  user: SessionLayout;
  functions: Functions;
}

const toAlbumKey = (value: string): string => {
  return value
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .toLowerCase();
};

export const main = async ({ data }: ApiParams): Promise<ApiResponse> => {
  const albumName = data.albumName?.trim();
  const folder = toAlbumKey(albumName);

  const result = await createAlbum({
    folder,
    title: albumName,
    theme: data.theme,
  });

  if (result.status === 'error') {
    return {
      status: 'error',
      errorCode: result.message ?? 'api.internalServerError',
    };
  }

  return {
    status: 'success',
    folder: result.folder,
  };
};
