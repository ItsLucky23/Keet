import { AuthProps, SessionLayout } from '../../../config';
import { ApiResponse, Functions } from '../../../src/_sockets/apiTypes.generated';
import { deleteAlbumCompletely } from '../../../server/media/mediaLibrary';

export const auth: AuthProps = {
  login: false,
  additional: [],
};

export const httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'DELETE';

export interface ApiParams {
  data: {
    folder: string;
  };
  user: SessionLayout;
  functions: Functions;
}

export const main = async ({ data }: ApiParams): Promise<ApiResponse> => {
  const result = await deleteAlbumCompletely(data.folder);

  if (result.status === 'error') {
    return {
      status: 'error',
      errorCode: result.message ?? 'api.internalServerError',
    };
  }

  return {
    status: 'success',
    ok: true,
  };
};
