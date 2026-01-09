import Database from "@tauri-apps/plugin-sql"

let db: Database | null = null

/**
 * Initialize database connection
 * This function is idempotent - safe to call multiple times
 */
export async function initDatabase(): Promise<Database> {
  if (db) {
    return db
  }

  try {
    // Load the database (migrations are auto-applied by Tauri plugin)
    db = await Database.load("sqlite:chats.db")
    console.log("Database initialized successfully")
    return db
  } catch (error) {
    console.error("Failed to initialize database:", error)
    throw error
  }
}

/**
 * Get database instance (initialize if needed)
 */
export async function getDatabase(): Promise<Database> {
  if (!db) {
    return await initDatabase()
  }
  return db
}
