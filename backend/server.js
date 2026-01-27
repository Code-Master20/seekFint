const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const connectDB = require("./utils/database.util");

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

app.get("/", (req, res, next) => {
  res.send("hello from server");
});

connectDB().then(() => {
  console.log("Database connected, server is starting...");
  app.listen(PORT, () => {
    console.log(`server is running on http://localhost:${PORT}/`);
  });
});
