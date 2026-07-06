import { handleRequest } from "../server.mjs";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(request, response) {
  await handleRequest(request, response);
}
