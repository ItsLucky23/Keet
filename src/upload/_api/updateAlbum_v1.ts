import { AuthProps, SessionLayout } from '../../../config';
import { ApiResponse, Functions } from '../../../src/_sockets/apiTypes.generated';
import { updateAlbum } from '../../../server/media/mediaLibrary';

export const auth: AuthProps = {
  login: false,
  additional: [],
};

export interface ApiParams {
  data: {
    folder: string;
    title?: string;
    hidden?: boolean;
    theme?: string;
    thumbnailFile?: string | null;
    coverFiles?: string[];
    extraFiles?: string[];
    renameFolder?: string;
  };
  user: SessionLayout;
  functions: Functions;
}

export const main = async ({ data }: ApiParams): Promise<ApiResponse> => {
  const result = await updateAlbum({
    folder: data.folder,
    title: data.title,
    hidden: data.hidden,
    theme: data.theme,
    thumbnailFile: data.thumbnailFile,
    coverFiles: data.coverFiles,
    extraFiles: data.extraFiles,
    renameFolder: data.renameFolder,
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
