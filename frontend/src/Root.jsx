import { useState } from "react";
import "./App.css";
import { HeaderOne } from "./components/Header/HeaderOne";
import { HeaderTwo } from "./components/Header/HeaderTwo";
import { Outlet } from "react-router-dom";

function Root() {
  return (
    <div>
      <HeaderOne />
      <HeaderTwo />
      {/* <Outlet /> */}
    </div>
  );
}

export default Root;
