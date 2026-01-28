const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const connectDB = require("./utils/database.util");
const signUpRoute = require("./routers/signup.router");
const app = express();
const PORT = process.env.PORT || 3000;

//all middlewares
app.use(express.json());
app.use("/api/auth", signUpRoute);

// app.get("/", (req, res, next) => {
//   res.send("hello from server");
// });

connectDB().then(() => {
  console.log("Database connected, server is starting...");
  app.listen(PORT, () => {
    console.log(`server is running on http://localhost:${PORT}`);
  });
});
