'use strict';

// Equirectangular -> Marzipano cube-tile converter, running entirely in the
// browser. Face math is a direct port of a Python prototype that was
// validated pixel-for-pixel against this tour's real existing tiles.
var EnzaPhotoTool = (function() {

  var FACES = ['f', 'b', 'l', 'r', 'u', 'd'];
  var PREVIEW_FACE_ORDER = ['b', 'd', 'f', 'l', 'r', 'u'];

  function faceDirection(face, u, v) {
    // u, v in [-1, 1]; v already flipped so row 0 = top of the face.
    switch (face) {
      case 'f': return [u, v, 1];
      case 'b': return [-u, v, -1];
      case 'r': return [1, v, -u];
      case 'l': return [-1, v, u];
      case 'u': return [u, 1, -v];
      case 'd': return [u, -1, v];
    }
  }

  // Renders one cube face at `size`x`size` from the equirectangular source
  // (given as an ImageData) onto a new canvas, returning that canvas.
  function generateFace(srcData, srcW, srcH, face, size) {
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    var outData = ctx.createImageData(size, size);
    var out = outData.data;
    var src = srcData.data;

    for (var row = 0; row < size; row++) {
      var v = -((2 * (row + 0.5) / size) - 1); // flip so row 0 = top
      for (var col = 0; col < size; col++) {
        var u = (2 * (col + 0.5) / size) - 1;
        var dir = faceDirection(face, u, v);
        var x = dir[0], y = dir[1], z = dir[2];
        var norm = Math.sqrt(x * x + y * y + z * z);
        x /= norm; y /= norm; z /= norm;

        var yaw = Math.atan2(x, z);
        var pitch = Math.asin(Math.max(-1, Math.min(1, y)));

        var sx = Math.round((yaw / (2 * Math.PI) + 0.5) * srcW);
        var sy = Math.round((0.5 - pitch / Math.PI) * srcH);
        sx = Math.max(0, Math.min(srcW - 1, sx));
        sy = Math.max(0, Math.min(srcH - 1, sy));

        var srcIdx = (sy * srcW + sx) * 4;
        var dstIdx = (row * size + col) * 4;
        out[dstIdx] = src[srcIdx];
        out[dstIdx + 1] = src[srcIdx + 1];
        out[dstIdx + 2] = src[srcIdx + 2];
        out[dstIdx + 3] = 255;
      }
    }

    ctx.putImageData(outData, 0, 0);
    return canvas;
  }

  function canvasToBlob(canvas, quality) {
    return new Promise(function(resolve) {
      canvas.toBlob(resolve, 'image/jpeg', quality || 0.9);
    });
  }

  function loadImageData(file) {
    return new Promise(function(resolve, reject) {
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        var data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(img.src);
        resolve({ data: data, width: canvas.width, height: canvas.height });
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  // Builds the full tile set for one scene into a JSZip folder.
  // onProgress(fraction) is called periodically (0..1).
  function buildSceneTiles(file, sceneId, onProgress) {
    var FACE_SIZE = 1024;
    var TILE_SIZE = 512;
    return loadImageData(file).then(function(src) {
      var zip = new JSZip();
      var root = zip.folder(sceneId);
      var totalSteps = FACES.length * 2 + 1; // level1 + level2 per face + preview
      var doneSteps = 0;

      function tick() {
        doneSteps++;
        if (onProgress) onProgress(doneSteps / totalSteps);
      }

      // Yield to the browser between steps so the UI (progress bar) can repaint.
      function nextTick() {
        return new Promise(function(resolve) { setTimeout(resolve, 0); });
      }

      var chain = Promise.resolve();

      FACES.forEach(function(face) {
        chain = chain.then(function() {
          // Level 1: single 512x512 tile.
          var small = generateFace(src.data, src.width, src.height, face, TILE_SIZE);
          return canvasToBlob(small, 0.9).then(function(blob) {
            root.file('1/' + face + '/0/0.jpg', blob);
            tick();
          });
        }).then(nextTick);

        chain = chain.then(function() {
          // Level 2: 1024x1024 face, sliced into a 2x2 grid of 512 tiles.
          var big = generateFace(src.data, src.width, src.height, face, FACE_SIZE);
          var n = FACE_SIZE / TILE_SIZE;
          var tilePromises = [];
          for (var row = 0; row < n; row++) {
            for (var col = 0; col < n; col++) {
              var tileCanvas = document.createElement('canvas');
              tileCanvas.width = TILE_SIZE;
              tileCanvas.height = TILE_SIZE;
              tileCanvas.getContext('2d').drawImage(
                big, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE, 0, 0, TILE_SIZE, TILE_SIZE
              );
              (function(row, col, tileCanvas) {
                tilePromises.push(canvasToBlob(tileCanvas, 0.9).then(function(blob) {
                  root.file('2/' + face + '/' + row + '/' + col + '.jpg', blob);
                }));
              })(row, col, tileCanvas);
            }
          }
          return Promise.all(tilePromises).then(tick);
        }).then(nextTick);
      });

      chain = chain.then(function() {
        var strip = document.createElement('canvas');
        strip.width = 256;
        strip.height = 256 * 6;
        var ctx = strip.getContext('2d');
        var y = 0;
        PREVIEW_FACE_ORDER.forEach(function(face) {
          var f = generateFace(src.data, src.width, src.height, face, 256);
          ctx.drawImage(f, 0, y);
          y += 256;
        });
        return canvasToBlob(strip, 0.85).then(function(blob) {
          root.file('preview.jpg', blob);
          tick();
        });
      });

      return chain.then(function() {
        return zip.generateAsync({ type: 'blob' }, function(meta) {
          if (onProgress) onProgress(0.95 + 0.05 * (meta.percent / 100));
        });
      });
    });
  }

  return { buildSceneTiles: buildSceneTiles };
})();
