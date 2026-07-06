module.exports = function handler(request, response) {
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end("pong");
};
