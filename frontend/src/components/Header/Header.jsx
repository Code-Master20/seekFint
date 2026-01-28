import classMate from "../../assets/class-mate.png";
import styles from "./Header.module.css";
import { FiSearch } from "react-icons/fi";
import { RiMessengerLine } from "react-icons/ri";
import { MdAddCircleOutline } from "react-icons/md";
import { FaRegFileLines } from "react-icons/fa6";
import { useEffect, useState } from "react";
// import { FaUsersBetweenLines } from "react-icons/fa6";
export const Header = () => {
  //to track current width of the screen
  const [width, setWidth] = useState(window.outerWidth);

  useEffect(() => {
    const screenWidthTracker = () => {
      setWidth(window.outerWidth);
    };
    window.addEventListener("resize", screenWidthTracker);
    return () => {
      window.removeEventListener("resize", screenWidthTracker);
    };
  }, []);
  console.log(width);

  return (
    <header className={styles["header-container"]}>
      <nav className={styles["header-first-child"]}>
        <section>
          <FaRegFileLines />
          {/* <FaUsersBetweenLines /> */}
          <img src={classMate} alt="" />
          <section>
            <MdAddCircleOutline />
            <FiSearch />
            <RiMessengerLine />
          </section>
        </section>
        <section></section>
      </nav>
    </header>
  );
};
