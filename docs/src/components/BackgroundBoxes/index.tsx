import React from "react";
import styles from "./styles.module.css";

export const Boxes = () => {
  const rows = new Array(150).fill(1);
  const cols = new Array(100).fill(1);
  const colors = [
    "--red-300",
    "--red-400",
    "--red-500",
    "--red-600",
  ];

  const getRandomColor = () => {
    return colors[Math.floor(Math.random() * colors.length)];
  };

  return (
    <div className={styles.boxes}>
      {rows.map((_, i) => (
        <div key={`row` + i} className={styles.row}>
          {cols.map((_, j) => (
            <div
              key={`col` + j}
              className={styles.box}
              style={{
                "--box-color": `var(${getRandomColor()})`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      ))}
    </div>
  );
};
