/**
 * The player for Claude's motion designs.
 *
 * Generated code runs inside an iframe sandboxed to `allow-scripts` only, so it
 * has no access to the app, its cookies or its storage. The player owns time:
 * it calls the code's `draw()` once per frame with `t`, and can record the
 * canvas to a video file. This contract must match MOTION_CODE_CONTRACT in
 * api/_motion-template.ts.
 */

export const MOTION_FORMATS = {
  portrait: { width: 1080, height: 1350, label: '4:5', name: 'Post' },
  story: { width: 1080, height: 1920, label: '9:16', name: 'Story' },
  square: { width: 1080, height: 1080, label: '1:1', name: 'Square' },
} as const

export type MotionFormat = keyof typeof MOTION_FORMATS

export type MotionPlayerConfig = {
  code: string
  reference: string
  format: MotionFormat
  duration: number
}

export type MotionPlayerMessage =
  | { source: 'spyda-motion'; type: 'loaded' | 'ready' | 'recording' }
  | { source: 'spyda-motion'; type: 'error'; message: string }
  | { source: 'spyda-motion'; type: 'recorded'; blob: Blob; mimeType: string }

const BASE_FONTS = ['Space Grotesk:500,600,700', 'Montserrat:400,500,600,700']

const RUNTIME = String.raw`
(function () {
  var post = function (message) { message.source = 'spyda-motion'; parent.postMessage(message, '*'); };
  var canvas = document.getElementById('stage');
  var ctx, W, H, D, assets = {}, state, drawFrame, playing = false, start = 0, raf = 0;

  function fail(error) {
    playing = false;
    cancelAnimationFrame(raf);
    post({ type: 'error', message: String((error && (error.stack || error.message)) || error) });
  }
  window.onerror = function (message, source, line, column, error) { fail(error || message); };
  window.onunhandledrejection = function (event) { fail(event.reason); };

  function compile() {
    var code = document.getElementById('spyda-code').textContent;
    var factory = new Function(code + '\n;return { setup: typeof setup === "function" ? setup : null, draw: typeof draw === "function" ? draw : null, fonts: typeof GOOGLE_FONTS !== "undefined" && Array.isArray(GOOGLE_FONTS) ? GOOGLE_FONTS : [] };');
    return factory();
  }

  function frame(t) {
    ctx.save();
    drawFrame({ ctx: ctx, width: W, height: H, t: t, duration: D, progress: t / D, assets: assets, state: state });
    ctx.restore();
  }

  function loop(now) {
    if (!playing) return;
    try { frame(((now - start) / 1000) % D); } catch (error) { fail(error); return; }
    raf = requestAnimationFrame(loop);
  }

  function play() { cancelAnimationFrame(raf); playing = true; start = performance.now(); raf = requestAnimationFrame(loop); }

  function loadFonts(list) {
    var families = list.filter(function (item) { return typeof item === 'string' && item.trim(); }).map(function (item) {
      var parts = item.split(':');
      var name = parts[0].trim().replace(/\s+/g, '+');
      var weights = (parts[1] || '400,700').split(',').map(function (w) { return w.trim(); }).filter(Boolean).sort().join(';');
      return 'family=' + name + ':wght@' + weights;
    });
    if (!families.length) return Promise.resolve();
    return new Promise(function (resolve) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?' + families.join('&') + '&display=block';
      link.onload = function () {
        var loads = list.map(function (item) {
          var parts = item.split(':');
          var weights = (parts[1] || '400').split(',');
          return Promise.all(weights.map(function (w) { return document.fonts.load(w.trim() + ' 48px "' + parts[0].trim() + '"').catch(function () {}); }));
        });
        Promise.all(loads).then(function () { resolve(); });
      };
      link.onerror = function () { resolve(); };
      document.head.appendChild(link);
      setTimeout(resolve, 3000);
    });
  }

  function init(config) {
    W = config.width; H = config.height; D = config.duration;
    canvas.width = W; canvas.height = H;
    ctx = canvas.getContext('2d');
    var image = new Image();
    image.src = config.reference;
    return image.decode().then(function () {
      assets.reference = image;
      var module = compile();
      if (!module.draw) throw new Error('The animation has no draw() function.');
      drawFrame = module.draw;
      return loadFonts(config.fonts.concat(module.fonts)).then(function () {
        state = module.setup ? module.setup({ ctx: ctx, width: W, height: H, assets: assets }) : undefined;
        post({ type: 'ready' });
        play();
      });
    }).catch(fail);
  }

  function record() {
    var types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    var type = window.MediaRecorder && types.filter(function (t) { return MediaRecorder.isTypeSupported(t); })[0];
    if (!type || !canvas.captureStream) { fail('This browser cannot record video. Download the HTML version instead.'); return; }
    playing = false;
    cancelAnimationFrame(raf);
    var recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: type, videoBitsPerSecond: 8000000 });
    var chunks = [];
    recorder.ondataavailable = function (event) { if (event.data && event.data.size) chunks.push(event.data); };
    recorder.onstop = function () { post({ type: 'recorded', blob: new Blob(chunks, { type: type }), mimeType: type }); play(); };
    recorder.start();
    post({ type: 'recording' });
    var began = performance.now();
    (function tick(now) {
      var t = (now - began) / 1000;
      try {
        if (t >= D) { frame(D - 0.001); recorder.stop(); return; }
        frame(t);
      } catch (error) { recorder.stop(); fail(error); return; }
      requestAnimationFrame(tick);
    })(began);
  }

  window.addEventListener('message', function (event) {
    var message = event.data || {};
    if (message.type === 'init') init(message.config);
    else if (message.type === 'restart') play();
    else if (message.type === 'record') record();
  });

  if (window.__SPYDA_MOTION__) init(window.__SPYDA_MOTION__);
  else post({ type: 'loaded' });
})();
`

/** Text that sits inside a <script> element without being able to close it. */
function scriptSafe(value: string) {
  return value.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--')
}

export function playerConfig(config: MotionPlayerConfig) {
  const size = MOTION_FORMATS[config.format]
  return { width: size.width, height: size.height, duration: config.duration, reference: config.reference, fonts: BASE_FONTS }
}

/**
 * The player document. In the app it waits for an `init` message; with
 * `standalone` it carries its own config and plays on open, which is the
 * downloadable HTML version.
 */
export function motionDocument(config: MotionPlayerConfig, { standalone = false } = {}) {
  const embedded = standalone
    ? `<script>window.__SPYDA_MOTION__ = ${JSON.stringify(playerConfig(config)).replace(/</g, '\\u003c')};</script>`
    : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Spyda motion design</title>
<style>html,body{margin:0;height:100%;background:#050606;overflow:hidden}canvas{display:block;width:100%;height:100%;object-fit:contain}</style>
</head>
<body>
<canvas id="stage"></canvas>
<script type="text/plain" id="spyda-code">${scriptSafe(config.code)}</script>
${embedded}
<script>${RUNTIME}</script>
</body>
</html>`
}
