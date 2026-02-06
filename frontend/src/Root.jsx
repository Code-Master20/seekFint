import { useState } from "react";
import "./Root.css";
import { HeaderOne } from "./components/Header/HeaderOne";
import { HeaderTwo } from "./components/Header/HeaderTwo";
import { Outlet } from "react-router-dom";

export const Root = () => {
  return (
    <div className="root-container">
      <HeaderOne />
      <HeaderTwo />
      {/* <Outlet /> */}
    </div>
  );
};
