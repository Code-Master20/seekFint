const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const connectDB = require("./utils/database.util");
const signUpRoute = require("./routers/signup.router");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: "http://localhost:5173", //<--in future if you buy a domain, paste here that domain
  methods: "GET, POST, PUT, DELETE, PATCH, HEAD", //<-- what can an user do from front-end
  CredentialS: true,
};
app.use(cors(corsOptions));

//all middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//all routes
app.use("/api/auth", signUpRoute);
app.get("/", (req, res, next) => {
  res.send("hello from server");
});

connectDB().then(() => {
  console.log("Database connected, server is starting...");
  app.listen(PORT, () => {
    console.log(`server is running on http://localhost:${PORT}`);
  });
});
