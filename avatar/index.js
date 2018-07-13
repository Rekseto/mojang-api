// Generated by CoffeeScript 2.3.1
var bucket, compose, crop, exists, fetchAndRender, image, os, profile, read, render, request, resize, resizeCoef, resizeMulti, resizeNearest, resizeOps, save, savePng, sharp, storage, texture;

exports.get = function(req, res) {
  var file, id, size;
  id = req.body.id;
  size = resizeNearest(req.body.size);
  res.set("Content-Type", "image/png");
  return exists(file = `${id}/${size}`).then(function(cached) {
    if (cached) {
      return res.pipe(read(file));
    } else {
      return fetchAndRender(req.body.id).then(function([id, bufs]) {
        return bufs.map(function([i, buf]) {
          if (i === size) {
            res.status(200).send(buf);
          }
          return savePng(file = `${id}/${i}`, buf);
        });
      }).catch(function(err) {
        console.error(err);
        return res.status(500).end();
      });
    }
  });
};

// Render the avatars of a user given their UUID or username.

// @param {string} id - UUID or username.
// @returns {promise<[string, [integer, buffer]]>} - Dashed UUID and resized buffers.
fetchAndRender = function(id) {
  return profile(id).then(function(data) {
    id = data.uuid_dashed;
    return texture(data);
  }).then(function(buf) {
    return render(buf).then(function(buf) {
      return [id, buf];
    });
  });
};

// Render an avatar given the texture image of a user.

// @param {buffer} buf - Image buffer of textures.
// @returns {promise<[[integer, buffer]]>} - Size of image with new image buffer.
render = function(buf) {
  return Promise.all([crop(buf, 8, 8, 8, 8), crop(buf, 40, 8, 8, 8)]).then(function([face, hat]) {
    return compose(face, hat);
  }).then(function(both) {
    return resizeMulti(both);
  });
};

os = require("os");

sharp = require("sharp");

// Safely perform mutation operations on an image buffer.

// @param {buffer} buf - Image buffer.
// @returns {sharp} - Cloned image buffer with the sharp module.
image = function(buf) {
  return sharp(buf).clone();
};

// Crop out a section of an image buffer.

// @param {buffer} buf - Image buffer.
// @param {integer} x - Left-hand upper corner x-coordinate.
// @param {integer} y - Left-hand upper corner y-coordinate.
// @param {integer} w - Width in pixels of the crop section.
// @param {integer} h - Height in pixels of the crop section.
// @returns {promise<buffer>} - Image buffer of the cropped section.
crop = function(buf, x, y, w, h) {
  return image(buf).extract({
    left: x,
    top: y,
    width: w,
    height: h
  }).toBuffer();
};

// Place one image buffer on top of another.

// @param {buffer} buf0 - Image buffer at the bottom.
// @param {buffer} buf1 - Image buffer placed on top.
// @param {integer} x - Left-hand upper corner x-coordinate to place image.
// @param {integer} y - Left-hand upper corner y-coordinate to place image.
// @returns {promise<buffer>} - Image buffer with the composed image.
compose = function(buf0, buf1, x = 0, y = 0) {
  return image(buf0).overlayWith(buf1, {
    left: x,
    top: y
  }).toBuffer();
};

// Resize an image to a new width and height.

// Uses the nearestNeighbor algorithm to keep
// pixel density without blurring.

// @param {buffer} buf - Image buffer to resize.
// @param {integer} size - Width and height in pixels of the new image.
// @returns {promise<[integer, buffer]>} - Image size and buffer of resized image.
resize = function(buf, size) {
  size = Math.max(0, size);
  return image(buf).resize(size * resizeCoef, size * resizeCoef, {
    kernel: sharp.kernel.nearest,
    interpolator: sharp.interpolator.nearest,
    centerSampling: true
  }).png().toBuffer().then(function(buf) {
    return [size, buf];
  });
};

resizeCoef = 2;

// Resize an image to multiple new widths and heights.

// @see #resizeOps for the default resize options.
// @param {buffer} buf - Image buffer.
// @returns {[promise<[integer, buffer]>]} - Image buffers of resized images.
resizeMulti = function(buf) {
  return Promise.all(resizeOps.map(function(i) {
    return resize(buf, i);
  }));
};

// Return the largest default size that will encapsulate the given size.

// @param {integer} size - Requested size in pixels.
// @returns {integer} - Size in pixels the server allows.
resizeNearest = function(size = 0) {
  var i;
  size = Math.min(size, resizeOps.slice(-1));
  return ((function() {
    var j, len, results;
    results = [];
    for (j = 0, len = resizeOps.length; j < len; j++) {
      i = resizeOps[j];
      if (i >= size) {
        results.push(i);
      }
    }
    return results;
  })())[0];
};

resizeOps = [8, 16, 32, 64, 128, 256, 512];

// Reduce IO operations because of impodency.
sharp.cache({
  memory: os.freemem() * 1000
});

// Allocate dedicated threads to process images.
sharp.concurrency(8);

// Enable special image vectoring to improve IO performance.
sharp.simd(true);

request = require("request-promise-native");

// Fetch the user profile from a UUID or username.

// @param {string} id - UUID or username.
// @returns {promise<object>} - User profile as JSON.
profile = function(id = "Steve") {
  return request({
    uri: `https://ashcon.app/minecraft/user/${id}`,
    json: true
  });
};

// Fetch and download as a buffer the skin texture artifact.

// @param {object} profile - User profile.
// @param {promise<buffer>} - Image buffer.
texture = function(data) {
  return request({
    uri: data.textures.skin,
    encoding: null
  });
};

storage = require("@google-cloud/storage")();

bucket = storage.bucket(`${process.env.bucket}`);

// Get whether a file exists in a bucket.

// @param {string} name - Name of the file.
// @returns {promise<boolean>} - Whether the file exists.
exists = function(name) {
  return bucket.file(name).exists().then(function(data) {
    return data[0];
  });
};

// Create a read stream to access a file.

// @param {string} name - Name of the file.
// @returns {readablestream} - A readable stream of the file.
read = function(name) {
  return bucket.file(name).createReadStream();
};

// Save a raw data file into a bucket.

// @param {string} name - Path name of the file.
// @param {object|buffer} data - Raw data file.
// @param {string} type - Type of data file (ie. application/json).
// @param {integer} ttl - Cache in seconds of the file.
save = function(name, data, type, ttl) {
  return bucket.file(name).save(data, {
    contentType: type,
    gzip: true,
    public: true,
    resumable: false,
    validation: false,
    metadata: {
      cacheControl: `public, max-age=${ttl}`
    }
  });
};

// Save a PNG file into a bucket.

// @param {string} name - Path name of the file.
// @param {buffer} buf - Image buffer.
savePng = function(name, buf) {
  return save(name, buf, "image/png", 604800);
};
