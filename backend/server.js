const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

// ======================
// USERS
// ======================
app.get("/users", async (req, res) => {
  const result = await db.query("SELECT * FROM users ORDER BY id");
  res.json(result.rows);
});

app.post("/users", async (req, res) => {
  const { username, password } = req.body;

  await db.query(
    "INSERT INTO users (username, password) VALUES ($1, $2)",
    [username, password]
  );

  res.json({ success: true });
});

// ======================
// LOGIN
// ======================
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const result = await db.query(
    "SELECT * FROM users WHERE username=$1 AND password=$2",
    [username, password]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ error: "Invalid login" });
  }

  res.json({ success: true, user: result.rows[0] });
});

// ======================
// ATTENDANCE
// ======================
app.get("/attendance", async (req, res) => {
  const result = await db.query(`
    SELECT a.*, u.username 
    FROM attendance a
    JOIN users u ON u.id = a.user_id
    ORDER BY a.id DESC
  `);

  res.json(result.rows);
});

app.post("/attendance", async (req, res) => {
  const { user_id, type } = req.body;

  await db.query(
    "INSERT INTO attendance (user_id, type, created_at) VALUES ($1, $2, NOW())",
    [user_id, type]
  );

  res.json({ success: true });
});

// ======================
// STATIC
// ======================
app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// ======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});