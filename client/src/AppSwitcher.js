import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import ArabicLetterTrainer from "./arabicTrainer/ArabicLetterTrainer";
import App from "./App";
const MAGIC_KEY = "a";
const MAGIC_PRESS_COUNT = 5;
export function AppSwitcher() {
    const [showArabicTrainer, setShowArabicTrainer] = useState(false);
    const magicKeyCountRef = useRef(0);
    useEffect(() => {
        function handleKeyDown(event) {
            if (event.repeat) {
                return;
            }
            if (event.key.toLowerCase() !== MAGIC_KEY) {
                magicKeyCountRef.current = 0;
                return;
            }
            magicKeyCountRef.current += 1;
            if (magicKeyCountRef.current >= MAGIC_PRESS_COUNT) {
                magicKeyCountRef.current = 0;
                setShowArabicTrainer((current) => !current);
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);
    return showArabicTrainer ? _jsx(ArabicLetterTrainer, {}) : _jsx(App, {});
}
