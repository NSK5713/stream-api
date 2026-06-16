import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL?.trim();
let client: Redis | null = null;

if (redisUrl) {
	client = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
	client.on("connect", () => console.log("🧊 Redis connected"));
	client.on("error", (err) => console.error("❌ Redis error", err));
} else {
	console.debug("Redis not configured (REDIS_URL unset) — using local fallback only.");
}

export default client;

