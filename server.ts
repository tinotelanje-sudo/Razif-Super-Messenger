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
    avatar TEXT,
    last_lat REAL,
    last_lng REAL
  );

  CREATE TABLE IF NOT EXISTS contacts (
    user_id INTEGER,
    contact_id INTEGER,
    PRIMARY KEY(user_id, contact_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(contact_id) REFERENCES users(id)
  );
`);

// Migration for existing users table
try { db.exec("ALTER TABLE users ADD COLUMN last_lat REAL;"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN last_lng REAL;"); } catch (e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS linked_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    provider TEXT,
    provider_user_id TEXT,
    access_token TEXT,
    refresh_token TEXT,
    UNIQUE(user_id, provider),
    FOREIGN KEY(user_id) REFERENCES users(id)
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
  insert.run("aisa", "AISA (NASA DEF AI)", "Bot", "ai");
  insert.run("floodsense", "FloodSense Monitoring", "Waves", "iot");
  insert.run("farmsense", "FarmSense Security", "ShieldCheck", "iot");
  insert.run("telegram", "Telegram", "Send", "messenger");
  insert.run("whatsapp", "WhatsApp", "MessageCircle", "messenger");
  insert.run("messenger", "Messenger", "Facebook", "messenger");
  insert.run("instagram", "Instagram", "Instagram", "social");
  insert.run("email", "Email", "Mail", "email");
}

// Seed AISA user
const aisaUser = db.prepare("SELECT * FROM users WHERE username = 'AISA'").get();
if (!aisaUser) {
  db.prepare("INSERT INTO users (username, password, avatar) VALUES (?, ?, ?)").run("AISA", "system", "https://api.dicebear.com/7.x/bottts/svg?seed=AISA");
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

  // User & Contact Routes
  app.get("/api/users/search", (req, res) => {
    const { q, currentUserId } = req.query;
    const users = db.prepare("SELECT id, username, avatar FROM users WHERE username LIKE ? AND id != ? LIMIT 10")
      .all(`%${q}%`, currentUserId);
    res.json(users);
  });

  app.post("/api/contacts/add", (req, res) => {
    const { userId, contactId } = req.body;
    try {
      db.prepare("INSERT INTO contacts (user_id, contact_id) VALUES (?, ?)").run(userId, contactId);
      db.prepare("INSERT INTO contacts (user_id, contact_id) VALUES (?, ?)").run(contactId, userId); // Mutual for demo
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Already contacts" });
    }
  });

  app.post("/api/contacts/delete", (req, res) => {
    const { userId, contactId } = req.body;
    db.prepare("DELETE FROM contacts WHERE user_id = ? AND contact_id = ?").run(userId, contactId);
    db.prepare("DELETE FROM contacts WHERE user_id = ? AND contact_id = ?").run(contactId, userId);
    res.json({ success: true });
  });

  app.get("/api/contacts/:userId", (req, res) => {
    const contacts = db.prepare(`
      SELECT u.id, u.username, u.avatar 
      FROM users u 
      JOIN contacts c ON u.id = c.contact_id 
      WHERE c.user_id = ?
    `).all(req.params.userId);
    res.json(contacts);
  });

  app.post("/api/users/location", (req, res) => {
    const { userId, lat, lng } = req.body;
    db.prepare("UPDATE users SET last_lat = ?, last_lng = ? WHERE id = ?").run(lat, lng, userId);
    res.json({ success: true });
  });

  app.get("/api/users/nearby", (req, res) => {
    const { userId } = req.query;
    // Simple "nearby" logic: just return other users who have location set
    const users = db.prepare("SELECT id, username, avatar, last_lat, last_lng FROM users WHERE id != ? AND last_lat IS NOT NULL")
      .all(userId);
    res.json(users);
  });

  // OAuth & Linked Accounts
  app.get("/api/auth/url/:provider", (req, res) => {
    const { provider } = req.params;
    const { userId } = req.query;
    
    const baseUrl = process.env.APP_URL || "http://localhost:3000";
    const callbackUrl = `${baseUrl}/auth/callback/${provider}?userId=${userId}`;
    
    let authUrl = "";
    switch(provider) {
      case 'telegram': 
        // Telegram Login Widget or Bot flow
        authUrl = `https://t.me/razif_messenger_bot?start=auth_${userId}`; 
        break;
      case 'whatsapp': 
        // WhatsApp Business API or Link flow
        authUrl = `https://wa.me/razif_messenger?text=auth_${userId}`; 
        break;
      case 'facebook': 
        const fbId = process.env.VITE_FACEBOOK_CLIENT_ID || "FB_ID";
        authUrl = `https://www.facebook.com/v12.0/dialog/oauth?client_id=${fbId}&redirect_uri=${callbackUrl}&scope=email,public_profile,pages_messaging`; 
        break;
      case 'instagram': 
        const igId = process.env.VITE_INSTAGRAM_CLIENT_ID || "IG_ID";
        authUrl = `https://api.instagram.com/oauth/authorize?client_id=${igId}&redirect_uri=${callbackUrl}&response_type=code&scope=instagram_basic,instagram_manage_messages`; 
        break;
      case 'email': 
        authUrl = `/auth/email-setup?userId=${userId}`; 
        break;
      default: 
        authUrl = callbackUrl;
    }
    
    res.json({ url: authUrl });
  });

  app.get("/auth/callback/:provider", (req, res) => {
    const { provider } = req.params;
    const { userId, code } = req.query;
    
    // Simulate token exchange and storage
    db.prepare(`
      INSERT INTO linked_accounts (user_id, provider, provider_user_id, access_token)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, provider) DO UPDATE SET access_token = excluded.access_token
    `).run(userId, provider, `simulated_${provider}_id`, `simulated_token_${Date.now()}`);

    res.send(`
      <html>
        <body style="background: #151619; color: white; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh;">
          <div style="text-align: center;">
            <h2 style="color: #10b981;">${provider.toUpperCase()} Connected!</h2>
            <p>You can close this window now.</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_SUCCESS', provider: '${provider}' }, '*');
                setTimeout(() => window.close(), 1000);
              }
            </script>
          </div>
        </body>
      </html>
    `);
  });

  app.get("/api/linked-accounts/:userId", (req, res) => {
    const accounts = db.prepare("SELECT provider, provider_user_id FROM linked_accounts WHERE user_id = ?").all(req.params.userId);
    res.json(accounts);
  });

  app.post("/api/accounts/sync", (req, res) => {
    const { userId, provider } = req.body;
    
    // In a real app, you would use the stored access_token to fetch contacts from the provider's API
    // For this "real-feel" implementation, we'll simulate fetching 2-3 contacts from that service
    const simulatedContacts = [
      { username: `${provider}_User_1`, avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${provider}1` },
      { username: `${provider}_User_2`, avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${provider}2` }
    ];

    for (const c of simulatedContacts) {
      // 1. Ensure user exists in our DB
      try {
        db.prepare("INSERT OR IGNORE INTO users (username, avatar) VALUES (?, ?)").run(c.username, c.avatar);
        const newUser = db.prepare("SELECT id FROM users WHERE username = ?").get(c.username) as any;
        
        // 2. Add as contact
        db.prepare("INSERT OR IGNORE INTO contacts (user_id, contact_id) VALUES (?, ?)").run(userId, newUser.id);
        db.prepare("INSERT OR IGNORE INTO contacts (user_id, contact_id) VALUES (?, ?)").run(newUser.id, userId);
      } catch (e) {
        console.error("Sync error:", e);
      }
    }

    res.json({ success: true, count: simulatedContacts.length });
  });

  app.post("/api/contacts/add-email", (req, res) => {
    const { userId, email } = req.body;
    db.prepare(`
      INSERT INTO linked_accounts (user_id, provider, provider_user_id, access_token)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, provider) DO UPDATE SET provider_user_id = excluded.provider_user_id
    `).run(userId, 'email', email, 'simulated_email_token');
    res.json({ success: true });
  });

  app.post("/api/users/update", (req, res) => {
    const { userId, username, avatar } = req.body;
    try {
      db.prepare("UPDATE users SET username = ?, avatar = ? WHERE id = ?").run(username, avatar, userId);
      const updatedUser = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
      res.json(updatedUser);
    } catch (e) {
      res.status(400).json({ error: "Username already taken" });
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
