const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const connectDB = require("./utils/database.util");
const cookieParser = require("cookie-parser");
const signUpRoute = require("./routers/signup.router");
const logInRoute = require("./routers/login.router");
const logOutRoute = require("./routers/logout.router");
const passResetRoute = require("./routers/resetPass.router");
const meRoute = require("./routers/me.router");
const cors = require("cors");
const app = express();

const PORT = process.env.PORT || 3000;
const frontend_uri = process.env.FRONTEND_URI || "http://localhost:5173";

const corsOptions = {
  origin: frontend_uri,
  methods: "GET, POST, PUT, DELETE, PATCH, HEAD",
};
app.use(cors(corsOptions));
app.use(cookieParser());

//all middleWares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//all routes
app.use("/api/auth", signUpRoute);
app.use("/api/auth", logInRoute);
app.use("/api/auth", passResetRoute);
app.use("/api/auth", logOutRoute);
app.use("/api/auth", meRoute);
app.get("/", (req, res, next) => {
  res.send("hello from server");
});

connectDB().then(() => {
  console.log("Server is starting...");
  app.listen(PORT, () => {
    console.log(`server is running on http://localhost:${PORT}`);
  });
});
