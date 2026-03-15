import { IncomingMessage, ServerResponse } from "http";
import tryCatch from "../../shared/tryCatch";
import { parseMultipartRequest } from "../media/mediaLibrary";

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

type getParamsType = {
  method: string;
  req: IncomingMessage;
  res: ServerResponse;
  queryString?: string;
}

export default async function getParams({ method, req, res: _res, queryString }: getParamsType): Promise<Record<string, any> | null> {

  if (method == "GET") {
    //? if get request we return the query string as an object
    return Object.fromEntries(new URLSearchParams(queryString || '')) as Record<string, string>;
  }

  //? if a POST, PUT or DELETE method we return the body as an object
  return new Promise((resolve, reject) => {
    const rawContentType = req.headers['content-type'];
    const contentType = (Array.isArray(rawContentType) ? rawContentType[0] : rawContentType || '').toLowerCase();

    if (contentType.includes('multipart/form-data')) {
      void (async () => {
        const [multipartError, multipartData] = await tryCatch(parseMultipartRequest, req);
        if (multipartError || !multipartData) {
          reject(multipartError ?? new Error('Invalid multipart request'));
          return;
        }

        const parsed = {
          folder: multipartData.fields.folder ?? '',
          replaceTarget: multipartData.fields.replaceTarget || undefined,
          markAsExtra: multipartData.fields.markAsExtra === 'true',
          files: multipartData.files.map((file) => ({
            fileName: file.fileName,
            mimeType: file.mimeType,
            base64: file.buffer.toString('base64'),
          })),
        };

        resolve(parsed);
      })();
      return;
    }

    //? we store the passed data chunks in a string
    let body = '';
    let bodySize = 0;
    req.on('data', (chunk) => {
      bodySize += chunk.length;
      if (bodySize > MAX_BODY_BYTES) {
        _res.setHeader('Content-Type', 'application/json');
        _res.writeHead(413);
        _res.end(JSON.stringify({
          status: 'error',
          httpStatus: 413,
          message: 'api.payloadTooLarge',
          errorCode: 'api.payloadTooLarge',
        }));
        req.destroy();
        return resolve(null);
      }

      body += chunk.toString();
    });

    req.on('end', async () => {
      //? here we parse the data depending on the content type
      //? if the content type is application/x-www-form-urlencoded we parse the data as a URLSearchParams object
      if (contentType.startsWith('application/x-www-form-urlencoded')) {
        const parseData = () => {
          const data = new URLSearchParams(body);
          return Object.fromEntries(data);
        }
        const [, response] = await tryCatch(parseData)
        if (response) {
          return resolve(response)
        }

        _res.setHeader('Content-Type', 'application/json');
        _res.writeHead(400);
        _res.end(JSON.stringify({
          status: 'error',
          httpStatus: 400,
          message: 'api.invalidRequestFormat',
          errorCode: 'api.invalidRequestFormat',
        }));
        return resolve(null);
      }

      //? if the content type is application/json we parse the data as a JSON object
      if (contentType.startsWith('application/json')) {
        const parseData = () => {
          return JSON.parse(body || '{}');
        }
        const [, response] = await tryCatch(parseData)
        if (response) {
          return resolve(response)
        }

        _res.setHeader('Content-Type', 'application/json');
        _res.writeHead(400);
        _res.end(JSON.stringify({
          status: 'error',
          httpStatus: 400,
          message: 'api.invalidRequestFormat',
          errorCode: 'api.invalidRequestFormat',
        }));
        return resolve(null);
      }

      resolve({ body });
    })

    req.on('error', (error) => {
      reject(error);
    })
    // }

  });
}