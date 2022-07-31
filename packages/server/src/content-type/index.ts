export interface ContentType {
  key: string;
  headerValue: string;
  /**
   * Used to serialize output data to a response body and input data to a POST request body.
   */
  toBody(data: unknown): BodyInit;
  /**
   * Used to deserialize output data on the client from a server response.
   */
  fromResponse(res: Response): any;
  /**
   * Used to serialize input data in a GET request.
   */
  toString(data: unknown): string;
  /**
   * Used to deserialize input data from a GET request.
   */
  fromString(str: string): any;
}

export const jsonContentType: ContentType = {
  key: '_default',
  headerValue: 'application/json',
  fromResponse: async (res) => JSON.parse(await res.text()),
  fromString: (str) => JSON.parse(str),
  toBody: (data) => JSON.stringify(data),
  toString: (data) => JSON.stringify(data),
};

export const defaultContentTypes = [jsonContentType];

export type DefaultContentTypes = typeof defaultContentTypes;
