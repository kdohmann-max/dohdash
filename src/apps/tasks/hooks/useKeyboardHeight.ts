import { useEffect, useState } from "react";

// Measures the height of the software keyboard using the visualViewport API.
// Returns 0 when the keyboard is hidden. Used to pin the format bar above the
// keyboard on mobile.
export function useKeyboardHeight(): number {
  const [kh, setKh] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function update() {
      setKh(Math.max(0, window.innerHeight - vv!.height - vv!.offsetTop));
    }

    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return kh;
}
