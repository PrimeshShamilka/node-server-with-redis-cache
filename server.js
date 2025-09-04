const express = require("express");
const axios = require("axios");
const cors = require("cors");
const redis = require("redis");
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const app = express();
const redisClient = redis.createClient({ url: REDIS_URL });
const DEFAULT_EXPIRATION = 3600; // 1 hour
app.use(cors());

// connect redis properly
redisClient.on("error", (err) => console.error("Redis Client Error", err));
(async () => {
  console.log("Connecting to Redis...");
  await redisClient.connect();
})();

/**
 * GET /
 * Health check / basic root route.
 * - Responses:
 *   - 200: Plain text greeting to confirm the server is running
 */
app.get("/", (req, res) => {
  res.send("Hello from Express!");
});

/**
 * GET /photos
 * Fetch photos, optionally filtered by albumId.
 * - Query params:
 *   - albumId (optional): string | number; when omitted, returns all photos
 * - Caching:
 *   - Uses Redis with keys:
 *     - `photos?albumId={albumId}` when albumId is provided
 *     - `photos` when albumId is omitted
 *   - Cached for DEFAULT_EXPIRATION seconds
 * - Responses:
 *   - 200: JSON array of photos
 *   - 500: Error message on failure
 */
app.get("/photos", async (req, res) => {
  console.log("Fetching photos");
  const albumId = req.query.albumId;
  const cacheKey = albumId ? `photos?albumId=${albumId}` : "photos";
console.log(cacheKey);
  try {
    const photos = await getOrSetCache(cacheKey, async () => {
      const { data } = await axios.get(
        `https://jsonplaceholder.typicode.com/photos`,
        { params: albumId ? { albumId } : {}, timeout: 10000 }
      );
      return data;
    });
    res.json(photos);
  } catch (error) {
    res.status(500).send("Error fetching photos");
  }
});

/**
 * GET /photos/:id
 * Fetch a single photo by its ID.
 * - Path params:
 *   - id: string | number (photo identifier)
 * - Behavior:
 *   - Attempts to serve from Redis cache using key `photos:{id}`.
 *   - On cache miss, fetches from upstream API and caches the response
 *     for DEFAULT_EXPIRATION seconds.
 * - Responses:
 *   - 200: JSON photo object
 *   - 500: Error message on failure
 */
app.get('/photos/:id', async (req, res) => {
  const { id } = req.params;
  const cacheKey = `photos:${id}`;
  try {
   const photos = await getOrSetCache(cacheKey, async () => {
      const { data } = await axios.get(
        `https://jsonplaceholder.typicode.com/photos/${id}`,
      );
      return data;
    });
    res.json(photos);
  } catch (error) {
    res.status(500).send("Error fetching photos");
  }
});

/**
 * GET /photos/:id
 * Fetch a single photo by its ID (no caching variant).
 * - Path params:
 *   - id: string | number (photo identifier)
 * - Responses:
 *   - 200: JSON photo object
 *   - 500: Error message on failure
 */
app.get('/photos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data } = await axios.get(
      `https://jsonplaceholder.typicode.com/photos/${id}`
    );
    res.json(data);
  } catch (error) {
    res.status(500).send("Error fetching photo");
  }
});

async function getOrSetCache(key, cb) {
  try {
    const cachedData = await redisClient.get(key);
    if (cachedData != null) {
      console.log(`Cache hit for ${key}`);
      return JSON.parse(cachedData);
    }

    console.log(`Cache miss for ${key}`);
    const freshData = await cb();
    await redisClient.setEx(key, DEFAULT_EXPIRATION, JSON.stringify(freshData));
    return freshData;
  } catch (err) {
    console.error("Redis error:", err);
    // fallback: just call the API
    return await cb();
  }
}

app.listen(3000, () => {
  console.log("Express server running at http://localhost:3000");
});


