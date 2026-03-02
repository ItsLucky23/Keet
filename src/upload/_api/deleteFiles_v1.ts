import { AuthProps, SessionLayout } from '../../../config';
import { ApiResponse, Functions } from '../../../src/_sockets/apiTypes.generated';
import { deleteAlbumFiles } from '../../../server/media/mediaLibrary';

export const auth: AuthProps = {
  login: false,
  additional: [],
};

export const httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'DELETE';

export interface ApiParams {
  data: {
    folder: string;
    fileNames: string[];
  };
  user: SessionLayout;
  functions: Functions;
}

export const main = async ({ data }: ApiParams): Promise<ApiResponse> => {
  const result = await deleteAlbumFiles({
    folder: data.folder,
    fileNames: data.fileNames,
  });

  if (result.status === 'error') {
    return {
      status: 'error',
      errorCode: result.message ?? 'api.internalServerError',
    };
  }

  return {
    status: 'success',
    deleted: result.deleted,
  };
};
