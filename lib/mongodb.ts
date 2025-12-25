import mongoose, { Connection, ConnectOptions, Mongoose } from 'mongoose';

/**
 * MongoDB connection URI.
 * - Must be defined in your environment (e.g. .env.local) as MONGODB_URI.
 * - We throw early in case it's missing to fail fast during boot.
 */
const MONGODB_URI: string | undefined = process.env.MONGO_URI;

if (!MONGODB_URI) {
  throw new Error('Invalid configuration: MONGODB_URI environment variable is not set');
}

/**
 * Shape of the cached connection object we store on the global object.
 * This avoids creating multiple connections in development where modules
 * can be re-evaluated on every HMR refresh or file change.
 */
interface MongooseCache {
  /** The resolved, reusable Mongoose instance (once connected). */
  conn: Mongoose | null;
  /** The in-flight connection promise to avoid duplicate connects. */
  promise: Promise<Mongoose> | null;
}

/**
 * Augment the Node.js global type so TypeScript knows about `global.mongoose`.
 * We use a global cache because Next.js (and other tooling) may hot-reload
 * modules multiple times in development, which would otherwise create
 * multiple active connections to MongoDB.
 */
declare global {
  // eslint-disable-next-line no-var
  var mongoose: MongooseCache | undefined;
}

// Reuse the existing cached instance on the global object if it exists.
// eslint-disable-next-line no-var
const globalForMongoose: typeof globalThis & { mongoose?: MongooseCache } = global as typeof globalThis & {
  mongoose?: MongooseCache;
};

const cached: MongooseCache = globalForMongoose.mongoose ?? {
  conn: null,
  promise: null,
};

// Ensure the cache is stored globally so it's shared across module reloads.
globalForMongoose.mongoose = cached;

/**
 * Establishes (or reuses) a Mongoose connection to MongoDB.
 *
 * This function is safe to call from any server-side code (API routes,
 * server components, route handlers, etc.). It ensures:
 * - Only one physical connection is created per server instance.
 * - Concurrent calls share the same in-flight connection promise.
 */
export async function connectToDatabase(): Promise<Mongoose> {
  // If we already have an active connection, reuse it.
  if (cached.conn) {
    return cached.conn;
  }

  // If a connection attempt is already in progress, reuse its promise.
  if (!cached.promise) {
    const options: ConnectOptions = {
      // Add connection options here as needed for your deployment.
      // Example:
      // dbName: 'my-database-name',
    };

    cached.promise = mongoose.connect(MONGODB_URI as string, options).then((mongooseInstance: Mongoose) => {
      return mongooseInstance;
    });
  }

  // Wait for the connection to finish and cache the resolved instance.
  cached.conn = await cached.promise;

  return cached.conn;
}

/**
 * Optional helper to get the underlying native MongoDB driver connection.
 * Useful when you need access to lower-level driver APIs.
 */
export function getMongoNativeConnection(): Connection | null {
  if (!cached.conn) {
    return null;
  }

  return cached.conn.connection;
}
