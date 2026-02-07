import styles from "./HeaderTwo.module.css";
import { CiHome, CiImageOn } from "react-icons/ci";
import { PiVideoLight } from "react-icons/pi";
import { BsPeople } from "react-icons/bs";
import { IoIosNotificationsOutline } from "react-icons/io";
import { TbPhotoVideo } from "react-icons/tb";
import { TfiBarChart } from "react-icons/tfi";
import { NavLink } from "react-router-dom";
import profilePic from "../../assets/profilePic.jpg";
import { useState } from "react";

export const HeaderTwo = () => {
  const [isActive, setActive] = useState("");
  return (
    <header className={styles["header-container"]}>
      <nav className={styles["header-first-child"]}>
        <NavLink
          to="/"
          className={({ isActive }) => (isActive ? styles.iconActived : "")}
        >
          <CiHome />
        </NavLink>
        <NavLink
          to="#"
          className={`(${isActive}) => ${isActive ? styles.iconActived : ""}`}
        >
          <PiVideoLight />
        </NavLink>
        <NavLink
          to="#"
          className={({ isActive }) => (isActive ? styles.iconActived : "")}
        >
          <CiImageOn />
        </NavLink>
        <NavLink
          to="#"
          className={({ isActive }) => (isActive ? styles.iconActived : "")}
        >
          <TbPhotoVideo />
        </NavLink>
        <NavLink
          to="#"
          className={({ isActive }) => (isActive ? styles.iconActived : "")}
        >
          <BsPeople />
          {/* <TfiBarChart /> */}
        </NavLink>
        <NavLink
          to="#"
          className={({ isActive }) => (isActive ? styles.iconActived : "")}
        >
          <IoIosNotificationsOutline />
        </NavLink>
        <NavLink to="#">
          <img src={profilePic} alt="me" />
        </NavLink>
      </nav>
    </header>
  );
};
