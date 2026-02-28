import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("razif.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    avatar TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    channel TEXT,
    sender_name TEXT,
    content TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_ai INTEGER DEFAULT 0,
    FOREIGN KEY(sender_id) REFERENCES users(id)
  );
  
  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT,
    icon TEXT,
    type TEXT
  );
`);

// Seed channels if empty
const channelCount = db.prepare("SELECT COUNT(*) as count FROM channels").get() as { count: number };
if (channelCount.count === 0) {
  const insert = db.prepare("INSERT INTO channels (id, name, icon, type) VALUES (?, ?, ?, ?)");
  insert.run("telegram", "Telegram", "Send", "messenger");
  insert.run("whatsapp", "WhatsApp", "MessageCircle", "messenger");
  insert.run("messenger", "Messenger", "Facebook", "messenger");
  insert.run("instagram", "Instagram", "Instagram", "social");
  insert.run("email", "Email", "Mail", "email");
  insert.run("ai", "RAZIF AI", "Bot", "ai");
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  app.use(express.json());

  // Auth Routes
  app.post("/api/auth/register", (req, res) => {
    const { username, password } = req.body;
    try {
      const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
      const info = db.prepare("INSERT INTO users (username, password, avatar) VALUES (?, ?, ?)").run(username, password, avatar);
      res.json({ id: info.lastInsertRowid, username, avatar });
    } catch (e) {
      res.status(400).json({ error: "Username already exists" });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE username = ? AND password = ?").get(username, password) as any;
    if (user) {
      res.json({ id: user.id, username: user.username, avatar: user.avatar });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  // API Routes
  app.get("/api/channels", (req, res) => {
    const channels = db.prepare("SELECT * FROM channels").all();
    res.json(channels);
  });

  app.get("/api/messages/:channelId", (req, res) => {
    const messages = db.prepare("SELECT * FROM messages WHERE channel = ? ORDER BY timestamp ASC").all(req.params.channelId);
    res.json(messages);
  });

  app.post("/api/messages", (req, res) => {
    const { channel, sender_name, sender_id, content, is_ai } = req.body;
    const info = db.prepare("INSERT INTO messages (channel, sender_name, sender_id, content, is_ai) VALUES (?, ?, ?, ?, ?)").run(channel, sender_name, sender_id, content, is_ai ? 1 : 0);
    const newMessage = { id: info.lastInsertRowid, channel, sender_name, sender_id, content, is_ai, timestamp: new Date().toISOString() };
    io.to(channel).emit("message", newMessage);
    res.json(newMessage);
  });

  // Socket.IO
  io.on("connection", (socket) => {
    console.log("A user connected");
    
    socket.on("join", (channel) => {
      socket.join(channel);
      console.log(`User joined channel: ${channel}`);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected");
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
