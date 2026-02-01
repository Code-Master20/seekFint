const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const connectDB = require("./utils/database.util");
const signUpRoute = require("./routers/signup.router");
const logInRoute = require("./routers/login.router");
const passResetRoute = require("./routers/resetPass.router");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: process.env.FRONTEND_URL, //<--in future if you buy a domain, paste here that domain
  methods: "GET, POST, PUT, DELETE, PATCH, HEAD", //<-- what can an user do from front-end
  credentialS: true,
};
app.use(cors(corsOptions));

//all middleWares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//all routes
app.use("/api/auth", signUpRoute);
app.use("/api/auth", logInRoute);
app.use("/api/auth", passResetRoute);
app.get("/", (req, res, next) => {
  res.send("hello from server");
});

connectDB().then(() => {
  console.log("Server is starting...");
  app.listen(PORT, () => {
    console.log(`server is running on http://localhost:${PORT}`);
  });
});
