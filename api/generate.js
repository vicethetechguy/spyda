async function handler(request, response) {
  const { handleRequest } = await import("../server.mjs");
  request.url = "/api/generate";
  await handleRequest(request, response);
}

handler.config = {
  api: {
    bodyParser: false,
  },
};

module.exports = handler;
