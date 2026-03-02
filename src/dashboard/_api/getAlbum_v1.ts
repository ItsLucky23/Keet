import { AuthProps, SessionLayout } from '../../../config';
import { ApiResponse, Functions } from '../../../src/_sockets/apiTypes.generated';
import { getAlbumData } from '../../../server/media/mediaLibrary';

export const auth: AuthProps = {
  login: false,
  additional: [],
};

export const httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET';

export interface ApiParams {
  data: {
    folder: string;
    includeHidden?: boolean;
  };
  user: SessionLayout;
  functions: Functions;
}

export const main = async ({ data }: ApiParams): Promise<ApiResponse> => {
  const includeHidden = data.includeHidden === undefined
    ? false
    : String(data.includeHidden) === 'true';

  const result = await getAlbumData({
    folder: data.folder,
    includeHidden,
  });

  if (!result) {
    return {
      status: 'error',
      errorCode: 'album.notFound',
    };
  }

  return {
    status: 'success',
    result,
  };
};
