import mysql from "mysql2/promise";

const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "vibe_user",
    password: process.env.DB_PASSWORD || "vibe_password",
    database: process.env.DB_NAME || "vibe_platform",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

export async function getDbPool() {
    return pool;
}

export async function ensureProjectsTable() {
    const query = `
    CREATE TABLE IF NOT EXISTS projects (
      id VARCHAR(255) PRIMARY KEY,
      updated_at DATETIME NOT NULL,
      data JSON NOT NULL
    );
  `;
    await pool.execute(query);
}
