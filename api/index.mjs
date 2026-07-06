import { handleRequest } from "../server.mjs";

export default async function handler(request, response) {
  await handleRequest(request, response);
}
